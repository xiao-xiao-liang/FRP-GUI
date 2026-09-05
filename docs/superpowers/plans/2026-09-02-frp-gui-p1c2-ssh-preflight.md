# FRP-GUI P1-C2「远程 SSH 预检与主机信任」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 当前工作区不是 Git 仓库，未经用户授权不得执行 commit。

**Goal:** 让桌面版用户以密码或私钥安全地检查 Ubuntu/Debian 服务器，显式确认 SSH 主机指纹，并将节点可靠地转换为“可部署”状态；本阶段不在远程主机写文件、下载 FRP 或创建 systemd 服务。

**Architecture:** 前端只提交结构化节点元数据以及仅本次使用的认证材料；Rust 后端从系统凭据库读取已记住的秘密，或在内存中使用临时秘密，绝不把秘密、远程命令或原始 SSH 输出回传给前端。后端使用 `russh` 建立 SSH 连接，并将远程主机的 SHA-256 指纹与节点已确认指纹逐字比较：首次连接和指纹变化均在认证及任何远程命令之前停止，必须由用户在界面中确认后才会继续预检。

**Tech Stack:** React 19、TypeScript、Vitest、React Testing Library、Tauri v2、Rust、Tokio、`russh` 0.45.0、`russh-keys` 0.45.0、`keyring` v4。

**Non-goals:** 不下载或安装 FRPS、不生成或写入 `frps.toml`、不执行 `sudo`、不创建/启停 systemd 服务、不打开端口、不读取远程日志、不支持 CentOS/RHEL，也不允许前端传入任意 Shell/Bash/PowerShell 文本。以上内容属于 P1-C3。

---

## 已确认的领域边界

| 对象 | 所有者 | 本阶段允许的变化 | 禁止行为 |
| --- | --- | --- | --- |
| `FrpServerNode` | 前端 localStorage（仅非敏感元数据） | 保存已确认的 SSH 指纹、预检摘要、状态和脱敏错误 | 保存密码、私钥、私钥口令、sudo 密码或 FRP Token |
| 系统安全凭据 | Tauri Rust 后端 / OS Keyring | 仅由 Rust 内部读取已记住 SSH 凭据 | 暴露读取用 Tauri 命令或回传秘密 |
| 临时认证材料 | 本次 IPC 调用的 Rust 内存 | 用于一次 SSH 认证后立即释放 | 写 localStorage、日志、Toast 或预检结果 |
| SSH 主机指纹 | 节点元数据 | 首次明确确认后保存，后续逐字匹配 | 自动信任、指纹变化后继续连接 |
| 预检命令 | Rust 常量 | 只读识别发行版、架构、权限和 systemd | 从前端接收命令、写文件或提权 |

### 状态迁移

```text
draft | error | ready_to_deploy
  -> checking
  -> (主机指纹未确认/变化) draft 或 error，返回 needs_host_trust
  -> (认证失败、网络失败、发行版不支持、无可用 sudo/root、无 systemd) error
  -> (Ubuntu/Debian + root 或免密 sudo + systemd) ready_to_deploy
```

`checking` 仅为 UI 进行中状态，不可持久化为成功状态。远程命令的超时、认证失败和不支持的平台一律不得将节点标为 `running`。

## 文件与职责

| 文件 | 变更 | 职责 |
| --- | --- | --- |
| `src/types/frp.ts` | 修改 | 定义主机信任、预检请求与结果的前端领域契约。 |
| `src/services/server-nodes.ts` | 修改 | 把无副作用的预检结果合并为新的节点元数据。 |
| `src/services/server-nodes.test.ts` | 修改 | 验证状态迁移、指纹保存和秘密剥离。 |
| `src/services/ipc.ts` | 修改 | 桌面端 `runServerPreflight` 包装；浏览器明确拒绝，不做假成功模拟。 |
| `src-tauri/Cargo.toml` | 修改 | 固定 SSH 客户端依赖。 |
| `src-tauri/src/credential_store.rs` | 修改 | 仅供 Rust 内部读取凭据的私有函数；仍不注册读取命令。 |
| `src-tauri/src/server_preflight.rs` | 新增 | SSH 主机密钥校验、认证、只读命令白名单、输出解析与脱敏错误映射。 |
| `src-tauri/src/lib.rs` | 修改 | 注册预检模块及唯一的结构化 Tauri 预检命令，移除既有未消费的 `stderr` 管道变量。 |
| `src/features/servers/ServerNodePreflightModal.tsx` | 新增 | 凭据临时输入、指纹确认、步骤结果、重试和回到编辑入口。 |
| `src/features/servers/ServerNodeManagerPage.tsx` | 修改 | 为节点添加“检查连接”入口并接收预检结果。 |
| `src/features/servers/ServerNodeManagerPage.test.tsx` | 修改 | 覆盖普通检查、主机指纹确认、浏览器阻断及秘密不回显。 |
| `src/App.tsx` | 修改 | 保存预检后的节点元数据与状态，显示脱敏 Toast。 |
| `src/App.test.tsx` | 修改 | 覆盖从节点页面检查后变为“可部署”的集成闭环。 |
| `README.md` | 修改 | 说明桌面版预检、首次指纹确认与本阶段无远程写操作。 |

