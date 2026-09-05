# FRPC 状态、日志与 MSI 安装体验设计

## 目标

解决桌面端已启动的 FRPC 长期显示“启动中”、启动后日志页为空、连接卡片信息层级陈旧，以及首次安装 MSI 因 WebView2 下载而缓慢的问题。

## 已确认事实与根因

1. 用户提供的 FRPC 输出先出现“login to server success”，随后出现某个代理的 `Start error: port already used`。这代表客户端到 FRPS 的连接已成功，失败范围是该代理的远程监听端口，不能判定整个 FRPC 实例启动失败。
2. `src-tauri/src/frpc_runtime.rs` 在子进程存活确认窗口结束后才将实例更新为 `running`，发射运行状态事件，并返回 `accepted: true` 与 PID。
3. `src/App.tsx` 对启动成功的返回值不更新 UI，而只等待 `frp-runtime-state` 事件；状态事件未到达时，前端保留先前设置的 `starting`。
4. `src/features/logs/LogDashboard.tsx` 仅在日志路由已挂载时才订阅日志。用户从连接页启动时，启动日志没有缓存接收者；进入日志页后无法回放这些早期输出。
5. 现有 MSI 为约 5.81MB，`src-tauri/tauri.conf.json` 未配置 `bundle.windows.webviewInstallMode`。Tauri 默认的 `downloadBootstrapper` 会在 WebView2 缺失时联网下载运行时，安装时间取决于网络。官方提供离线嵌入方案，但会增加约 127MB 包体：[Tauri Windows Installer](https://v2.tauri.app/distribute/windows-installer/)。

## 设计

### 1. 可信状态的双通道收敛

运行期状态事件仍是实时更新的主通道。单次启动命令成功返回后，前端额外调用 `getRuntimeStates()` 查询后端受监管实例的权威快照；只有该快照中同一 profile 的状态为 `running` 才写入卡片。

该机制不把“进程已 spawn”乐观地显示成运行中：Rust 仅在 800ms 存活确认后返回 `accepted: true`，快照则再次读取 Rust 监管器当前状态。启动响应与事件之间任一通道丢失时，另一通道仍能将 UI 从 `starting` 收敛到 `running`。

提前退出、核心校验失败和后续意外退出保持既有 `error` 行为；快照若不是 `running`，不覆盖当前状态，等待后端状态事件或失败响应落定。

### 2. 应用级日志环形缓存与代理警告

`AppLayout` 订阅运行时日志和状态事件，维护最多 2,000 条的内存日志环形缓存，并将其传入日志页。日志页不再自行订阅原始事件，因此切换路由不会丢失启动前、启动中或页面未打开时的输出。

日志写入缓存时，将 warn 级别最新消息同步为对应连接的 `stats.lastWarning`。启动操作清除旧 warning；新的警告不会改变连接主状态。运行中的连接若收到 `port already used` 等 FRPC warning，仍显示“运行中”，并展示规则级“配置有警告”提示及原始安全日志内容。

日志与状态均继续使用现有脱敏和 4KiB 截断逻辑；不持久化到 localStorage，也不增加秘密信息暴露面。

### 3. 连接卡片视觉与交互

采用用户确认的 A 方案：

- 保持明亮、简洁的现代卡片，而非旧式密集控件；标题、连接地址和协议标签分层展示。
- 使用绿色“运行中”作为实例状态；警告独立显示，不用橙色“启动中”覆盖真实运行状态。
- 代理规则显示名称、协议、本地到公网端口映射；卡片底部保留唯一主操作“停止连接”与次级“查看详情”。
- 对有 `lastWarning` 的运行中 FRPC，显示可访问日志的警告条；停止或下一次启动会清空过期 warning。

### 4. MSI 分发策略

保留默认在线 MSI：继续使用 Tauri 默认 `downloadBootstrapper`，体积小，适用于已有 WebView2 或网络稳定的 Windows 10/11 设备。

新增单独的离线 MSI 构建配置，设置 `bundle.windows.webviewInstallMode.type` 为 `offlineInstaller`。该包不在安装阶段下载 WebView2，适用于网络受限或需要确定安装耗时的设备；代价是增加约 127MB。离线与在线产物在发布时使用明确文件名区分，README 说明选择方式。

不采用 `skip`：它虽然最小最快，但会使缺少 WebView2 的用户安装后无法运行。

## 边界与验收标准

1. 模拟 `startProfileInstance` 已接受且 `getRuntimeStates` 返回 `running` 时，即使没有事件，卡片也显示“运行中”及 PID。
2. 模拟失败响应或非 running 快照时，不能伪造“运行中”。
3. 从连接页启动后再进入日志页，能够查看启动期间收到的日志；日志数最多 2,000 条。
4. 运行中连接出现 warn 日志时仍为“运行中”，并显示 warning；重新启动或停止后 warning 被清除。
5. 默认 MSI 与离线 MSI 均能构建；离线配置包含 `offlineInstaller`，README 说明包体积与网络取舍。

## 非目标

- 不自动释放或修改远程 FRPS 已占用的端口。
- 不将完整运行日志持久化到磁盘或 localStorage。
- 不改动 FRPC 的安全校验、进程权限、Token 脱敏或远程 FRPS 部署流程。

