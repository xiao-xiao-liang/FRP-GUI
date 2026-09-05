# FRPC 结构化日志、日志级别配置与数字输入框优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FRPC 运行日志在界面中只显示一次原生日志时间与正确级别，并允许用户为 FRPC/FRPS 配置日志级别，同时从全应用数字输入框移除浏览器微调箭头。

**Architecture:** Rust 运行时在 ANSI 清洗和凭据脱敏后识别 FRP 的标准日志前缀，将原生日志时间、级别和正文拆成结构化字段；无法识别的输出仍保留后端采集时间和现有推断级别。React 表单以统一的日志级别状态驱动既有 `FeishuSelect`、TOML 往返和保存；全局 CSS 仅改变 number 控件外观，不改变其语义、键盘输入或校验。

**Tech Stack:** Rust / Tokio / Regex、Tauri、React 18、TypeScript、Vitest + Testing Library、Tailwind CSS。

---

## 文件结构与职责

- 修改：`src-tauri/src/frpc_runtime.rs` — 清洗后的 FRP 原生日志行解析、标准级别映射、stdout/stderr 统一结构化采集及 Rust 回归测试。
- 修改：`src/services/toml-sync.ts` — FRPC 与 FRPS 的 `[log]` 区块双向序列化，修复 FRPC 解析漏带 `log` 的现有缺口。
- 新建：`src/services/toml-sync.test.ts` — FRPC/FRPS 日志级别 TOML 往返回归测试。
- 修改：`src/features/editor/ConfigEditorModal.tsx` — FRPC 与 FRPS 表单的“运行日志”高级区、默认 INFO、说明文案，以及表单/TOML/保存的同步。
- 修改：`src/features/editor/ConfigEditorModal.test.tsx` — 验证两种方案类型的选择器默认值、选择结果和保存/源码同步。
- 修改：`src/features/logs/LogDashboard.tsx` — 将 TRACE 纳入现有日志筛选分段控件，并赋予 TRACE 清晰的徽标颜色。
- 修改：`src/features/logs/LogDashboard.test.tsx` — 验证 TRACE 筛选只显示 TRACE 行。
- 修改：`src/styles/globals.css` — 对所有 `input[type="number"]` 隐藏 Chromium/WebKit 与 Firefox 的增减箭头。
- 新建：`src/styles/globals.test.ts` — 直接验证全局样式含目标选择器，防止后续样式重构重新带回微调箭头。

## 约束

- 只识别 FRP 标准前缀：`YYYY-MM-DD HH:mm:ss.SSS [I|W|E|D|T] `；不匹配时不得丢弃、改写或伪造原始正文。
- 结构化解析必须在 ANSI 清洗和凭据脱敏之后执行；不得削弱现有 4 KiB UTF-8 安全截断与脱敏行为。
- FRP 的 `log.to`、`log.maxDays` 既有含义不变；可视化高级项只写 `log.level`。
- 默认 INFO 用于现有未配置日志级别的旧方案；不能要求用户手动迁移旧配置。
- 运行日志的复制、导出继续依据 `LogEntry.timestamp`、`level`、`message` 生成，因此后端字段正常化后自然不再重复时间。
- 此目录不是 Git 仓库；不得执行 `git add`、`git commit`、`git reset`、`git clean` 或任何会改变 Git 状态的命令。

### Task 1: 后端将 FRP 原始输出标准化为时间、级别和正文

**Files:**
- Modify: `src-tauri/src/frpc_runtime.rs:245-307,417-444,621-662,测试模块`

- [ ] **Step 1: 写出会失败的纯函数测试，锁定标准与非标准日志的边界**

在 `frpc_runtime.rs` 的既有 `#[cfg(test)] mod tests` 中添加以下测试；时间字符串与断言必须完整保留毫秒，测试输入保留 ANSI 包裹以验证顺序：

