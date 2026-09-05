# FRPC 日志净化与飞书展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除 FRPC 日志的 ANSI 控制符，并提供默认飞书浅色、可切换自动换行的日志视图。

**Architecture:** Rust `sanitize_runtime_text` 是日志缓冲和 Tauri 事件的权威净化入口，先移除 ANSI 终端控制序列，再执行现有脱敏和截断。TypeScript `sanitizeRuntimeText` 实现等价兜底，以保护异常 IPC 载荷。`LogDashboard` 仅负责展示状态：默认换行时内容在自身宽度内断行，关闭换行时仅日志容器横向滚动。

**Tech Stack:** Rust、Tokio/Tauri 2、React 19、TypeScript、Tailwind CSS、Vitest。

---

## 文件结构

- Modify: `src-tauri/src/frpc_runtime.rs` — ANSI 剥离函数、后端净化顺序和 Rust 回归测试。
- Modify: `src/services/ipc.ts` — IPC 纵深防御的 ANSI 剥离。
- Modify: `src/services/ipc.test.ts` — 实时事件和快照的 ANSI 兜底测试。
- Modify: `src/features/logs/LogDashboard.tsx` — 飞书浅色日志区域和自动换行开关。
- Modify: `src/features/logs/LogDashboard.test.tsx` — 换行模式、可访问状态和横向滚动测试。

当前工作区不是 Git 仓库，且用户没有授权提交；所有任务均不得执行 `git add`、`git commit`、`push`、`reset` 或 `clean`。

### Task 1: 后端权威 ANSI 净化

**Files:**
- Modify: `src-tauri/src/frpc_runtime.rs:196-239`
- Test: `src-tauri/src/frpc_runtime.rs:1050-1090`

- [ ] **Step 1: 写出后端 ANSI 与脱敏的失败测试**

在现有 `sanitize_runtime_text` 测试后增加：

```rust
#[test]
fn runtime_log_ansi_sequences_are_removed_before_redaction() {
    let raw = "\x1b[1;34m2026-09-04 [I] token = visible-secret\x1b[0m\n\x1b]8;;https://example.test\x07link\x1b]8;;\x07";
    let sanitized = sanitize_runtime_text(raw);

    assert_eq!(sanitized, "2026-09-04 [I] token = ******\nlink");
    assert!(!sanitized.contains('\x1b'));
    assert!(!sanitized.contains("visible-secret"));
}

#[test]
fn runtime_log_ansi_cleanup_still_honors_utf8_safe_length_limit() {
    let raw = format!("\x1b[31m{}\x1b[0m", "日志".repeat(3_000));
    let sanitized = sanitize_runtime_text(&raw);

    assert!(!sanitized.contains('\x1b'));
    assert!(sanitized.len() <= MAX_SAFE_RUNTIME_TEXT_LENGTH);
    assert!(sanitized.is_char_boundary(sanitized.len()));
}
```

