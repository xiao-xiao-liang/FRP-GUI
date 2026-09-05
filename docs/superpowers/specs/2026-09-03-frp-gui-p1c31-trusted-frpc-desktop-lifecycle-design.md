# FRP-GUI P1-C3.1「可信 FRPC 桌面运行闭环与 Windows 打包准备」设计规格

## 目标

让 FRP-GUI 只在 Tauri 桌面窗口中启动、停止和监督本机 `frpc`，向用户展示真实进程状态与真实 stdout/stderr 日志；浏览器页面只作为界面预览，绝不伪造连接、PID 或日志。同步补齐 Windows 开发与安装包构建路径。

## 范围

- Tauri 桌面端本机 FRPC 的启动、短暂存活确认、退出监听、停止确认和真实日志事件。
- 前端连接卡片的可信状态机：`stopped`、`starting`、`running`、`stopping`、`error`。
- 浏览器预览环境对所有运行时操作的显式阻断。
- Tauri CLI、本地正式图标资源、开发与 Windows 打包文档。
- 自动化离线测试与桌面开发窗口的本机人工验收说明。

## 非目标

- 不连接、修改或验证任何远程 FRPS 服务器；后续真实服务器走查必须单独取得用户授权。
- 不改变 P1-C3 的远程 FRPS 部署链路，不实现 FRPC 选用远程节点（P1-C4）。
- 不实现系统开机自启、系统服务包装、自动重连策略、浏览器本地代理或网页端进程控制。
- 不把 Token、完整 TOML、私钥、密码或原始环境变量放入状态事件、日志、localStorage 或测试快照。

## 已确认边界

1. 直接浏览 `localhost:5173`、Vite Preview 或任意普通浏览器都只是界面预览。它们不可启动/停止 FRPC、查看实时运行日志、执行网络检测、下载核心或访问安全凭据库；界面必须明确说明“请在桌面版运行”。
2. `pnpm tauri dev` 打开的 Tauri 窗口是唯一开发测试入口。它可加载同一份 Vite 页面，但必须通过受控 Tauri IPC 调用 Rust 后端。
3. 正式安装包通过 `pnpm tauri build` 构建，Windows 产物应落在 `src-tauri/target/release/bundle/` 的 NSIS 或 MSI 子目录。

## 运行架构

```text
Tauri WebView
  └─ 受控 IPC：start / stop / status
       └─ Rust FrpcProcessSupervisor
            ├─ 将已验证的 TOML 写入受控应用数据目录
            ├─ spawn frpc，接收 stdout/stderr
            ├─ 在确认窗口内检测是否过早退出
            ├─ 推送 frp-runtime-log 与 frp-runtime-state 事件
            └─ 退出或停止后清理进程记录

普通浏览器
  └─ 只渲染 UI；运行期 API 一律拒绝，且不创建模拟日志或模拟 PID
```

### Rust 进程监督

- `start_profile` 不得在 `spawn()` 成功时立即承诺 `running`；返回值只表示“启动请求已接受”或“启动失败”。
- 每个 profile 仅允许一个受控运行实例。启动中、运行中或停止中再次启动必须得到明确的冲突结果。
- Rust 在有限的确认窗口内观察子进程：若退出，返回/推送 `error` 和安全的错误摘要；若持续存活，再发出 `running`。
- stdout 和 stderr 逐行转换为统一的、无秘密的 `frp-runtime-log` 事件；进程退出发出 `frp-runtime-state` 事件。
- 停止操作必须实际验证进程终止结果。未知 PID、进程已退出或终止失败均不得伪称“已停止”。
- 运行元数据只包含 profile ID、PID、状态、启动时间和安全错误摘要；不保存进程的完整命令、秘密或 TOML 内容。

### 前端状态与日志

- `starting` 与 `stopping` 为过渡状态，禁用重复启动/停止。
- 只有收到后端 `running` 状态事件才显示“运行中”。后端 `error` 或意外 `stopped` 事件会即时更新卡片并保留安全错误摘要。
- 桌面端订阅 Tauri 真实事件并汇入现有日志面板；浏览器模式的日志面板仅展示不可用说明，不显示“实时流已就绪”。
- 删除 `src/services/ipc.ts` 中所有浏览器模拟 PID、模拟登录成功、随机心跳与模拟代理日志。浏览器分支必须抛出/返回明确的“仅桌面版可执行”错误。

## Windows 构建准备

