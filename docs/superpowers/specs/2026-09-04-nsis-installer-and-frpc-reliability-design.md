# NSIS 主安装包与 FRPC 运行期可靠性设计

## 目标

将 `setup.exe` 升级为 DBX 同类的中文 NSIS 安装向导，保留现有在线/离线 MSI；同时修复 FRPC 日志缺失、停止状态卡住和启动时短暂黑框的问题。

## 已确认根因

1. 当前发布脚本只构建 WiX/MSI。WiX 的目录浏览页是系统原生旧式对话框，不能通过应用前端样式现代化。
2. 参考项目 DBX 使用 Tauri 的 `windows.nsis.template` 指向自定义 NSIS 脚本，而不是 MSIX。其安装目录页是 NSIS Modern UI 2 的可控向导页面。
3. `offlineInstaller` 仅取消 WebView2 的网络下载；首次安装仍要解压、校验并安装完整 Evergreen Runtime，不能承诺十秒完成。
4. 后端 `stop_profile` 返回成功前已经收到子进程退出确认，但前端停止成功后只等待 `frp-runtime-state` 事件。事件未到达时，UI 会永久停留在 `stopping`。
5. FRPC 输出目前只通过 Tauri 事件传给前端。事件订阅异常、页面初始化时序或窗口事件丢失都会使日志页为空，后端没有可回放的权威日志来源。
6. 真正运行 FRPC 的命令已设置 `CREATE_NO_WINDOW`；但启动前执行 `frpc.exe --version` 的核心校验命令没有设置该 Windows 创建标志。该控制台程序探测会短暂打开黑框，符合用户复现。

## 设计

### 1. 发布矩阵

| 产物 | 用途 | WebView2 策略 |
| --- | --- | --- |
| `FRP-GUI-Pro-x64-setup.exe` | 默认给普通用户下载 | NSIS 检测到系统 Evergreen Runtime 时跳过；缺失时才下载安装 Bootstrapper |
| `FRP-GUI-Pro-x64-online.msi` | 企业部署或既有 MSI 工作流 | 保持在线 Bootstrapper |
| `FRP-GUI-Pro-x64-offline.msi` | 无网络环境 | 保持嵌入式离线 Runtime；不承诺快速安装 |

不新增 MSIX 或 App Installer，不引入签名证书和证书信任步骤。

### 2. DBX 风格 NSIS 主安装包

先使用 Tauri 内置的 NSIS Modern UI 2 模板，仅通过 `bundle.windows.nsis` 配置安装模式、语言和产品素材，并新增独立 `tauri:bundle:setup` 脚本。该模板本身即提供与 DBX 截图同类的目录输入框、浏览按钮、进度和完成页；除非人工验收证明默认页面无法满足目标，否则不复制或维护大型第三方 `.nsi` 模板。

安装器行为：

- 使用简体中文和当前用户安装模式，默认目标为 `%LOCALAPPDATA%\\FRP-GUI Pro`，避免普通安装触发管理员权限。
- 提供欢迎、安装目录、安装进度和完成页；目录页使用 NSIS 自身路径输入框与“浏览”按钮，不调用 WiX 的旧式目录选择器。
- 使用项目图标、中文产品名和简洁的页首图；不复制 DBX 的品牌、图标、文案或素材。
- 复用 Tauri 内置的安装、卸载、升级、WebView2、快捷方式和文件关联逻辑；只对本项目所需语言、安装路径和 WebView2 检测进行最小配置。
- 默认 setup 仅在注册表未检测到可用 WebView2 Runtime 时执行 Bootstrapper。已具备 Runtime 的 Windows 10/11 设备只发生应用文件复制；没有 Runtime 的设备仍会受 WebView2 下载和安装耗时影响，并在安装器中明确展示该进度。

### 3. 后端日志权威快照

`FrpcRuntimeManager` 为受监管实例维护内存日志环形缓冲：

- 写入缓冲前沿用既有脱敏和单条 4KiB 截断；缓冲总量有固定上限，超限删除最旧记录。
- 每条记录包含单调递增序号、profileId、时间、等级和已脱敏消息，供前端去重与排序。
- stdout、stderr 均先写入缓冲，再尝试广播 Tauri 事件；事件发送失败不影响缓冲。
- 新增只读 `get_runtime_logs` 命令，可按 profile 或全部实例返回有限快照；不返回核心路径、原始 TOML、Token 或未脱敏输出。

前端继续维护应用级显示缓存，但从后端快照同步：应用订阅就绪后、启动响应完成后、进入日志页时均拉取快照，并按序号去重合并。实时事件只是低延迟通道，因此用户给出的 login、proxy added、start proxy success 等启动行即使错过事件也能回放。

### 4. 状态收敛与停止

启动和停止均采用“事件加速、后端快照兜底”的规则：

- 启动：仅当后端快照显示 `running` 才显示“运行中”。
- 停止：`stop_profile` 返回 `accepted: true` 后立即查询状态快照；若为 `stopped`，立即更新 UI。若仍为 `stopping`，在受限时间内轮询快照；若为 `error` 或达到上限，则显示明确失败信息，绝不无限停留。
- 后端现有停止确认语义不放宽：只有子进程实际退出才发布 `stopped`。

### 5. 黑框消除与可诊断性

抽取唯一的 Windows 后台命令构造器，所有 FRPC 子进程入口都必须使用：

- `frpc.exe --version` 核心校验；
- 实际 `frpc.exe -c <受控配置>` 运行；
- 未来与 FRPC 相关的受控探测。

该构造器在 Windows 使用命名常量 `CREATE_NO_WINDOW`，禁止通过 `cmd.exe`、`.bat` 或 shell 包装来启动核心。保留只读、脱敏的本地诊断记录：核心文件名、操作阶段、PID、stdout/stderr 管道接管结果和退出状态；不记录配置内容、绝对路径或秘密信息。若后续仍出现窗口闪烁，日志可以区分是版本探测、实际启动还是外部核心自身行为。

## 验收标准

1. `pnpm tauri:bundle:setup` 产出可安装的 NSIS `setup.exe`；其安装目录页为 NSIS 向导页面，不再出现 WiX 的目录选择器。
2. 现有 WebView2 Runtime 的设备安装默认 `setup.exe` 时，不执行 Runtime 安装器；无 Runtime 时展示明确前置安装进度，不承诺十秒。
3. 在线 MSI、离线 MSI、NSIS setup 三种产物均保留并能独立构建。
4. 启动后即使没有收到 Tauri 日志事件，日志页也能从后端快照显示已产生的启动日志。
5. 停止响应成功而 `stopped` 事件丢失时，状态快照仍将卡片收敛到“已停止”；停止超时则展示 error 而非无限“停止中”。
6. 版本校验与实际 FRPC 运行均通过同一无窗口命令构造器；在 Windows 人工验收中连续启动不出现黑框。
7. 新增测试覆盖日志快照去重、停止事件丢失、已有 WebView2 跳过安装器及无窗口命令配置；运行现有前端和 Rust 测试。

## 非目标

- 不保证缺失 WebView2 的首次安装在任意机器上十秒内完成。
- 不自动释放远程 FRPS 已占用端口。
- 不将完整 FRPC 日志、运行时配置或敏感信息持久化到磁盘或 localStorage。
