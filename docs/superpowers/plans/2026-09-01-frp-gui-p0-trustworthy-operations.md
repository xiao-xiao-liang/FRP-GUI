# FRP-GUI P0 可信操作闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让网络诊断、核心状态和启动失败路径均展示真实结果，并将失败连接直接带入可恢复的诊断流程。

**Architecture:** 在 `App.tsx` 集中持有当前核心和诊断上下文，作为页面间状态的唯一协调点。`DashboardOverview` 只渲染由 `profiles` 与已选核心派生的真实状态；`DiagnosticModal` 接受可选预选方案，并把检测结果回传给应用层以更新方案的最近检测信息。P0 不改变配置格式和 TOML 编辑器，仅修复用户可见的操作闭环。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS、Radix UI、Vitest、React Testing Library。

---

## 范围和文件结构

本计划只实现设计文档中的 P0。P1 的“我的连接”、场景向导和卡片重排，以及 P2 的历史与无障碍增强，保留在已批准的设计文档中，另行规划，避免将可独立验收的状态可信改造与大规模信息架构调整耦合。

| 文件 | 责任 |
| --- | --- |
| `package.json` | 添加测试脚本与测试开发依赖。 |
| `vitest.config.ts` | 为 React 组件测试提供 jsdom、别名和测试初始化。 |
| `src/test/setup.ts` | 注册 `@testing-library/jest-dom` 断言。 |
| `src/test/fixtures.ts` | 提供不含敏感 Token 的 `Profile` 与 `FrpCore` 测试夹具。 |
| `src/types/frp.ts` | 将最近诊断时间写入方案统计模型。 |
| `src/features/diagnostics/DiagnosticModal.tsx` | 支持预选方案、回传检测结果并保留本地历史。 |
| `src/features/dashboard/DashboardOverview.tsx` | 删除固定速率与固定核心版本，展示真实核心和异常摘要。 |
| `src/features/profiles/ProfileCard.tsx` | 将异常提示中的“立即排查”接入全局诊断。 |
| `src/features/profiles/ProfileList.tsx` | 将方案级诊断回调传递给卡片。 |
| `src/App.tsx` | 挂载诊断弹窗、校验当前核心、传递核心给启动命令，并将失败和检测结果写回方案。 |
| `src/features/diagnostics/DiagnosticModal.test.tsx` | 覆盖预选方案与检测结果回传。 |
| `src/features/dashboard/DashboardOverview.test.tsx` | 覆盖未配置核心和异常摘要，不允许固定指标回归。 |
| `src/App.test.tsx` | 覆盖“网络连通检测”进入诊断而非新建方案，以及未配置核心时阻止启动。 |

当前项目没有 Git 仓库，且用户未授权提交；执行时不包含 `git commit` 步骤。

### Task 1: 建立可运行的组件测试基线

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/test/fixtures.ts`

- [x] **Step 1: 添加测试依赖和脚本**

在 `package.json` 的 `scripts` 中加入以下脚本，并以开发依赖安装 Vitest 与 Testing Library：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest"
  }
}
```

运行：

```powershell
pnpm add -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [x] **Step 2: 添加 Vitest 配置与断言初始化**

创建 `vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    clearMocks: true,
  },
});
```

创建 `src/test/setup.ts`：

```ts
import '@testing-library/jest-dom/vitest';
```

- [x] **Step 3: 创建最小、无敏感信息的测试夹具**

创建 `src/test/fixtures.ts`：

```ts
import type { FrpCore, Profile } from '../types/frp';

export const makeProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'profile-nas',
  name: '家庭 NAS',
  type: 'frpc',
  description: '公开家庭 NAS',
  config: {
    serverAddr: 'frp.example.test',
    serverPort: 7000,
    proxies: [{ name: 'nas-web', type: 'http', localIP: '127.0.0.1', localPort: 8080, customDomains: ['nas.example.test'] }],
    visitors: [],
  },
  rawToml: 'serverAddr = "frp.example.test"',
  status: 'stopped',
  stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

