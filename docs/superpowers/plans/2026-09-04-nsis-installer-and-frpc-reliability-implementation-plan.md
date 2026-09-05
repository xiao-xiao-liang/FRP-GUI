# NSIS 主安装包与 FRPC 运行期可靠性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 DBX 同类的中文 NSIS `setup.exe` 主安装包，并让 FRPC 日志、停止状态和无黑框启动不再依赖单一事件通道。

**Architecture:** Rust 运行时以每个受监管 profile 的有限、脱敏日志缓冲为权威来源，Tauri 事件只负责低延迟推送；前端把事件与快照按 `(profileId, sequence)` 去重合并。停止操作复用已有状态快照作为最终依据。Windows 下所有 FRPC 子进程命令均通过单一无窗口构造器创建。发布层新增 NSIS 主包，现有两个 MSI 产物保持不变。

**Tech Stack:** Tauri 2、Rust/Tokio、React 19、TypeScript、Vitest、Tauri NSIS、WiX MSI。

---

## 文件结构

- Modify: `src-tauri/src/frpc_runtime.rs` — 运行时日志快照、无窗口命令构造器、Rust 回归测试。
- Modify: `src-tauri/src/lib.rs` — 暴露只读 `get_runtime_logs` Tauri 命令。
- Modify: `src/types/frp.ts` — 增加带序号的运行期日志类型。
- Modify: `src/services/ipc.ts` — 解析、查询并返回日志快照。
- Modify: `src/services/ipc.test.ts` — IPC 参数、日志序号和畸形载荷测试。
- Modify: `src/App.tsx` — 事件/快照日志合并，启动和停止后的状态收敛。
- Modify: `src/App.test.tsx` — 日志事件缺失、停止事件缺失和去重回归测试。
- Modify: `src-tauri/tauri.conf.json` — 启用中文、当前用户 NSIS 配置。
- Create: `scripts/bundle-setup.cjs` — 构建并稳定命名 NSIS `setup.exe`。
- Modify: `package.json` — 添加 NSIS 构建命令。
- Modify: `README.md` — 三种 Windows 安装包的选择和真实耗时边界。

当前工作目录不是 Git 仓库，且用户未授权提交；所有任务均不执行 `git commit`。

### Task 1: 后端日志快照与统一无窗口命令

**Files:**
- Modify: `src-tauri/src/frpc_runtime.rs:1-20, 52-95, 150-170, 265-310, 409-490, 760-780, 900-1160`

- [ ] **Step 1: 先写 Rust 失败测试，定义日志缓冲与快照语义**

在 `frpc_runtime.rs` 的 `#[cfg(test)]` 模块新增测试；先只引用尚不存在的 API：

```rust
#[tokio::test]
async fn runtime_log_snapshot_is_sanitized_ordered_and_bounded() {
    let handle = Arc::new(ProfileProcessHandle::new("snapshot_profile".to_string()));
    for index in 0..(MAX_RUNTIME_LOGS_PER_PROFILE + 2) {
        FrpcRuntimeManager::capture_runtime_log(
            handle.clone(),
            None,
            "2026-09-04 16:18:19".to_string(),
            "info".to_string(),
            format!("line-{index} token = should_be_hidden"),
        ).await;
    }

    let logs = handle.runtime_logs_snapshot().await;
    assert_eq!(logs.len(), MAX_RUNTIME_LOGS_PER_PROFILE);
    assert_eq!(logs.first().unwrap().sequence, 3);
    assert!(logs.windows(2).all(|pair| pair[0].sequence < pair[1].sequence));
    assert!(logs.iter().all(|log| log.message.contains("token = ******")));
    assert!(logs.iter().all(|log| !log.message.contains("should_be_hidden")));
}

#[tokio::test]
async fn manager_returns_only_requested_profile_logs() {
    let manager = FrpcRuntimeManager::new(std::env::temp_dir());
    let first = Arc::new(ProfileProcessHandle::new("first".to_string()));
    let second = Arc::new(ProfileProcessHandle::new("second".to_string()));
    manager.registry.lock().await.insert("first".to_string(), first.clone());
    manager.registry.lock().await.insert("second".to_string(), second.clone());
    FrpcRuntimeManager::capture_runtime_log(first, None, "t".to_string(), "info".to_string(), "first".to_string()).await;
    FrpcRuntimeManager::capture_runtime_log(second, None, "t".to_string(), "info".to_string(), "second".to_string()).await;

    let logs = manager.get_runtime_logs(Some("first".to_string())).await.unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0].profile_id, "first");
}
```

