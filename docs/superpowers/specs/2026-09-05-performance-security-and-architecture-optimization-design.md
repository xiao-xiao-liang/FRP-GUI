# FRP-GUI 性能、安全与架构深度优化设计

## 目标

针对 FRP-GUI 当前在高频实时日志流下的 CPU 峰值与前端 DOM 渲染瓶颈、客户端核心下载的供应链安全防线、组件树重渲染级联以及原生对话框调用的胶水开销进行系统性升级，全面提升系统的吞吐性能、运行时安全防护与工程可维护性。

---

## 现状分析与确认根因

1. **Rust 运行期日志脱敏与解析的高频重复编译**：
   - `sanitize_runtime_text` 和 `normalize_runtime_log_line` 在处理每一行 stdout/stderr 时均调用 4~5 次 `Regex::new(...)`。在大流量穿透或频繁重连产生密集日志时，频繁构建 DFA/NFA 引发剧烈 CPU 消耗与堆分配。
2. **前端日志看板 DOM 节点爆炸与主线程丢帧**：
   - `LogDashboard` 将最多 2000 条日志直接通过全量 `.map()` 渲染为 1.2~1.5 万个真实 DOM 节点。日志高频到达且触发平滑滚动时，浏览器排版与重绘导致界面出现显著卡顿（Jank）。
   - `mergeRuntimeLogs` 每次事件到达均对 2000 个对象进行全量 `localeCompare` 排序，计算开销大。
3. **全局组件树级联重渲染（Render Storm）**：
   - `AppLayout`（1063 行）集中管理全局状态（`profiles`, `cores`, `runtimeLogs` 等）。任何一条日志推送或状态微调均导致整个应用顶层容器、侧边栏、所有路由和未激活弹窗全量协调。
4. **客户端核心下载缺乏哈希校验与供应链防护**：
   - 服务端部署（FRPS）具备严格的 GitHub Release 校验和下载与 SHA-256 强制匹配机制；但客户端核心下载接口 `download_and_extract_core` 直接信任传入的 `download_url` 并解压赋予执行权限，存在中间人攻击与恶意文件执行的供应链漏洞风险。
5. **外部进程弹窗的冷启动延迟与平台依赖**：
   - `pick_core_file` 和 `pick_directory` 依赖在 Rust 中拉起 `powershell.exe` / `osascript` / `zenity`。Windows 下每次唤起 PowerShell 带来 300~600ms 进程启动开销，且易触发反病毒误报。
6. **未配置 Rust 产物极致压缩 profile**：
   - 当前 `Cargo.toml` 缺少 `lto`, `opt-level = "z"`, `strip = true` 配置，安装包与二进制体积未达最轻量状态。

---

## 设计

### 1. Rust 高性能日志脱敏与进程状态机重构

#### 1.1 全局静态预编译正则 (`std::sync::LazyLock`)
在 [`src-tauri/src/frpc_runtime.rs`](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src-tauri/src/frpc_runtime.rs) 中，将所有运行期脱敏与格式解析正则表达式提升为 `LazyLock<Regex>` 全局静态单例：
- `RE_PEM`：PEM 密钥块脱敏正则；
- `RE_AUTH`：Authorization 标头脱敏正则；
- `RE_QUOTED_SECRET` / `RE_UNQUOTED_SECRET`：Token、Password 键值脱敏正则；
- `RE_FRP_LOG_PREFIX`：FRP 标准日志前缀解析正则。

日志处理过程完全消除正则构造时间开销，实现零重复编译与近似线性的处理性能。

#### 1.2 状态聚合单锁化（消除 Mutex Sprawl）
重构 `ProfileProcessHandle`：
- 将分散的 `status: Mutex<String>`, `pid: Mutex<Option<u32>>`, `timestamp: Mutex<u64>`, `error_message: Mutex<Option<String>>`, `cmd_sender: Mutex<Option<...>>` 合并为内部结构体 `ProfileStateInner`；
- 由单个 `Mutex<ProfileStateInner>` 统一托管，状态读取与更新保证原子一致性，消除锁争用与潜在死锁隐患；
- `runtime_logs` 环形缓冲保留独立锁保护，读写互不干扰。

