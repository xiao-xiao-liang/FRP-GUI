# FRP 核心版本库、目录导入与可恢复下载实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 FRP 核心管理改造成 GitHub 官方 Release 驱动的统一版本库，支持批量目录导入、按当前平台/架构派生状态、下载—校验—解压—验真的单一进度条和安全断点续下。

**Architecture:** GitHub Releases 是唯一版本元数据目录；`FrpCore[]` 是已验证本地安装项，前端将二者按 `tag + 当前 OS + 当前架构` 聚合为一行/一卡。Rust 新增目录扫描与持久化下载任务模块，所有文件写入、Range/ETag、SHA-256、临时解压和原子安装均在桌面端完成，并以 Tauri 事件向前端推送同一任务的阶段进度。

**Tech Stack:** React 19、TypeScript、Vitest、Tauri v2、Rust、Tokio、Reqwest、SHA-256、Zip、Tar/Gzip。

**Preconditions:** 以 [2026-09-07-core-version-library-design.md](../specs/2026-09-07-core-version-library-design.md) 为准。现有工作树有用户未提交改动；实施时只能增量修改本计划列出的文件，不能重置、暂存或覆盖其他改动。未经用户明确要求，不创建 Git 提交。

---

## 文件结构与职责

| 文件 | 变更 | 职责 |
| --- | --- | --- |
| `src/features/cores/core-version-library.ts` | 新建 | 纯前端类型、Release/安装项/下载任务聚合、状态派生、下载速度与 EMA ETA 计算。 |
| `src/features/cores/core-version-library.test.ts` | 新建 | 对状态派生、平台匹配、进度和 ETA 做无 DOM 单元测试。 |
| `src/features/cores/CoreManagerPage.tsx` | 修改 | 读取目录扫描与下载任务、订阅事件、调度导入/下载/恢复，向卡片和表格传入统一行数据。 |
| `src/features/cores/CoreManagerPage.test.tsx` | 修改 | 验证目录导入、唯一 Release 行、表格状态列、卡片任务状态和 IPC 调度。 |
| `src/features/cores/CoreCard.tsx` | 修改 | 复用飞书组件显示“已下载/可下载/下载中/可继续/失败”及单一进度条。 |
| `src/features/cores/CoreCard.test.tsx` | 修改 | 验证无圆点状态胶囊、各阶段文案、速度/ETA、恢复/取消动作。 |
| `src/services/ipc.ts` | 修改 | 声明扫描/下载任务契约，包装 Tauri 调用和 `core-download-progress` 事件订阅；浏览器环境明确阻断。 |
| `src/services/ipc.test.ts` | 修改 | 验证命令参数、事件解包和浏览器环境阻断。 |
| `src-tauri/src/core_import.rs` | 新建 | 安全枚举候选 `frpc/frpc.exe`，限制规模并汇总跳过原因。 |
| `src-tauri/src/core_download.rs` | 新建 | 持久化任务、Range/ETag、流式归档、哈希校验、阶段事件、临时解压、验真和原子提交。 |
| `src-tauri/src/lib.rs` | 修改 | 注册新模块、Tauri 命令和任务状态；删除旧的内存归档式 `download_and_extract_core` 实现与命令注册。 |
| `src-tauri/Cargo.toml` | 修改 | 仅在任务模块需要稳定任务 ID 时新增直接依赖 `uuid`；不升级既有依赖。 |
| `src/types/frp.ts` | 修改 | 定义前后端共用的非敏感下载任务/阶段类型；只在必要时扩展 `FrpCore`，不存下载缓存或凭据。 |
| `README.md` | 修改 | 同步目录批量导入、平台匹配、镜像职责、统一进度和继续下载的用户行为。 |

## 实施任务

### Task 1: 建立可测试的统一版本状态与 ETA 纯函数

**Files:**
- Create: `src/features/cores/core-version-library.ts`
- Create: `src/features/cores/core-version-library.test.ts`
- Modify: `src/types/frp.ts`

- [ ] **Step 1: 写出失败的状态派生与 ETA 测试**

