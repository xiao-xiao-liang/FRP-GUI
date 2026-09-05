# FRP-GUI P1-C1「服务器节点与安全凭据基础」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立远程 Ubuntu/Debian FRPS 的服务器节点管理与操作系统安全凭据基础，让用户在应用内保存可复用的非敏感节点配置和可选 SSH 凭据，为后续 SSH 预检与一键部署提供安全边界。

**Architecture:** 前端 `FrpServerNode` 只持久化公开连接信息和安全凭据引用；密码、私钥、私钥口令绝不进入 `localStorage`、节点 JSON、日志或 Toast。Tauri 后端新增仅供 Rust 后续 SSH 执行器读取的系统凭据仓库命令；浏览器模拟模式明确拒绝“记住凭据”，但仍允许保存不含秘密的节点草稿。未勾选“记住凭据”时，表单中的认证材料只用于本次编辑校验，保存节点后立即清空；P1-C1 生成的节点保持 `draft`，待 P1-C2 执行预检时由用户重新提供凭据。

**Tech Stack:** React 19、TypeScript、Vitest、React Testing Library、Tauri v2、Rust、`keyring` v4.1.5（`v1` feature）。

**Non-goals:** 本阶段不建立 SSH 会话、不执行远程命令、不上传文件、不下载 FRPS、不生成 `systemd` 服务、不修改 FRPC 场景向导的节点选择器。

---

## 文件与职责

| 文件 | 变更 | 职责 |
| --- | --- | --- |
| `src/types/frp.ts` | 修改 | 定义非敏感 `FrpServerNode`、认证方式和节点状态。 |
| `src-tauri/Cargo.toml` | 修改 | 增加操作系统安全凭据库依赖。 |
| `src-tauri/src/credential_store.rs` | 新增 | 只在后端读写/删除 SSH 凭据，不向前端返回秘密。 |
| `src-tauri/src/lib.rs` | 修改 | 注册凭据仓库模块和 Tauri 命令。 |
| `src/services/server-nodes.ts` | 新增 | 节点验证、序列化、凭据引用构造与不含秘密的草稿类型。 |
| `src/services/server-nodes.test.ts` | 新增 | 节点验证、秘密剥离和引用稳定性测试。 |
| `src/services/ipc.ts` | 修改 | 安全凭据写入/删除 IPC 包装；Web 模式不持久化秘密。 |
| `src/features/servers/ServerNodeManagerPage.tsx` | 新增 | 节点列表、空状态、新增/编辑/删除入口。 |
| `src/features/servers/ServerNodeEditorModal.tsx` | 新增 | 密码/私钥表单、可选记住凭据与安全提示。 |
| `src/features/servers/ServerNodeManagerPage.test.tsx` | 新增 | UI 新增、编辑、删除、记住凭据调用与秘密不回显测试。 |
| `src/App.tsx` | 修改 | 管理节点状态、`/servers` 路由、侧边栏入口和 localStorage 非敏感持久化。 |
| `src/App.test.tsx` | 修改 | 服务器节点路由、新增保存和 localStorage 不含秘密的集成测试。 |
| `README.md` | 修改 | 同步节点管理与凭据安全边界说明。 |

## 数据契约

```ts
export type ServerNodeAuthMethod = 'password' | 'private_key';
export type ServerNodeStatus = 'draft' | 'checking' | 'ready_to_deploy' | 'deploying' | 'running' | 'stopped' | 'error';

export interface FrpServerNode {
  id: string;
  name: string;
  host: string;
  sshPort: number;
  username: string;
  authMethod: ServerNodeAuthMethod;
  credentialRef?: string;
  credentialsRemembered: boolean;
  frpsBindPort: number;
  frpsDashboardPort?: number;
  installDir: string;
  frpsVersion?: string;
  status: ServerNodeStatus;
  isDefault: boolean;
  lastCheckedAt?: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ServerCredentialDraft {
  password?: string;
  privateKey?: string;
  privateKeyPassphrase?: string;
}

export interface ServerNodeFormValues extends Omit<FrpServerNode, 'id' | 'credentialRef' | 'credentialsRemembered' | 'status' | 'isDefault' | 'lastCheckedAt' | 'lastError' | 'createdAt' | 'updatedAt'> {
  rememberCredentials: boolean;
  credentials: ServerCredentialDraft;
}
```

