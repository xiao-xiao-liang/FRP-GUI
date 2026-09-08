# 我的连接工具栏与桌面壳层收口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` for every code task. Do not create commits unless the user explicitly asks.

**Goal:** 仅改造“我的连接”的表格与桌面壳层，令批量操作替代该页筛选工具区，恢复协议高亮并移除全局顶栏。

**Architecture:** 新建特性内 `ProfileConnectionsTable`，避免修改通用 `FeishuDataTable` 与 `FeishuToolbar`。`ProfileList` 保留状态、规则详情和确认弹层，按已保存的 `defaultSort` 排序后向本地表格传入 Profile 与批量操作节点；`AppLayout` 仅删除右侧全局 header。

**Tech Stack:** React、TypeScript、Vitest、项目现有 Feishu UI 组件、Tailwind、Tauri/Rust 回归测试。

---

## 文件结构

- Create: `src/features/profiles/ProfileConnectionsTable.tsx` — 我的连接专用表格、局部批量操作区与协议高亮。
- Create: `src/features/profiles/ProfileConnectionsTable.test.tsx` — 专用工具区、固定列和协议颜色映射测试。
- Modify: `src/features/profiles/ProfileList.tsx` — 删除页面筛选/组织工具栏，改用专用表格。
- Modify: `src/features/profiles/ProfileList.test.tsx` — 删除筛选控件断言，验证新表格透传与批量确认。
- Modify: `src/features/profiles/ProfileRuleDetailsDialog.tsx` — 协议类型列使用同一彩色 Pill 映射。
- Modify: `src/features/profiles/ProfileRuleDetailsDialog.test.tsx` — 验证协议标识语义与颜色映射。
- Modify: `src/App.tsx` — 删除右侧全局顶栏。
- Modify: `src/App.test.tsx` — 验证全局顶栏不渲染且路由内容仍可访问。
- Modify: `README.md` — 同步简化后的连接列表与桌面布局说明。

## 任务 1：先锁定专用工具区和协议高亮

1. 在 `ProfileConnectionsTable.test.tsx` 写失败测试：无论选择数量，`data-testid="profile-batch-action-slot"` 都位于表格容器内且高度固定；零选择时它不含文字、图标或可聚焦操作元素，并呈纯白背景；选中项时同一节点仅含批量删除、批量启动、批量停止。
2. 写失败测试：TCP、UDP、HTTP、HTTPS 协议分别带有可稳定断言的 `data-proxy-type` 和蓝、青、绿、紫样式标识；未知协议为灰色。端口映射仍显示 `本地端口 → 远程端口`。
3. 运行 `pnpm test -- src/features/profiles/ProfileConnectionsTable.test.tsx`，确认失败。
4. 新建 `ProfileConnectionsTable.tsx`。只导入项目已有组件；定义 `proxyTypeVariant(type)`，返回 `blue`、`cyan`、`green`、`purple` 或 `gray`；以 `FeishuPill showDot={false}` 渲染协议。
5. 在组件的表格边框内始终渲染右对齐操作区，使用固定 `min-height`，但仅在有选中项时渲染三个按钮；无论选择数量，该区均为纯白。不要通过条件渲染整个操作区造成表头位移；不渲染筛选、分组、标签、搜索、排序或管理分组入口。专用表复用 `FeishuHeaderCell` 的白色表头与列宽拖拽手柄，并在组件内维护列宽；用 `min-width` 保持横向滚动，操作列的 `th`/`td` 必须有 `sticky right-0` 与白色背景。
6. 再次运行该测试，确认通过。

## 任务 2：将 ProfileList 改为只使用专用表格

1. 在 `ProfileList.test.tsx` 写失败测试：页面中没有“连接类型”“全部类型”“分组”“标签”“排序”“管理分组”及“搜索连接名称、服务器地址或描述...”控件；没有通用工具栏的“筛选”“分组”“排序”。
2. 写失败测试：已有 Profile 的行仍显示名称、描述、规则、上次启动和固定操作，不显示运行状态列；规则单元格点击仍打开 `ProfileRuleDetailsDialog`；批量停止和删除仍显示既有确认弹层。表格根字号为 13px，正文按信息层级进一步缩小。
3. 运行 `pnpm test -- src/features/profiles/ProfileList.test.tsx`，确认失败。
4. 从 `ProfileList.tsx` 移除类型/分组/标签/关键词/排序相关的 UI 状态与选项、`filterProfiles`、外层筛选 JSX、分组管理 JSX 和其 Props；保留 `sortProfiles(profiles, defaultSort)`，让列表继续采用已保存的默认排序。同步从 `App.tsx` 的 `ProfileList` 调用中移除这些已删除 Props，但不删除分组、标签或置顶数据的加载与持久化逻辑。
5. 将当前列渲染、选择逻辑、严格批量资格和确认弹层以明确 Props 交给 `ProfileConnectionsTable`。不得把 Profile 的完整配置对象作为 DOM 属性或测试 ID。
6. 写失败测试：停止状态的单项“启动连接”按钮不含蓝色背景类，使用绿色 `RunIcon`，仍保留 `aria-label="启动连接"` 与 Tooltip；运行中、过渡态、删除和更多操作不变。
7. 将该启动按钮替换为白底/无填充、带边框的图标按钮，图标使用现有 `RunIcon` 的绿色语义色；不得新建 SVG 或使用文字替代图标。
8. 再次运行该测试，确认通过。

## 任务 3：规则明细协议高亮

1. 在 `ProfileRuleDetailsDialog.test.tsx` 写失败测试：规则表中的 TCP/UDP/HTTP/HTTPS 单元格带对应 `data-proxy-type` 标识；机密 `authToken` 仍不可见。
2. 运行 `pnpm test -- src/features/profiles/ProfileRuleDetailsDialog.test.tsx`，确认失败。
3. 抽取或复用任务 1 的纯粹协议映射函数；不得通过循环依赖从 `ProfileConnectionsTable` 导入 React 组件。优先在 `src/features/profiles/proxy-type-presentation.ts` 建立只导出映射与 `ProxyTypePill` 的特性内模块，并由两处引用。
4. 再次运行规则详情测试，确认通过。

## 任务 4：移除桌面壳层顶栏

1. 在 `App.test.tsx` 写失败测试：进入 `/profiles` 后不存在全局顶栏说明“统一管理与快速访问所有内网穿透连接”，左侧“我的连接”导航和页面内容仍存在。
2. 运行 `pnpm test -- src/App.test.tsx`，确认失败。
3. 从 `App.tsx` 仅删除右侧 `main` 内的 `<header>` 区块，保留 `main`、内容滚动容器、左侧导航、Toast 与 Dialog 容器。不要通过 CSS 隐藏顶栏。
4. 再次运行 App 测试，确认通过。

## 任务 5：文档与全量验证

1. 更新 `README.md`：说明我的连接不提供列表筛选/分组/排序入口，批量操作出现于表格内右上角；说明协议高亮和无全局顶栏桌面布局。
2. 运行 `pnpm test`，预期全部测试通过。
3. 运行 `pnpm build`，预期 TypeScript 与 Vite 构建通过。
4. 运行 `cargo test --manifest-path src-tauri/Cargo.toml`，预期 Rust 测试通过。
5. 运行 `git diff --check`、`git status --short` 和 `git diff --stat`；确认没有改动 `src/components/ui/feishu-table/FeishuDataTable.tsx` 或 `FeishuToolbar.tsx`，且既有未提交改动未被覆盖。
6. 未经用户明确要求，不执行 commit、push、merge、rebase、reset 或清理工作区。
