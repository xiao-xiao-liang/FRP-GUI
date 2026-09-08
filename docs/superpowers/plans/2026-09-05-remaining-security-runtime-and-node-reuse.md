# 剩余安全、运行时与节点复用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成核心下载身份收敛、可换行日志虚拟化、Profile 凭据隔离和已部署 FRPS 节点复用。

**Architecture:** Rust 持有下载与凭据读取的信任边界；React 只处理受控元数据和用户交互。每个工作包以一个失败回归测试开始，完成后运行对应模块及全量测试。

**Tech Stack:** React 19、TypeScript、Vitest、Tauri v2、Rust、Keyring。

---

### Task 1: 下载身份收敛

**Files:** `src/services/ipc.ts`、`src/features/cores/CoreManagerPage.tsx`、`src-tauri/src/lib.rs` 及对应测试。

- [x] 先测试前端不再发送 URL，而发送 `releaseTag`、`assetName`、`mirror`；运行失败测试。
- [x] Rust 测试仅可由合法 tag 与无路径分隔符的资产名构造官方 URL；实现后端构造、流式哈希和大小限制；运行测试。

### Task 2: 可换行日志虚拟化

**Files:** `src/features/logs/LogDashboard.tsx`、`src/features/logs/LogDashboard.test.tsx`。

- [x] 先测试换行日志行高变化后仍保留正确总滚动高度和可见索引；运行失败测试。
- [x] 以 `ResizeObserver` 测量行高、前缀偏移与二分可视范围替换固定行高；运行组件测试。

### Task 3: Profile 凭据隔离与本地二维码

**Files:** `src-tauri/src/credential_store.rs`、`src/services/ipc.ts`、`src/App.tsx`、`src/features/sync/SyncModal.tsx` 及测试。

- [x] 先测试 Profile 元数据序列化不含 Token/TOML 秘密、二维码不含远程 URL；运行失败测试。
- [x] 增加 Profile Keyring 引用、旧存储迁移和本地二维码生成；运行安全与导入导出测试。

### Task 4: P1-C4 已部署节点复用

**Files:** `src/features/editor/ScenarioWizard.tsx`、`src/services/ipc.ts`、`src-tauri/src/credential_store.rs` 及测试。

- [x] 先测试仅已部署运行节点可选，选择后回填主机端口且不显示 Token；运行失败测试。
- [x] 增加只读节点查询和受控 Token 注入到启动配置；运行向导与运行时回归。

### Task 5: 收尾

- [x] 运行 `pnpm test`、`cargo test --manifest-path src-tauri/Cargo.toml`、`pnpm build`、`git diff --check`，并更新本计划。