节点 `credentialRef` 固定为 `frp-gui/server-node/{nodeId}`；后端在其下分别保存 `password`、`private-key` 和 `private-key-passphrase`。节点 JSON 只能保存该引用与 `credentialsRemembered` 布尔值。

---

### Task 1: 节点模型与无秘密校验服务

**Files:**
- Modify: `src/types/frp.ts`
- Create: `src/services/server-nodes.ts`
- Create: `src/services/server-nodes.test.ts`

- [ ] **Step 1: 写入失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { buildServerNode, createCredentialRef, validateServerNodeForm } from './server-nodes';
import type { ServerNodeFormValues } from '../types/frp';

const values: ServerNodeFormValues = {
  name: '东京 Ubuntu 节点', host: '203.0.113.10', sshPort: 22, username: 'ubuntu',
  authMethod: 'password', frpsBindPort: 7000, frpsDashboardPort: 7500,
  installDir: '/opt/frp', frpsVersion: undefined, rememberCredentials: true,
  credentials: { password: 'never-persist-this' },
};

describe('server-nodes', () => {
  it('拒绝缺失主机、用户名和非法 SSH/FRPS 端口', () => {
    const result = validateServerNodeForm({ ...values, host: '', username: '', sshPort: 0, frpsBindPort: 70000 });
    expect(result.valid).toBe(false);
    expect(result.errors).toMatchObject({ host: '请输入服务器地址', username: '请输入 SSH 用户名', sshPort: 'SSH 端口需在 1 - 65535 之间', frpsBindPort: 'FRPS 端口需在 1 - 65535 之间' });
  });

  it('私钥认证要求私钥内容，密码认证要求密码', () => {
    expect(validateServerNodeForm({ ...values, credentials: {} }).errors.credentials).toBe('请输入 SSH 密码');
    expect(validateServerNodeForm({ ...values, authMethod: 'private_key', credentials: {} }).errors.credentials).toBe('请选择或粘贴 SSH 私钥');
  });

  it('构造节点时剥离所有秘密，只保留稳定的凭据引用', () => {
    const node = buildServerNode(values, 'node_tokyo');
    expect(node.credentialRef).toBe('frp-gui/server-node/node_tokyo');
    expect(node.credentialsRemembered).toBe(true);
    expect(JSON.stringify(node)).not.toContain('never-persist-this');
    expect(createCredentialRef('node_tokyo')).toBe('frp-gui/server-node/node_tokyo');
  });
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
pnpm test src/services/server-nodes.test.ts
```

Expected: FAIL，因为类型和模块不存在。

- [ ] **Step 3: 实现类型和服务**

在 `src/types/frp.ts` 追加数据契约中的全部类型。创建 `src/services/server-nodes.ts`：

```ts
import type { FrpServerNode, ServerNodeFormValues } from '../types/frp';

export const createCredentialRef = (nodeId: string) => `frp-gui/server-node/${nodeId}`;
const validPort = (value: number) => Number.isInteger(value) && value >= 1 && value <= 65535;

export function validateServerNodeForm(values: ServerNodeFormValues) {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = '请输入节点名称';
  if (!values.host.trim()) errors.host = '请输入服务器地址';
  if (!values.username.trim()) errors.username = '请输入 SSH 用户名';
  if (!validPort(values.sshPort)) errors.sshPort = 'SSH 端口需在 1 - 65535 之间';
  if (!validPort(values.frpsBindPort)) errors.frpsBindPort = 'FRPS 端口需在 1 - 65535 之间';
  if (values.authMethod === 'password' && !values.credentials.password?.trim()) errors.credentials = '请输入 SSH 密码';
  if (values.authMethod === 'private_key' && !values.credentials.privateKey?.trim()) errors.credentials = '请选择或粘贴 SSH 私钥';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function buildServerNode(values: ServerNodeFormValues, id: string, existing?: FrpServerNode): FrpServerNode {
  const now = Date.now();
  return {
    id, name: values.name.trim(), host: values.host.trim(), sshPort: values.sshPort,
    username: values.username.trim(), authMethod: values.authMethod,
    credentialRef: values.rememberCredentials ? createCredentialRef(id) : undefined,
    credentialsRemembered: values.rememberCredentials,
    frpsBindPort: values.frpsBindPort, frpsDashboardPort: values.frpsDashboardPort,
    installDir: values.installDir.trim() || '/opt/frp', frpsVersion: values.frpsVersion,
    status: existing?.status ?? 'draft', isDefault: existing?.isDefault ?? false,
    lastCheckedAt: existing?.lastCheckedAt, lastError: existing?.lastError,
    createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
}
```

- [ ] **Step 4: 运行服务测试**

```powershell
pnpm test src/services/server-nodes.test.ts
```

Expected: 3 tests PASS。

---

### Task 2: Tauri 系统凭据库命令

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/credential_store.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 添加依赖和后端单元测试**

在 `src-tauri/Cargo.toml` 的 `[dependencies]` 添加：

```toml
keyring = { version = "4.1.5", features = ["v1"] }
```

在 `credential_store.rs` 内编写只测试引用键生成与请求验证的单元测试；测试不得连接真实系统凭据库：

```rust
#[cfg(test)]
mod tests {
    use super::{credential_username, CredentialKind};

    #[test]
    fn credential_username_is_scoped_by_node_and_kind() {
        assert_eq!(credential_username("frp-gui/server-node/node-1", CredentialKind::Password), "frp-gui/server-node/node-1/password");
        assert_eq!(credential_username("frp-gui/server-node/node-1", CredentialKind::PrivateKey), "frp-gui/server-node/node-1/private-key");
    }
}
```

- [ ] **Step 2: 运行并确认失败**

```powershell
cd src-tauri
cargo test credential_username_is_scoped_by_node_and_kind
```

Expected: FAIL，因为模块尚未实现。

- [ ] **Step 3: 实现安全凭据模块**

创建 `src-tauri/src/credential_store.rs`：

```rust
use serde::Deserialize;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialKind { Password, PrivateKey, PrivateKeyPassphrase }

pub fn credential_username(reference: &str, kind: CredentialKind) -> String {
    let suffix = match kind {
        CredentialKind::Password => "password",
        CredentialKind::PrivateKey => "private-key",
        CredentialKind::PrivateKeyPassphrase => "private-key-passphrase",
    };
    format!("{reference}/{suffix}")
}

fn entry(reference: &str, kind: CredentialKind) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.frpgui.pro.server-node", &credential_username(reference, kind))
        .map_err(|error| format!("无法访问系统安全凭据库: {error}"))
}

#[tauri::command]
pub fn store_server_credential(reference: String, kind: CredentialKind, secret: String) -> Result<(), String> {
    if !reference.starts_with("frp-gui/server-node/") || secret.trim().is_empty() {
        return Err("凭据引用或内容无效".to_string());
    }
    entry(&reference, kind)?.set_password(&secret).map_err(|error| format!("保存系统安全凭据失败: {error}"))
}

#[tauri::command]
pub fn delete_server_credentials(reference: String) -> Result<(), String> {
    if !reference.starts_with("frp-gui/server-node/") { return Err("凭据引用无效".to_string()); }
    for kind in [CredentialKind::Password, CredentialKind::PrivateKey, CredentialKind::PrivateKeyPassphrase] {
        match entry(&reference, kind)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(format!("删除系统安全凭据失败: {error}")),
        }
    }
    Ok(())
}
```

在 `src-tauri/src/lib.rs` 顶部增加 `mod credential_store;`，并将 `credential_store::store_server_credential`、`credential_store::delete_server_credentials` 加入已有 `tauri::generate_handler![]`。

- [ ] **Step 4: 运行 Rust 测试和检查**

```powershell
cd src-tauri
cargo test credential_username_is_scoped_by_node_and_kind
cargo check
```

Expected: PASS。不得新增读取凭据并返回前端的 Tauri 命令。

---

### Task 3: 前端安全凭据适配与服务器节点工作台

**Files:**
- Modify: `src/services/ipc.ts`
- Create: `src/features/servers/ServerNodeEditorModal.tsx`
- Create: `src/features/servers/ServerNodeManagerPage.tsx`
- Create: `src/features/servers/ServerNodeManagerPage.test.tsx`

- [ ] **Step 1: 编写工作台失败测试**

```tsx
it('保存记住密码的节点时只向安全凭据 IPC 传递秘密，回调节点不含秘密', async () => {
  const user = userEvent.setup();
  const onSave = vi.fn();
  render(<ServerNodeManagerPage nodes={[]} onSaveNode={onSave} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);
  await user.click(screen.getByRole('button', { name: '添加服务器节点' }));
  await user.type(screen.getByLabelText('节点名称'), '东京节点');
  await user.type(screen.getByLabelText('服务器地址'), '203.0.113.10');
  await user.type(screen.getByLabelText('SSH 用户名'), 'ubuntu');
  await user.type(screen.getByLabelText('SSH 密码'), 'secret-password');
  await user.click(screen.getByRole('checkbox', { name: '记住凭据到系统安全凭据库' }));
  await user.click(screen.getByRole('button', { name: '保存节点' }));
  await waitFor(() => expect(storeServerCredential).toHaveBeenCalled());
  expect(onSave.mock.calls[0][0]).not.toHaveProperty('password');
  expect(JSON.stringify(onSave.mock.calls[0][0])).not.toContain('secret-password');
});

it('浏览器模拟模式禁用记住凭据，不会降级到 localStorage 保存秘密', () => {
  vi.mocked(isTauriEnv).mockReturnValue(false);
  render(<ServerNodeEditorModal visible onClose={vi.fn()} onSave={vi.fn()} />);
  expect(screen.getByRole('checkbox', { name: '记住凭据到系统安全凭据库' })).toBeDisabled();
  expect(screen.getByText('仅桌面版可记住凭据')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
pnpm test src/features/servers/ServerNodeManagerPage.test.tsx
```

Expected: FAIL，因为组件和 IPC 包装不存在。

- [ ] **Step 3: 实现 IPC 包装和 UI**

在 `src/services/ipc.ts` 追加：

```ts
export async function storeServerCredential(reference: string, kind: 'password' | 'private_key' | 'private_key_passphrase', secret: string) {
  if (!isTauriEnv()) throw new Error('仅桌面版可记住凭据到系统安全凭据库');
  await tauriInvoke<void>('store_server_credential', { reference, kind, secret });
}
export async function deleteServerCredentials(reference: string) {
  if (!isTauriEnv()) return;
  await tauriInvoke<void>('delete_server_credentials', { reference });
}
```

实现 `ServerNodeEditorModal` 时遵守以下规则：

```tsx
<input aria-label="SSH 密码" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
<textarea aria-label="SSH 私钥" spellCheck={false} value={privateKey} onChange={(event) => setPrivateKey(event.target.value)} />
<input aria-label="私钥口令" type="password" value={privateKeyPassphrase} onChange={(event) => setPrivateKeyPassphrase(event.target.value)} />
<input aria-label="记住凭据到系统安全凭据库" type="checkbox" disabled={!isTauriEnv()} checked={rememberCredentials} onChange={(event) => setRememberCredentials(event.target.checked)} />
```

私钥采用可多行粘贴的 `textarea`，不以单行密码框伪装或截断 PEM 内容；私钥口令仍使用密码框。保存顺序固定为：本地表单校验 -> 构造无秘密节点 -> 若勾选记住则调用 `storeServerCredential` 保存必需秘密 -> 成功后调用 `onSave(node)` -> 清空组件内秘密状态 -> 关闭弹窗。未勾选记住时不调用凭据 IPC，`onSave(node)` 仅保存无秘密节点，且在 P1-C1 中不能用该节点发起 SSH。任何凭据库失败必须阻止 `onSave`，且错误文案不得拼接秘密。

`ServerNodeManagerPage` 包含空状态、`添加服务器节点` 主按钮、节点卡片、`设为默认`、编辑和删除；删除弹窗提供 `同时删除系统安全凭据` 复选项，勾选后先调用 `deleteServerCredentials`，成功后才调用 `onDeleteNode`。

- [ ] **Step 4: 运行 UI 测试**

```powershell
pnpm test src/features/servers/ServerNodeManagerPage.test.tsx
```

Expected: PASS，至少覆盖新增密码节点、私钥多行表单切换、浏览器模式禁用记住、未记住凭据时只保存草稿、删除凭据和秘密不回显。

---

### Task 4: App 状态、路由和非敏感持久化

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: 添加 App 集成测试**

```tsx
it('服务器节点只持久化非敏感信息，并能从侧边栏进入节点工作台', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/profiles']}><AppLayout /></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: '服务器节点' }));
  expect(screen.getByRole('heading', { name: '服务器节点' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '添加服务器节点' }));
  await user.type(screen.getByLabelText('节点名称'), '东京节点');
  await user.type(screen.getByLabelText('服务器地址'), '203.0.113.10');
  await user.type(screen.getByLabelText('SSH 用户名'), 'ubuntu');
  await user.type(screen.getByLabelText('SSH 密码'), 'not-in-local-storage');
  await user.click(screen.getByRole('button', { name: '保存节点' }));
  const stored = localStorage.getItem('frp_gui_server_nodes') || '';
  expect(stored).toContain('东京节点');
  expect(stored).not.toContain('not-in-local-storage');
});
```

- [ ] **Step 2: 运行并确认失败**

```powershell
pnpm test src/App.test.tsx
```

Expected: FAIL，因为 `/servers`、节点状态和节点管理页未接入。

- [ ] **Step 3: 接入 App**

在 `AppLayout` 新增：

```ts
const [serverNodes, setServerNodes] = useState<FrpServerNode[]>(() => {
  const cached = localStorage.getItem('frp_gui_server_nodes');
  return cached ? JSON.parse(cached) : [];
});
useEffect(() => localStorage.setItem('frp_gui_server_nodes', JSON.stringify(serverNodes)), [serverNodes]);
```

新增侧边栏按钮 `服务器节点`、`currentNav` 分支和路由：

```tsx
<Route path="/servers" element={<ServerNodeManagerPage
  nodes={serverNodes}
  onSaveNode={(node) => setServerNodes((items) => [node, ...items.filter((item) => item.id !== node.id)])}
  onDeleteNode={(id) => setServerNodes((items) => items.filter((item) => item.id !== id))}
  onSetDefault={(id) => setServerNodes((items) => items.map((item) => ({ ...item, isDefault: item.id === id, updatedAt: Date.now() })))}
/>} />
```

当 localStorage JSON 损坏时，沿用现有 profiles/cores 的 `try/catch` 模式并返回空数组。不得把 `ServerCredentialDraft` 放入 React 全局状态、localStorage 或 Toast。

- [ ] **Step 4: 运行集成测试与类型构建**

```powershell
pnpm test src/App.test.tsx
pnpm build
```

Expected: PASS。

---

### Task 5: 回归、文档与人工走查

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README**

在“我的连接”之前增加“服务器节点 (`/servers`)”说明：密码、私钥和私钥口令仅在桌面端用户明确勾选时保存到系统安全凭据库；`frp_gui_server_nodes` 只保存节点元数据；本阶段尚未执行远程部署，SSH 预检和 FRPS 一键部署将在 P1-C2 交付。

- [ ] **Step 2: 执行全量验证**

```powershell
pnpm test
pnpm build
cd src-tauri
cargo test
cargo check
```

Expected: 所有前端、Rust 测试和生产构建通过。

- [ ] **Step 3: 人工走查**

1. 在桌面版新增密码节点，勾选“记住凭据”，确认节点卡片不显示密码。
2. 新增私钥节点，确认密码输入不再显示、私钥可完整粘贴多行 PEM 内容、私钥口令使用掩码显示。
3. 刷新应用后，节点仍在；检查 localStorage 不包含输入的秘密。
4. 在浏览器模拟模式，确认“记住凭据”禁用并明确提示原因。
5. 删除节点并选择删除凭据，确认节点移除且后续 P1-C2 无法读取凭据。

## 计划自检

- P1-C 规格中的节点、密码/私钥、系统凭据、root/sudo 前置边界和 FRPC 节点复用前置模型均有对应任务。
- 本计划故意不执行 SSH、sudo 或远程命令；这些高影响操作在 P1-C2 单独设计和审批。
- 所有节点持久化和测试断言均不包含密码、私钥、私钥口令或 Token。
