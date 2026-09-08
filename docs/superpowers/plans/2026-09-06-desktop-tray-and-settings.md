# 桌面托盘与设置页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付用户可配置的桌面托盘后台常驻行为。

**Architecture:** React 持有并持久化设置，受限 IPC 将关闭策略同步给 Rust；Rust 统一处理托盘菜单、窗口关闭和受控退出，并复用运行时管理器停止 FRPC。

**Tech Stack:** React、TypeScript、Vitest、Tauri v2、Rust。

---

### Task 1: 设置模型与 IPC

**Files:** `src/services/app-settings.ts`、`src/services/app-settings.test.ts`、`src/services/ipc.ts`、`src/services/ipc.test.ts`。

- [x] 先为默认设置、合法值归一化和 localStorage 持久化写失败测试。
- [x] 实现 `AppSettings`、加载和保存函数；添加桌面端同步设置与受控退出 IPC。
- [x] 运行 `pnpm vitest run src/services/app-settings.test.ts src/services/ipc.test.ts`。

### Task 2: 设置页面与应用接线

**Files:** `src/features/settings/SettingsPage.tsx`、`src/features/settings/SettingsPage.test.tsx`、`src/App.tsx`、`src/App.test.tsx`。

- [x] 先写失败测试：设置页显示默认项，修改后保存并同步原生端。
- [x] 实现页面、侧边栏和 `/settings` 路由；在运行连接时退出前显示确认。
- [x] 运行 `pnpm vitest run src/features/settings/SettingsPage.test.tsx src/App.test.tsx`。

### Task 3: 原生托盘和窗口生命周期

**Files:** `src-tauri/src/app_lifecycle.rs`、`src-tauri/src/lib.rs`。

- [x] 先写关闭行为、菜单标识和设置解析的 Rust 单元测试。
- [x] 实现托盘菜单、双击恢复窗口、关闭时隐藏或退出、停止所有进程后退出的命令。
- [x] 运行 `cargo test --manifest-path src-tauri/Cargo.toml app_lifecycle`。

### Task 4: 收尾

- [x] 运行 `pnpm test`、`cargo test --manifest-path src-tauri/Cargo.toml`、`pnpm build` 与 `git diff --check`。
- [x] 更新 README 的导航和桌面端说明，并勾选本计划。
