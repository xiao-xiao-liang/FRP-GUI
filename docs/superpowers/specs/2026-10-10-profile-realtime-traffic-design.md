# 我的连接指标与实时流量设计与验收

日期：2026-10-10。状态：已实现，完成 Windows 自动化与官方核心真实传输验证；验证边界见文末。

## 目标与统计口径

1. 将“在线穿透隧道”改为“穿透规则”，主数字展示当前已配置的代理规则总量，已停止连接的规则也计入；不再用进程状态推断规则在线，不显示“正常工作”。统计范围与规则详情中的代理列表保持一致。
2. 用“实时流量”替换“FRP 核心引擎”卡片，分别展示上行、下行速率。核心管理与每连接独立选择版本的能力继续保留。
3. 流量仅统计本应用管理的本地 FRPC 实例。上行是本机 FRPC 发往 FRPS，下行是 FRPS 发往本机 FRPC。统计隧道传输字节，包含 TLS、心跳与 FRP 复用等开销，不等同于纯业务文件大小，也不是整机网卡流量。
4. 本次仅修改这两张指标卡及其必要采集链路，不增加历史统计或逐规则流量，不提交 Git。

## 已核实的数据源限制

- 当前应用的 `bytesIn`、`bytesOut`、`curConns` 仅有初始化值，没有真实采集路径。
- FRPC v0.61.1 与 v0.71.0 的管理状态接口均没有流量字节计数，不能通过开启 Admin UI 得到实时速率。
- 上述 FRPS 版本的 TCP 通用转发路径在连接结束后才提交流量累计。轮询 Dashboard 或 Prometheus 会漏掉长连接传输期间的变化，并在结束时突然跳增，不适合作为本需求的数据源。
- 操作系统进程级采集是另一条路线，但需分别适配平台。Windows TCP 扩展统计的启用涉及管理员权限，而且单独使用 TCP 统计不覆盖 UDP 传输。它适合另行评估，不作为本次默认实现。

官方依据：