export const makeCore = (overrides: Partial<FrpCore> = {}): FrpCore => ({
  id: 'core-0611',
  name: 'FRPC 核心',
  version: 'v0.61.1',
  arch: 'amd64',
  os: 'windows',
  path: 'C:\\Tools\\frpc.exe',
  isDefault: true,
  isCustom: true,
  status: 'ready',
  ...overrides,
});
```

- [x] **Step 4: 验证测试运行器可用**

运行：

```powershell
pnpm test
```

预期：Vitest 以成功退出；在尚未添加测试文件时显示 `No test files found`。`--passWithNoTests` 只影响无测试文件的首次初始化，不会掩盖已有测试的失败。

### Task 2: 为诊断结果定义可持久的方案状态

**Files:**
- Modify: `src/types/frp.ts:96-104`

- [x] **Step 1: 为方案统计增加最后检测时间字段**

在 `ProfileStats` 中紧随 `lastPingMs` 增加：

```ts
lastCheckedAt?: number;
```

`lastPingMs` 只保存成功探测的延迟；`lastCheckedAt` 无论成功或失败均更新，使 UI 可以诚实地展示“最后检查时间”。不新增另一套连接状态字段，继续以现有 `Profile.status === 'error'` 表示“需要处理”。

- [x] **Step 2: 进行类型检查**

运行：

```powershell
pnpm exec tsc -b
```

预期：PASS；该字段为可选字段，不影响已有缓存数据和导入数据。

### Task 3: 将真实诊断弹窗接入全局入口和方案上下文

**Files:**
- Modify: `src/features/diagnostics/DiagnosticModal.tsx:14-58`
- Modify: `src/App.tsx:1-12, 220-228, 535-548, 620-635`
- Test: `src/features/diagnostics/DiagnosticModal.test.tsx`
- Test: `src/App.test.tsx`

- [x] **Step 1: 写入失败的预选方案与结果回传测试**

创建 `src/features/diagnostics/DiagnosticModal.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { DiagnosticModal } from './DiagnosticModal';
import { makeProfile } from '../../test/fixtures';

vi.mock('../../services/ipc', () => ({
  testServerConnectivity: vi.fn().mockResolvedValue({
    server: 'frp.example.test', port: 7000, latencyMs: 18,
    status: 'success', timestamp: '10:00:00',
  }),
}));

it('预填目标方案并将检测结果回传给应用层', async () => {
  const user = userEvent.setup();
  const onDiagnosticComplete = vi.fn();
  render(<DiagnosticModal isOpen onClose={vi.fn()} profiles={[makeProfile()]} selectedProfile={makeProfile()} onDiagnosticComplete={onDiagnosticComplete} />);

  expect(screen.getByDisplayValue('frp.example.test')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '开始连通性测试' }));
  expect(onDiagnosticComplete).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', latencyMs: 18 }));
});
```

同一文件创建前，在 `src/App.test.tsx` 写入全局入口测试：

```tsx
import { beforeEach, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

beforeEach(() => localStorage.clear());

it('网络连通检测打开诊断而不是新建方案', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: '网络连通检测' }));
  expect(screen.getByText('网络节点连通性测试与延迟探测')).toBeInTheDocument();
  expect(screen.queryByText('新建 FRP 穿透方案')).not.toBeInTheDocument();
});
```

运行：

```powershell
pnpm test src/features/diagnostics/DiagnosticModal.test.tsx
```

预期：FAIL，`selectedProfile` 与 `onDiagnosticComplete` 尚不存在；第二个测试会显示当前入口打开“新建 FRP 穿透方案”。

- [x] **Step 2: 使诊断弹窗具有受控上下文**

将 props 扩展为：

```ts
interface DiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: Profile[];
  selectedProfile?: Profile | null;
  onDiagnosticComplete?: (result: DiagnosticResult) => void;
}
```

使用 `useEffect` 在 `isOpen && selectedProfile` 时从 `selectedProfile.config` 写入 `host` 与 `port`。在 `handleTest` 成功或失败取得 `res` 后，紧接历史更新调用：

```ts
onDiagnosticComplete?.(res);
```

保持“方案一键探测”行为：它也必须调用同一 `handleTest`，所以结果会自动回传。

- [x] **Step 3: 在 App 中建立诊断状态与入口**

导入 `DiagnosticModal`，并在现有弹窗状态旁新增：

```ts
const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
const [diagnosticTargetProfile, setDiagnosticTargetProfile] = useState<Profile | null>(null);