```ts
import { describe, expect, it } from 'vitest';
import { deriveCoreReleaseRows, updateDownloadTelemetry } from './core-version-library';

it('只为同版本生成一行，且仅匹配当前平台架构的本地核心标记为已下载', () => {
  const rows = deriveCoreReleaseRows({
    releases: [{ tag: 'v0.71.0', name: 'v0.71.0', publishedAt: '2026-08-14', assets: [] }],
    cores: [
      { id: 'arm', version: 'v0.71.0', os: 'windows', arch: 'arm64', path: 'D:/arm/frpc.exe', name: 'ARM', isDefault: false, isCustom: true },
      { id: 'x64', version: 'v0.71.0', os: 'windows', arch: 'amd64', path: 'D:/x64/frpc.exe', name: 'x64', isDefault: false, isCustom: true },
    ],
    host: { os: 'windows', arch: 'amd64' }, tasks: [],
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ version: 'v0.71.0', availability: 'downloaded', installationId: 'x64' });
});

it('三个非零秒级样本后，以 EMA 计算 ETA；连续零速时隐藏 ETA', () => {
  let telemetry = updateDownloadTelemetry(undefined, 1_000_000, 10_000_000, 1000);
  telemetry = updateDownloadTelemetry(telemetry, 3_000_000, 10_000_000, 2000);
  telemetry = updateDownloadTelemetry(telemetry, 5_000_000, 10_000_000, 3000);
  expect(telemetry.etaSeconds).toBeGreaterThan(0);
  telemetry = updateDownloadTelemetry(telemetry, 5_000_000, 10_000_000, 6000);
  expect(telemetry.etaSeconds).toBeUndefined();
});
```

- [ ] **Step 2: 运行 RED 验证**

Run: `pnpm vitest run src/features/cores/core-version-library.test.ts`

Expected: FAIL，因为模块和导出尚不存在。

- [ ] **Step 3: 实现最小纯模型**

在 `core-version-library.ts` 定义以下稳定类型与纯函数：

```ts
export type CoreAvailability = 'downloaded' | 'available' | 'downloading' | 'resumable' | 'failed';

export function deriveCoreReleaseRows(input: { releases: GitHubRelease[]; cores: FrpCore[]; host: Pick<HostPlatformInfo, 'os' | 'arch'>; tasks: CoreDownloadTask[] }): CoreReleaseRow[];
export function updateDownloadTelemetry(previous: DownloadTelemetry | undefined, receivedBytes: number, totalBytes: number | undefined, sampledAtMs: number): DownloadTelemetry;
```

在 `src/types/frp.ts` 定义并导出 `CoreDownloadPhase`、`CoreDownloadTask` 和 `CoreDownloadInstallation`；任务字段固定为 `taskId`、`releaseTag`、`assetName`、`phase`、字节/速度/ETA、解压条目、当前文件名、镜像、目标目录、错误和可选 `installation`。`deriveCoreReleaseRows` 必须遍历每一个 Release 一次，优先级为 `downloading/resumable/failed` 任务、当前平台匹配且验真的安装项、否则 `available`；不能因同版本 `FrpCore` 再添加行。`updateDownloadTelemetry` 每秒样本更新瞬时速度，非零样本计数满 3 后以 `0.25 * instant + 0.75 * priorEma` 计算 ETA；连续三次零速、未知总量或非下载阶段清空 ETA。

- [ ] **Step 4: 运行 GREEN 验证**

Run: `pnpm vitest run src/features/cores/core-version-library.test.ts`

Expected: PASS。

### Task 2: 在 Rust 端安全扫描本地目录中的多个 FRPC

**Files:**
- Create: `src-tauri/src/core_import.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/services/ipc.ts`
- Modify: `src/services/ipc.test.ts`

- [ ] **Step 1: 写出候选扫描与 IPC 契约的失败测试**

在 `core_import.rs` 的 `#[cfg(test)]` 模块验证候选名过滤和去重：

```rust
#[test]
fn candidate_filter_only_accepts_frpc_names() {
    assert!(is_frpc_candidate(Path::new("D:/frp/frpc.exe")));
    assert!(is_frpc_candidate(Path::new("/opt/frp/frpc")));
    assert!(!is_frpc_candidate(Path::new("D:/frp/frps.exe")));
    assert!(!is_frpc_candidate(Path::new("D:/frp/frpc.toml")));
}
```

在 `ipc.test.ts` 断言：

```ts
await scanLocalFrpcCores('D:/downloads');
expect(invoke).toHaveBeenCalledWith('scan_local_frpc_cores', { directoryPath: 'D:/downloads' });
```

