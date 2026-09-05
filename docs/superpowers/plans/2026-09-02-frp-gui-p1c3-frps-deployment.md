# FRP-GUI P1-C3「FRPS 安全部署与服务管理」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 当前工作区不是 Git 仓库，未经用户授权不得执行 commit。

**Goal:** 让已通过 SSH 主机信任与平台预检的 Ubuntu/Debian 节点，在桌面版内安全完成 FRPS 配置、官方 release 下载与 checksum 校验、部署、systemd 管理和状态/脱敏日志查看，且支持 root、免密 sudo 与需 sudo 密码的普通用户。

**Architecture:** 所有秘密存于 OS Keyring 或只存活于单次 IPC 调用；`FrpServerNode` 与 localStorage 只保存可公开的配置摘要和状态。前端仅发出结构化操作枚举，Rust 以固定的远程 helper、固定服务名和固定安装根目录执行；资产先由桌面端从官方 GitHub Release 下载并校验 SHA-256，再通过 SSH stdin 发送给 helper，所有动态数据不进入远程命令字符串。

**Tech Stack:** React 19、TypeScript、Vitest、React Testing Library、Tauri v2、Rust、Tokio、`russh` 0.45.0、`russh-keys` 0.45.0、`keyring` 4.1.5、`reqwest`、`sha2`、`base64`。

**Non-goals:** 不支持 CentOS/RHEL、容器/集群、用户自定义命令/URL/路径/服务名、云安全组、交互终端、自动升级/回滚或 FRPC 向导选节点（P1-C4）。本阶段服务名固定为 `frp-gui-frps.service`，安装根目录固定为 `/opt/frp`，不会改写用户现有的 `frps.service`。

---

## 安全不变量（每个 Task 都不得破坏）

1. 前端、Tauri DTO 和日志中不得出现 `command`、`shell`、`script`、`downloadUrl`、`serviceName`、任意路径覆盖字段或原始远程 stderr。
2. sudo 密码、FRP Token、dashboard 密码、SSH 密码/私钥/口令均不得进入 `FrpServerNode`、localStorage、Toast、错误对象、测试快照或日志；未记住的 SSH 与 sudo 凭据仅可存在于一次 Tauri 请求和 Rust 内存。禁止为含秘密的 DTO 派生 Rust `Debug`。
3. sudo 仅能以固定 `sudo -S -p '' -- /bin/sh -s -- frp-gui-deploy` 的 stdin 第一行输入；root 与免密 sudo 不发送 sudo 密码。
4. 每个远程写操作必须重新校验已保存的 SHA-256 SSH 主机指纹。未预检、指纹变化、下载/checksum/FRPS 配置校验失败时必须在写入前停止，且节点不为 `running`。
5. 版本只接受 `0.x.y`，架构只接受 P1-C2 预检出的 `amd64`/`arm64`，端口必须为 1–65535；官方 asset URL 只能由 Rust 构造。

## 文件与职责

| 文件 | 变更 | 职责 |
| --- | --- | --- |
| `src/types/frp.ts` | 修改 | 部署草稿、服务状态、受控操作请求/结果；节点只保存公开部署摘要。 |
| `src/services/frps-deployment.ts` | 新增 | 前端纯函数：表单校验、无秘密摘要、节点操作结果归并。 |
| `src/services/frps-deployment.test.ts` | 新增 | 校验、秘密剥离和状态迁移回归。 |
| `src/services/server-nodes.ts` | 修改 | 将 `sudo_password_required` 预检结果合法归并为“可部署但需 sudo 密码”。 |
| `src/services/ipc.ts` | 修改 | 浏览器阻断、请求白名单重建、FRP 秘密写入 Keyring 以及唯一部署 IPC 包装。 |
| `src/services/frps-deployment-ipc.test.ts` | 新增 | 断言 IPC 不透传命令、URL、路径和秘密。 |
| `src-tauri/Cargo.toml` | 修改 | 仅新增 `sha2` 与 `base64`，锁定兼容版本；不得升级 `russh`。 |
| `src-tauri/src/credential_store.rs` | 修改 | 增加 sudo/FRP/dashboard 凭据类别；内部读取仍不注册 Tauri read command。 |
| `src-tauri/src/frps_deployment.rs` | 新增 | DTO 拒绝未知字段、官方资产校验、主机信任、固定 helper、sudo stdin、服务操作、脱敏。 |
| `src-tauri/src/lib.rs` | 修改 | 只注册 `run_frps_operation`；不注册任何远程命令或凭据读取命令。 |
| `src/features/servers/FrpsDeploymentModal.tsx` | 新增 | 配置、sudo 输入、部署确认、进度和结果界面。 |
| `src/features/servers/ServerNodeManagerPage.tsx` | 修改 | 节点卡片的部署/服务操作入口与浏览器阻断。 |
| `src/features/servers/ServerNodeManagerPage.test.tsx` | 修改 | 部署 UI、密码清理、确认门槛、服务状态操作。 |
| `src/App.tsx`、`src/App.test.tsx` | 修改 | 持久化公开节点更新；覆盖跨页面回归。 |
| `README.md`、`docs/superpowers/specs/2026-09-02-frp-gui-p1c3-frps-deployment-design.md` | 修改 | 同步实际支持范围、人工走查与验证结果。 |