- [ ] **Step 2: 运行测试并确认它失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml runtime_log_ansi_sequences_are_removed_before_redaction`

Expected: FAIL；当前输出仍包含 `ESC[1;34m`，且 token 因颜色序列未按预期净化。

- [ ] **Step 3: 实现无依赖的 ANSI 剥离状态机**

在 `sanitize_runtime_text` 前新增下列函数。它按 Unicode 字符迭代，只把 ASCII 控制序列移除，因此不会破坏中文 UTF-8：

```rust
pub fn strip_ansi_escape_sequences(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();

    while let Some(current) = chars.next() {
        match current {
            '\u{1b}' => match chars.next() {
                Some('[') => {
                    while let Some(value) = chars.next() {
                        if ('@'..='~').contains(&value) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    while let Some(value) = chars.next() {
                        if value == '\u{7}' {
                            break;
                        }
                        if value == '\u{1b}' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some('P' | 'X' | '^' | '_') => {
                    while let Some(value) = chars.next() {
                        if value == '\u{1b}' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some(_) | None => {}
            },
            '\u{009b}' => {
                while let Some(value) = chars.next() {
                    if ('@'..='~').contains(&value) {
                        break;
                    }
                }
            }
            value => output.push(value),
        }
    }

    output
}
```

将 `sanitize_runtime_text` 初始化语句替换为：

```rust
let mut result = strip_ansi_escape_sequences(text);
```

保留其余 PEM、Authorization、键值脱敏以及 UTF-8 安全截断逻辑，顺序不得调整。

- [ ] **Step 4: 运行 Rust 定向测试并确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml runtime_log_ansi`

Expected: 两个 ANSI 测试 PASS。

### Task 2: IPC 纵深防御与快照一致性

**Files:**
- Modify: `src/services/ipc.ts:75-107`
- Test: `src/services/ipc.test.ts:238-250, 340-410`

- [ ] **Step 1: 写出 IPC ANSI 兜底的失败测试**

在 `ipc.test.ts` 增加如下测试；它同时覆盖原生事件和 `getRuntimeLogs` 快照：

```ts
it('运行期事件与日志快照均剥离 ANSI 颜色控制符', async () => {
  vi.mocked(isTauriEnv).mockReturnValue(true);
  (window as any).__MOCK_TAURI_ENV__ = true;
  const invoke = vi.fn().mockResolvedValue([
    { sequence: 1, profileId: 'p1', timestamp: '2026-09-04 20:18:58', level: 'info', message: '\u001b[1;34mproxy success\u001b[0m' },
  ]);
  (window as any).__TAURI__ = { core: { invoke } };

  const received = vi.fn();
  const unsub = await subscribeRuntimeEvents(received, vi.fn());
  emitRuntimeLog({ sequence: 2, profileId: 'p1', timestamp: '2026-09-04 20:18:59', level: 'info', message: '\u001b[31mconnected\u001b[0m' });

  expect(received).toHaveBeenCalledWith(expect.objectContaining({ message: 'connected' }));
  expect(await getRuntimeLogs('p1')).toEqual([
    { sequence: 1, profileId: 'p1', timestamp: '2026-09-04 20:18:58', level: 'info', message: 'proxy success' },
  ]);
  await unsub();
});
```

- [ ] **Step 2: 运行测试并确认它失败**

Run: `pnpm exec vitest run src/services/ipc.test.ts`

Expected: FAIL；当前 message 仍包含 `\u001b[...m`。

- [ ] **Step 3: 在前端净化函数添加等价兜底**

在 `sanitizeRuntimeText` 前新增：

```ts
function stripAnsiEscapeSequences(text: string): string {
  return text.replace(
    /\u001b(?:\][\s\S]*?(?:\u0007|\u001b\\)|[PX^_][\s\S]*?\u001b\\|\[[0-?]*[ -/]*[@-~]|[@-_])/g,
    ''
  ).replace(/\u009b[0-?]*[ -/]*[@-~]/g, '');
}
```

将初始化语句替换为：

```ts
let result = stripAnsiEscapeSequences(text);
```

不要改动 `parseRuntimeLogEvent` 的 sequence 校验、日志级别校验或任何 Tauri IPC 名称。

- [ ] **Step 4: 运行 IPC 定向测试并确认通过**

Run: `pnpm exec vitest run src/services/ipc.test.ts`

Expected: PASS；事件与快照断言都只包含可见文本。

### Task 3: 飞书浅色日志视图与自动换行开关

**Files:**
- Modify: `src/features/logs/LogDashboard.tsx:25-36, 229-247, 282-325`
- Test: `src/features/logs/LogDashboard.test.tsx:41-120`

- [ ] **Step 1: 写出日志展示切换的失败测试**

在 `LogDashboard.test.tsx` 增加：

```tsx
it('默认自动换行，关闭后只让日志容器横向滚动', async () => {
  vi.mocked(isTauriEnv).mockReturnValue(true);
  const user = userEvent.setup();
  render(<LogDashboard
    profiles={[makeProfile({ id: 'p1' })]}
    logs={[{ id: 'l1', sequence: 1, profileId: 'p1', profileName: 'p1', timestamp: '20:18:58', level: 'info', message: 'C:/very-long-path/'.repeat(20), raw: 'long' }]}
    onClearLogs={vi.fn()}
  />);

  const toggle = screen.getByRole('button', { name: '自动换行' });
  const viewport = screen.getByTestId('runtime-log-viewport');
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(viewport).toHaveClass('overflow-x-hidden');
  expect(screen.getByTestId('runtime-log-message-l1')).toHaveClass('whitespace-pre-wrap');

  await user.click(toggle);

  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(viewport).toHaveClass('overflow-x-auto');
  expect(screen.getByTestId('runtime-log-message-l1')).toHaveClass('whitespace-pre');
});
```

- [ ] **Step 2: 运行组件测试并确认它失败**

Run: `pnpm exec vitest run src/features/logs/LogDashboard.test.tsx`

Expected: FAIL；当前没有“自动换行”按钮、测试 ID 或模式 class。

- [ ] **Step 3: 实现可访问的换行开关与浅色日志区域**

在 state 声明处增加：

```tsx
const [wrapLogLines, setWrapLogLines] = useState(true);
```

在“滚屏”按钮之后插入：

```tsx
<Button
  size="sm"
  variant={wrapLogLines ? 'default' : 'outline'}
  onClick={() => setWrapLogLines((current) => !current)}
  aria-pressed={wrapLogLines}
  className="h-8 px-3 text-[13px] rounded-[6px]"
>
  自动换行
</Button>
```

将日志容器替换为下列结构。`FEISHU_FONT_FAMILY` 已由根容器提供，不添加 `font-mono`：

```tsx
<div
  ref={scrollContainerRef}
  data-testid="runtime-log-viewport"
  className={`flex-1 min-h-0 overflow-y-auto ${wrapLogLines ? 'overflow-x-hidden' : 'overflow-x-auto'} bg-[#F7F8FA] p-3 text-[13px] leading-relaxed text-[#1F2329] select-text`}
>
  <div className={wrapLogLines ? 'min-w-0' : 'min-w-max'}>
    {/* 保留空状态、filteredLogs.map(...) 与 logEndRef */}
  </div>
</div>
```

将每一条日志行 class 改为浅色、可收缩布局：

```tsx
className={`flex min-w-0 items-start gap-2.5 rounded-[4px] px-2 py-1 transition-colors hover:bg-[#EFF3FF] ${wrapLogLines ? '' : 'w-max min-w-full'}`}
```

时间编号改为 `text-[#8F959E]`，方案标签改为 `bg-[#EFF3FF] text-[#1456C8]`。正文 span 必须具有以下属性和 class；保留既有按日志级别计算的文本色：

```tsx
<span
  data-testid={`runtime-log-message-${log.id}`}
  className={`min-w-0 flex-1 ${wrapLogLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} ${levelClass}`}
>
  {log.message}
</span>
```

其中 `levelClass` 是将当前三元表达式提取出的同语义字符串：error 保持红色，warn 保持橙色，debug 保持紫色，info 使用 `text-[#1F2329]`。不得改变过滤、暂停冻结、复制、导出、自动滚屏或清空逻辑。

- [ ] **Step 4: 运行组件测试并确认通过**

Run: `pnpm exec vitest run src/features/logs/LogDashboard.test.tsx`

Expected: PASS；包含暂停冻结测试和新增换行开关测试。

### Task 4: 整体验证与人工交接

**Files:**
- Verify only: `src-tauri/src/frpc_runtime.rs`
- Verify only: `src/services/ipc.ts`
- Verify only: `src/features/logs/LogDashboard.tsx`

- [ ] **Step 1: 执行完整自动化验证**

Run: `pnpm test`

Expected: exit code 0；覆盖 IPC、日志面板、暂停冻结和既有运行时状态回归。

Run: `pnpm build`

Expected: exit code 0；允许既有超过 500 kB 的 Vite chunk 提示，但不得有 TypeScript 错误。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: exit code 0；包含新增 ANSI 净化测试。

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: exit code 0。

Run: `rustfmt --edition 2021 --check src-tauri/src/frpc_runtime.rs`

Expected: exit code 0。

- [ ] **Step 2: 执行真实桌面端人工验收**

使用用户的真实 FRPC 配置启动一次，检查日志页首行不含 `ESC[`、替代字符或可见控制码；默认“自动换行”开启时，长配置路径不超出右侧；关闭开关后，横向滚动条仅出现在日志区；确认背景为飞书浅色、字体不再为等宽终端字体。随后停止、再次启动同一方案，确认既有的停止收敛和日志隔离没有回归。

- [ ] **Step 3: 报告结果和已知限制**

报告每条命令的退出码、实际失败数、人工验收是否完成。当前目录不是 Git 仓库，`git status --short` 和 `git diff --check` 均无法作为变更校验；如执行它们，原样报告其非 Git 错误及退出码。不得创建提交或删除构建产物。