```rust
#[test]
fn standard_frpc_log_line_uses_native_timestamp_level_and_message() {
    let normalized = normalize_runtime_log_line(
        "2026-09-04 21:22:57.999".to_string(),
        "error".to_string(),
        "\x1b[1;34m2026-09-04 21:22:57.278 [I] [sub/root.go:194] start frpc\x1b[0m"
            .to_string(),
    );

    assert_eq!(normalized.timestamp, "2026-09-04 21:22:57.278");
    assert_eq!(normalized.level, "info");
    assert_eq!(normalized.message, "[sub/root.go:194] start frpc");
}

#[test]
fn standard_frpc_log_line_maps_every_supported_level_code() {
    for (code, expected) in [
        ('I', "info"),
        ('W', "warn"),
        ('E', "error"),
        ('D', "debug"),
        ('T', "trace"),
    ] {
        let normalized = normalize_runtime_log_line(
            "fallback".to_string(),
            "info".to_string(),
            format!("2026-09-04 21:22:57.278 [{code}] detail"),
        );
        assert_eq!(normalized.level, expected);
        assert_eq!(normalized.message, "detail");
    }
}

#[test]
fn non_standard_runtime_output_keeps_fallback_metadata_and_sanitized_text() {
    let normalized = normalize_runtime_log_line(
        "2026-09-04 21:22:57.999".to_string(),
        "error".to_string(),
        "helper output: token = secret-value".to_string(),
    );

    assert_eq!(normalized.timestamp, "2026-09-04 21:22:57.999");
    assert_eq!(normalized.level, "error");
    assert_eq!(normalized.message, "helper output: token = ******");
}
```

- [ ] **Step 2: 先运行最小 Rust 测试，确认因函数不存在而失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml standard_frpc_log_line`

Expected: 非零退出，编译器指出 `normalize_runtime_log_line` 尚不存在。

- [ ] **Step 3: 定义最小结构化结果和规范化函数**

在 `sanitize_runtime_text` 与 `derive_log_level` 相邻位置新增私有结果类型和函数。函数必须先调用 `sanitize_runtime_text`，再使用只匹配行首的正则；仅捕获到完整前缀时替换 metadata。不要对不匹配行执行字符串切片。

```rust
#[derive(Debug, PartialEq, Eq)]
struct NormalizedRuntimeLogLine {
    timestamp: String,
    level: String,
    message: String,
}

fn normalize_runtime_log_line(
    fallback_timestamp: String,
    fallback_level: String,
    raw_line: String,
) -> NormalizedRuntimeLogLine {
    let sanitized = sanitize_runtime_text(&raw_line);
    let pattern = Regex::new(
        r"^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) \[(?P<level>[IWEDT])\] (?P<message>.*)$",
    )
    .expect("FRP 标准日志前缀正则必须有效");

    let Some(captures) = pattern.captures(&sanitized) else {
        return NormalizedRuntimeLogLine {
            timestamp: fallback_timestamp,
            level: fallback_level,
            message: sanitized,
        };
    };

    let level = match captures.name("level").expect("标准前缀必须含级别").as_str() {
        "I" => "info",
        "W" => "warn",
        "E" => "error",
        "D" => "debug",
        "T" => "trace",
        _ => unreachable!("正则已限制 FRP 标准级别"),
    };

    NormalizedRuntimeLogLine {
        timestamp: captures.name("timestamp").expect("标准前缀必须含时间").as_str().to_string(),
        level: level.to_string(),
        message: captures.name("message").expect("标准前缀必须含正文").as_str().to_string(),
    }
}
```

保留 `derive_log_level` 作为非标准 stdout 的现有兜底；不要让该函数负责剥离标准前缀。

- [ ] **Step 4: 将 stdout/stderr 采集统一接入规范化函数**

在两条 `BufReader::lines()` 循环内都生成采集兜底时间，格式统一为 `"%Y-%m-%d %H:%M:%S%.3f"`。stdout 的 fallback level 传 `derive_log_level(&line)`；stderr 的 fallback level 传 `"error".to_string()`。将返回字段传给 `capture_runtime_log`：

```rust
let fallback_timestamp = Local::now()
    .format("%Y-%m-%d %H:%M:%S%.3f")
    .to_string();
