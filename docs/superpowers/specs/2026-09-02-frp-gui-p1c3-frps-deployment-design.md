# FRP-GUI P1-C3「FRPS 安全部署与服务管理」设计规格

## 目标

让已通过 P1-C2 SSH 预检的 Ubuntu/Debian 服务器节点，在 FRP-GUI 桌面版内完成 FRPS 稳定版下载、`frps.toml` 图形化配置、受控部署、启动/停止/重启、开机自启与脱敏状态查看；普通用户不需要编写或运行 Shell、Bash、PowerShell 命令。

## 范围与非目标

### 本阶段范围

- 仅支持 P1-C2 已确认 SSH 指纹、Ubuntu/Debian、`amd64`/`arm64` 和 `systemd` 的服务器节点。
- 支持三种部署权限：`root`、免密 sudo、需要 sudo 密码的普通用户。
- 从 fatedier/frp GitHub Release 的固定官方 HTTPS 地址下载用户选择的稳定 FRPS 版本及同发布版本的 `frp_sha256_checksums.txt`，校验 Linux 对应架构压缩包的 SHA-256 后才解压和安装。
- 图形化配置 FRPS bind 端口、Token、dashboard 端口/用户名/密码、TLS 与 transport；普通模式不展示或持久化 Token、dashboard 密码等秘密。
- 原子写入 `/opt/frp/frps.toml`、安装版本目录、创建固定命名的 `frp-gui-frps.service`、`daemon-reload`、`enable --now`，并读取 `is-active`、`is-enabled`、`frps --version` 和 bind 端口健康结果。
- 对已部署节点提供重新部署、启动、停止、重启、刷新状态和最近有限行数的 systemd 日志。

### 非目标

- 不支持 CentOS/RHEL、非 systemd Linux、容器/Kubernetes、多节点集群、云安全组自动配置、远程交互终端、用户自定义 Shell/Bash/PowerShell、任意 URL 下载、自动升级或自动回滚。
- 不在 P1-C3 改造 FRPC 场景向导复用默认节点；该闭环仍属于 P1-C4。
- 不读取、显示或导出已保存的 SSH、sudo、FRP Token、dashboard 密码或私钥秘密。

## 已确认安全决策

1. **独立 sudo 凭据。** SSH 认证秘密与 sudo 密码是不同的 Keyring 条目。用户可以仅本次输入 sudo 密码，或明确勾选“记住 sudo 密码到系统安全凭据库”。节点元数据只记录 `sudoCredentialsRemembered` 与既有凭据引用，绝不保存密码。
2. **密码只走 stdin。** Rust 以 `sudo -S -p '' --` 调用固定的受控部署操作。sudo 密码通过 SSH 通道标准输入写入；不会被拼入远程命令、脚本参数、配置文件、日志、Toast、错误对象或 localStorage。
3. **后端白名单。** 前端只能请求 `deploy`、`start`、`stop`、`restart`、`refresh_status`、`read_logs` 六种枚举操作。版本、端口、安装目录、服务名和配置均由 Rust 严格校验；Tauri DTO 使用 `deny_unknown_fields`。前端不可提交命令、脚本、下载 URL、服务名单或文件路径。
4. **供应链校验。** 版本必须匹配 `^0\\.[0-9]+\\.[0-9]+$`，下载地址只可由 Rust 按版本和已预检架构构造：`https://github.com/fatedier/frp/releases/download/v{version}/`。后端取得同一 release 的 `frp_sha256_checksums.txt`，计算压缩包 SHA-256 并逐字匹配相应 `frp_{version}_linux_{amd64|arm64}.tar.gz` 条目。任何网络、解析或校验失败均不得安装。
5. **部署前确认与幂等。** UI 必须展示将执行的固定步骤、版本、安装目录、配置路径、服务名和端口，并要求显式确认。首版安装根目录固定为 `/opt/frp`，服务名固定为 `frp-gui-frps.service`，避免覆盖用户自行维护的 `frps.service`。每次部署使用版本目录 `/opt/frp/releases/{version}` 和临时文件；仅在二进制、校验、配置校验均成功后原子切换 `/opt/frp/current` 并替换配置。重新部署同版本允许覆盖同一版本目录，但失败不会将节点标成运行中。
6. **严格脱敏。** 后端不返回原始 stderr、远程环境、完整 TOML 或 journal 原文；日志服务端按行过滤 `token =`、`password =`、私钥 PEM 块和已知临时秘密，并限制为最近 200 行、总计 32 KiB。UI 只显示脱敏摘要。
7. **安全中断。** 开始每项写操作前都新建 SSH 连接并复核 P1-C2 已信任的主机指纹。指纹变化、未预检、预检过期、权限/凭据/校验失败都会中止，不执行后续操作。
8. **桌面端原生边界与凭据引用生命周期。** 远程受控部署与 systemd 服务管理仅在桌面端原生环境（Tauri）可用，浏览器模式展示桌面版说明并阻断调用。所有节点无论是否记住 SSH 登录凭据，均持有稳定的公开凭据引用 `credentialRef`（形如 `frp-gui/server-node/<id>`），确保部署生成的 FRP Token 与 Dashboard 密码始终写入 Keyring；删除节点时无论是否记住 SSH 凭据，均可一键从系统凭据库清理该引用下存储的所有机密。
9. **单次凭据即时清空。** 未记住凭据的单次 SSH 凭据或临时 sudo 密码仅短暂存活于单次 IPC 请求的局部变量中；向导在 Keyring 写入成功后立即清空 React 状态中的机密，发起远程调用时 UI 状态已处于清空状态，在完成、失败、取消或关闭时均执行兜底清空。

