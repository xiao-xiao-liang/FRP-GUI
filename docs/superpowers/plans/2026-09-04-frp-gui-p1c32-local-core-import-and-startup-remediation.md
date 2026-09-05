# P1-C3.2 本地核心导入与启动故障引导 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` task-by-task. Use `superpowers:systematic-debugging` for every unexpected failure and `superpowers:verification-before-completion` before each report. Do not create a Git commit.

**Goal:** 让 Windows 桌面端能可靠地选择和验证本地 `frpc.exe`，并把“核心无效”和“FRPC 启动失败”引导到正确的修复入口，而不是用网络连通性测试掩盖本机故障。

**Architecture:** Tauri 桌面端的本地核心选择只使用既有的 `pick_core_file` 原生命令，禁止调用仅为旧 Vite 开发中间件设计的 `/api/dev/fs/*` 路径。Rust 将“选择时检查”和“启动前检查”复用同一套 FRPC 客户端验证规则，并向前端返回稳定的失败类别；前端据此显示“修复 FRPC 核心”或“查看启动日志”，网络诊断保留为次级操作。

**Tech Stack:** React 19、TypeScript、Vitest、React Testing Library、Tauri v2、Rust、Tokio。

---

## 已确认的根因与范围

1. `FeishuFileSystemPickerModal` 调用 `fetchFileSystemList()`，后者无条件请求 `/api/dev/fs/list`。Tauri 开发窗口中的 Vite 会为该未知地址返回 `index.html`；代码再对 HTML 调用 `response.json()`，所以出现 `Unexpected token '<'`。Rust 端没有注册目录枚举命令，不能把它包装成“文件系统读取失败”。
2. 导入时的 `detect_core_version()` 只要发现版本数字就把核心写成 `ready`；启动时的 `verify_frpc_executable()` 却要求 `--version` 输出包含字面量 `frpc`。官方 FRPC 新版本可只输出 `0.71.0`，因此同一文件会出现“导入就绪、启动校验失败”的矛盾。
3. 当前所有 `error` 卡片主按钮都调用 `onDiagnose`，它只测试 `serverAddr:serverPort` 的 TCP 可达性。该测试不能诊断本机文件路径、客户端类型、进程启动、TOML 解析或本地端口占用。
4. 本计划不连接任何远程服务器、不写入真实 Token、不读取用户现有 FRP 配置，也不改动 FRPS 远程部署流程。

## 文件职责

| 文件 | 变更职责 |
| --- | --- |
| `src-tauri/src/frpc_runtime.rs` | 统一 FRPC 文件名、版本输出和启动前验证；定义稳定失败类别。 |
| `src-tauri/src/lib.rs` | 暴露只读的 `inspect_frpc_core` IPC，并把启动失败类别返回给前端。 |
| `src/types/frp.ts` | 定义 `FrpcFailureKind`、核心检查结果，并在状态/命令结果中承载失败类别。 |
| `src/services/ipc.ts` | 只在 Tauri 下调用核心检查 IPC；不再让核心导入流程访问 `/api/dev/fs/*`。 |
| `src/features/cores/CoreManagerPage.tsx` | 桌面端点击“选择本地已有核心”时直接打开原生选择框；检查通过才持久化为 `ready`。 |
| `src/features/cores/CoreManagerPage.test.tsx` | 覆盖原生选择、成功导入和失败不持久化。 |
| `src/App.tsx` | 保存结构化 `lastFailureKind`，运行/停止时清除它，并把“修复核心”路由到 `/cores`。 |
| `src/features/profiles/ProfileCard.tsx` | 核心故障主操作改为“修复 FRPC 核心”；其他启动失败主操作改为“查看启动日志”；网络诊断移到更多操作。 |
| `src/features/profiles/ProfileList.tsx` | 表格操作列与卡片保持同一故障动作语义。 |
| `src/features/profiles/ProfileCard.test.tsx`、`src/features/profiles/ProfileList.test.tsx`、`src/App.test.tsx`、`src/services/ipc.test.ts` | 对用户复现路径建立回归保护。 |
| `README.md` | 补充本地核心导入、失败引导和浏览器预览边界。 |

---

### Task 1: 用原生文件对话框替换失效的桌面端伪文件浏览器