- [ ] **Step 2: 运行 RED 验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml core_import; pnpm vitest run src/services/ipc.test.ts`

Expected: FAIL，因为模块、命令和前端包装均不存在。

- [ ] **Step 3: 实现受限遍历和批量检查命令**

`core_import.rs` 提供 `discover_frpc_candidates(root: &Path) -> ScanDiscovery`：

```rust
pub const MAX_CORE_SCAN_CANDIDATES: usize = 256;
pub const MAX_CORE_SCAN_DEPTH: usize = 4;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalCoreScanResult {
    pub recognized: Vec<RecognizedLocalCore>,
    pub skipped: Vec<SkippedLocalCore>,
}
```

使用标准库目录遍历，不跟随符号链接；只保留 `frpc/frpc.exe` 候选，超过深度或 256 个候选时返回明确的限制错误。`lib.rs` 的 `scan_local_frpc_cores` 命令先在 `spawn_blocking` 中发现路径，随后逐个调用既有 `frpc_runtime::inspect_frpc_executable`；成功项填入真实路径、版本、当前 `get_system_platform()` 的 OS/架构和文件大小，失败项只返回路径基名与安全原因。浏览器环境中 `scanLocalFrpcCores` 返回桌面端错误，不能回退到 Vite 文件系统 API。

- [ ] **Step 4: 运行 GREEN 验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml core_import; pnpm vitest run src/services/ipc.test.ts`

Expected: PASS。

### Task 3: 创建持久化、可恢复且可观测的下载任务模块

**Files:**
- Create: `src-tauri/src/core_download.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: 先写下载任务的纯函数测试**

在 `core_download.rs` 中覆盖请求验证、Range 判定、阶段进度与缓存恢复资格：

```rust
#[test]
fn partial_response_requires_matching_etag_and_content_range() {
    assert!(validate_resume_response(206, Some("etag-a"), Some("bytes 20-99/100"), 20, Some("etag-a")).is_ok());
    assert!(validate_resume_response(200, Some("etag-a"), None, 20, Some("etag-a")).is_err());
    assert!(validate_resume_response(206, Some("etag-b"), Some("bytes 20-99/100"), 20, Some("etag-a")).is_err());
}

#[test]
fn total_progress_is_monotonic_across_phases() {
    assert_eq!(overall_progress(CoreDownloadPhase::Downloading, 50, Some(100), 0, 0), 42);
    assert_eq!(overall_progress(CoreDownloadPhase::Verifying, 0, None, 0, 0), 85);
    assert_eq!(overall_progress(CoreDownloadPhase::Extracting, 0, None, 4, 8), 94);
}
```

- [ ] **Step 2: 运行 RED 验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml core_download`

Expected: FAIL，因为模块和函数尚不存在。

- [ ] **Step 3: 实现任务元数据、缓存和事件模型**

在 `core_download.rs` 定义带 `#[serde(rename_all = "camelCase")]` 的请求、快照和事件：

```rust
pub enum CoreDownloadPhase { Downloading, Verifying, Extracting, Inspecting, Completed, Failed, Cancelled }
pub struct CoreDownloadRequest { pub release_tag: String, pub asset_name: String, pub mirror: String, pub target_dir: String, pub target_os: String, pub target_arch: String }
pub struct CoreDownloadProgress { pub task_id: String, pub phase: CoreDownloadPhase, pub received_bytes: u64, pub total_bytes: Option<u64>, pub speed_bytes_per_second: Option<u64>, pub eta_seconds: Option<u64>, pub extracted_entries: Option<u64>, pub total_entries: Option<u64>, pub current_file_name: Option<String>, pub error: Option<String>, pub installation: Option<CoreDownloadInstallation> }
```

缓存根目录使用 `app.path().app_data_dir()/core-downloads/<task-id>/`，内部只包含 `archive.part` 与 `task.json`；任务元数据存 Release/资产/镜像/目标目录、预期大小、ETag/Last-Modified、官方哈希和已接收字节，绝不存凭据。通过 `Arc<AtomicBool>` 管理取消标记，并在每个数据块和每个解压条目检查。用 `app.emit("core-download-progress", progress)` 推送状态。

- [ ] **Step 4: 将旧的一次性内存下载替换为安全任务流水线**

任务实现必须按以下固定顺序执行：