const handleOpenDiagnostics = (profile: Profile | null = null) => {
  setDiagnosticTargetProfile(profile);
  setIsDiagnosticOpen(true);
};

const handleDiagnosticComplete = (result: DiagnosticResult) => {
  if (!diagnosticTargetProfile) return;
  setProfiles((previous) => previous.map((profile) => profile.id === diagnosticTargetProfile.id
    ? {
        ...profile,
        status: result.status === 'failed' ? 'error' : profile.status,
        stats: {
          ...profile.stats,
          lastPingMs: result.latencyMs ?? undefined,
          lastCheckedAt: Date.now(),
          lastError: result.status === 'failed' ? result.error : undefined,
        },
        updatedAt: Date.now(),
      }
    : profile));
};
```

将 `DashboardOverview` 的 `onOpenDiagnostics` 改为 `() => handleOpenDiagnostics()`；删除当前错误的 `setIsEditorOpen(true)` 分支。与 `ConfigEditorModal`、`SyncModal` 同级渲染：

```tsx
<DiagnosticModal
  isOpen={isDiagnosticOpen}
  onClose={() => setIsDiagnosticOpen(false)}
  profiles={profiles}
  selectedProfile={diagnosticTargetProfile}
  onDiagnosticComplete={handleDiagnosticComplete}
/>
```

- [x] **Step 4: 验证诊断组件测试通过**

运行：

```powershell
pnpm test src/features/diagnostics/DiagnosticModal.test.tsx
```

预期：PASS；测试确认预填 `frp.example.test:7000` 且成功探测被回传。

### Task 4: 从失败连接直接进入诊断，并保留日志路径

**Files:**
- Modify: `src/features/profiles/ProfileCard.tsx:14-31, 104-121`
- Modify: `src/features/profiles/ProfileList.tsx:20-31, 465-478`
- Modify: `src/App.tsx:550-572`
- Test: `src/features/profiles/ProfileCard.test.tsx`

- [x] **Step 1: 写入失败的错误连接操作测试**

创建 `src/features/profiles/ProfileCard.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ProfileCard } from './ProfileCard';
import { makeProfile } from '../../test/fixtures';

it('异常方案可直接进入排查', async () => {
  const user = userEvent.setup();
  const onDiagnose = vi.fn();
  render(<ProfileCard profile={makeProfile({ status: 'error' })} onToggle={vi.fn()} onEdit={vi.fn()} onClone={vi.fn()} onDelete={vi.fn()} onSync={vi.fn()} onViewLogs={vi.fn()} onDiagnose={onDiagnose} />);

  await user.click(screen.getByRole('button', { name: '异常中断 ▾' }));
  await user.click(screen.getByRole('button', { name: '立即排查' }));
  expect(onDiagnose).toHaveBeenCalledWith(expect.objectContaining({ id: 'profile-nas' }));
});
```

运行：

```powershell
pnpm test src/features/profiles/ProfileCard.test.tsx
```

预期：FAIL，`ProfileCardProps` 中尚无 `onDiagnose`，错误 Popover 中也没有“立即排查”。

- [x] **Step 2: 在卡片错误提示中加入“立即排查”**

为 `ProfileCardProps` 增加：

```ts
onDiagnose: (profile: Profile) => void;
```

在现有错误 Popover 的“查看日志”按钮前添加：

```tsx
<button
  type="button"
  onClick={() => {
    setShowErrorPopover(false);
    onDiagnose(profile);
  }}
  className="text-[#165DFF] hover:underline font-medium cursor-pointer"