**Files:**
- Modify: `src/features/cores/CoreManagerPage.tsx`
- Modify: `src/services/ipc.ts`
- Create: `src/features/cores/CoreManagerPage.test.tsx`

- [ ] **Step 1: 写出桌面端导入的失败测试**

在新测试中 mock `isTauriEnv`、`pickCoreFileNative` 和新检查函数。先定义可复用的核心检查成功值：

```tsx
vi.mock('../../services/ipc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ipc')>()),
  isTauriEnv: vi.fn(() => true),
  pickCoreFileNative: vi.fn(),
  inspectLocalFrpcCore: vi.fn(),
  fetchGitHubReleases: vi.fn().mockResolvedValue([]),
}));

it('桌面端选择本地 frpc 时只调用原生选择和检查，不请求 Vite 文件系统接口', async () => {
  vi.mocked(pickCoreFileNative).mockResolvedValue('D:\\frp_0.71.0_windows_amd64\\frpc.exe');
  vi.mocked(inspectLocalFrpcCore).mockResolvedValue({ version: 'v0.71.0' });
  const onAddCustomCore = vi.fn();
  const onSelectCore = vi.fn();
  render(<CoreManagerPage cores={[]} activeCoreId="" onAddCustomCore={onAddCustomCore} onSelectCore={onSelectCore} />);

  await userEvent.setup().click(screen.getByRole('button', { name: '选择本地已有核心' }));

  await waitFor(() => expect(onAddCustomCore).toHaveBeenCalledWith(expect.objectContaining({
    path: 'D:\\frp_0.71.0_windows_amd64\\frpc.exe', version: 'v0.71.0', status: 'ready', isDefault: true,
  })));
  expect(onSelectCore).toHaveBeenCalledTimes(1);
});

it('核心检查失败时不新增、不设默认，并显示检查错误', async () => {
  vi.mocked(pickCoreFileNative).mockResolvedValue('D:\\frp\\frps.exe');
  vi.mocked(inspectLocalFrpcCore).mockResolvedValue({ version: '', error: '请选择有效的 frpc 客户端程序' });
  const onAddCustomCore = vi.fn();
  const onSelectCore = vi.fn();
  render(<CoreManagerPage cores={[]} activeCoreId="" onAddCustomCore={onAddCustomCore} onSelectCore={onSelectCore} />);
  await userEvent.setup().click(screen.getByRole('button', { name: '选择本地已有核心' }));
  await waitFor(() => expect(screen.getByText('请选择有效的 frpc 客户端程序')).toBeInTheDocument());
  expect(onAddCustomCore).not.toHaveBeenCalled();
  expect(onSelectCore).not.toHaveBeenCalled();
});
```

运行：`pnpm test src/features/cores/CoreManagerPage.test.tsx`

预期：失败，因为页面仍然打开 `FeishuFileSystemPickerModal`，且尚无 `inspectLocalFrpcCore`。

- [ ] **Step 2: 实现最小的桌面端选择边界**

在 `CoreManagerPage.tsx` 删除 `FeishuFileSystemPickerModal`、`fsPicker` 状态和只服务于它的回调；保留下载目录的原生选择逻辑。将入口改为：

```tsx
const handleTriggerFilePicker = async () => {
  if (!isTauriEnv()) {
    feishuToast.warning('浏览器预览不能读取本机可执行文件，请在 FRP-GUI 桌面端导入核心');
    return;
  }
  const selectedPath = await pickCoreFileNative();
  if (!selectedPath) return;

  const inspected = await inspectLocalFrpcCore(selectedPath);
  if (inspected.error) {
    feishuToast.error(inspected.error);
    return;
  }

  const fileName = selectedPath.replace(/[\\/]/g, '/').split('/').pop() || 'frpc.exe';
  const newCore: FrpCore = {
    id: `custom_${Date.now()}`,
    name: `本地核心 (${fileName})`,
    version: inspected.version,
    arch: hostPlatform.arch,
    os: hostPlatform.os,
    path: selectedPath,
    isDefault: true,
    isCustom: true,
    downloadDate: new Date().toLocaleDateString(),
    status: 'ready',
  };
  onAddCustomCore(newCore);
  onSelectCore(newCore.id);
  feishuToast.success(`已导入可用 FRPC 核心: ${fileName} (${inspected.version})`);
};
```

