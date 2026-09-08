# 我的连接表格化呈现实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` for every code task. Do not create commits unless the user explicitly asks.

**Goal:** 用单一、紧凑、可横向滚动的飞书表格替代 Profile 卡片视图，并实现规则详情弹层与严格批量操作。

**Architecture:** `ProfileList` 持有展示筛选、选择和规则详情弹层状态；纯函数和 `App` 同时实施严格批量状态规则。`FeishuDataTable` 已支持右固定列，Profile 只需在操作列声明 `fixed: 'right'`。

**Tech Stack:** React、TypeScript、Vitest、现有 Feishu UI、Radix Tooltip、Tauri/Rust 回归测试。

---

## 文件结构

- Modify: `src/features/profiles/ProfileList.tsx` — 单一表格、列、选择工具条和固定操作列。
- Modify: `src/features/profiles/ProfileList.test.tsx` — 表格、批量资格、规则预览与固定操作列回归。
- Create: `src/features/profiles/ProfileRuleDetailsDialog.tsx` — 规则详情弹层。
- Create: `src/features/profiles/ProfileRuleDetailsDialog.test.tsx` — 规则详情映射测试。
- Modify: `src/services/profile-organization.ts` — 严格批量资格计算。
- Modify: `src/services/profile-organization.test.ts` — 全停止/全运行资格测试。
- Modify: `src/App.tsx` — 应用层严格验证并复用既有生命周期操作。
- Modify: `src/App.test.tsx` — 绕过 UI 的批量状态防御测试。
- Modify: `README.md` — 更新连接列表与批量操作说明。

## 任务 1：规则详情弹层

1. 写失败测试：传入三条 `ProxyRule` 时，弹层显示“名称、协议类型、本地 IP、本地端口、远程端口”五列；缺失 `remotePort` 显示 `—`；弹层关闭后不渲染。
2. 运行 `pnpm test -- src/features/profiles/ProfileRuleDetailsDialog.test.tsx`，确认失败。
3. 新建 `ProfileRuleDetailsDialog.tsx`。Props 固定为 `visible`、`profile`、`onClose`；从 `profile.config.proxies` 生成只读行数据，使用 `FeishuDialog` 包裹 `FeishuDataTable`，并设置 `selectable={false}`、无分页。
4. 禁止在行数据中传递 `authToken`、`rawToml`、密码、密钥或整个 config 对象。
5. 再次运行该测试，确认通过。

## 任务 2：严格批量资格纯函数

1. 写失败测试：全 `stopped` 选择可启动和删除；全 `running` 选择可停止；混合 `stopped`/`running`、含 `error`、`starting` 或 `stopping` 的选择，对三个操作均返回不可执行和中文原因。
2. 运行 `pnpm test -- src/services/profile-organization.test.ts`，确认失败。
3. 修改 `getBatchActionTargets`：`start` 仅在所有项为 `stopped` 时返回完整选择集；`stop` 仅在所有项为 `running` 时返回完整选择集；`delete` 仅在所有项为 `stopped` 时返回完整选择集。空集不得可执行。
4. 再次运行相关测试，确认通过。

## 任务 3：将 ProfileList 收口为表格

1. 写失败测试：不再出现“卡片视图”“表格视图”、四个状态 Tab、页面级“全部启动”“全部停止”；默认渲染 `FeishuDataTable`。
2. 写失败测试：列顺序为选择、连接名称、连接描述、运行状态、穿透规则、上次启动、操作；表中不出现服务端、流量/连接、分组或标签列。
3. 运行 `pnpm test -- src/features/profiles/ProfileList.test.tsx`，确认失败。
4. 删除 `viewMode`、`activeTab`、卡片分页分支与 `ProfileCard` 引用；保留类型、分组、标签、关键词、排序和分页。筛选传给 `filterProfiles` 时状态固定为 `all`。
5. 名称列只显示置顶标识与名称。描述列为空显示 `—`，有值时单行截断，并用 `FeishuTooltip` 包住可聚焦文本显示完整描述。
6. “上次启动”将 `stats.startTime` 格式化为本地日期时间；没有时间显示 `—`。
7. 再次运行 ProfileList 测试，确认通过。

## 任务 4：规则预览与固定 SVG 操作列

1. 写失败测试：一至三条规则显示 `type localPort → remotePort` 的纵向预览；四条规则只显示前两条与“查看更多（+2 条）”；点击任意规则预览区域打开对应详情弹层。
2. 写失败测试：操作列声明 `fixed: 'right'`；运行中显示只有 `StopIcon` 的停止按钮，停止状态显示只有 `RunIcon` 的启动按钮；图标按钮有可访问名称和 `FeishuTooltip`。
3. 运行 `pnpm test -- src/features/profiles/ProfileList.test.tsx`，确认失败。
4. 在规则列以一个可访问按钮包裹预览；规则端口缺失时显示 `—`。按规则数添加紧凑行距和字号，不能用端口域名或本地 IP 替代端口映射。
5. 使用 `ProfileRuleDetailsDialog` 管理点击结果。操作列设置 `fixed: 'right'`、固定宽度，并在图标按钮内使用 `RunIcon`、`StopIcon`、`DeleteIcon`、`RefreshIcon`；不要用文字替代启动或停止图标。
6. 再次运行 ProfileList 与规则弹层测试，确认通过。

## 任务 5：严格批量工具条与应用层防御

1. 写失败测试：零选择时批量工具条完全不存在；有选择时只出现删除、启动、停止。全停止选择仅启动和删除可用；全运行选择仅停止可用；混合状态时全部禁用。
2. 写失败测试：禁用按钮的包裹元素有 `FeishuTooltip`，说明“仅当所有选中连接均已停止”或“仅当所有选中连接均在运行”。
3. 写失败测试：即使直接调用 App 批量处理器，混合状态、错误或过渡状态均不调用启动、停止或凭据删除 IPC。
4. 运行 `pnpm test -- src/features/profiles/ProfileList.test.tsx src/App.test.tsx`，确认失败。
5. 删除批量移动分组按钮、移动分组弹层和选择工具条中的取消选择文本；不得删除分组数据、筛选或持久化逻辑。
6. 使用任务 2 资格函数控制按钮和 App 处理器。停止和删除保留既有确认；执行时继续受 `isBatchOperating` 禁用保护。
7. 再次运行相关测试，确认通过。

## 任务 6：文档与全量验证

1. 更新 `README.md`：说明单一表格、规则详情、上次启动、固定操作列，以及严格的全停止/全运行批量条件。
2. 运行 `pnpm test`，预期全部测试通过。
3. 运行 `pnpm build`，预期 TypeScript 与 Vite 构建通过。
4. 运行 `cargo test --manifest-path src-tauri/Cargo.toml`，预期 Rust 测试通过。
5. 运行 `git diff --check`、`git status --short` 与 `git diff --stat`；确认未覆盖既有未提交改动。
6. 未经用户明确要求，不执行 commit、push、merge、rebase、reset 或清理工作区。