let normalized = normalize_runtime_log_line(
    fallback_timestamp,
    derive_log_level(&line), // stderr 循环改为 "error".to_string()
    line,
);
Self::capture_runtime_log(
    handle_out.clone(),
    sink_out.clone(),
    normalized.timestamp,
    normalized.level,
    normalized.message,
)
.await;
```

保留 `capture_runtime_log` 内现有的 `sanitize_runtime_text` 调用，作为所有 IPC 日志写入点的最后一道纵深防御；`sanitize_runtime_text` 是幂等清洗，因此对已经规范化的正文重复执行不会改变标准化结果。不得让测试或未来新增调用方绕过脱敏与 4 KiB 截断。

- [ ] **Step 5: 运行 Rust 定向测试，再运行既有运行时测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml standard_frpc_log_line`

Expected: 2 tests passed。

Run: `cargo test --manifest-path src-tauri/Cargo.toml non_standard_runtime_output`

Expected: 1 test passed。

Run: `cargo test --manifest-path src-tauri/Cargo.toml frpc_runtime`

Expected: 退出码 0；既有 ANSI、脱敏、快照与生命周期测试不回归。

### Task 2: 让 FRPC 与 FRPS 的 `[log]` TOML 可完整往返

**Files:**
- Modify: `src/services/toml-sync.ts:127-132,255-285,198-249`
- Create: `src/services/toml-sync.test.ts`

- [ ] **Step 1: 添加 FRPC 和 FRPS 的失败往返测试**

创建 `src/services/toml-sync.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  parseFrpcToml,
  parseFrpsToml,
  serializeFrpcToml,
  serializeFrpsToml,
} from './toml-sync';

describe('日志级别 TOML 同步', () => {
  it('FRPC 序列化并解析 [log].level', () => {
    const toml = serializeFrpcToml({
      serverAddr: 'frp.example.com',
      serverPort: 7000,
      proxies: [],
      visitors: [],
      log: { level: 'debug' },
    });

    expect(toml).toContain('[log]');
    expect(toml).toContain('level = "debug"');
    expect(parseFrpcToml(toml).log?.level).toBe('debug');
  });

  it('FRPS 序列化并解析 [log].level', () => {
    const toml = serializeFrpsToml({
      bindPort: 7000,
      log: { level: 'trace' },
    });

    expect(toml).toContain('[log]');
    expect(toml).toContain('level = "trace"');
    expect(parseFrpsToml(toml).log?.level).toBe('trace');
  });
});
```

- [ ] **Step 2: 运行定向测试，确认 FRPS 序列化与 FRPC 解析分别失败**

Run: `pnpm exec vitest run src/services/toml-sync.test.ts`

Expected: 非零退出；FRPS 产物没有 `[log]`，且 FRPC 解析结果中没有 `log`。

- [ ] **Step 3: 对称实现两种配置的 `[log]` 写入和读取**

保留既有 FRPC `[log]` 序列化逻辑。给 `parseFrpcToml` 的返回对象增加 `log: parsed.log`。在 `serializeFrpsToml` 的 `[webServer]` 写入逻辑之后、`return lines.join('\n')` 之前，使用与 FRPC 完全相同的受保护输出：

```ts
if (config.log) {
  lines.push('');
  lines.push('[log]');
  lines.push(`level = "${config.log.level || 'info'}"`);
  lines.push(`maxDays = ${Number(config.log.maxDays) || 3}`);
}
```

不得在该任务中修改 `FrpcConfig`、`FrpsConfig` 的类型：两者已经具备正确 `log` 字段。

- [ ] **Step 4: 运行 TOML 定向测试**

Run: `pnpm exec vitest run src/services/toml-sync.test.ts`

Expected: 2 tests passed。

### Task 3: 在 FRPC 和 FRPS 高级表单中提供日志级别选择

**Files:**
- Modify: `src/features/editor/ConfigEditorModal.tsx:1-245,324-360,高级表单 JSX`
- Modify: `src/features/editor/ConfigEditorModal.test.tsx`

- [ ] **Step 1: 为编辑模式、向导转高级模式和 TOML 回读添加失败测试**

先在测试夹具中让 `mockEditingProfile.config` 包含 `log: { level: 'debug' }`，然后添加以下两项行为测试：