在 `ipc.ts` 新增只读包装：

```ts
export interface LocalFrpcCoreInspection { version: string; error?: string; }

export async function inspectLocalFrpcCore(filePath: string): Promise<LocalFrpcCoreInspection> {
  if (!isTauriEnv()) return { version: '', error: '浏览器预览不能校验本机 FRPC 核心' };
  try {
    return await tauriInvoke<LocalFrpcCoreInspection>('inspect_frpc_core', { filePath });
  } catch {
    return { version: '', error: '无法校验本地 FRPC 核心，请重新选择 frpc.exe' };
  }
}
```

`pickCoreFileNative` 在 Tauri 命令失败时直接返回 `null`，不得继续请求 `/api/dev/pick-file`；该 HTTP 后备路径仅可留给明确的浏览器测试工具，不能从桌面核心导入入口触达。

- [ ] **Step 3: 运行 Task 1 测试**

运行：`pnpm test src/features/cores/CoreManagerPage.test.tsx src/services/ipc.test.ts`

预期：通过；测试必须证明导入流程不依赖 `/api/dev/fs/list`，取消原生窗口不产生 Toast 或状态写入。

---

### Task 2: 统一本地 FRPC 验证并返回结构化失败类别

**Files:**
- Modify: `src-tauri/src/frpc_runtime.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/types/frp.ts`
- Modify: `src/services/ipc.ts`
- Modify: `src/services/ipc.test.ts`

- [ ] **Step 1: 为纯数字版本输出和失败类别写 Rust 失败测试**

在 `frpc_runtime.rs` 的测试模块先增加：

```rust
#[test]
fn version_only_output_from_modern_frpc_is_valid() {
    assert_eq!(parse_frpc_version_output("0.71.0\n", "").unwrap(), "v0.71.0");
}

#[test]
fn non_semver_output_is_not_an_frpc_version() {
    assert_eq!(parse_frpc_version_output("hello", "").unwrap_err(), ERR_CORE_VERIFY_FAILED);
}

#[test]
fn frps_file_name_is_rejected_for_frpc_runtime() {
    assert_eq!(validate_frpc_file_name(Path::new("C:/frp/frps.exe")).unwrap_err(), ERR_CORE_VERIFY_FAILED);
}

#[test]
fn frpc_file_name_is_accepted_for_frpc_runtime() {
    assert!(validate_frpc_file_name(Path::new("C:/frp/frpc.exe")).is_ok());
}
```

运行：`cargo test frpc_runtime`

预期：第一个测试失败，证明当前代码错误拒绝了用户选择的 FRPC 0.71.x 输出。

- [ ] **Step 2: 提取同一套核心检查逻辑**

在 `frpc_runtime.rs` 定义稳定类别：

```rust
pub const FAILURE_CORE_INVALID: &str = "core_invalid";
pub const FAILURE_STARTUP: &str = "startup";
pub const FAILURE_EARLY_EXIT: &str = "early_exit";

pub fn validate_frpc_file_name(path: &Path) -> Result<(), String> {
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
    if name.eq_ignore_ascii_case("frpc") || name.eq_ignore_ascii_case("frpc.exe") { Ok(()) }
    else { Err(ERR_CORE_VERIFY_FAILED.to_string()) }
}

pub fn parse_frpc_version_output(stdout: &str, stderr: &str) -> Result<String, String> {
    let combined = format!("{} {}", stdout, stderr);
    let matched = Regex::new(r"(?m)(?:^|\\s)v?(\\d+\\.\\d+\\.\\d+)(?:\\s|$)")
        .ok().and_then(|re| re.captures(&combined))
        .and_then(|caps| caps.get(1).map(|value| value.as_str().to_string()));
    matched.map(|version| format!("v{}", version)).ok_or_else(|| ERR_CORE_VERIFY_FAILED.to_string())
}
```

`verify_frpc_executable` 必须按顺序调用 `validate_core_path`、`validate_frpc_file_name`、`--version`、`parse_frpc_version_output`，并返回版本字符串。`start_profile` 与新 `inspect_frpc_core` 都调用这个函数；不得保留一个导入校验和一个启动校验的分叉实现。

