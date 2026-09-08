# FRP 核心现代原生弹窗与压缩包/目录双模导入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Windows 平台下的文件夹/文件选择弹窗升级为现代 Windows 资源管理器原生对话框（对齐 `frpc-desktop` 体验，消除卡顿与老旧树形框）；支持直接导入官方 `.zip` / `.tar.gz` 压缩包（自动解压验真入库），同时保留本地解压目录批量导入与自定义下载目录能力。

**Architecture:**
1. **Rust 原生对话框升级**：引入 `rfd = "0.15"`，在 `src-tauri/src/lib.rs` 中使用 Win32 现代 `IFileOpenDialog` 替换原先通过 PowerShell 唤起的 `System.Windows.Forms.FolderBrowserDialog` 和 `OpenFileDialog`。
2. **后端压缩包导入与验真 (core_import.rs)**：新增 `import_frpc_archive`，支持安全解压 `.zip` 与 `.tar.gz`、路径防穿越、查找 `frpc`、执行宿主架构兼容性检查（`inspect_frpc_core`），并持久化到受管目录后返回元数据。
3. **IPC 契约层扩展 (ipc.ts)**：新增 `pickArchiveFileNative()` 与 `importLocalFrpcArchive(archivePath)`，在非桌面端阻断并返回提示；补充 Vite 开发服务器中间件支持。
4. **前端交互与视图升级 (CoreManagerPage.tsx)**：将“导入本地 FRP”升级为飞书 Universe Design (UD) 风格的下拉菜单（`DropdownMenu`），提供“导入官方压缩包 (.zip, .tar.gz)”与“选择本地已解压目录”双入口；下载模态框中完整保留自定义下载目录与历史偏好推导。

**Tech Stack:** Tauri v2, Rust (rfd, zip, tar, flate2, tokio), React 18, TypeScript, Tailwind CSS, Radix UI (DropdownMenu), Vitest.

---

## Global Constraints

- 严格遵循飞书 Universe Design (UD) 规范，使用既有组件与色彩体系；
- 严禁删除或退化已有的自定义下载路径功能；
- 遵循 TDD 规范，单元测试与集成测试全部通过；
- 解压过程严格防范 Zip Slip / 路径穿越安全风险；
- 非 Windows 平台代码（macOS / Linux）保持编译与功能兼容。

---

## User Review Required

> [!NOTE]
> 1. **原生弹窗效果**：通过 `rfd` 调用的 Windows 原生对话框具有左侧快速访问/此电脑导航栏、顶部路径栏和右侧大图标列表，右下角为标准“选择文件夹”或“打开”，与 `frpc-desktop` 及 Windows 11/10 资源管理器完全一致，且无 PowerShell 进程启动开销。
> 2. **主操作区入口**：将顶部“导入本地 FRP”按钮改造为飞书下拉菜单，支持一键选择“导入官方压缩包”或“选择本地已解压目录”，不增加页面视觉冗余。

---

## Proposed Changes

### Rust 后端

#### [MODIFY] [Cargo.toml](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src-tauri/Cargo.toml)
- 添加依赖 `rfd = "0.15"`。

#### [MODIFY] [src-tauri/src/lib.rs](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src-tauri/src/lib.rs)
- 重构 `pick_directory` 与 `pick_core_file`，使用 `rfd::FileDialog` 替换 PowerShell 命令；
- 增加 `pick_archive_file` 与 `import_local_frpc_archive` 命令，并在 `tauri::generate_handler!` 中注册。

#### [MODIFY] [src-tauri/src/core_import.rs](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src-tauri/src/core_import.rs)
- 实现 `import_frpc_archive` 函数，包含防穿越解压、可执行文件递归定位、版本与架构验真；
- 添加压缩包校验与解压测试用例。

---

### 前端与 IPC 层

#### [MODIFY] [src/services/ipc.ts](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src/services/ipc.ts)
- 导出 `pickArchiveFileNative(): Promise<string | null>`；
- 导出 `importLocalFrpcArchive(archivePath: string): Promise<RecognizedLocalFrpcCore>`。

#### [MODIFY] [src/services/ipc.test.ts](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src/services/ipc.test.ts)
- 补充 `pickArchiveFileNative` 和 `importLocalFrpcArchive` 契约测试用例。

#### [MODIFY] [src/features/cores/CoreManagerPage.tsx](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src/features/cores/CoreManagerPage.tsx)
- 使用 `DropdownMenu` 升级“导入本地 FRP”按钮，提供双模导入菜单项；
- 实现 `handleImportArchive`，联动 `pickArchiveFileNative` 与 `importLocalFrpcArchive`；
- 保持 `handleImportLocalDirectory` 及下载弹窗自定义路径逻辑。

#### [MODIFY] [src/features/cores/CoreManagerPage.test.tsx](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src/features/cores/CoreManagerPage.test.tsx)
- 更新测试以支持双模导入交互测试，验证压缩包导入与目录扫描行为。

---

## Tasks & Steps

- [ ] **Task 1: 在 Rust 后端接入 `rfd` 并重构现代原生文件/文件夹选择对话框**
  - 在 `src-tauri/Cargo.toml` 中引入 `rfd = "0.15"`。
  - 在 `src-tauri/src/lib.rs` 中将 `pick_directory` 和 `pick_core_file` 重构为 `rfd::FileDialog`。
  - 新增 `pick_archive_file` 命令，限制扩展名 `zip, tar.gz, tgz`。
  - 运行 `cargo check` 确保编译无误。

- [ ] **Task 2: 在 `core_import.rs` 中实现官方压缩包安全解压与验真入库**
  - 实现压缩包格式校验与安全解压至 `temp_dir/import_<uuid>`。
  - 路径穿越检查与 `frpc`/`frpc.exe` 定位。
  - 调用只读检查 `inspect_frpc_core` 验真架构与版本。
  - 移动至受管版本目录并返回 `RecognizedLocalFrpcCore`。
  - 编写 Rust 单元测试并运行 `cargo test`。

- [ ] **Task 3: 在 `src/services/ipc.ts` 中封装压缩包选择与导入命令**
  - 实现 `pickArchiveFileNative` 与 `importLocalFrpcArchive`。
  - 编写前端 mock 单元测试并运行 `vitest run src/services/ipc.test.ts`。

- [ ] **Task 4: 在 `CoreManagerPage.tsx` 中实现飞书风格双模导入下拉菜单**
  - 引入 `DropdownMenu`，将“导入本地 FRP”升级为具备“导入 FRP 压缩包”与“选择已解压目录”的组合下拉菜单。
  - 实现压缩包导入状态与 Toast 提示。
  - 确保“下载弹窗”中的自定义下载路径及更新逻辑完全保留。
  - 运行 `vitest run src/features/cores/CoreManagerPage.test.tsx` 确保测试全绿。

- [ ] **Task 5: 全流程集成验证与回归**
  - 执行完整单元测试 `npm run test` 与 `cargo test`。
  - 检查代码变更与 git status。
