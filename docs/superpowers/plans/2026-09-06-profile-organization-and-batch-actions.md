# Profile 组织与批量编排实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` for every code task. Do not create commits unless the user explicitly asks.

**Goal:** 为 FRP-GUI 的 Profile 提供扁平分组、标签、置顶、组合筛选、排序和安全的批量操作能力。

**Architecture:** 将非敏感组织元数据保留在前端本地存储，并由纯函数服务统一校验、筛选和排序。`App` 保持生命周期和凭据清理的唯一入口；`ProfileList` 管理非持久化选择状态；分组管理使用独立对话框。既有 TOML 与系统凭据库边界不变。

**Tech Stack:** React、TypeScript、Vitest、Tauri/Rust（仅回归验证）、现有 Feishu UI 组件。

---

## 任务 1：建立组织数据类型与纯函数服务

**Files:**

- Modify: `src/types/frp.ts`
- Create: `src/services/profile-organization.ts`
- Create: `src/services/profile-organization.test.ts`
- Modify: `src/test/fixtures.ts`

1. 先在 `profile-organization.test.ts` 写失败测试，覆盖：旧 Profile 缺失字段的默认值、分组名与标签规范化、分组名不区分大小写唯一、标签数量上限、删除分组后清空关联 `groupId`、多条件 AND 筛选，以及排序相同时间戳时按 `id` 兜底。
2. 运行 `pnpm test -- src/services/profile-organization.test.ts`，确认测试因实现缺失而失败。
3. 在 `frp.ts` 增加 `ProfileGroup`、`ProfileSort` 和 Profile 组织字段。
4. 实现纯函数服务。存储键固定为 `frp_gui_profile_groups`；读取损坏数据时返回空数组；写入前只保留组织元数据。筛选、排序和选择目标计算不得依赖 React 状态。
5. 更新测试夹具，以便显式构造未分组、置顶和带标签的 Profile。
6. 再次运行同一测试，确认通过。

## 任务 2：扩展设置并兼容旧数据

**Files:**

- Modify: `src/services/app-settings.ts`
- Modify: `src/services/app-settings.test.ts`
- Modify: `src/features/settings/SettingsPage.tsx`
- Modify: `src/features/settings/SettingsPage.test.tsx`

1. 先增加失败测试：旧设置读取后得到 `profileSort: 'pinned_updated'`；`profileSort` 非法时只回退该字段且保留其他有效设置。
2. 运行相关设置测试，确认失败。
3. 以字段级迁移方式实现 `profileSort`，默认值为 `pinned_updated`。
4. 在设置页加入“Profile 默认排序”单选项，并将变化通过已有设置回调保存。
5. 增加设置页交互测试，确认默认显示、切换和保存回调。
6. 运行相关测试，确认通过。

## 任务 3：实现分组管理对话框

**Files:**

- Create: `src/features/profiles/ProfileGroupManagerDialog.tsx`
- Create: `src/features/profiles/ProfileGroupManagerDialog.test.tsx`
- Modify: `src/features/profiles/ProfileList.tsx`

1. 先写失败测试，覆盖创建、重命名、删除确认、空名称、超长名称和重名反馈。
2. 运行对话框测试，确认失败。
3. 使用项目已有 Dialog、Input、Button 与确认组件实现分组管理。对话框只发出意图回调；校验逻辑复用任务 1 的纯函数。
4. 从列表工具区提供“管理分组”入口，并保证关闭对话框不会改变筛选或选择状态。
5. 运行对话框与 ProfileList 相关测试，确认通过。

## 任务 4：在 App 中接入分组与安全持久化

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

1. 先写失败测试，覆盖分组读取与保存、删除分组只解除关联、Profile 本地保存不含 `rawToml`/Token、克隆复制分组和标签但不置顶。
2. 运行 `pnpm test -- src/App.test.tsx`，确认失败。
3. 在 `App` 初始化分组状态，并通过组织服务读写；Profile 保存继续调用既有 `sanitizeProfileForStorage`，不得引入新的凭据存储。
4. 实现创建、重命名、删除分组处理器。删除分组时原子更新内存 Profile 与持久化 Profile。
5. 调整克隆逻辑，明确复制 `groupId`、`tags`，并设定 `isPinned: false`。
6. 运行 `App` 相关测试，确认通过。

## 任务 5：实现组合筛选、排序与跨页选择

**Files:**

- Modify: `src/features/profiles/ProfileList.tsx`
- Modify: `src/features/profiles/ProfileList.test.tsx`
- Modify: `src/features/profiles/ProfileCard.tsx`
- Modify: `src/features/profiles/ProfileCard.test.tsx`

1. 先写失败测试，覆盖分组/标签/状态/类型/关键词的 AND 筛选、排序选择、筛选变更重置分页、跨页全选、筛选后自动清理不可见选择，以及批量工具条选择计数。
2. 运行 ProfileList 与 ProfileCard 测试，确认失败。
3. 让 `ProfileList` 只使用任务 1 的一个筛选排序结果，避免卡片视图与表格视图各自实现不同过滤逻辑。
4. 选择集以 `Set<string>` 保存，不持久化；“选择全部”覆盖当前筛选结果而非当前页。若现有表格组件无法满足跨页选择，则增加明确的首列复选框，不能依赖组件的页内选择状态。
5. 在卡片与表格中展示置顶、分组名和至多两个标签；添加单项置顶切换回调。
6. 运行相关测试，确认通过。

## 任务 6：实现批量业务操作并同步文档

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/features/profiles/ProfileList.tsx`
- Modify: `README.md`

1. 先写失败测试：批量启动仅请求 `stopped`/`error` 且串行；批量停止仅请求 `running` 且确认；批量移动只更新 `groupId`；任一运行中项目会禁用批量删除；批量删除复用现有凭据清理。
2. 运行 App 和 ProfileList 测试，确认失败。
3. 在 `App` 实现批量回调，逐项复用 `handleToggleProfile`、`handleDeleteProfile` 或其可复用的底层安全逻辑。运行期间禁用重复批量动作，并向用户展示完成与跳过数量。
4. 删除前检查所有被选 Profile 的状态；停止和删除必须使用现有确认交互。
5. 在 README 的 Profile 管理与设置说明中写明组织能力、默认排序和凭据安全边界。
6. 运行相关测试，确认通过。

## 任务 7：全量验证与交付检查

1. 运行 `pnpm test`。
2. 运行 `pnpm build`。
3. 运行 `cargo test --manifest-path src-tauri/Cargo.toml`。
4. 运行 `git diff --check`。
5. 运行 `git status --short` 与 `git diff --stat`，确认仅包含本功能的预期改动，且不覆盖既有未提交工作。
6. 按验收文档执行手工场景，至少覆盖卡片、表格、分页、浏览器预览限制和真实 Tauri 环境各一次。
7. 未经用户明确要求，不执行 `git commit`、`push`、`merge` 或发布。
