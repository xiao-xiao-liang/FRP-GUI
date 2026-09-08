# FRP 核心现代原生弹窗与压缩包/目录双模导入设计

## 目标与背景

当前应用在 Windows 平台下点击“导入本地 FRP”以及在下载模态框中“选择下载目录”时，底层采用 PowerShell 启动过时的 `System.Windows.Forms.FolderBrowserDialog`，导致以下体验缺陷：
1. **弹窗风格老旧**：唤起的是类似 Windows XP/2000 时代的 WinForms 树状单列窗口，缺少现代 Windows 资源管理器的导航栏、面包屑、快捷访问和文件搜索能力，与 `frpc-desktop` 及现代 Windows 原生体验严重不符；
2. **响应卡顿延迟**：每次调起弹窗均需新建 `powershell.exe` 进程并初始化 .NET 运行时，耗时 1~3 秒；
3. **导入模式受限**：目前仅支持扫描“已解压目录”，不支持像 `frpc-desktop` 那样直接导入官方未解压的 `.zip` / `.tar.gz` 压缩包。

本设计旨在：
1. **底层弹窗现代化**：在 Tauri 桌面端与开发环境下全面接入原生现代文件/文件夹选择对话框（对齐 Windows `IFileOpenDialog`，毫秒级即时调起，外观与 Windows 资源管理器 100% 对齐）；
2. **双模导入支持**：
   - 模式 A：支持直接导入官方下载的原版未解压 `.zip` / `.tar.gz` 压缩包，并在后台安全解压、防范目录穿越、执行只读版本校验并原子登记；
   - 模式 B：完全保留现有的本地解压目录扫描与批量识别能力；
3. **保留自定义下载路径**：完全保留下载弹窗中用户自定义安装与解压目录的完整交互与记住历史偏好逻辑。

---

## 架构与交互设计

### 1. 前端主操作区与双模导入交互 (CoreManagerPage)

顶部主操作区的“导入本地 FRP”按钮升级为飞书 Universe Design (UD) 风格的下拉菜单组合（`DropdownMenu`）：
- **点击“导入本地 FRP”**，展开飞书风格下拉菜单：
  1. 📦 **导入 FRP 压缩包 (.zip, .tar.gz)**：
     - 辅助文案：官方原始压缩包，自动解压与验真安装
     - 动作：调起系统原生文件选择对话框（过滤 `.zip`, `.tar.gz`, `.tgz`）
     - 选择后：前端提示“正在解压并校验 FRP 压缩包...”，后台解压并校验成功后，自动添加到版本库并在当前设备派生为“已就绪/已下载”状态。
  2. 📁 **选择本地已解压目录**：
     - 辅助文案：本地已有解压文件夹，扫描并识别 FRPC 核心
     - 动作：调起系统原生现代文件夹选择对话框，执行既有 `scanLocalFrpcCores` 批量识别与登记。

### 2. 下载模态框自定义路径保持 (DownloadModal)

- 下载模态框中的“安装与解压目录”输入框与右侧文件夹选择图标完全保留；
- 点击图标调用升级后的 `pickDirectoryNative()`，弹出 Windows 现代资源管理器样式的文件夹选择框；
- 选定后同步更新 `targetDir`，并持久化为用户下次下载的默认前缀路径。

### 3. 底层原生弹窗 (Native Dialogs)

- 在 Rust 后端引入轻量高效的 `rfd` (Rusty File Dialog) 库，彻底替换原先在 `src-tauri/src/lib.rs` 中通过 `powershell.exe` 调用 `System.Windows.Forms` 的旧实现：
  - `pick_directory()`：通过 `rfd::FileDialog::new().pick_folder()` 调出 Win32 现代 `IFileOpenDialog`（带 `FOS_PICKFOLDERS`）；
  - `pick_core_file()`：通过 `rfd::FileDialog::new().add_filter("可执行程序", &["exe"]).pick_file()` 调出现代文件选择框；
  - `pick_archive_file()`：新增命令，通过 `rfd::FileDialog::new().add_filter("FRP 压缩包", &["zip", "tar.gz", "tgz"]).pick_file()` 调出过滤压缩包的文件选择框。
- 在 Vite 开发环境下：
  - 补充 `/api/dev/pick-archive` 中间件接口，保持浏览器预览调试与桌面端行为一致。

### 4. 后台压缩包解压与安全规范 (core_import.rs)

新增 `import_frpc_archive(archive_path: &Path, managed_cores_root: &Path) -> Result<RecognizedLocalFrpcCore, String>`：
1. **合法性检查**：严格校验文件扩展名为 `.zip`、`.tar.gz` 或 `.tgz`，文件大小不超过预设上限（复用 `MAX_CORE_ARCHIVE_BYTES` 100 MiB）；
2. **防路径穿越解压**：解压至受控临时目录 `temp_dir/import_<uuid>`，解压条目严格执行 `safe_staging_path` 路径安全校验，禁止 `..` 相对路径逃逸；
3. **可执行文件定位与校验**：在解压内容中递归查找 `frpc`（Windows 下为 `frpc.exe`），若不存在或仅有 `frps` 则明确报错拒绝；
4. **宿主兼容性验真**：调用既有 `inspect_frpc_core` 执行只读版本检查（`frpc --version`），如果架构或操作系统与当前宿主不兼容（无法执行），返回明确提示：“所导入的压缩包与当前系统架构不兼容，无法在当前设备运行”；
5. **原子安装**：校验通过后，将解压产物移动至应用持久化受管核心目录 `app_data/cores/frp_<version>_<os>_<arch>`；
6. **返回标准元数据**：返回 `RecognizedLocalFrpcCore` 对象供前端登记入库。

---

## 边界与异常处理

1. **用户取消选择**：原生弹窗取消返回 `None` / `null`，前端静默不执行任何操作；
2. **无效或损坏的压缩包**：解压报错时清理临时目录，并返回中文错误信息，前端通过 `feishuToast.error` 提示；
3. **版本已存在**：若导入的 FRPC 路径或版本在当前已安装核心中已存在，提示用户已存在并自动定位或去重，避免重复登记；
4. **跨磁盘写入/权限不足**：解压到用户目录失败时给出明确的权限提示；
5. **浏览器预览模式保护**：非 Tauri 环境下尝试导入压缩包时通过 Toast 阻断，不发起桌面专有文件操作。

---

## 验证与验收标准

1. **单元与集成测试**：
   - Rust: `core_import.rs` 新增压缩包解析、格式校验、不匹配架构阻断、合法压缩包解压验真单元测试；
   - TS: `ipc.test.ts` 覆盖 `pickArchiveFileNative` 与 `importLocalFrpcArchive` 契约断言；
   - UI: `CoreManagerPage.test.tsx` 覆盖下拉菜单渲染、导入压缩包分支、导入解压目录分支与自定义下载路径保留断言。
2. **桌面真实体验**：
   - 点击选择文件夹与选择文件时，毫秒级弹出 Windows 资源管理器样式对话框，绝不再出现古老 WinForms 树状框；
   - 导入官方 `.zip` 压缩包能一键解压并登记成功。