- [ ] **Step 2: 运行 Rust 测试，确认其因缺少 API 失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml runtime_log_snapshot_is_sanitized_ordered_and_bounded manager_returns_only_requested_profile_logs`

Expected: 编译失败，提示 `MAX_RUNTIME_LOGS_PER_PROFILE`、`capture_runtime_log`、`runtime_logs_snapshot` 或 `get_runtime_logs` 不存在。

- [ ] **Step 3: 实现最小日志数据结构和快照 API**

在 `frpc_runtime.rs`：

```rust
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};

pub const MAX_RUNTIME_LOGS_PER_PROFILE: usize = 500;
pub const MAX_RUNTIME_LOG_SNAPSHOT: usize = 2_000;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FrpcRuntimeLogEvent {
    pub sequence: u64,
    pub profile_id: String,
    pub timestamp: String,
    pub level: String,
    pub message: String,
}

// ProfileProcessHandle 新增：
pub runtime_logs: Mutex<VecDeque<FrpcRuntimeLogEvent>>,
pub next_log_sequence: AtomicU64,
```

在 `ProfileProcessHandle::new` 初始化空 `VecDeque` 与 `AtomicU64::new(0)`；新增：

```rust
pub async fn runtime_logs_snapshot(&self) -> Vec<FrpcRuntimeLogEvent> {
    self.runtime_logs.lock().await.iter().cloned().collect()
}

pub async fn clear_runtime_logs(&self) {
    self.runtime_logs.lock().await.clear();
    self.next_log_sequence.store(0, Ordering::SeqCst);
}
```

在 `FrpcRuntimeManager` 新增 `capture_runtime_log`：先 `sanitize_runtime_text`，以 `fetch_add(1, Ordering::SeqCst) + 1` 生成序号，推入队列，超出上限时 `pop_front`，随后才调用 `sink.emit_log`。新增 `get_runtime_logs(profile_id)`：profileId 存在时先复用 `validate_profile_id`；遍历 registry、复制快照、按 `(timestamp, profile_id, sequence)` 排序、仅保留最后 `MAX_RUNTIME_LOG_SNAPSHOT` 条。无效 profileId 返回 `ERR_INVALID_PROFILE_ID`，不存在 profile 返回空数组。

在每次 `start_profile` 设置 `starting` 后调用 `handle.clear_runtime_logs().await`，保证新实例不展示上一次运行期日志。把 stdout/stderr 两个读取协程中直接 `emit_log` 的代码替换为 `capture_runtime_log`。

- [ ] **Step 4: 统一所有 FRPC 命令的 Windows 无窗口配置**

在 `frpc_runtime.rs` 新增唯一构造器，并删除启动路径中散落的数字字面量：

```rust
fn new_frpc_command(executable: &Path) -> Command {
    let mut command = Command::new(executable);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}