>
  立即排查
</button>
```

保留“查看日志”作为证据查看入口，不把日志当作唯一恢复路径。

- [x] **Step 3: 贯通列表与应用层回调**

为 `ProfileListProps` 增加同名 `onDiagnose`；在卡片渲染中传入 `onDiagnose={onDiagnose}`。在 `App.tsx` 渲染 `ProfileList` 时传入：

```tsx
onDiagnose={(profile) => handleOpenDiagnostics(profile)}
```

同时确保 `handleToggleProfile` 的失败分支记录可读错误，而不只写 `status: 'error'`：

```ts
const errorMessage = res.error || 'FRP 进程启动失败，请检查核心、服务器地址和认证信息';
setProfiles((previous) => previous.map((item) => item.id === p.id
  ? { ...item, status: 'error', stats: { ...item.stats, lastError: errorMessage } }
  : item));
feishuToast.error(`启动失败: ${errorMessage}`);
```

- [x] **Step 4: 运行诊断和应用入口测试**

运行：

```powershell
pnpm test src/features/diagnostics/DiagnosticModal.test.tsx src/App.test.tsx src/features/profiles/ProfileCard.test.tsx
```

预期：PASS；“网络连通检测”展示诊断标题，错误状态保留可读原因。

### Task 5: 移除概览假数据，并阻止无核心启动

**Files:**
- Modify: `src/features/dashboard/DashboardOverview.tsx:14-31, 158-191`
- Modify: `src/App.tsx:240-301, 535-548`
- Test: `src/features/dashboard/DashboardOverview.test.tsx`
- Test: `src/App.test.tsx`

- [x] **Step 1: 写入失败的概览状态测试**

创建 `src/features/dashboard/DashboardOverview.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { DashboardOverview } from './DashboardOverview';
import { makeProfile } from '../../test/fixtures';