1. 用既有 `build_official_core_download_url` 和 `build_core_download_url` 验证资产名/Release/镜像，始终从 GitHub 官方获取 `frp_sha256_checksums.txt`；
2. 若存在部分归档，先发送带 `Range: bytes=<received>-` 和 `If-Range: <etag>` 的请求；仅接受 ETag 一致的 `206` 和匹配的 `Content-Range`，否则保持任务为失败/不可恢复并要求重新下载；
3. 将响应流式追加到 `archive.part`，每次写入检查 `MAX_CORE_ARCHIVE_BYTES`，每秒发送接收字节、瞬时速度和 EMA ETA；
4. 下载成功后 85–90% 阶段重新流式读取 `.part` 计算 SHA-256，失败立即停止；
5. 解压到同一任务缓存下的 `staging/`，拒绝路径穿越、异常条目数量/大小，逐条发送 90–99% 的条目数、总数和文件名；
6. 在 staging 中定位 `frpc/frpc.exe`，调用 `inspect_frpc_executable` 验证实际版本，且版本与 Release tag 相同；
7. 只有上述全部成功且目标路径不存在或为空时，才将 staging 原子移动为目标安装目录；发送 99–100% 的验真/完成事件，缓存仅保留可用于前端恢复安装项的终态元数据。

旧 `download_and_extract_core` 不得保留为第二条可绕过任务/校验的下载路径；迁移后删除其实现、命令注册与前端调用。

- [ ] **Step 5: 暴露任务命令并注册运行时状态**

在 `AppState` 增加 `core_download_manager: Arc<core_download::CoreDownloadManager>`；在 `run()` 的 `.manage()` 初始化它并注册：

```rust
start_core_download,
list_core_download_tasks,
resume_core_download,
cancel_core_download,
clear_core_download_task,
```

`start`/`resume` 只接受白名单字段并在后台 `tokio::spawn` 执行；`list` 读取缓存快照，以便应用重启后页面显示“可继续”或把已完成安装同步回前端本地核心列表。`cancel` 保留合格 `.part` 以支持继续；`clear` 删除该任务自己的缓存目录，不能接收任意文件路径。

- [ ] **Step 6: 运行 GREEN 验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml core_download; cargo check --manifest-path src-tauri/Cargo.toml`

Expected: PASS，且不再存在 `download_and_extract_core` 命令注册。

### Task 4: 完成前端 IPC 契约、事件订阅与浏览器阻断

**Files:**
- Modify: `src/services/ipc.ts`
- Modify: `src/services/ipc.test.ts`

- [ ] **Step 1: 写出失败的任务命令与事件测试**

```ts
await startCoreDownload({ releaseTag: 'v0.71.0', assetName: 'frp_0.71.0_windows_amd64.zip', mirror: 'official', targetDir: 'D:/frp', targetOs: 'windows', targetArch: 'amd64' });
expect(invoke).toHaveBeenCalledWith('start_core_download', expect.objectContaining({ request: expect.objectContaining({ releaseTag: 'v0.71.0' }) }));

const stop = await subscribeCoreDownloadProgress(onProgress);
await tauriListener({ payload: { taskId: 'core-1', phase: 'extracting', extractedEntries: 4, totalEntries: 7 } });
expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'extracting' }));
await stop();
```

- [ ] **Step 2: 运行 RED 验证**

Run: `pnpm vitest run src/services/ipc.test.ts`

Expected: FAIL，因为新包装函数和类型不存在。

- [ ] **Step 3: 实现严格 IPC 包装**

新增 `LocalCoreScanResult`、`CoreDownloadRequest`、`CoreDownloadProgress` 类型，并复用 Task 1 在 `src/types/frp.ts` 定义的 `CoreDownloadTask`；实现 `scanLocalFrpcCores`、`startCoreDownload`、`listCoreDownloadTasks`、`resumeCoreDownload`、`cancelCoreDownload`、`clearCoreDownloadTask`、`subscribeCoreDownloadProgress`。请求字段由参数白名单逐个重建；非 Tauri 环境中的每个文件系统/下载函数都返回中文桌面端说明且不触发 `fetch`。订阅函数使用已有 `listen` 导入，并返回可等待的 unlisten 回调。

- [ ] **Step 4: 运行 GREEN 验证**

Run: `pnpm vitest run src/services/ipc.test.ts`

Expected: PASS。

### Task 5: 将核心管理页改为唯一 Release 行并接入目录导入

**Files:**
- Modify: `src/features/cores/CoreManagerPage.tsx`
- Modify: `src/features/cores/CoreManagerPage.test.tsx`
- Modify: `src/types/frp.ts`

- [ ] **Step 1: 写出失败的页面行为测试**

```tsx
it('批量目录扫描登记当前平台匹配的两个版本，且每个 Release 只渲染一条记录', async () => {
  vi.mocked(pickDirectoryNative).mockResolvedValue('D:/frp-archives');
  vi.mocked(scanLocalFrpcCores).mockResolvedValue({ recognized: [
    { path: 'D:/frp-0.70/frpc.exe', version: 'v0.70.1', os: 'windows', arch: 'amd64', sizeBytes: 1 },
    { path: 'D:/frp-0.71/frpc.exe', version: 'v0.71.0', os: 'windows', arch: 'amd64', sizeBytes: 1 },
  ], skipped: [] });
  // 点击“选择本地已有 FRP 文件夹”后断言 onAddCustomCore 被调用两次，v0.71.0 没有本地/在线重复行。
});