```tsx
it('FRPC 编辑表单显示已有日志级别，并能写入 TOML 与保存结果', async () => {
  const user = userEvent.setup();
  render(<ConfigEditorModal isOpen onClose={mockOnClose} onSave={mockOnSave}
    editingProfile={mockEditingProfile} activeCore={mockActiveCore} />);

  expect(screen.getByText('DEBUG')).toBeInTheDocument();
  await user.click(screen.getByText('DEBUG'));
  await user.click(screen.getByText('TRACE'));
  expect(screen.getByText('适合协议级排障与完整调用链追踪。')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'TOML 源码' }));
  expect((screen.getByPlaceholderText(/在此编写标准 FRP TOML 配置文件/) as HTMLTextAreaElement).value)
    .toContain('level = "trace"');

  fireEvent.click(screen.getByRole('button', { name: '可视化表单' }));
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
  expect(mockOnSave.mock.calls[0][0].config.log.level).toBe('trace');
});

it('FRPS 编辑表单默认 INFO，且 TOML 回读的 WARN 同步到选择器', async () => {
  const frpsProfile = { ...mockEditingProfile, id: 'prof_frps', type: 'frps' as const,
    config: { bindPort: 7000 }, rawToml: 'bindPort = 7000\n\n[log]\nlevel = "warn"' };
  render(<ConfigEditorModal isOpen onClose={mockOnClose} onSave={mockOnSave}
    editingProfile={frpsProfile} activeCore={mockActiveCore} />);

  expect(screen.getByText('INFO（默认）')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'TOML 源码' }));
  fireEvent.click(screen.getByRole('button', { name: '同步到表单' }));
  expect(screen.getByText('WARN')).toBeInTheDocument();
});
```

如现有 `FeishuSelect` 触发按钮有多个同名元素，先在“运行日志”容器上增加 `data-testid="runtime-log-level-setting"`，测试通过该容器内查询触发/选项，不要依赖页面其他 Select 的顺序。

- [ ] **Step 2: 运行组件定向测试，确认新增断言失败**

Run: `pnpm exec vitest run src/features/editor/ConfigEditorModal.test.tsx`

Expected: 非零退出，原因是没有“运行日志”区、没有 TRACE/帮助文案，或保存结果未含 `config.log.level`。

- [ ] **Step 3: 增加统一日志级别状态、选项和说明映射**

在组件顶层（组件外）声明可复用的窄类型、选项和说明；所有文字使用以下已确认文案：

```ts
type FrpLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_OPTIONS: { value: FrpLogLevel; label: string }[] = [
  { value: 'info', label: 'INFO（默认）' },
  { value: 'warn', label: 'WARN' },
  { value: 'error', label: 'ERROR' },
  { value: 'debug', label: 'DEBUG' },
  { value: 'trace', label: 'TRACE' },
];

const LOG_LEVEL_HELPERS: Record<FrpLogLevel, string> = {
  info: '适合日常运行，记录启动、登录、代理状态及警告、错误。',
  warn: '适合稳定运行期，仅关注警告和错误。',
  error: '适合低噪声监控，仅记录导致功能异常的错误。',
  debug: '适合连接、重连和心跳异常排查，日志量会增加。',
  trace: '适合协议级排障与完整调用链追踪。',
};
```

新增 `const [logLevel, setLogLevel] = useState<FrpLogLevel>('info');`。在以下所有进入/回读路径设值：

- 编辑 FRPC：`setLogLevel(conf.log?.level || 'info')`；编辑 FRPS 同样设置。
- 新建向导初始分支和 `handleSwitchToAdvanced`：设为 `'info'`。
- `syncTomlToForm` 的 FRPC 和 FRPS 分支：`setLogLevel(conf.log?.level || 'info')`。

- [ ] **Step 4: 将 `log.level` 贯通表单生成、保存和可视化高级区**

在 `handleSwitchToAdvanced`、`syncFormToToml`、`handleSave` 的每一个 FRPC 配置对象中加入 `log: { level: logLevel }`；在每一个 FRPS 配置对象中也加入相同字段。这样切换“可视化表单”到“TOML 源码”、直接保存以及由向导进入高级编辑都一致。