## 领域模型与状态

`FrpServerNode` 继续只保存非敏感元数据，并增加：

| 字段 | 用途 | 禁止保存 |
| --- | --- | --- |
| `sudoCredentialsRemembered` | 标识 sudo 密码是否已进入 Keyring | sudo 密码本身 |
| `deployment` | 已确认的 FRPS 版本、安装目录、服务名、配置摘要、最后部署时间 | Token、dashboard 密码、完整 TOML |
| `serviceStatus` | `unknown` / `running` / `stopped` / `failed` | 原始 systemd 输出 |
| `lastOperation` | 操作类型、完成时间、脱敏结果摘要 | 命令行、秘密、原始 stderr |

状态规则：

```text
ready_to_deploy | stopped | error
  -> deploying
  ->（校验、安装、配置、enable、健康检查都成功）running
  ->（任一步失败、取消、指纹变化）error

running -> stopped       （停止成功）
stopped -> running       （启动并健康检查成功）
running | stopped -> error（服务查询失败或健康检查失败）
```

`sudo_password_required` 不再在 P1-C3 被视为永久不可部署：它表示部署确认页必须收集可用 sudo 密码。缺少密码、密码错误或用户取消时保持 `ready_to_deploy` 或回到 `error`，绝不写成 `running`。

## 受控远程执行协议

前端调用的请求由 Rust 定义的 `ServerOperationRequest` 接收：节点标识和完整连接元数据、操作枚举、受限的 `DeploymentDraft`、可选的单次 sudo 密码，以及首次部署确认令牌。请求不含 shell 文本、URL、路径覆盖项或任何可执行参数。

Rust 根据节点的已预检 OS/架构和可信主机指纹，建立 SSH 会话。它使用固定的操作脚本常量：脚本从标准输入读取经长度限定的部署载荷，写入临时文件，校验 SHA-256、调用 `frps verify -c`，以原子 `mv` 切换配置/当前版本链接，再执行固定的 systemd 子命令。所有动态文本都通过受限数据载荷传递，绝不插入 `exec` 命令字符串。需要提权时，同一 SSH 通道先写入 sudo 密码和换行，再写入载荷；root 与免密 sudo 不产生 sudo 密码输入。

每步返回一个不含秘密的 `ServerOperationEvent`：`preparing`、`downloading`、`verifying`、`configuring`、`installing_service`、`starting`、`health_checking`、`completed` 或 `failed`。UI 使用事件渲染进度，但不会显示远程命令或原始输出。

## 图形界面流程

1. 用户在“服务器节点”卡片点击“部署 FRPS”或“重新部署”。仅 `ready_to_deploy`、`stopped`、`error` 节点可进入。
2. 部署向导载入节点的非敏感摘要；用户选择官方稳定版本，填写普通配置字段。Token、dashboard 密码和需要 sudo 的密码均为密码输入框，默认不显示。
3. 若节点权限为 `sudo_password_required`，展示原因和 sudo 密码输入；用户可选择记住。若已记住，只展示“将使用系统安全凭据库”，不出现读取/回显入口。
4. 确认页展示固定部署计划及端口冲突提醒，用户点击“确认部署”后才可发起远程写操作。
5. 进度页按步骤呈现脱敏状态。成功后显示“运行中、已启用开机自启、版本、端口”；失败保留安全摘要以及“重试”“返回编辑”。
6. 已部署卡片提供启动、停止、重启、刷新状态、查看最近日志和重新部署。高风险操作（首次部署、重新部署、停止）均有明确确认。

## 验收标准

1. root、免密 sudo 与需要 sudo 密码的 Ubuntu/Debian 节点均能走完正确的部署授权流程；sudo 密码可临时使用或进入系统凭据库，但绝不出现在前端状态、节点对象、日志、TOML 或 IPC 结果中。
2. 未预检、指纹变化、非支持系统/架构、缺少 systemd、缺少/错误 sudo 密码、下载或 checksum 校验失败时，没有安装、配置、服务创建或“运行中”假状态。
3. 成功部署后，`frps.toml` 通过 `frps verify -c`，固定服务 `frp-gui-frps.service` 已 enabled 且 active，并可通过服务控制动作得到一致的节点状态。
4. 前端不能向 Tauri/Rust 传递命令、脚本、URL、服务名或任意路径；Rust 会拒绝未知字段和非法版本、端口、节点状态。
5. P0、P1-A、P1-B、P1-C1、P1-C2 全量回归通过；新增 Rust 单元测试覆盖凭据隔离、sudo stdin、远程操作白名单、资产校验和脱敏，新增前端测试覆盖向导、密码清理、确认门槛、进度和失败重试。

## 后续拆分

本规格足够大，实施计划将拆为四个可独立验收的任务组：

1. sudo 凭据、部署数据契约与配置校验；
2. Rust 受控执行器、官方资产 checksum 校验与原子部署；
3. FRPS 部署向导、节点服务操作与前端 IPC；
4. 文档、全量回归和经用户明确授权的真实测试服务器走查。