---

### 2. 客户端核心下载供应链与完整性安全加固

#### 2.1 强制 SHA-256 校验和流式限制
加固 [`src-tauri/src/lib.rs`](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src-tauri/src/lib.rs) 的 `download_and_extract_core` 流程：
- **来源可信白名单**：仅允许下载来自官方 GitHub Release（`https://github.com/fatedier/frp/releases/...`）的资产文件；
- **校验和自动获取**：后端根据目标版本，自动拉取对应 release 的 `frp_sha256_checksums.txt` 并提取目标包的官方哈希值；
- **流式大小截断**：采用流式分块读取，强制施加 100 MiB 安全上限；
- **哈希校验**：计算实际下载字节的 SHA-256，校验失败立即终止并清理临时文件，绝不解压或修改权限。

---

### 3. 前端状态解耦与虚拟滚动性能跃迁

#### 3.1 领域状态切分与渲染隔离
重构全局状态体系，将 `AppLayout` 臃肿的内部状态下沉为独立领域 Store 或 Context：
- `useProfileStore`：仅管理连接方案（增删改查、启停操作派发）；
- `useRuntimeLogStore`：独立维护日志缓冲区，日志流入直接驱动日志视图，阻断向 `AppLayout` 冒泡；
- `useCoreStore`：管理核心版本与本地路径；
- `useServerNodeStore`：管理远程节点与预检状态。

`App.tsx` 仅保留路由架构、导航指示器与弹窗调度，代码缩减至 150 行内。

#### 3.2 实时日志看板虚拟滚动 (Virtual Scroll)
在 [`src/features/logs/LogDashboard.tsx`](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src/features/logs/LogDashboard.tsx) 引入虚拟列表机制：
- 无论日志历史包含 500 条还是 2000 条，真实 DOM 节点恒定保持在视口可见的 30~45 个；
- 移除大数组高频 `localeCompare`，改为基于数字序号和时序的追加合并；
- 对关键字搜索输入框增加 `useDeferredValue` 或 150ms 防抖，保障长列表打字响应度；
- 保持原有的自动滚屏、换行切换、日志暂停与脱敏复制能力。

---

### 4. 平台对话框原生化与构建剪裁

#### 4.1 接入 Tauri 官方 Dialog 插件
- 引入 `@tauri-apps/plugin-dialog`；
- 移除 `pick_core_file` 和 `pick_directory` 中通过 PowerShell / osascript / zenity 拼接脚本起子进程的代码；
- 彻底消除 Windows 端打开文件选择框的 300~600ms 进程冷启动延迟与杀软误报隐患。

#### 4.2 Rust 发布 Profile 体积优化
在 [`src-tauri/Cargo.toml`](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src-tauri/Cargo.toml) 中配置 release profile：
```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = true
```
使安装包与可执行文件体积进一步缩减 30%~40%。

---

## 验收标准

1. **基准测试与功能回归**：
   - 现有的 18 个前端测试文件（165 个测试）和 50 个 Rust 单元测试全部保持 100% 通过。
2. **正则预编译验证**：
   - 后端日志脱敏函数在高频调用下不再重复构造 `Regex`，单元测试验证 ANSI 去除与机密脱敏结果一致。
3. **安全校验防篡改验证**：
   - 客户端核心下载接口在 Hash 不匹配或非官方域名时直接阻断并返回安全错误，不解压任何内容。
4. **日志看板长列表性能**：
   - 在 2000 条日志高频刷屏场景下，前端 DOM 节点数量维持在 100 以内，页面无卡顿感。
5. **原生 Dialog 替换**：
   - 选择核心和解压目录调用原生 Tauri 插件，无后台额外子进程派生。

---

## 非目标

- 不对既有的飞书 UI 视觉规范和设计系统进行重做。
- 不修改现有的 TOML 双向同步协议规范与 FRP 配置数据模型。
- 不破坏现有的本地 Keyring 凭据存储格式与引用命名规范。