```

将 `verify_frpc_executable` 的 `Command::new(canonical_path)` 改为 `new_frpc_command(canonical_path)`；将 `start_profile` 的 `Command::new(&canonical_core)` 同样改为该构造器。仍明确设置 `stdout(Stdio::piped())`、`stderr(Stdio::piped())`，不引入 `cmd.exe`、`.bat` 或 shell。

- [ ] **Step 5: 运行 Rust 定向测试并修正测试期望**

Run: `cargo test --manifest-path src-tauri/Cargo.toml runtime_log_snapshot_is_sanitized_ordered_and_bounded manager_returns_only_requested_profile_logs early_exit_is_error_never_running_and_captures_real_logs`

Expected: PASS。已有提前退出测试的日志断言需补充 `sequence >= 1`，且仍验证 token 脱敏。

### Task 2: 暴露日志快照 IPC，并保持前后端类型一致

**Files:**
- Modify: `src-tauri/src/lib.rs:123-128, 600-608`
- Modify: `src/types/frp.ts:74-87, 147-155`
- Modify: `src/services/ipc.ts:90-180, 264-285`
- Modify: `src/services/ipc.test.ts:42-50, 150-230, 240-265`

- [ ] **Step 1: 添加 IPC 失败测试**

在 `ipc.test.ts` 先添加：

```ts
it('getRuntimeLogs 仅接受带正整数 sequence 的脱敏快照条目', async () => {
  vi.mocked(isTauriEnv).mockReturnValue(true);
  (window as any).__MOCK_TAURI_ENV__ = true;
  const invoke = vi.fn().mockResolvedValue([
    { sequence: 1, profileId: 'profile_1', timestamp: '2026-09-04 16:18:19', level: 'info', message: 'login success' },
    { sequence: 0, profileId: 'profile_1', timestamp: 't', level: 'info', message: 'must be ignored' },
  ]);
  (window as any).__TAURI__ = { core: { invoke } };

  const logs = await getRuntimeLogs('profile_1');
  expect(invoke).toHaveBeenCalledWith('get_runtime_logs', { profileId: 'profile_1' });
  expect(logs).toEqual([{ sequence: 1, profileId: 'profile_1', timestamp: '2026-09-04 16:18:19', level: 'info', message: 'login success' }]);
});
```

同时把所有 `emitRuntimeLog` 有效样本补上 `sequence: 1`，保留一个缺失 sequence 的畸形载荷断言其被拒绝。

- [ ] **Step 2: 运行前端定向测试，确认失败**

Run: `pnpm vitest run src/services/ipc.test.ts`

Expected: FAIL，提示 `getRuntimeLogs` 未导出或 `sequence` 不在类型中。

- [ ] **Step 3: 实现 Rust 命令、TypeScript 类型和 IPC 查询函数**

在 `lib.rs` 添加并注册：

```rust
#[tauri::command]
async fn get_runtime_logs(
    state: State<'_, AppState>,
    profile_id: Option<String>,
) -> Result<Vec<frpc_runtime::FrpcRuntimeLogEvent>, String> {
    state.frpc_manager.get_runtime_logs(profile_id).await
}
```

在 `generate_handler!` 中紧随 `get_runtime_states` 注册 `get_runtime_logs`。

在 `frp.ts` 的 `FrpcRuntimeLogEvent` 中新增必填 `sequence: number`；在 `LogEntry` 中新增 `sequence: number`，使 UI 可按序号去重排序。

在 `ipc.ts` 的 `parseRuntimeLogEvent` 中拒绝不是正安全整数的 `sequence`，并返回该字段。新增：

```ts
export async function getRuntimeLogs(profileId?: string): Promise<FrpcRuntimeLogEvent[]> {
  if (!isTauriEnv()) return [];
  try {
    const payload = await tauriInvoke<unknown[]>('get_runtime_logs', profileId ? { profileId } : undefined);
    return Array.isArray(payload)
      ? payload.map(parseRuntimeLogEvent).filter((entry): entry is FrpcRuntimeLogEvent => entry !== null)
      : [];
  } catch (error) {
    console.error('Failed to get runtime logs:', error);
    return [];
  }
}
```

- [ ] **Step 4: 运行 IPC 定向测试**

Run: `pnpm vitest run src/services/ipc.test.ts`

Expected: PASS，且既有运行时事件桥接测试继续通过。

### Task 3: 前端日志合并与停止状态快照兜底

**Files:**
- Modify: `src/App.tsx:1-20, 360-425, 430-590, 890-905`
- Modify: `src/App.test.tsx:1-35, 551-630, 1020-1050`
- Modify: `src/features/logs/LogDashboard.test.tsx:40-100`

- [ ] **Step 1: 先写 App 失败测试**

在 `App.test.tsx` 添加两项测试：

```tsx
it('启动日志事件缺失时仍从后端快照显示 FRPC 启动输出', async () => {
  (startProfileInstance as any).mockResolvedValue({ accepted: true, pid: 8123 });
  (getRuntimeStates as any).mockResolvedValue([{ profileId: 'prof-lifecycle', status: 'running', pid: 8123, timestamp: Date.now() }]);
  (getRuntimeLogs as any).mockResolvedValue([{ sequence: 1, profileId: 'prof-lifecycle', timestamp: '2026-09-04 16:18:19', level: 'info', message: 'login to server success' }]);
  setupTestProfileAndCore('stopped');
  render(<MemoryRouter initialEntries={['/profiles']}><AppLayout /></MemoryRouter>);

  await userEvent.setup().click(await screen.findByRole('button', { name: '启动连接' }));
  await userEvent.setup().click(screen.getByRole('button', { name: /实时日志/ }));
  expect(await screen.findByText('login to server success')).toBeInTheDocument();
});