---

### Task 1: 部署领域契约、秘密隔离与 P1-C2 sudo 密码状态

**Files:**
- Modify: `src/types/frp.ts`
- Create: `src/services/frps-deployment.ts`
- Create: `src/services/frps-deployment.test.ts`
- Modify: `src/services/server-nodes.ts`
- Modify: `src/services/server-nodes.test.ts`
- Modify: `src-tauri/src/credential_store.rs`

- [x] **Step 1: 先写 TypeScript 失败测试，锁定公开节点模型与校验规则**
- [x] **Step 2: 定义唯一的前端契约并实现最小校验**
- [x] **Step 3: Change P1-C2’s valid sudo-password preflight path and cover it**
- [x] **Step 4: 扩展 Keyring 枚举，并只增加内部读取能力**
- [x] **Step 5: Run focused validation**

---

### Task 2: Rust 官方资产校验与固定 FRPS 远程执行器

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/frps_deployment.rs`
- Modify: `src-tauri/src/lib.rs`

**补充的硬性契约：** `ServerOperationRequest` 必须提供非 `Debug` 的 `ephemeralSshCredentials`（密码或私钥/口令），只允许用于 `credentialsRemembered: false` 的一次操作；已记住节点必须拒绝此字段。`ServerOperationConnection` 必须传递并验证 P1-C2 的 `systemd` 与 `privilege`，并严格区分 `root`、`sudo_passwordless`、`sudo_password_required`。所有 systemd 操作必须读取 SSH `ExitStatus`；启动/重启成功后还必须复核 `is-active`，不得只因没有 stderr 就返回 `running`。TOML 必须使用安全 serializer 或严格转义，且 Keyring 缺少 Token/dashboard 密码时在远程写入前失败。

- [x] **Step 1: 写入离线 Rust 失败测试，先锁定不可绕过的安全函数**
- [x] **Step 2: Add only the required dependencies and DTOs**
- [x] **Step 3: Implement official download and checksum verification before opening a write operation**
- [x] **Step 4: Implement one embedded helper and fixed commands, with stdin-only secret/data transport**
- [x] **Step 5: Implement action result handling and redaction**
- [x] **Step 6: Register the single Tauri command and run Rust validation**

---

### Task 3: 前端安全 IPC、部署向导与节点服务操作

**Files:**
- Modify: `src/services/ipc.ts`
- Create: `src/services/frps-deployment-ipc.test.ts`
- Create: `src/features/servers/FrpsDeploymentModal.tsx`
- Modify: `src/features/servers/ServerNodeManagerPage.tsx`
- Modify: `src/features/servers/ServerNodeManagerPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [x] **Step 1: 写 IPC 失败测试，确保请求会被重建而非透传**

```ts
it('部署 IPC 只发送白名单字段，不透传命令、URL 和路径', async () => {
  await runFrpsOperation({
    node: readyNode as any,
    operation: 'deploy',
    deployment: { ...publicDraft, command: 'id', downloadUrl: 'https://evil', installDir: 'C:/x' } as any,
    confirmation: { accepted: true, shell: 'bash' } as any,
    ephemeralSudoPassword: 'sudo-secret',
  });
  const request = vi.mocked(tauriInvoke).mock.calls[0][1].request;
  expect(JSON.stringify(request)).not.toContain('command');
  expect(JSON.stringify(request)).not.toContain('downloadUrl');
  expect(JSON.stringify(request)).not.toContain('installDir');
  expect('command' in request.deployment).toBe(false);
  expect('downloadUrl' in request.deployment).toBe(false);
  expect('installDir' in request.deployment).toBe(false);
  expect('shell' in request.confirmation).toBe(false);
});
```

For explicitly remembered sudo, the frontend must first call the existing `store_server_credential(reference, 'sudo_password', secret)`, clear the modal state, then call the operation without `ephemeralSudoPassword`. Add a separate one-time-sudo test that asserts the password exists only in the single Tauri request and never in a returned result, state update or JSON-persisted node.

- [x] **Step 2: Implement explicit secret storage and safe operation wrapper**

Provide `storeFrpsSecrets(reference, { authToken, dashboardPassword?, sudoPassword?, rememberSudoPassword })` that writes `frp_token` and optional `dashboard_password` to Keyring before deployment; it writes `sudo_password` only if explicitly opted in. Implement `runFrpsOperation` to reject non-Tauri environments and rebuild exact whitelisted fields. For a node without remembered SSH credentials, the DTO may contain exactly one one-time `ephemeralSshCredentials` object matching its authentication method; for a remembered node it must be absent. It may also contain a one-time `ephemeralSudoPassword`. Neither form may contain Token, dashboard password, command, URL, service name or path, and neither may enter a returned result, state update or persisted node.

