# FRP 核心管理页面呈现重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` for every code task. Do not create commits unless the user explicitly asks.

**Goal:** 重构 FRP 核心管理页面，支持卡片与表格双视图切换，优化表格列宽至 100% 自适应，合并冗余版本号列，并增加下载量字段与复制下载链接能力。

**Architecture:** 
- 复用 `src/components/ui/card.tsx` 创建 `src/features/cores/CoreCard.tsx`；
- 在 `src/services/ipc.ts` 扩展 `fetchGitHubReleases` 支持汇总 Release 的 `downloadCount`；
- 在 `src/features/cores/CoreManagerPage.tsx` 实现视图切换（Card / Table），自适应表格列宽，消除重复列；
- 全流程严格执行 TDD（先写测试，验证失败，再实现代码，验证通过）。

**Tech Stack:** React 19、TypeScript、Vitest、Tailwind CSS、Radix UI、项目既有 Feishu UI 组件。

---

## 文件结构规划

- [NEW] `docs/superpowers/specs/2026-09-07-core-manager-presentation-design.md` — SDD 设计文档（已创建）
- [NEW] `docs/superpowers/plans/2026-09-07-core-manager-presentation.md` — 实施计划（本文件）
- [NEW] `src/features/cores/CoreCard.tsx` — 飞书风格核心卡片组件
- [NEW] `src/features/cores/CoreCard.test.tsx` — 核心卡片组件单测（TDD）
- [MODIFY] `src/services/ipc.ts` — `fetchGitHubReleases` 补充 Release 下载量汇总
- [MODIFY] `src/services/ipc.test.ts` — 测试 GitHub Release 数据解析包含 `downloadCount`
- [MODIFY] `src/features/cores/CoreManagerPage.tsx` — 整合双视图切换、自适应表格列宽、合并冗余列、渲染下载量
- [MODIFY] `src/features/cores/CoreManagerPage.test.tsx` — 视图切换、自适应列与交互测试
- [MODIFY] `README.md` — 同步核心管理双视图与字段说明

---

## 阶段任务划分

### 任务 1：数据链路与下载量（Download Count）扩展 (TDD)
1. 在 `src/services/ipc.test.ts` 中编写测试：断言 `fetchGitHubReleases()` 返回的 Release 对象包含汇总的 `downloadCount`（累计 assets 的 `download_count`）。
2. 更新 `src/services/ipc.ts` 中的 `fetchGitHubReleases` 实现与备用静态数据。
3. 运行测试，验证通过。

### 任务 2：创建飞书风格核心卡片组件 CoreCard (TDD)
1. 在 `src/features/cores/CoreCard.test.tsx` 编写测试：
   - 渲染加粗版本号、状态徽章（使用中/已就绪/云端可下载）；
   - 展示体积、架构、下载量、发布日期；
   - 验证已安装状态下的“设为默认”、“更改”、“删除”回调；
   - 验证云端状态下的“下载核心”、“复制下载链接”操作与 Toast 提示。
2. 创建 `src/features/cores/CoreCard.tsx`，基于 `src/components/ui/card.tsx` 实现上述结构与飞书样式。
3. 运行测试，验证通过。

### 任务 3：CoreManagerPage 自适应表格与双视图整合 (TDD)
1. 在 `src/features/cores/CoreManagerPage.test.tsx` 编写测试：
   - 验证右上角视图切换按钮（卡片视图 / 表格视图），且切换偏好持久化至 `localStorage`；
   - 验证表格视图中合并了冗余的“版本号”列，并且展示“下载量”列；
   - 验证在卡片视图下渲染 `CoreCard` 网格；
   - 验证各视图下的操作（设为默认、编辑、删除、下载、复制链接）正常触发。
2. 修改 `src/features/cores/CoreManagerPage.tsx`：
   - 重构 `columns` 定义：消除固定大宽度，主列弹性自适应，移除冗余列，补充下载量列；
   - 加入 `viewMode`（`'card' | 'table'`）状态与切换工具；
   - 当 `viewMode === 'card'` 时渲染响应式网格与 `<CoreCard>`；
   - 当 `viewMode === 'table'` 时渲染自适应表格；
   - 增加“复制下载链接”工具函数与 Toast 提示。
3. 运行测试，验证通过。

### 任务 4：全量回归、构建与文档收口
1. 运行 `npm test`（确保全部 28 个测试套件通过）；
2. 运行 `npm run build`（确保 `tsc -b && vite build` 无类型与构建错误）；
3. 同步更新 `README.md` 相关描述；
4. 执行 `git diff --check` 与 `git status --short`，提交完工总结。
