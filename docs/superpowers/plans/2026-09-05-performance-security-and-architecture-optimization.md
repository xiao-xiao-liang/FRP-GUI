# FRP-GUI 性能、安全与架构深度优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 系统性解决 FRP-GUI 在日志高频吞吐下的 CPU 峰值与 DOM 渲染卡顿，加固客户端核心官方供应链 SHA-256 校验防篡改，并重构状态机锁竞争以提升可靠性与可维护性。

**Architecture:**
- Rust 端采用 `std::sync::LazyLock` 预编译所有运行期日志与时间解析正则，进程运行态由分散 Mutex 聚合成 `ProfileStateInner` 单锁保护；客户端核心下载流程增加 GitHub Release 官方校验和文件拉取与 SHA-256 强制核验。
- 前端端使用轻量定高虚拟列表重构 `LogDashboard`，将 2000 条日志真实 DOM 节点压制在 40 个内，并消除全量 `localeCompare` 排序开销。

**Tech Stack:** Rust 2021 / Tokio / Tauri v2, React 19, TypeScript, Vitest, Cargo Test

## Global Constraints

- 严禁破坏现有的 18 个前端测试套件（165 个测试）和 50 个 Rust 后端单元测试；
- 严禁修改现有的 TOML 双向同步协议规范与 FRP 配置数据模型；
- 所有新增代码与注释使用简体中文；
- 遵循严谨的 TDD 流程：先写测试（RED）-> 验证失败 -> 最小实现（GREEN）-> 回归验证。

---

### Task 1: Rust 端日志脱敏与解析正则全局预编译 (`LazyLock`)

**Files:**
- Modify: `src-tauri/src/frpc_runtime.rs`
- Test: `src-tauri/src/frpc_runtime.rs` (内联 tests 模块)

**Interfaces:**
- Consumes: `std::sync::LazyLock`, `regex::Regex`
- Produces: 零动态编译开销的 `sanitize_runtime_text` 和 `normalize_runtime_log_line`

- [x] **Step 1: 编写/扩充针对高频并发日志脱敏的一致性测试**
  在 `frpc_runtime.rs` 的 `tests` 模块新增单元测试 `test_lazylock_regex_performance_and_correctness`，验证连续密集调用下 PEM、Auth、Token 及标准日志前缀正则的正确脱敏。

- [x] **Step 2: 运行测试并验证基准**
  执行 `cargo test --manifest-path src-tauri/Cargo.toml test_lazylock_regex`。

- [x] **Step 3: 将局部 `Regex::new` 重构为 `LazyLock` 全局单例**
  声明静态正则：
  - `RE_PEM`
  - `RE_AUTH`
  - `RE_QUOTED_SECRET`
  - `RE_UNQUOTED_SECRET`
  - `RE_STANDARD_FRP_LOG`
  替换 `sanitize_runtime_text` 与 `normalize_runtime_log_line` 中的局部构造调用。

- [x] **Step 4: 验证所有 Rust 单元测试全部通过**
  执行 `cargo test --manifest-path src-tauri/Cargo.toml`。

---

### Task 2: Rust 端进程运行状态聚合单锁化 (`ProfileStateInner`)

**Files:**
- Modify: `src-tauri/src/frpc_runtime.rs`

**Interfaces:**
- Consumes: `tokio::sync::Mutex`
- Produces: `ProfileProcessHandle` 内部聚合状态原子读写接口

- [x] **Step 1: 编写并发状态原子一致性测试**
  在 `frpc_runtime.rs` 中新增测试 `test_profile_handle_atomic_state_consistency`，验证并发修改 status 与 pid 时 `to_state_event` 绝不读取到撕裂的瞬态。

- [x] **Step 2: 运行测试验证**
  执行 `cargo test --manifest-path src-tauri/Cargo.toml test_profile_handle_atomic`。

- [x] **Step 3: 实施状态聚合与锁收敛**
  定义 `ProfileStateInner`：
  ```rust
  struct ProfileStateInner {
      status: String,
      pid: Option<u32>,
      timestamp: u64,
      error_message: Option<String>,
      cmd_sender: Option<mpsc::Sender<ProcessControlCommand>>,
  }
  ```
  将 `ProfileProcessHandle` 中的多独立 Mutex 替换为 `inner: Mutex<ProfileStateInner>`，并适配所有读写处（`update_state`, `to_state_event`, `spawn_and_confirm_child`, `stop_profile`）。

- [x] **Step 4: 运行全部 Rust 单元测试确保无死锁与行为一致**
  执行 `cargo test --manifest-path src-tauri/Cargo.toml`。

---

### Task 3: 客户端核心下载强制 SHA-256 官方校验和加固

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/frps_deployment.rs` (复用/公开 checksum 解析算法)
- Test: `src-tauri/src/lib.rs` / `src-tauri/src/frps_deployment.rs`

**Interfaces:**
- Consumes: `checksum_for_asset`
- Produces: 带 SHA-256 强制校验的 `download_and_extract_core`

- [x] **Step 1: 编写客户端核心下载 SHA-256 校验和测试**
  编写测试验证：
  - 非官方 GitHub 资产 URL 拒绝下载；
  - 校验和不匹配时拒绝解压并返回安全错误；
  - 校验通过时正常完成。

- [x] **Step 2: 运行测试确认 RED**
  执行 `cargo test --manifest-path src-tauri/Cargo.toml`。

- [x] **Step 3: 实现官方校验和匹配与安全解压逻辑**
  在 `download_and_extract_core` 中：
  - 校验下载 URL 严格属于 `https://github.com/fatedier/frp/releases/download/...`；
  - 自动根据版本拉取 `frp_sha256_checksums.txt` 并匹配目标资产哈希；
  - 计算下载归档的 SHA-256，核对无误后再解压。

- [x] **Step 4: 运行测试确认 GREEN**
  执行 `cargo test --manifest-path src-tauri/Cargo.toml`。

---

### Task 4: 前端实时日志看板轻量虚拟滚动与高频合并优化

**Files:**
- Modify: `src/features/logs/LogDashboard.tsx`
- Modify: `src/App.tsx` (`mergeRuntimeLogs`)
- Test: `src/features/logs/LogDashboard.test.tsx`

**Interfaces:**
- Consumes: `LogEntry[]`
- Produces: 恒定 DOM 数量的高性能渲染列表，毫秒级追加合并

- [x] **Step 1: 编写大容量日志长列表渲染与追加测试**
  在 `LogDashboard.test.tsx` 中编写测试：在传入 2000 条日志时，渲染的日志行元素数量维持在受控视口范围（< 60 个），且依然能通过关键字正确定位日志。

- [x] **Step 2: 运行测试确认现状**
  执行 `pnpm test LogDashboard.test.tsx`。

- [x] **Step 3: 引入轻量视口虚拟计算与增量合并优化**
  - 在 `LogDashboard.tsx` 中实现基于容器 `scrollTop` 与行高的虚拟视口计算；
  - 优化 `App.tsx` 中的 `mergeRuntimeLogs`：移除 `localeCompare`，改为基于数值时序与 sequence 快速比较追加。

- [x] **Step 4: 运行前端所有单元测试确保无回归**
  执行 `pnpm test`。

---

### Task 5: 优化 Cargo Release Profile 与全套自动化回归

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [x] **Step 1: 配置 Cargo Release Profile**
  在 `Cargo.toml` 中添加 `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true`。

- [x] **Step 2: 执行全量自动化测试验证**
  - 前端：`pnpm test` (全 165+ 测试通过)
  - 后端：`cargo test --manifest-path src-tauri/Cargo.toml` (全 50+ 测试通过)