在 FRPC 专属“高级传输与加密”区之后，新增一个不受 `profileType === 'frpc'` 限制的“运行日志”区，因此 FRPC 和 FRPS 都能看到：

```tsx
<div data-testid="runtime-log-level-setting" className="space-y-2.5">
  <div className="text-[13px] font-semibold text-[#1F2329]">运行日志</div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
    <div>
      <label className="block text-[12px] font-medium text-[#1F2329] mb-1">日志级别</label>
      <FeishuSelect
        options={LOG_LEVEL_OPTIONS}
        value={logLevel}
        onChange={(value) => setLogLevel(value as FrpLogLevel)}
        size="sm"
        className="w-full"
      />
    </div>
  </div>
  <p className="text-[12px] leading-5 text-[#646A75]">{LOG_LEVEL_HELPERS[logLevel]}</p>
</div>
```

在该区前保留现有分割线；不要变更 FRPC 专属的传输字段，也不要向向导简化页新增这个高级选项。

- [ ] **Step 5: 运行编辑器与 TOML 定向测试**

Run: `pnpm exec vitest run src/features/editor/ConfigEditorModal.test.tsx src/services/toml-sync.test.ts`

Expected: 退出码 0；新增 FRPC/FRPS 日志级别断言通过，既有向导草稿同步测试仍通过。

### Task 4: 在日志面板暴露 TRACE 筛选

**Files:**
- Modify: `src/features/logs/LogDashboard.tsx:94-121,137-151`
- Modify: `src/features/logs/LogDashboard.test.tsx`

- [ ] **Step 1: 写 TRACE 筛选的失败 UI 测试**

在 `LogDashboard.test.tsx` 添加测试，输入一条 `info` 和一条 `trace` 日志，点击 `TRACE` 后仅断言 trace 文本存在：

