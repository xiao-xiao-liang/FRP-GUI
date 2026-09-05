# FRPC Runtime UI and MSI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FRPC 的真实运行状态与日志在事件丢失或路由切换时仍可收敛、将代理端口冲突呈现为运行中警告、采用已确认的现代连接卡片，并新增可选离线 MSI。

**Architecture:** Rust 运行期监管器与事件协议保持不变；React 应用根部把状态事件和日志事件转化为 UI 状态及非持久化环形日志缓存。启动返回后以 Rust `get_runtime_states` 快照作为事件通道的可信兜底。连接卡只消费 profile 状态和 `lastWarning`，不解析或控制 FRPC。Windows 打包通过独立配置生成离线 MSI，而默认包保持小体积在线安装。

**Tech Stack:** Tauri 2、Rust/Tokio、React 19、TypeScript、Vitest、Testing Library、Tauri bundler。

---

## 文件结构

- 修改：`src/types/frp.ts` — 为 profile 统计信息加入非持久化语义的最新警告字段。
- 修改：`src/App.tsx` — 应用级运行日志环形缓存、状态快照兜底、warning 归集及日志页 props。
- 修改：`src/App.test.tsx` — 覆盖快照兜底、日志跨路由保留及 warning 状态重置。
- 修改：`src/features/logs/LogDashboard.tsx` — 作为应用日志缓存的展示层，支持上层清空。
- 修改：`src/features/logs/LogDashboard.test.tsx` — 验证传入日志可见和清空行为。
- 修改：`src/features/profiles/ProfileCard.tsx` — 按 A 方案更新状态、规则和 warning 视觉层级。
- 修改：`src/features/profiles/ProfileCard.test.tsx` — 验证运行中警告不改变主状态。
- 新增：`src-tauri/tauri.offline.conf.json` — 仅覆盖 Windows MSI 的 WebView2 离线安装配置。
- 修改：`package.json` — 增加可复现的在线/离线 MSI 构建脚本。
- 修改：`README.md` — 说明 MSI 分发选择、包体积与构建命令。

### Task 1: 为启动状态快照兜底编写回归测试

**Files:**
- Modify: `src/App.test.tsx`
- Modify: `src/types/frp.ts`

- [ ] **Step 1: 写入失败测试：事件缺失时，权威运行快照应使卡片变为运行中**

在 `Task 3: FRPC 桌面端真实生命周期与状态收敛` 测试组中新增：

```tsx
it('启动响应成功但 running 事件缺失时，运行时快照仍使卡片收敛到运行中', async () => {
  const user = userEvent.setup();
  (startProfileInstance as any).mockResolvedValue({ accepted: true, pid: 8123 });
  (getRuntimeStates as any)
    .mockResolvedValueOnce([]) // App 初次挂载快照
    .mockResolvedValueOnce([
      { profileId: 'prof-lifecycle', status: 'running', pid: 8123, timestamp: Date.now() },
    ]);
  setupTestProfileAndCore('stopped');

  render(<MemoryRouter initialEntries={['/profiles']}><AppLayout /></MemoryRouter>);
  await user.click(await screen.findByRole('button', { name: '启动连接' }));

  expect(await screen.findByText(/运行中 \(PID: 8123\)/)).toBeInTheDocument();
  expect(stateEventHandler).not.toBeNull();
});
```

- [ ] **Step 2: 运行该测试，确认它因仍停在“启动中”而失败**

Run: `pnpm test -- src/App.test.tsx`

Expected: FAIL，新增测试找不到 `运行中 (PID: 8123)`。

- [ ] **Step 3: 定义 warning 字段并实现仅在权威快照确认 running 时的收敛**

在 `src/types/frp.ts` 的 `ProfileStats` 添加：

```ts
lastWarning?: string;
```

在 `src/App.tsx` 中保留现有 `applyRuntimeState` 作为唯一的状态归一化函数。在 `handleToggleProfile` 的 `res.accepted` 分支加入：

```ts
const states = await getRuntimeStates();
const authoritativeState = states.find((state) => state.profileId === p.id);
if (authoritativeState?.status === 'running') {
  applyRuntimeState(authoritativeState);
}
```