it('未配置核心时不显示固定版本或模拟速率', () => {
  render(<DashboardOverview profiles={[makeProfile({ status: 'error' })]} activeCore={null} onStartAll={() => {}} onStopAll={() => {}} onCreateNew={() => {}} onOpenLogs={() => {}} onOpenDiagnostics={() => {}} onOpenCores={() => {}} />);

  expect(screen.getByText('未配置')).toBeInTheDocument();
  expect(screen.getByText('需要处理')).toBeInTheDocument();
  expect(screen.queryByText('1.2 MB/s')).not.toBeInTheDocument();
  expect(screen.queryByText('v0.61.1')).not.toBeInTheDocument();
});
```

运行：

```powershell
pnpm test src/features/dashboard/DashboardOverview.test.tsx
```

预期：FAIL，因为当前组件没有 `activeCore` 且渲染固定速率与 `v0.61.1`。

- [x] **Step 2: 让概览只读取真实核心和异常数**

将 `DashboardOverviewProps` 增加：

```ts
activeCore: FrpCore | null;
```

在组件内计算：

```ts
const errorCount = profiles.filter((profile) => profile.status === 'error').length;
const coreReady = Boolean(activeCore?.path) && activeCore?.status !== 'not_downloaded';
```

用“需要处理”卡片替换整个“实时穿透速率”固定卡片：显示 `errorCount`，无异常时显示 `0` 与“暂无待处理连接”。核心卡片显示 `activeCore?.version` 和 `activeCore?.name`；当 `coreReady` 为 false 时显示“未配置”和“配置核心”，点击进入 `onOpenCores`。删除硬编码的 `1.2 MB/s`、`348 KB/s` 与 `v0.61.1` 字面量及不再使用的 `ArrowDown`、`ArrowUp` 导入。

- [x] **Step 3: 以已选核心启动，缺失时阻断**

在 `AppLayout` 中计算：

```ts
const activeCore = useMemo(
  () => cores.find((core) => core.id === activeCoreId) ?? null,
  [cores, activeCoreId],
);
```

在 `handleToggleProfile` 的启动分支开头加入：

```ts
if (!activeCore?.path || activeCore.status === 'not_downloaded') {
  feishuToast.warning('请先在“FRP 核心管理”中配置可用核心后再启动连接');
  navigate('/cores');
  return;
}
```

将调用改为：

```ts
const res = await startProfileInstance(p, activeCore);
```

把 `activeCore={activeCore}` 传给 `DashboardOverview`。批量启动继续复用 `handleToggleProfile`，因此会在没有核心时阻断且不把方案错误标记为正在启动。

- [x] **Step 4: 完成概览与启动阻断测试**

在 `src/App.test.tsx` 增加：

```tsx
it('未配置核心时启动方案跳转到核心管理且不显示启动成功', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getAllByRole('button', { name: '启动方案' })[0]);
  expect(await screen.findByText('FRP 核心引擎管理')).toBeInTheDocument();
  expect(screen.queryByText(/已成功启动/)).not.toBeInTheDocument();
});
```

运行：

```powershell
pnpm test src/features/dashboard/DashboardOverview.test.tsx src/App.test.tsx
```

预期：PASS；概览无固定指标，未配置核心时用户被带到核心管理。

### Task 6: 执行完整回归和人工任务走查

**Files:**
- Modify: `README.md: 核心特性或测试说明`（仅当实际行为文案需要同步时）

- [x] **Step 1: 运行全部自动化验证**

运行：

```powershell
pnpm test
pnpm build
```

预期：两个命令均以 0 退出；测试覆盖诊断入口、预选方案、诊断回传、无核心阻断和无固定概览指标。

- [x] **Step 2: 在浏览器开发模式进行三条任务走查**

运行：

```powershell
pnpm dev
```

按以下顺序验证：

1. 在概览点击“网络连通检测”，确认出现“网络节点连通性测试与延迟探测”，而非“新建 FRP 穿透方案”。
2. 选择一个方案，打开其诊断并成功或失败执行一次探测；确认历史中出现结果，成功时更新延迟，失败时方案呈现错误原因。
3. 清除活动核心后点击“启动方案”；确认跳转核心管理、显示配置提示，且没有方案状态被改成 `starting`。
4. 配置可执行核心后再次启动；确认 `startProfileInstance` 接收该核心路径，启动结果和日志仍可使用。

- [x] **Step 3: 检查本轮改动与文档同步**

运行：

```powershell
git diff --check
git diff
git status --short
```

预期：若工作区仍不是 Git 仓库，命令会明确失败；记录该环境限制，改为人工检查本轮修改文件和构建输出。只有实际改变了用户可见测试方式时，才在 `README.md` 增加 `pnpm test` 命令，避免无关文档变更。

## 计划自检

- **规格覆盖：** P0 的诊断入口、真实核心/统计、启动失败原因和异常到排障路径分别由 Task 3、Task 5 与 Task 4 实现；配置兼容和 TOML 保留由 Task 6 回归走查验证。
- **范围边界：** P1/P2 未混入本计划；它们需要在 P0 成功验收后依据真实状态模型单独规划。
- **类型一致性：** `DiagnosticResult` 作为诊断回传类型；`ProfileStats.lastCheckedAt` 统一使用 epoch 毫秒；当前核心统一命名为 `activeCore`；状态仍复用现有 `ProcessStatus`。
- **占位检查：** 本文件不含未定义任务、待定实现或泛化测试步骤；每个测试均给出断言、命令和预期结果。