- [x] **Step 3: Implement the modal as a strict three-stage flow**

Use existing `FeishuDialog`, `FeishuInput`, `Button`, `FeishuPill` and `feishuToast`.

1. **配置：** render version, bind port, transport protocol, TLS, dashboard toggle/fields, Token and dashboard-password inputs. Inputs for secrets use `type="password"` and clear controls. If P1-C2 privilege is `sudo_password_required`, render sudo password and `记住 sudo 密码到系统安全凭据库` checkbox; if remembered, show only Keyring notice.
2. **确认：** show exactly the version, architecture, `/opt/frp`, `/opt/frp/frps.toml`, `frp-gui-frps.service`, bind/dashboard ports and fixed steps. It must say “将下载并写入远程服务器”； only `确认部署` submits.
3. **进度/结果：** show fixed safe event labels, success details, safe error plus retry/edit. Wipe every in-component secret after successful Keyring store, operation completion, failure, cancel, modal close, and unmount.

- [x] **Step 4: Add card actions and App persistence**

On desktop cards: `ready_to_deploy` shows `部署 FRPS`; `running` shows `停止服务` plus an overflow menu for restart/refresh/logs/redeploy; `stopped` shows `启动服务`; `error` shows `重新部署` and `查看安全摘要`. Browser mode shows non-actionable “FRPS 部署需要桌面版应用” text and no operation buttons. `onComplete` must call the existing App node save path with `applyFrpsOperationResult` output only; no modal secret is placed in `frp_gui_server_nodes`.

- [x] **Step 5: Write and run UI/integration regression tests**

Add tests for: desktop deployment requires the confirmation stage; browser exposes no deploy action; unremembered password and private-key SSH nodes submit only one-time credentials and clear them on cancel/failure/success; `sudo_password_required` displays temporary/remembered alternatives; cancel, failed deployment and success clear sudo/Token/dashboard inputs; saved node and localStorage contain no secrets; success shows running/enabled/version; failed checksum is error not running; start/stop/restart/refresh action routes correct enum; a log value resembling `token = abc` renders as `token = ******`.

Run: `pnpm test src/services/frps-deployment.test.ts src/services/frps-deployment-ipc.test.ts src/features/servers/ServerNodeManagerPage.test.tsx src/App.test.tsx`  
Expected: PASS.

---

### Task 4: 文档同步、全量回归与受控人工验收

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-02-frp-gui-p1c3-frps-deployment-design.md`

- [x] **Step 1: Update user documentation without overstating capability**

Document the desktop-only boundary, supported OS/architectures, root/three sudo flows, system Keyring treatment, official checksum verification, fixed `/opt/frp` root and `frp-gui-frps.service`, explicit deployment confirmation, and P1-C4 as the future FRPC-node reuse phase. Do not document a command users should copy/paste. Do not include real hostnames, IPs, fingerprints or secrets.

- [x] **Step 2: Run the complete automated suite**

Run: `pnpm test`  
Expected: all existing P0/P1 tests plus P1-C3 tests pass.

Run: `pnpm build`  
Expected: TypeScript check and Vite production build pass. Report the existing bundle-size warning separately; do not change chunking in this task.

Run: `cargo test` and `cargo check` from `src-tauri`  
Expected: pass. If the local Windows toolchain requires a temporary `PATH` or test-only `TAURI_CONFIG` icon override, report it as a test environment limitation; never commit it as production configuration.

- [ ] **Step 3: Manual test only after explicit user authorization of a disposable Ubuntu/Debian server**

Before connecting, ask the user for authorization and a disposable server. Verify root, passwordless sudo, and sudo-password flows separately; record no real secrets/IPs/fingerprints in the report. Check that `/opt/frp/current/frps -c /opt/frp/frps.toml` validates, `systemctl is-enabled frp-gui-frps.service` and `is-active` succeed, start/stop/restart updates UI, and an intentionally incorrect checksum / sudo password does not yield a running state. Confirm no existing `frps.service` was modified.（必须等待用户后续明确授权方可执行）

---

## Plan self-review

- **Scope coverage:** Task 1 handles the new sudo-password path and secret ownership; Task 2 handles official verified assets and all remote writes; Task 3 handles UI/IPC and state persistence; Task 4 covers documentation, regression and authorized live validation. FRPC selection is explicitly left for P1-C4.
- **Security consistency:** The only privileged remote commands are fixed constants; all versions, ports, roots, assets and service names are validated or fixed. Secrets use Keyring or one operation’s memory, and results/logs are redacted.
- **Compatibility:** Keeps P1-C2 `russh` 0.45.0, reuses its host-key protocol and Keyring prefix, preserves existing local FRPC behavior, and does not require Git commits in this non-Git workspace.