---

### Task 1: 前端预检契约与节点状态归并

**Files:**
- Modify: `src/types/frp.ts`
- Modify: `src/services/server-nodes.ts`
- Modify: `src/services/server-nodes.test.ts`

- [x] **Step 1: 写入失败测试**
- [x] **Step 2: 运行并确认失败**
- [x] **Step 3: 实现前端数据契约和归并函数**
- [x] **Step 4: 运行通过测试**

---

### Task 2: 后端凭据读取边界与 SSH 主机指纹校验

- [x] **Step 1: 写入 Rust 单元测试**
- [x] **Step 2: 运行并确认失败**
- [x] **Step 3: 增加依赖与内部凭据读取函数**
- [x] **Step 4: 增加限定的 SSH 执行器**
- [x] **Step 5: 运行 Rust 测试和检查**

---

### Task 3: Tauri 命令与前端 IPC 的无模拟预检闭环

- [x] **Step 1: 写入失败测试**
- [x] **Step 2: 运行并确认失败**
- [x] **Step 3: 实现受控命令与 IPC 包装**
- [x] **Step 4: 运行 IPC 测试**

---

### Task 4: 预检界面、指纹确认与节点页面集成

- [x] **Step 1: 写入失败交互测试**
- [x] **Step 2: 运行并确认失败**
- [x] **Step 3: 实现预检模态框**
- [x] **Step 4: 运行组件和集成测试**

---

### Task 5: 文档同步、全量验证与人工桌面走查

- [x] **Step 1: 更新 README**
- [x] **Step 2: 执行全量自动化验证**
- [x] **Step 3: 人工桌面走查**

仅在专用测试 Ubuntu/Debian 虚拟机或用户明确授权的测试服务器上执行；不得在日志、截图或报告中记录真实 IP、用户名、密码、私钥、Token 或完整指纹。逐项确认：

1. 未确认指纹时，只出现确认提示，远程服务器的审计日志中没有认证后命令执行。
2. 确认正确指纹后，Ubuntu/Debian + root 或免密 sudo 显示“可部署”。
3. 将节点已保存指纹替换为不同测试值后，预检被阻断并显示指纹变化提示。
4. 无凭据、错误凭据、非 Ubuntu/Debian、非受支持架构、无 systemd、需要交互 sudo 的节点均显示可操作的安全摘要且状态为“异常待处理”。
5. 对测试服务器执行前后比较：本阶段未创建 `/opt/frp`、`frps.toml`、`frps.service`，未下载二进制，未启用服务。

---

## 计划自检

- **规格覆盖：** 已覆盖密码与私钥两种认证、系统凭据内部读取、首次主机指纹确认/变化阻断、Ubuntu/Debian 与架构/权限/systemd 预检、桌面与浏览器边界、状态回写、测试和文档；远程写操作明确移交 P1-C3。
- **安全边界：** 无前端命令字段、无读取凭据 IPC、无静默信任主机、无浏览器假成功、无 sudo/远程写入。
- **一致性：** `ServerPreflightRequest`/`ServerPreflightResult` 为 TypeScript 与 Rust 同名的 camelCase 契约；前端状态只由 `applyServerPreflightResult` 归并。
- **环境边界：** 当前工作区不是 Git 仓库，不执行 commit；当前正式 Tauri 图标缺失只影响打包，不应通过修改构建配置掩盖。