it('表格有状态列，下载任务显示下载阶段摘要', async () => {
  // mock listCoreDownloadTasks 返回 v0.71.0 downloading / 62%，断言列头“状态”和“下载 62%”。
});
```

- [ ] **Step 2: 运行 RED 验证**

Run: `pnpm vitest run src/features/cores/CoreManagerPage.test.tsx`

Expected: FAIL，因为页面仍以本地行和在线行分离渲染，且没有目录扫描或状态列。

- [ ] **Step 3: 用统一行替换现有 `UnifiedCoreRow` 聚合逻辑**

引入 Task 1 的 `deriveCoreReleaseRows`，以 `onlineReleases + cores + hostPlatform + downloadTasks` 生成每个 Release 的唯一行。移除 `onlineReleases.forEach` 中 `alreadyInstalled` 后分别 push 本地/在线行的逻辑；保留现有搜索、卡片/表格偏好、下载量和发布时间。使用 `availability` 而不是旧 `active/installed/online` 决定动作：本地匹配核心可设默认/更改/删除，其他状态可下载/继续/清理/重试。

将所有“选择本地已有核心”文案和入口改为“选择本地已有 FRP 文件夹”；调用目录选择和 `scanLocalFrpcCores`，将每项识别结果转换成 `FrpCore` 后按 canonical path 去重并调用 `onAddCustomCore`。Toast 必须展示识别与跳过数量；不得因一项失败丢弃其他成功项。

- [ ] **Step 4: 添加表格“状态”列**

在版本、体积、下载量、发布时间和操作之间加入 `status` 列：

```tsx
{
  key: 'availability', title: '状态', width: 132,
  render: (_, record) => <CoreAvailabilityCell availability={record.availability} task={record.task} />,
}
```

`CoreAvailabilityCell` 使用 `FeishuPill showDot={false}`；“下载中”下方只显示“下载 62%”“正在校验”“正在解压 4 / 7”之一。列宽最小 132，保持右侧操作列吸附。卡片和表格必须接收同一个 `CoreReleaseRow`，不能维护第二份下载状态。

- [ ] **Step 5: 订阅并恢复任务状态**

页面挂载时 `listCoreDownloadTasks()`，订阅 `subscribeCoreDownloadProgress()`，卸载时 unlisten。进度事件更新 `downloadTasks`；终态成功事件只在包含经后端验证的 `installation` 时调用 `onAddCustomCore`，以路径去重。重启后列表返回成功任务时同样执行幂等同步，防止“已安装但前端未收到完成事件”丢失本地核心记录。

- [ ] **Step 6: 运行 GREEN 验证**

Run: `pnpm vitest run src/features/cores/CoreManagerPage.test.tsx`

Expected: PASS。

### Task 6: 在卡片与下载弹窗呈现单一任务进度

**Files:**
- Modify: `src/features/cores/CoreCard.tsx`
- Modify: `src/features/cores/CoreCard.test.tsx`
- Modify: `src/features/cores/CoreManagerPage.tsx`

- [ ] **Step 1: 写出失败的卡片阶段测试**

```tsx
render(<CoreCard core={{ ...onlineCore, availability: 'downloading', task: { phase: 'downloading', receivedBytes: 8_200_000, totalBytes: 13_200_000, speedBytesPerSecond: 1_800_000, etaSeconds: 3 } }} {...handlers} />);
expect(screen.getByText(/8\.2 MB \/ 13\.2 MB/)).toBeInTheDocument();
expect(screen.getByText(/1\.8 MB\/s/)).toBeInTheDocument();
expect(screen.getByText(/预计剩余下载时间 3 秒/)).toBeInTheDocument();