it('停止成功但 stopped 事件缺失时由快照收敛为已停止', async () => {
  (stopProfileInstance as any).mockResolvedValue({ accepted: true });
  (getRuntimeStates as any).mockResolvedValue([{ profileId: 'prof-lifecycle', status: 'stopped', timestamp: Date.now() }]);
  setupTestProfileAndCore('running');
  render(<MemoryRouter initialEntries={['/profiles']}><AppLayout /></MemoryRouter>);

  await userEvent.setup().click(await screen.findByRole('button', { name: '停止连接' }));
  expect(await screen.findByRole('button', { name: '启动连接' })).toBeInTheDocument();
});
```

在模块 mock 的 IPC 导入中补充 `getRuntimeLogs`，并把以前“停止成功后必须等待事件”的断言改为“快照为 stopping 时仍显示停止中；快照为 stopped 时立即收敛”。

- [ ] **Step 2: 运行定向 App 测试，确认失败**

Run: `pnpm vitest run src/App.test.tsx`

Expected: FAIL，日志快照尚未显示，或停止测试仍显示“停止中”。

- [ ] **Step 3: 实现幂等日志合并和快照同步**

在 `App.tsx` 从 `ipc` 导入 `getRuntimeLogs`。将现有的随机日志 id 改为稳定 id：`runtime-${event.profileId}-${event.sequence}`。新增 `mergeRuntimeLogs(events)`，规则必须是：

```ts
setRuntimeLogs((previous) => {
  const byId = new Map(previous.map((entry) => [entry.id, entry]));
  for (const event of events) {
    const id = `runtime-${event.profileId}-${event.sequence}`;
    byId.set(id, {
      id,
      sequence: event.sequence,
      profileId: event.profileId,
      profileName: event.profileId,
      timestamp: event.timestamp,
      level: event.level,
      message: event.message,
      raw: `[${event.timestamp}] [${event.level.toUpperCase()}] ${event.message}`,
    });
  }
  return [...byId.values()]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp)
      || left.profileId.localeCompare(right.profileId)
      || left.sequence - right.sequence)
    .slice(-2000);
});
```

事件回调调用 `mergeRuntimeLogs([event])`；新增 `hydrateRuntimeLogs(profileId?)` 调用 `getRuntimeLogs` 后合并。应用订阅完成后调用一次；`location.pathname` 进入 `/logs` 时调用一次；启动成功响应完成后同时调用 `getRuntimeStates()` 和 `hydrateRuntimeLogs(p.id)`。

- [ ] **Step 4: 实现停止后的有界状态快照收敛**

在 `App.tsx` 新增：

```ts
const reconcileStoppedState = useCallback(async (profileId: string) => {
  for (const delayMs of [0, 200, 500, 1000]) {
    if (delayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    const state = (await getRuntimeStates()).find((item) => item.profileId === profileId);
    if (!state) continue;
    applyRuntimeState(state);
    if (state.status === 'stopped' || state.status === 'error') return;
  }
  setProfiles((previous) => previous.map((item) => item.id === profileId && item.status === 'stopping'
    ? { ...item, status: 'error', stats: { ...item.stats, lastError: '停止 FRPC 实例超时，请查看运行日志' } }
    : item));
}, [applyRuntimeState]);
```

在 `stopProfileInstance` 返回 `accepted` 后调用 `await reconcileStoppedState(p.id)`，并调用 `await hydrateRuntimeLogs(p.id)`；不得直接伪造 `stopped`。

- [ ] **Step 5: 验证定向前端测试与暂停行为**

Run: `pnpm vitest run src/App.test.tsx src/features/logs/LogDashboard.test.tsx`

Expected: PASS。确认暂停日志测试使用的所有 `LogEntry` 都含 `sequence`，且暂停仍冻结已合并的快照。

### Task 4: 添加 DBX 同类 NSIS setup 主包，保留 MSI

**Files:**
- Modify: `src-tauri/tauri.conf.json:25-38`
- Create: `scripts/bundle-setup.cjs`
- Modify: `package.json:6-15`
- Modify: `README.md:83-92`

- [ ] **Step 1: 配置 NSIS 并先确认构建产物不存在**

在 `tauri.conf.json` 的 `bundle.windows` 新增：

```json
"windows": {
  "webviewInstallMode": {
    "type": "downloadBootstrapper",
    "silent": true
  },
  "nsis": {
    "installMode": "currentUser",
    "languages": ["SimpChinese"],
    "displayLanguageSelector": false
  }
}
```

不要改变 `tauri.offline.conf.json` 的 `offlineInstaller`。

先在 `package.json` 添加但尚未实现的命令：

```json
"tauri:bundle:setup": "node scripts/bundle-setup.cjs"
```

Run: `pnpm tauri:bundle:setup`

Expected: FAIL，提示 `scripts/bundle-setup.cjs` 不存在。

- [ ] **Step 2: 新增稳定命名的 NSIS 构建包装器**

创建 `scripts/bundle-setup.cjs`，遵循现有 `scripts/bundle-msi.cjs` 的 PATH 处理方式，但固定行为为：

1. 调用 `@tauri-apps/cli/tauri.js build --bundles nsis`；
2. 若 Tauri 返回非零则原样失败；
3. 在 `src-tauri/target/release/bundle/nsis/` 中选择本次构建后最新的 `.exe`；
4. 复制为 `FRP-GUI-Pro-x64-setup.exe`；
5. 输出文件名和字节数。

包装器不得删除 Tauri 原始产物、MSI 或任何已有 release 文件。选择源文件时排除目标文件名，避免上一次构建的副本被误选。

- [ ] **Step 3: 构建并进行界面人工验收**

Run: `pnpm tauri:bundle:setup`

Expected: exit code 0，生成 `src-tauri/target/release/bundle/nsis/FRP-GUI-Pro-x64-setup.exe`。

人工验收（不覆盖现有安装）：在隔离 Windows 用户或虚拟机打开 setup，确认有中文欢迎页、安装目录输入框和“浏览”按钮、安装进度及完成页；确认没有 WiX 的“Change destination folder”窗口。系统已装 WebView2 时，在进度页确认没有 WebView2 下载/安装步骤；未安装环境只验证明确显示 Runtime 前置安装进度，不以十秒为通过条件。

- [ ] **Step 4: 更新发布说明并验证三种产物**

将 README 的 Windows 安装说明替换为：默认下载 `FRP-GUI-Pro-x64-setup.exe`；在线 MSI 用于既有 MSI 工作流；离线 MSI 适合无网络但包大且首次运行时安装不保证快速。不得再写“离线安装约十秒”或“额外增加约 127MB”；用“包体和耗时随 WebView2 版本及设备变化”表述。

Run: `Get-ChildItem src-tauri/target/release/bundle/nsis/*.exe, src-tauri/target/release/bundle/msi/*.msi | Select-Object Name,Length`

Expected: 至少包含 `FRP-GUI-Pro-x64-setup.exe`、`FRP-GUI-Pro-x64-online.msi`、`FRP-GUI-Pro-x64-offline.msi`。

### Task 5: 全量验证与交接

**Files:**
- Modify only if verification exposes a test or documentation defect: files listed above.

- [ ] **Step 1: 执行全量自动验证**

Run: `pnpm test`

Expected: 全部 Vitest 通过，且包含日志快照、停止事件丢失和现有暂停冻结测试。

Run: `pnpm build`

Expected: exit code 0；允许现有超过 500kB bundle 的 Vite 警告，但不得出现 TypeScript 错误。

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: exit code 0。

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: exit code 0。

- [ ] **Step 2: 构建三个发布产物**

Run: `pnpm tauri:bundle:setup`

Run: `pnpm tauri:bundle:msi:online`

Run: `pnpm tauri:bundle:msi:offline`

Expected: 三个命令均 exit code 0；最后执行 Task 4 的 `Get-ChildItem` 命令确认命名产物同时存在。

- [ ] **Step 3: 进行 Windows 手工生命周期验收并诚实记录结果**

使用真实 `frpc.exe` 与一个可连接配置：启动后验证没有短暂黑框；日志页至少显示 `start frpc service`、`try to connect`、`login to server success` 或实际服务端返回的对应行；停止后在 2 秒内显示“已停止”。若公网配置不可用，明确标注此项未验证，不得以 Mock 测试替代。

- [ ] **Step 4: 汇报交接结果**

报告每条命令的退出码、三个产物名称及大小、手工验收结果、`cargo fmt --check` 若仍因本轮未触及的既有文件失败的完整原因。当前目录不是 Git 仓库，报告中明确未执行 commit、push 或删除构建产物。