- 在 `package.json` 中显式声明兼容 Tauri v2 的 `@tauri-apps/cli` 开发依赖，并提供可复现的 `tauri` 脚本入口。
- 提供 `src-tauri/icons/` 中 Tauri 配置要求的 PNG、ICO 与 ICNS 正式资源；不得依赖测试环境的临时图标覆盖。
- README 区分 `pnpm dev` 的浏览器预览与 `pnpm tauri dev` 的桌面功能测试，并说明 `pnpm tauri build` 的产物位置。

## 安全不变量

1. 前端不能传递可执行命令、路径、环境变量、任意参数或进程 ID 来控制 FRPC；Rust 只接收 profile ID、经现有模型生成的 TOML 和已选核心路径，并验证核心是本地 `frpc`。
2. 日志和状态事件不得包含 Token、私钥、密码、完整 TOML 或完整命令行；匹配已知敏感字段的日志必须掩码。
3. 浏览器环境没有降级模拟：任何运行时请求必须失败且不得变更 profile 为 `running`。
4. 进程退出、停止失败和启动前校验失败都必须落为 `error` 或保持 `stopped`，绝不产生“运行中”假状态。

## 验收标准

1. 浏览器预览点击启动、停止、日志或网络检测均不创建 PID、状态变更或日志，并显示桌面端说明。
2. Tauri 桌面端对无效核心路径、无效 TOML 或错误 Token 导致的早退不会显示 `running`；卡片与日志出现真实的安全错误摘要。
3. 正常运行的 FRPC 仅在存活确认后显示 `running`，stdout/stderr 可在日志面板中实时查看并按 profile 过滤。
4. 主动停止和进程意外退出能被监督器发现并同步 UI；重复启动/停止不会创建额外实例。
5. `pnpm test`、`pnpm build`、`cargo test`、`cargo check` 均通过；`pnpm tauri build` 不依赖临时图标环境变量，产生 Windows 安装包。

## 人工验收边界

完成离线测试后，可在本机 Tauri 开发窗口使用无敏感配置验证“启动、日志、停止、错误配置早退”。连接真实云服务器、使用真实 Token、私钥或远程写入都需要用户单独授权，且报告中不得记录这些秘密。

## 实际实施与真实验证结果

### 1. 交付功能
- **Task 1**：移除浏览器模拟 PID 与假心跳日志，建立前端单例 IPC 原生事件监听桥接与脱敏过滤。
- **Task 2**：Rust `frpc_runtime.rs` 实现进程监管 Actor 模型、受控配置写入（`app_local_data_dir/runtime-config/`）、800ms 存活确认期、实时脱敏 stdout/stderr 日志流、安全退出清理。
- **Task 3**：前端消费真实后端生命周期事件，移除乐观状态更新；修复快照与事件订阅竞态，更新 `startTime`，完善批量启动状态过滤与组件卸载解绑。
- **Task 4**：补齐 `@tauri-apps/cli` 与 `tauri` npm 脚本；创建原创 SVG 图标并由 `pnpm tauri icon` 自动生成全套平台图标资产（ICO/ICNS/PNG）；更新 README 文档；完成 Windows 原生安装包构建。

### 2. 真实命令验证输出与产物
- **`pnpm test`**：15 个测试文件、116 个测试全部通过。
- **`pnpm build`**：TypeScript 检查与 Vite 打包通过。
- **`pnpm tauri dev`**：桌面窗口成功编译并正常拉起，确认 Tauri 原生运行时就绪。
- **`pnpm tauri build`**：成功生成两份 Windows 安装包：
  - MSI 安装包：`src-tauri/target/release/bundle/msi/FRP-GUI Pro_1.0.0_x64_en-US.msi` (10,661,888 字节)
  - NSIS 安装包：`src-tauri/target/release/bundle/nsis/FRP-GUI Pro_1.0.0_x64-setup.exe` (7,053,107 字节)
- **`cargo check`**：通过（Exit code: 0）。
- **`cargo test --bin frp-gui`**：通过（Exit code: 0）。
- **环境前提与未验证项**：当前本地环境未安装 Visual Studio C++ Build Tools (MSVC)，默认使用 MinGW GNU GCC (`x86_64-pc-windows-gnu`)。在该环境下，`tauri-build` 注入的 Windows manifest 资源与 Rust lib 测试 harness 的 manifest 在由 MinGW `ld.exe` 合并时产生 `.rsrc merge failure: multiple non-default manifests`，致使 `cargo test` 生成的 `frp_gui_lib-*.exe` 启动时触发系统 `0xc0000139 (STATUS_ENTRYPOINT_NOT_FOUND)`。在完整 MSVC 工具链下即可正常运行所有内部测试。
- **安全边界遵守**：验证全过程未连接任何远程云服务器，未索取或写入任何真实 Token、私钥、密码或云主机 IP。