rerender(<CoreCard core={{ ...onlineCore, availability: 'downloading', task: { phase: 'extracting', extractedEntries: 4, totalEntries: 7, currentFileName: 'frpc.exe' } }} {...handlers} />);
expect(screen.getByText('正在解压 4 / 7')).toBeInTheDocument();
expect(screen.queryByText(/预计剩余下载时间/)).not.toBeInTheDocument();
```

- [ ] **Step 2: 运行 RED 验证**

Run: `pnpm vitest run src/features/cores/CoreCard.test.tsx`

Expected: FAIL，因为卡片只区分本地/云端，没有任务进度。

- [ ] **Step 3: 实现飞书风格状态和阶段内容**

保留现有 `Card`、`FeishuPill`、`Button` 及字体；新增紧凑 `CoreDownloadProgress` 呈现组件但不引入新视觉库。总条使用 Task 1 的阶段进度：下载 0–85%，校验停在 85% 并以活动态说明，解压按条目 90–99%，验真/提交 99–100%。下载内容显示已下载/总大小、每秒速度、镜像、目标目录和只有有效时的“预计剩余下载时间”；校验显示 SHA-256 和已耗时；解压显示条目数、当前文件名和目标目录。取消调用 `cancelCoreDownload`；可继续调用 `resumeCoreDownload`；失败/不可恢复调用清理或重试，所有按钮禁用状态与任务阶段对应。

下载弹窗仅负责在开始前选择镜像和不存在/空的目标目录；确认后立即关闭选项表单或转为只读任务详情，不能再调用已删除的 `downloadAndExtractCore`。

- [ ] **Step 4: 运行 GREEN 验证**

Run: `pnpm vitest run src/features/cores/CoreCard.test.tsx src/features/cores/CoreManagerPage.test.tsx`

Expected: PASS。

### Task 7: 补齐安全回归、文档与全量验证

**Files:**
- Modify: `README.md`
- Modify: `src/services/ipc.test.ts`
- Modify: `src/features/cores/CoreManagerPage.test.tsx`
- Modify: `src-tauri/src/core_download.rs`

- [ ] **Step 1: 增加失败路径回归测试**

在 Rust 单测中直接覆盖恢复校验与归档路径边界：

```rust
#[test]
fn resume_rejects_full_response_and_changed_entity() {
    assert!(validate_resume_response(200, Some("same"), None, 32, Some("same")).is_err());
    assert!(validate_resume_response(206, Some("changed"), Some("bytes 32-63/64"), 32, Some("same")).is_err());
}

#[test]
fn staging_path_rejects_archive_traversal_and_existing_target() {
    assert!(safe_staging_path(Path::new("D:/cache/staging"), Path::new("../../evil.exe")).is_err());
    assert!(ensure_empty_install_target(Path::new("D:/existing-user-files")).is_err());
}
```

在 IPC 测试中覆盖浏览器阻断：

```ts
vi.mocked(isTauriEnv).mockReturnValue(false);
await expect(startCoreDownload(request)).resolves.toMatchObject({ error: expect.stringContaining('桌面端') });
expect(fetch).not.toHaveBeenCalled();
expect(invoke).not.toHaveBeenCalled();
```

在页面测试中分别 mock `failed` 终态任务（SHA-256 不匹配）、`resumable` 任务和包含用户文件的目标目录错误，断言它们不调用 `onAddCustomCore`，且页面只给出重试/清理或改选目录动作。

- [ ] **Step 2: 运行 RED 验证**

Run: `pnpm vitest run src/services/ipc.test.ts src/features/cores/CoreManagerPage.test.tsx; cargo test --manifest-path src-tauri/Cargo.toml core_download`

Expected: 新增断言在相应实现遗漏安全分支前失败。

- [ ] **Step 3: 最小化修正安全边界并同步 README**

为 `safe_staging_path`、`ensure_empty_install_target` 和每条失败事件返回固定中文安全错误；镜像失败不自动换镜像，失败任务不产生 `installation`，目标目录非空不写入任何文件。更新 README 的“FRP 核心管理”和“导入本地 FRPC 核心”说明：目录批量扫描、当前平台/架构匹配、GitHub 元数据/镜像下载职责、下载速度与 ETA、下载—校验—解压—验真的一体进度、断点续下的 Range/ETag 前提。

- [ ] **Step 4: 运行最终验证**

Run: `pnpm test; pnpm build; cargo test --manifest-path src-tauri/Cargo.toml; cargo check --manifest-path src-tauri/Cargo.toml; git diff --check`

Expected: 每条命令退出码为 0；`git diff --check` 无空白错误。记录因本机 Tauri 图形环境或网络不可运行的人工验证项，不将其冒充为已通过。
