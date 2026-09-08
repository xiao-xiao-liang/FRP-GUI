# FRP 核心管理页面呈现重构设计文档

## 目标

重构 FRP 核心管理页面（`CoreManagerPage`）的呈现形式，参考 `frpc-desktop` 的优秀交互与字段体系：
1. 增加**卡片视图**（Card View）与**表格视图**（Table View）双模式自由切换；
2. 彻底改造表格列宽分配，消除固定像素导致的横向溢出滚动，实现 **100% 容器自适应**；
3. 合并消除“核心引擎版本”与“版本号”严重重复的冗余列；
4. 补充**下载量（Download Count）**字段；
5. 复用项目既有飞书风格 Card 组件与 UI 规范，保证设计语言高度统一。

---

## 范围与边界

- **页面范围**：仅重构 `src/features/cores/` 模块展示层，不破坏现有的核心检查（`inspectLocalFrpcCore`）、导入（`pickCoreFileNative`）、下载解压（`downloadAndExtractCore`）与持久化协议；
- **组件复用**：
  - 卡片视图复用 `src/components/ui/card.tsx`（`Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter`）以及 `FeishuPill`, `FeishuTag`；
  - 表格视图自适应重构，列宽按百分比/弹性伸缩（`flex-1` / `min-width`），右侧操作列保持固定吸附或清晰对齐；
  - 工具栏复用项目已有 SVG 图标及切换状态持久化；
- **数据兼容**：`fetchGitHubReleases` 补充返回 Release 的总下载量（GitHub 官方 Release 资产中的 `download_count` 累加），备用 mock 数据同步补齐；本地核心下载量展示为 `—`。

---

## 视图与字段体系设计

### 1. 字段体系梳理与精简

| 字段名称 | 含义与取值 | 卡片呈现 | 表格呈现 |
| :--- | :--- | :--- | :--- |
| **版本与名称** | 核心版本号（加粗，如 `v0.71.0`）及路径/来源说明（如 `GitHub 官方云端` 或本地路径） | 顶部标题 + 副标题 + 徽章 | 主列（弹性撑满，消除重复“版本号”列） |
| **状态徽章** | `使用中`（绿）、`已就绪`（蓝）、`云端可下载`（灰） | 紧随版本号右侧 | 状态列独立展示 FeishuPill |
| **文件体积** | 文件体积格式化（如 `12.5 MB` 或 `本地就绪`） | 紧凑 FeishuTag 胶囊 | 紧凑列展示等宽数值 |
| **下载量 (新增)** | GitHub 官方 Release 所有资产的下载总量累计（如 `52.3k`），本地核心为 `—` | 小字标签 `下载量: 52.3k` | 紧凑列展示等宽数值 |
| **发布时间** | 格式化日期 `YYYY-MM-DD`（本地引入则展示引入日期或 `本地引入`） | 小字标签 `发布时间: 2026-08-14` | 紧凑列展示 `YYYY-MM-DD` |
| **平台架构** | 适配 CPU 与操作系统（如 `跨平台全架构` 或 `Windows x86_64`） | 图标 + 平台文字 | 弹性列完整展示，彻底不截断 |
| **操作** | 下载核心、设为默认、编辑更改、删除、复制下载链接 | 底部操作栏（按钮/链接） | 右侧操作列（按钮/链接） |

---

## 2. 双视图交互模式

1. **视图切换工具**：
   - 工具栏右侧提供【卡片视图】与【表格视图】两个紧凑按钮切换（带选中态高亮与 Tooltip）；
   - 切换状态持久化于 `localStorage['frp_gui_core_view_mode']`，默认记住用户偏好（初始默认为卡片或表格）。
2. **卡片视图 (Card View)**：
   - 响应式网格：`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`；
   - 采用 `Card` 组件（飞书圆角、白色背景、轻阴影、悬浮微浮起效果）；
   - 卡片内部结构：
     - **CardHeader**：左侧展示版本号（加粗）与“当前默认 / 最新版”徽章，右侧展示引擎状态 Pill；下方为小字路径或来源；
     - **CardContent**：展示体积标签、架构图标与名称、下载人次（带有下载图标）、发布时间；
     - **CardFooter**：底部水平分隔线，右对齐操作按钮（已就绪项展示“设为默认 / 更改 / 删除”，云端项展示“下载核心 / 复制链接”）。
3. **表格视图 (Table View)**：
   - 移除原 `columns` 中写死的 1220px 大宽度，设置合理比例；
   - 合并消除重复的“版本号”列；
   - 增加“下载量”列；
   - 表格自适应充满 100% 容器宽度，消除在宽屏或标准屏幕下的恶性横向滚动条；“平台架构”列分配足够空间完整展示。

---

## 3. 数据层扩展（IPC & 类型）

- `fetchGitHubReleases`：
  - 从 GitHub API 返回对象中的 `assets[].download_count` 进行累加：`const downloadCount = (r.assets || []).reduce((acc, a) => acc + (a.download_count || 0), 0)`；
  - 返回类型补充 `downloadCount?: number`；
- `UnifiedCoreRow`：
  - 增加 `downloadCount?: number`；
  - 增加 `downloadCountDisplay: string`（如 `>= 10000` 格式化为 `x.xk`，缺省为 `—`）。

---

## 测试与质量保障 (TDD)

1. **单元测试与组件测试**：
   - 针对 `CoreCard`：编写各状态卡片渲染、默认徽章、下载量、操作回调与复制链接测试；
   - 针对 `CoreManagerPage`：
     - 验证双视图切换状态（Card 与 Table）及持久化；
     - 验证表格视图不再渲染重复的“版本号”列；
     - 验证自适应列宽分配与包含“下载量”列；
     - 验证点击设为默认、更改、删除、下载核心、复制链接均正常派发。
2. **全量回归测试**：
   - 确保 `npm test`（包括 `CoreManagerPage.test.tsx`, `App.test.tsx` 等）全部 272+ 测试通过。