为 `frpc_runtime::ProcessCommandResult` 增加 `failure_kind: Option<String>`，核心路径或版本失败填入 `Some(FAILURE_CORE_INVALID.to_string())`，spawn 失败填 `startup`，确认期早退填 `early_exit`。所有成功结果必须填 `None`。

在 `lib.rs`：

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalFrpcCoreInspection { version: String, error: Option<String> }

#[tauri::command]
async fn inspect_frpc_core(file_path: String) -> LocalFrpcCoreInspection {
    match frpc_runtime::inspect_frpc_executable(&file_path).await {
        Ok(version) => LocalFrpcCoreInspection { version, error: None },
        Err(error) => LocalFrpcCoreInspection { version: String::new(), error: Some(error) },
    }
}
```

把 `inspect_frpc_core` 加入 `generate_handler!`。`start_profile` 的 Tauri 返回结构也要透传 `failureKind`，而不是把类别丢弃。

在 `src/types/frp.ts` 定义：

```ts
export type FrpcFailureKind = 'core_invalid' | 'startup' | 'early_exit';
export interface ProcessCommandResult { accepted: boolean; pid?: number; error?: string; failureKind?: FrpcFailureKind; success?: boolean; }
export interface ProfileStats { /* existing fields */ lastFailureKind?: FrpcFailureKind; }
```

在 `ipc.ts` 的 `startProfileInstance` 仅白名单映射 `accepted`、`pid`、`error`、`failureKind`；不能透传任意后端字段。

- [ ] **Step 3: 验证 Rust 和 IPC 契约**

运行：

```powershell
cd src-tauri
cargo test frpc_runtime
cd ..
pnpm test src/services/ipc.test.ts
```

预期：纯数字 `0.71.0` 合法；`frps.exe` 被 FRPC 运行时明确拒绝；前端只能接收定义过的失败类别。

---

### Task 3: 依据失败类别提供正确的修复动作

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/profiles/ProfileCard.tsx`
- Modify: `src/features/profiles/ProfileList.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/features/profiles/ProfileCard.test.tsx`
- Modify: `src/features/profiles/ProfileList.test.tsx`

- [ ] **Step 1: 写出动作语义的失败测试**

新增三条互不重叠的断言：

```tsx
it('核心校验失败显示“修复 FRPC 核心”，点击后进入核心管理，不打开网络诊断', async () => {
  mockStartProfileInstance.mockResolvedValue({ accepted: false, failureKind: 'core_invalid', error: '核心程序校验失败' });
  // 点击启动后：expect(button name).toBe('修复 FRPC 核心')；点击后 expect(screen.getByText('FRP 核心引擎管理')).toBeInTheDocument()
});

it('启动确认期早退显示“查看启动日志”，点击后按方案过滤日志', async () => {
  mockStartProfileInstance.mockResolvedValue({ accepted: false, failureKind: 'early_exit', error: 'FRPC 在启动确认阶段退出' });
  // 点击后 expect(location/searchParams).toContain('profileId=prof-lifecycle')
});

it('网络诊断保留在更多操作中，且不会成为核心校验失败的主操作', async () => {
  // 展开“更多操作”后才存在“网络连通性检测”；点击会调用 onDiagnose
});
```

运行：`pnpm test src/App.test.tsx src/features/profiles/ProfileCard.test.tsx src/features/profiles/ProfileList.test.tsx`

预期：失败，因为当前所有错误状态均渲染“立即排查”并直接调用 `onDiagnose`。

- [ ] **Step 2: 以失败类别驱动卡片和表格动作**

在 `App.tsx` 的启动失败分支保存 `lastFailureKind: res.failureKind`；`running` 与 `stopped` 事件必须清除该字段。新增：

```tsx
const handleRepairCore = () => {
  navigate('/cores');
  feishuToast.info('请重新选择并验证本地 frpc.exe，然后再启动连接');
};
```

将它通过 `ProfileList` 传给 `ProfileCard`。在卡片和表格的错误动作遵循相同表：

| `lastFailureKind` | 主按钮 | 回调 |
| --- | --- | --- |
| `core_invalid` | `修复 FRPC 核心` | `onRepairCore()` |
| `startup`、`early_exit`、未知 | `查看启动日志` | `onViewLogs(profile)` |