在设置 `starting` 的同一处清理过期警告：

```ts
lastWarning: undefined,
```

不得根据 `accepted` 或 PID 直接制造 `running` 事件；只允许调用 `applyRuntimeState` 处理后端返回的 `running` 快照。

- [ ] **Step 4: 运行目标测试，确认通过**

Run: `pnpm test -- src/App.test.tsx`

Expected: PASS，包含新增快照兜底测试；现有早退、停止和旧快照乱序测试仍通过。

### Task 2: 将运行日志提升为应用级环形缓存

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/logs/LogDashboard.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/features/logs/LogDashboard.test.tsx`

- [ ] **Step 1: 写入失败测试：在连接页收到启动日志后进入日志页应能看到该日志**

在 `src/App.test.tsx` 增加一个可注入 `onLog` handler 的 IPC mock 变量，并新增测试：

```tsx
it('从连接页启动后进入日志页仍显示已收到的运行日志', async () => {
  let runtimeLogHandler: ((event: any) => void) | undefined;
  (subscribeRuntimeEvents as any).mockImplementationOnce(async (onLog: any, onState: any) => {
    runtimeLogHandler = onLog;
    stateEventHandler = onState;
    return async () => {};
  });

  render(<MemoryRouter initialEntries={['/profiles']}><AppLayout /></MemoryRouter>);
  await waitFor(() => expect(runtimeLogHandler).toBeDefined());
  runtimeLogHandler!({
    profileId: 'profile_1', timestamp: '2026-09-04 14:27:17', level: 'warn',
    message: '[backend-8009] Start error: port already used',
  });

  await userEvent.setup().click(screen.getByRole('button', { name: /实时日志/ }));
  expect(await screen.findByText(/port already used/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试，确认其失败**

Run: `pnpm test -- src/App.test.tsx`

Expected: FAIL，因为 App 尚未保存 onLog 事件，日志页没有该行。

- [ ] **Step 3: 在 `AppLayout` 建立环形缓存并同步 profile warning**

扩展 import，加入 `FrpcRuntimeLogEvent` 和 `LogEntry`。在 profile state 附近创建：

```tsx
const [runtimeLogs, setRuntimeLogs] = useState<LogEntry[]>([]);

const appendRuntimeLog = useCallback((event: FrpcRuntimeLogEvent) => {
  const entry: LogEntry = {
    id: `${event.profileId}-${event.timestamp}-${crypto.randomUUID()}`,
    profileId: event.profileId,
    profileName: event.profileId,
    timestamp: event.timestamp,
    level: event.level,
    message: event.message,
    raw: `[${event.timestamp}] [${event.level.toUpperCase()}] ${event.message}`,
  };
  setRuntimeLogs((previous) => [...previous, entry].slice(-2000));
  if (event.level === 'warn') {
    setProfiles((previous) => previous.map((profile) => profile.id === event.profileId
      ? { ...profile, stats: { ...profile.stats, lastWarning: event.message }, updatedAt: Date.now() }
      : profile));
  }
}, []);
```

把 `subscribeRuntimeEvents(undefined, onState)` 改为 `subscribeRuntimeEvents(appendRuntimeLog, onState)`；并把日志路由改为：

```tsx
<LogDashboard
  profiles={profiles}
  logs={runtimeLogs}
  onClearLogs={() => setRuntimeLogs([])}
  activeProfileId={searchParams.get('profileId') || logTargetProfileId}
/>
```

在 `LogDashboard` 将 `initialLogs?: LogEntry[]` 改为必传 `logs: LogEntry[]` 和 `onClearLogs: () => void`；删除 `subscribeLogs` import、实时订阅 `useEffect` 以及组件内部 `logs` state。清空按钮只调用 `onClearLogs`。其余筛选、统计、导出均以 `logs` prop 为数据源。

- [ ] **Step 4: 为日志面板写入 props 驱动与清空测试**

在 `src/features/logs/LogDashboard.test.tsx` 增加：

```tsx
it('桌面端展示应用缓存的日志并将清空委托给上层', async () => {
  vi.mocked(isTauriEnv).mockReturnValue(true);
  const onClearLogs = vi.fn();
  render(<LogDashboard
    profiles={[makeProfile({ id: 'p1' })]}
    logs={[{ id: 'l1', profileId: 'p1', profileName: 'p1', timestamp: '10:00:00', level: 'warn', message: 'port already used', raw: 'port already used' }]}
    onClearLogs={onClearLogs}
  />);
  expect(screen.getByText('port already used')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByTitle('清空日志流'));
  expect(onClearLogs).toHaveBeenCalledOnce();
});
```

- [ ] **Step 5: 运行前端相关测试，确认通过**

Run: `pnpm test -- src/App.test.tsx src/features/logs/LogDashboard.test.tsx`

Expected: PASS，新增跨路由日志测试和清空委托测试均通过。

### Task 3: 实现 A 方案连接卡的运行中 warning 呈现

**Files:**
- Modify: `src/features/profiles/ProfileCard.tsx`
- Modify: `src/features/profiles/ProfileCard.test.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: 写入失败测试：运行中 warning 不得变更为启动失败或启动中**

在 `ProfileCard.test.tsx` 增加：

```tsx
it('运行中的连接显示代理警告但保留运行中主状态', () => {
  render(<ProfileCard
    profile={makeProfile({
      status: 'running',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, pid: 8123, lastWarning: '远程端口 8009 已被占用' },
    })}
    onToggle={vi.fn()} onEdit={vi.fn()} onClone={vi.fn()} onDelete={vi.fn()}
    onSync={vi.fn()} onViewLogs={vi.fn()} onDiagnose={vi.fn()} onRepairCore={vi.fn()}
  />);
  expect(screen.getByText(/运行中 \(PID: 8123\)/)).toBeInTheDocument();
  expect(screen.getByText('远程端口 8009 已被占用')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '停止连接' })).toBeInTheDocument();
  expect(screen.queryByText('正在启动...')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test -- src/features/profiles/ProfileCard.test.tsx`

Expected: FAIL，因为卡片尚未渲染 `lastWarning`。

- [ ] **Step 3: 用 A 方案调整 `ProfileCard` 的视觉结构**

保留所有既有回调和无障碍名称；仅更新卡片结构及 className。实现以下 JSX 片段，置于服务器信息与规则列表之间：

```tsx
{isRunning && profile.stats.lastWarning && (
  <button
    type="button"
    onClick={() => onViewLogs(profile)}
    className="mt-3 flex w-full items-start gap-2 rounded-lg border border-[#FFE7BA] bg-[#FFF8E8] px-3 py-2 text-left text-[12px] text-[#9C6200] hover:border-[#FFB400]"
  >
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
    <span><strong>配置有警告：</strong>{profile.stats.lastWarning}</span>
  </button>
)}
```

同时将运行中状态胶囊固定为绿色“运行中 (PID: …)”，规则块展示 `本地 {localPort} → 公网 {remotePort}` 的辅助文本，底部保持“停止连接”为唯一主操作。不要把 warning 写入 `status`，不要将 warning 当作 `lastError`，不要移除更多操作菜单。

- [ ] **Step 4: 在应用级测试验证下一次启动会清除过期 warning**

增加测试，以含 `lastWarning` 的 stopped profile 点击启动，并断言启动中卡片不再显示旧 warning：

```tsx
expect(screen.queryByText('远程端口 8009 已被占用')).not.toBeInTheDocument();
```

- [ ] **Step 5: 运行卡片与应用测试，确认通过**

Run: `pnpm test -- src/features/profiles/ProfileCard.test.tsx src/App.test.tsx`

Expected: PASS，运行中 warning、warning 清除、既有启动/停止行为均通过。

### Task 4: 增加在线与离线 MSI 构建入口及文档

**Files:**
- Create: `src-tauri/tauri.offline.conf.json`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: 写入离线 MSI 配置**

创建 `src-tauri/tauri.offline.conf.json`：

```json
{
  "bundle": {
    "targets": "msi",
    "windows": {
      "webviewInstallMode": {
        "type": "offlineInstaller"
      }
    }
  }
}
```

- [ ] **Step 2: 添加明确的构建脚本**

在 `package.json` 的 `scripts` 添加：

```json
"tauri:bundle:msi:online": "tauri build --bundles msi",
"tauri:bundle:msi:offline": "tauri build --config src-tauri/tauri.offline.conf.json"
```

保留现有 `tauri` 脚本，不修改依赖版本。

- [ ] **Step 3: 更新 README 的 Windows 安装包说明**

在 Windows 打包章节加入：

```md
### MSI 分发选项

- 在线 MSI：`pnpm tauri:bundle:msi:online`。安装包较小；WebView2 缺失时会联网安装运行时。
- 离线 MSI：`pnpm tauri:bundle:msi:offline`。安装阶段不下载 WebView2，适合网络受限设备；安装包会额外增加约 127MB。

构建两个变体时，请在发布目录分别命名为 `FRP-GUI-Pro-x64-online.msi` 和 `FRP-GUI-Pro-x64-offline.msi`，避免覆盖同名产物。
```

- [ ] **Step 4: 构建默认在线 MSI，确认配置兼容**

Run: `pnpm tauri:bundle:msi:online`

Expected: exit code 0，并在 `src-tauri/target/release/bundle/msi/` 生成 MSI。

- [ ] **Step 5: 构建离线 MSI，确认不依赖网络阶段安装 WebView2**

Run: `pnpm tauri:bundle:msi:offline`

Expected: exit code 0，并在 `src-tauri/target/release/bundle/msi/` 生成 MSI；其文件大小明显大于在线 MSI，证明嵌入 WebView2 安装器。

### Task 5: 全量验证与交接

**Files:**
- Verify: `src/App.tsx`
- Verify: `src/features/logs/LogDashboard.tsx`
- Verify: `src/features/profiles/ProfileCard.tsx`
- Verify: `src-tauri/tauri.offline.conf.json`

- [ ] **Step 1: 执行前端完整测试**

Run: `pnpm test`

Expected: exit code 0；所有 Vitest 文件通过。

- [ ] **Step 2: 执行类型检查与前端生产构建**

Run: `pnpm build`

Expected: exit code 0；TypeScript 与 Vite 构建无错误。

- [ ] **Step 3: 执行 Rust 格式与静态检查**

Run: `cargo fmt --manifest-path src-tauri/Cargo.toml --check`

Expected: exit code 0。

Run: `cargo check --manifest-path src-tauri/Cargo.toml`

Expected: exit code 0。

- [ ] **Step 4: 审查改动范围**

由于当前目录不是 Git 仓库，无法执行 `git status`、`git diff` 或 `git diff --check`。改为逐个检查本计划列出的文件，确认没有修改 `src-tauri/target/`、`dist/`、锁文件或无关组件；如 Gemini 的工作目录已初始化 Git，则补跑：

```bash
git status --short
git diff --check
git diff -- src/types/frp.ts src/App.tsx src/features/logs/LogDashboard.tsx src/features/profiles/ProfileCard.tsx src-tauri/tauri.offline.conf.json package.json README.md
```

- [ ] **Step 5: 人工验收（桌面端，不连接真实服务器）**

使用本地无敏感测试配置在 `pnpm tauri dev` 打开桌面窗口：启动一个可持续运行的 FRPC，确认 800ms 后显示“运行中”；保持在连接页，检查日志页能看到启动输出；注入或复现一条端口占用 warning，确认连接仍显示“运行中”且卡片显示 warning。不要在验证记录中写入 Token、私钥或完整 TOML。

## 计划自检

- 状态事件丢失兜底：Task 1。
- 跨路由启动日志保留：Task 2。
- A 方案视觉、代理 warning 与不误判：Task 3。
- 在线/离线 MSI 及说明：Task 4。
- 单元、构建、Rust 与人工验收：Task 5。

未使用占位事项；`lastWarning`、`appendRuntimeLog`、`logs` 和 `onClearLogs` 的类型及职责在对应任务中已定义。