```tsx
it('TRACE 筛选只显示 trace 级别日志', async () => {
  vi.mocked(isTauriEnv).mockReturnValue(true);
  const user = userEvent.setup();
  render(<LogDashboard profiles={[makeProfile({ id: 'p1' })]} onClearLogs={vi.fn()} logs={[
    { id: 'info-1', sequence: 1, profileId: 'p1', profileName: 'p1', timestamp: '10:00:00.001', level: 'info', message: 'daily status', raw: 'daily status' },
    { id: 'trace-1', sequence: 2, profileId: 'p1', profileName: 'p1', timestamp: '10:00:00.002', level: 'trace', message: 'protocol frame', raw: 'protocol frame' },
  ]} />);

  await user.click(screen.getByRole('button', { name: 'TRACE' }));
  expect(screen.queryByText('daily status')).not.toBeInTheDocument();
  expect(screen.getByText('protocol frame')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行日志面板测试，确认 TRACE 按钮尚不存在**

Run: `pnpm exec vitest run src/features/logs/LogDashboard.test.tsx`

Expected: 非零退出，找不到名为 `TRACE` 的按钮。

- [ ] **Step 3: 扩展现有分段控件和徽标颜色**

将级别数组从 `['all', 'info', 'warn', 'error', 'debug']` 改为：

```ts
['all', 'info', 'warn', 'error', 'debug', 'trace']
```

在 `getLevelBadge` 中为 `trace` 使用紫色 `FeishuPillVariant`（与 debug 的排障类视觉语义一致），并在正文 `levelClass` 分支将 `trace` 一并设为 `text-[#722ED1]`。过滤逻辑已按字符串比较，无需重写。

- [ ] **Step 4: 运行日志面板测试**

Run: `pnpm exec vitest run src/features/logs/LogDashboard.test.tsx`

Expected: 退出码 0，原有自动换行、暂停冻结测试继续通过。

### Task 5: 在全局隐藏数字输入框增减箭头

**Files:**
- Modify: `src/styles/globals.css:全局表单控件字体规则之后`
- Create: `src/styles/globals.test.ts`

- [ ] **Step 1: 新建失败测试，锁定跨浏览器选择器**

创建 `src/styles/globals.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

describe('全局数字输入框样式', () => {
  it('隐藏 Chromium/WebKit 和 Firefox 的微调箭头但不改变 number 类型', () => {
    expect(css).toContain('input[type="number"]');
    expect(css).toContain('appearance: textfield');
    expect(css).toContain('-moz-appearance: textfield');
    expect(css).toContain('input[type="number"]::-webkit-inner-spin-button');
    expect(css).toContain('input[type="number"]::-webkit-outer-spin-button');
    expect(css).toContain('-webkit-appearance: none');
  });
});
```

- [ ] **Step 2: 运行样式测试，确认失败**

Run: `pnpm exec vitest run src/styles/globals.test.ts`

Expected: 非零退出，缺少 number 的外观规则。

- [ ] **Step 3: 在全局样式中加入仅外观相关的规则**

紧接全局表单字体规则后加入：

```css
/* 保留数值输入语义与键盘操作，仅移除无必要的浏览器微调箭头。 */
input[type="number"] {
  appearance: textfield;
  -moz-appearance: textfield;
}

input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
```

不得把已有端口字段改为 `type="text"`，不得添加手工校验、按钮或组件分支。

- [ ] **Step 4: 运行样式定向测试**

Run: `pnpm exec vitest run src/styles/globals.test.ts`

Expected: 1 test passed。

### Task 6: 完整验证与人工验收清单

**Files:**
- Modify if behavior/documentation changed during implementation: `README.md` only when其现有配置文档有日志级别字段需要同步；否则不作无关文档改动。

- [ ] **Step 1: 执行受影响前端测试集**

Run: `pnpm exec vitest run src/services/toml-sync.test.ts src/features/editor/ConfigEditorModal.test.tsx src/features/logs/LogDashboard.test.tsx src/styles/globals.test.ts`

Expected: 退出码 0。

- [ ] **Step 2: 执行 Rust 格式与完整运行时测试**

Run: `rustfmt --edition 2021 --check src-tauri/src/frpc_runtime.rs`

Expected: 退出码 0。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: 退出码 0。

- [ ] **Step 3: 执行前端全量测试与构建**

Run: `pnpm test`

Expected: 退出码 0。

Run: `pnpm build`

Expected: 退出码 0；若只有既有 Vite chunk-size 警告，需如实记录但不能视作构建失败。

- [ ] **Step 4: 做真实桌面端人工验收，不以单元测试替代**

在 Windows Tauri 桌面端确认：

1. 选择 INFO 后启动 FRPC，日志行只显示一次 `2026-...SSS` 时间；正文从 `[I]` 之后的 `[...]` 开始，不再重复前缀。
2. 将日志级别改为 DEBUG、TRACE 后保存并重新打开连接，选择器和 TOML `[log] level = "..."` 都保留所选值；在 FRPS 配置中做相同检查。
3. 日志过滤栏出现 TRACE，点击后只显示 trace 条目；复制与导出每行同样只有一个时间字段。
4. 在连接编辑器、代理规则、服务器节点等所有端口数字输入框检查：上下微调箭头消失，直接输入数字、方向键操作和既有保存校验仍可用。

- [ ] **Step 5: 记录版本控制检查的真实环境结果**

Run: `git status --short`

Expected: 当前目录仍会因非 Git 仓库返回非零；记录该环境限制，不要将其误报为代码测试失败，也不要初始化仓库。

## 实现完成标准

- ANSI 清洗后标准 FRP 行的时间与级别来自 FRP 原文，且 UI/复制/导出不再有重复时间。
- 不符合标准格式的 stdout/stderr 仍显示，保留后端采集的兜底时间和现有级别规则。
- FRPC、FRPS 的高级表单都能设置 INFO/WARN/ERROR/DEBUG/TRACE；默认 INFO，说明文案正确，TOML 可往返。
- 日志面板可以筛选 TRACE。
- 所有 number 输入框保持 number 语义但不显示浏览器自带加减箭头。
- 相关测试、完整 Rust 测试、前端测试和生产构建均成功；人工端到端结果单独如实记录。