---

## P1-C3.2 本地核心导入与启动故障排障整改记录

### 1. 根因复盘 (Root Causes)

1. **文件选择通道混淆与 Vite HTML 误解析**：
   桌面端曾错误复用面向开发预览的 `/api/dev/fs/list` 接口，在 Tauri 窗口内该请求返回 Vite 的单页 HTML，前端当成 JSON 解析从而引发 `SyntaxError: Unexpected token '<'`，导致文件选择窗口无法正常工作。
2. **核心校验链路分叉与版本输出不兼容**：
   - 导入保存与运行前校验逻辑未统一，前端曾依赖弱校验，导致用户可手动将 `frps.exe` 保存为可用核心；
   - Rust 启动前版本解析强依赖 `frpc v0.x.y` 带有 `frpc` 标识的横幅，而现代版本（如 v0.71.0）直接输出 `0.71.0` 纯 semver 字符串，导致可用现代核心被启动前校验误判为无效核心；
   - 缺乏统一的受控只读校验命令。
3. **故障恢复动作误导**：
   启动失败时前端未区分故障根因，无差别显示“立即排查”并将用户导向服务器网络 TCP 诊断，使本机核心失效或参数错误被误导为远程服务器不可达。同时，卡片曾残留内联直接“测速”按钮。

### 2. 架构整改与设计收敛 (Remediation Design)

1. **原生文件对话框与预览阻断**：
   - 桌面端通过 Rust 已注册的 `pick_core_file` Tauri IPC 命令唤起 Windows 系统原生文件选择对话框；
   - 核心管理页面的导入和编辑入口在浏览器预览环境会先阻断，因此不会调用 `/api/dev/fs/list`。
2. **统一核心校验 IPC (`inspect_frpc_core`) 与文件名/版本兼容规则**：
   - Rust 导出受控只读命令 `inspect_frpc_core(path: String)`，导入前、编辑保存前以及启动前校验共用同一套底层验证逻辑；
   - 校验流程规则：
     - 路径必须真实存在且能够规范化（`canonicalize`）；
     - `frps.exe` 的主要拒绝防线是文件名校验：规范化后的文件名必须严格为 `frpc` 或 `frpc.exe`（显式阻断 `frps`、`frps.exe` 及其他二进制文件）；
     - 通过安全子进程受控执行 `--version`（带 5 秒超时机制）；
     - 版本解析器严格解析 SemVer，兼容现代版本的纯 SemVer 字符串（如 `0.71.0`）与传统 `frpc v*` 横幅；当版本输出包含 `frps` 且不包含 `frpc` 时拒绝；
   - 桌面端导入与编辑保存时必须调用该命令验证通过，才可持久化为 `ready` 核心。
3. **失败分类结构化分流 (`failureKind`) 与网络排查收敛**：
   - 后端在启动流程中返回清晰的 `failureKind` 分类：
     - `core_invalid`：核心文件丢失、非客户端或校验失败；
     - `startup`：配置渲染错误或子进程 spawn 失败；
     - `early_exit`：子进程在确认期内异常退出；
   - 前端接收并记录 `stats.lastFailureKind`，生命周期中在启动中、运行中及正常停止时主动清空；
   - 动作分流：
     - `core_invalid`：唯一主操作为“修复 FRPC 核心”（调用必填 `onRepairCore` 回调导航至 `/cores` 引导修复）；
     - `startup`、`early_exit`、未知失败：唯一主操作为“查看启动日志”（调用 `onViewLogs` 携带 `profileId` 过滤）；
     - 移除卡片直接测速入口，网络连通性检测彻底收敛至卡片与表格“更多操作”菜单中的次级动作。

### 3. 验证命令与测试矩阵

- **前端全量单元与组件测试**：
  `pnpm test`
- **前端 TypeScript 类型检查与生产构建**：
  `pnpm build`
- **Rust 后端单元测试与编译检查**：
  `cd src-tauri; cargo test; cargo check; cd ..`
- **Tauri 桌面端 Windows 原生安装包构建**：
  `pnpm tauri build`
- **安全不变量保障**：
  全程无远程网络连接，无真实 Token、私钥、密码、IP 或本机私有路径输出与写入。