- [FRPC v0.61.1 管理 API](https://github.com/fatedier/frp/blob/v0.61.1/client/admin_api.go)
- [FRPC v0.71.0 管理路由](https://github.com/fatedier/frp/blob/v0.71.0/client/api_router.go)
- [FRPS v0.61.1 TCP 转发与统计](https://github.com/fatedier/frp/blob/v0.61.1/server/proxy/proxy.go)
- [FRPS v0.71.0 TCP 转发与统计](https://github.com/fatedier/frp/blob/v0.71.0/server/proxy/proxy.go)
- [Windows TCP 扩展统计限制](https://learn.microsoft.com/en-us/windows/win32/api/iphlpapi/nf-iphlpapi-getpertcpconnectionestats)

## 实现方案：本机计量中转

采用本机计量中转，继续使用用户选择的原版 FRPC，不要求服务端 Dashboard、服务端管理凭据或操作系统提权。已完成长连接实时计数、TLS、TCPMux 和资源释放验证；吞吐仅做调试构建下的粗略比较，尚未完成正式资源基准。

数据路径为：FRPC → 应用内 SOCKS5 计量中转 → FRPS。中转仅监听本机回环地址，为每个运行实例分配随机端口及临时认证信息，并且只允许连接该实例配置的 FRPS 目标。

在独立的临时运行 TOML 中，将 `transport.proxyURL` 指向计量中转，保留原来的服务端地址、端口和 TLS 身份。原始 TOML、导出配置、持久化配置、核心目录中保存的方案文件均不写入临时中转地址或临时密码。临时配置需要独立路径，并验证相对路径、工作目录与 includes 的解析语义。

中转在 SOCKS5 握手成功后统计实际成功传输的两个方向字节，每个方向只选一个边界计数，避免同时计算读与写造成翻倍。原始 FRP/TLS 数据保持透传。多个控制与工作连接归属同一运行实例，TCPMux 开关均须验证。

官方实现基础：[v0.61.1 connector](https://github.com/fatedier/frp/blob/v0.61.1/client/connector.go)、[v0.71.0 connector](https://github.com/fatedier/frp/blob/v0.71.0/client/connector.go)、[客户端代理配置说明](https://gofrp.org/en/docs/features/common/client/)。v0.68.1、v0.71.0 已使用官方核心完成 TCP 业务实测；其他版本不据此宣称全部验证。

## 首版覆盖与兼容要求

| 配置 | 首版处理 |
| --- | --- |
| FRPC 与 FRPS 使用 TCP 传输，普通 TCP、HTTP、HTTPS 代理 | 首版启用；TCP 业务实测覆盖 TLS 和 TCPMux 开关，HTTP/HTTPS 独立业务验证尚未执行 |
| TCP 传输承载 UDP、STCP、SUDP 或 visitor | 数据路径存在实现基础，完成各自验证后再加入支持名单 |
| WebSocket / WSS 传输 | 单独验证后扩展，不直接推定支持 |
| QUIC、KCP 传输 | 首版不可采集，继续使用原配置启动 |
| XTCP / P2P | 首版不可采集；不能用控制协商字节冒充业务流量 |
| 已配置 `transport.proxyURL`，或继承 `http_proxy` | 首版保留既有代理，标为不可采集；不能覆盖成直连 |
| 自定义 DNS、绑定源 IP、显式 `dialServerTimeout` / `dialServerKeepalive` / `dialServerKeepAlive` | 首版保留原拨号路径，标为不可采集，避免改变自定义拨号语义 |
| includes 或模板 | 首版保留原配置，标为不可采集 |

包含任何尚不支持的数据路径时，该运行实例整体标为不可采集，避免只统计一部分却声称完整。现有启动中的实例不能在不重启的情况下插入中转，接入后需在下一次启动时生效。

该方案的主要代价是新增数据转发环节。中转故障可能影响对应连接，不能宣称监控完全不影响业务。采样与事件发布应和数据转发分离；只有数字采样故障时，不关闭仍正常工作的转发连接。中转创建失败发生在 FRPC 启动之前时，明确标记采集不可用并使用原配置启动。已经运行的连接不能假装可以无中断切换回直连。

上游连接启用系统默认 TCP keepalive，探测间隔不保证与 Go 默认值完全一致。域名拨号保留原目标身份，按地址族交替尝试，间隔 250ms、最多两个并发拨号，避免 Windows 上不可达 IPv6 阻塞 IPv4。每实例最多 1024 个中转连接，复制缓冲区为每方向 32KiB；超过该连接上限的负载未验证。未新增依赖。

## 速率、生命周期与前端展示

- Rust 每秒计算一次 `累计字节差 / 实际经过秒数`，时间间隔使用单调时钟，不假设定时器总是准确触发。
- 每次启动产生独立运行标识。停止、退出、重启及删除连接后清理对应任务、监听端口和临时配置；采样带运行标识与序号，拒绝上一次运行的迟到数据。
- 首个有效采样间隔前展示“采集中”；采样失败或超过三个采样周期没有更新时失效，不继续把旧速率显示为当前速率。计数下降时重新建立基线，不产生负速率。
- Rust 保留独立流量缓存，新增 `frp-runtime-traffic` 事件与 `get_runtime_traffic` 快照命令。前端沿用先订阅、再读快照的方式，使用独立内存状态。
- 不把每秒变化的速率写入 `profiles.stats` 或 localStorage，避免触发现有方案持久化、凭据同步和列表排序。
- 卡片默认汇总当前运行实例的有效速率，显示“上行 ↑ / 下行 ↓”，自动使用 B/s、KB/s、MB/s，单位按十进制换算。
- 部分实例不可采集时，显示“已统计 N / M 个运行连接”，明确数字只是可采集部分的合计；没有任何可采集实例时显示 `—` 和原因。
- 只有真实采样到空闲，或当前没有运行实例时，显示 `0 B/s`。没有运行实例时同时标记“未运行”。
- 首版不做历史流量图、日月累计、逐条规则流量、服务端全局流量或自动代理链。

## 已完成的实施与涉及文件

1. **采集验证。** 独立验证本机中转、TCP 透传、长连接实时计数及官方核心兼容性；完成 v0.61.1、v0.71.0 的连接路径源码核实，实测 v0.68.1、v0.71.0。
2. **Rust 采集与运行配置。** 在 `E:/Code/Projects/MyProject/Tools/FRP-GUI/src-tauri/src/traffic_meter.rs` 实现计量、单调时间差分与资源管理；在 `E:/Code/Projects/MyProject/Tools/FRP-GUI/src-tauri/src/frpc_runtime.rs` 接入临时配置、运行标识和启停清理。优先使用已有 Tokio、TOML、UUID 能力。
3. **事件与快照。** 修改 `E:/Code/Projects/MyProject/Tools/FRP-GUI/src-tauri/src/lib.rs`、`E:/Code/Projects/MyProject/Tools/FRP-GUI/src/services/ipc.ts`、`E:/Code/Projects/MyProject/Tools/FRP-GUI/src/types/frp.ts`，定义独立流量样本、可用性、原因及运行标识。
4. **指标卡接入。** 修改 `E:/Code/Projects/MyProject/Tools/FRP-GUI/src/App.tsx`、`E:/Code/Projects/MyProject/Tools/FRP-GUI/src/features/profiles/ProfileList.tsx`、`E:/Code/Projects/MyProject/Tools/FRP-GUI/src/features/profiles/ProfileMetricsCards.tsx`：规则卡显示配置总数，第四张卡消费独立流量状态，移除核心卡对应的展示参数。
5. **验证与文档。** 更新相关回归、官方核心集成测试、README 与本记录。

## 验证结果与边界

- `pnpm.cmd test`：31 个文件、347 项通过，覆盖已配置规则数、流量汇总、过期与迟到事件、重启屏障、非法样本及不触发方案/凭据持久化。
- `pnpm.cmd build`：通过。Vite 的大于 500KB 包体提示仍存在，本次未调整打包策略。
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`：106 项通过，其中计量模块 19 项，覆盖认证、目标限制、双向计数、背压、半关闭、独立实例、采样故障、地址回退、保活与清理；运行时覆盖临时配置隔离、启动失败、停止及退出清理。
- 官方核心集成测试：设置 `FRP_TRAFFIC_TEST_CORE_DIR` 指向所选官方核心目录，再执行 `cargo test --manifest-path src-tauri/Cargo.toml --test traffic_frp -- --ignored --nocapture`。v0.68.1、v0.71.0 各通过 TCP 代理的 TLS × TCPMux 四组合；持续双向传输尚未关闭时读到业务速率，SHA256 校验一致，原配置逐字节一致，主动停止和意外退出后临时配置、测试进程和目录均已清理。测试默认忽略，避免依赖用户环境或下载核心。
- 浏览器空闲态预览：四张卡片显示正确，已停止连接的规则计入总数，实时流量为双向 `0 B/s` 并显示“未运行”，控制台无警告或错误。浏览器预览不具备真实 FRPC 能力，真实速率依据上述原生运行时集成测试。
- `git diff --check`：通过；未提交。

尚未验证：macOS/Linux 实机、其他核心版本、HTTP/HTTPS 独立业务、自定义 TLS 证书相对路径实机、桌面 WebView 完整交互、长时间运行及正式 CPU/内存/延迟基准。v0.61.1 官方压缩包被本机防病毒阻止，未绕过；仅完成该版本源码核实。16MiB 双向传输做过直接连接与中转的粗略比较，调试构建和校验开销不足以得出正式性能结论。首版支持范围有限，不能宣称覆盖所有协议与配置。