原来的 `onDiagnose(profile)` 改成“更多操作”中的 `网络连通性检测`。保留错误 Popover 的安全错误摘要和“去日志查看详细报错”，但不得再声称 TCP 测试能修复本机核心校验。

`ProfileList` 操作列必须与 `ProfileCard` 使用相同的 `getErrorPrimaryAction(record)` 小函数或同样的明确分支，避免卡片与表格又产生不同语义。

- [ ] **Step 3: 运行前端专项测试**

运行：`pnpm test src/App.test.tsx src/features/profiles/ProfileCard.test.tsx src/features/profiles/ProfileList.test.tsx`

预期：通过；核心无效永远不打开网络诊断，早退首先进入真实日志，网络诊断仍可从更多操作手动发起。

---

### Task 4: 文档同步与真实桌面端回归

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-03-frp-gui-p1c31-trusted-frpc-desktop-lifecycle-design.md`

- [ ] **Step 1: 更新用户文档**

在 README 的“桌面端功能测试”后新增：

```markdown
### 导入本地 FRPC 核心

在“FRP 核心管理”点击“选择本地已有核心”，桌面端会打开 Windows 原生文件选择窗口。请选择发行包中的 `frpc.exe`，不要选择 `frps.exe`。应用会在保存前执行只读版本检查；只有校验通过的客户端才会显示为可用核心。

如果启动失败，“修复 FRPC 核心”表示本机客户端路径或类型有问题；“查看启动日志”表示进程已尝试启动但需要查看真实输出。网络连通性检测只用于确认服务端端口可达，不能验证本机 `frpc.exe`、Token 或 TOML 配置。
```

设计文档追加此次复现事实和验证命令；不得写入任何服务器 IP、Token 或用户本地绝对路径。

- [ ] **Step 2: 执行全量验证**

在 MSVC Developer PowerShell 中按序运行：

```powershell
pnpm test
pnpm build
cd src-tauri
cargo test
cargo check
cd ..
pnpm tauri dev
pnpm tauri build
```

桌面手动走查只用用户自行选择的本地 `frpc.exe`：导入成功后，先不填真实 Token 进行“无效配置早退”验证；确认卡片主操作为“查看启动日志”且日志是真实 stderr。不要连接远程服务器，不要在测试报告粘贴核心绝对路径或任何凭据。

- [ ] **Step 3: 完成前范围检查**

运行：

```powershell
git status --short
git diff --check
```

如果工作区仍不是 Git 仓库，报告该事实并用修改文件清单替代 `git diff`；不得初始化仓库、提交或删除未知文件。报告每项实际命令的退出码、安装包路径、未验证范围及是否有真实服务器连接（预期：没有）。

---

## Plan self-review

- **根因覆盖：** Task 1 消除 Tauri 中的 Vite HTML/JSON 误解析；Task 2 消除导入与启动的版本校验分叉；Task 3 消除把所有本机启动失败错误导向 TCP 诊断的交互误导。
- **安全：** 不新增任意文件系统 IPC、shell 命令输入、远程访问或凭据读取；原生文件选择只将用户选择的路径交给受控 FRPC 校验。
- **回归：** 每一项用户复现路径都有测试：本机原生选取、FRPC 0.71 纯版本输出、`frps.exe` 拒绝、核心修复跳转、日志优先、手动网络诊断。
- **范围：** 不改 FRPS 远程部署、系统凭据库、下载协议或已有安装包配置。

## Execution handoff

给 Gemini 的首条指令：

> 阅读 `AGENTS.md`、`docs/superpowers/plans/2026-09-04-frp-gui-p1c32-local-core-import-and-startup-remediation.md`、`docs/superpowers/specs/2026-09-03-frp-gui-p1c31-trusted-frpc-desktop-lifecycle-design.md` 全文。必须使用 `superpowers:executing-plans`、`superpowers:test-driven-development`、`superpowers:systematic-debugging` 与 `superpowers:verification-before-completion`。只实施 Task 1，严格先写失败测试并展示其失败输出；不得启动 Task 2，不得连接任何远程服务器，不得读取、记录或粘贴真实 Token、IP、私钥或本机绝对路径；不执行 Git 操作。完成后停止，提交修改文件、测试原始输出和未验证项，等待验收。
