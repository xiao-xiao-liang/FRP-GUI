# 我的连接工具栏与桌面壳层收口验收清单

## 组件边界

- `src/components/ui/feishu-table/FeishuDataTable.tsx` 与 `FeishuToolbar.tsx` 没有本轮改动。
- 表格改动仅位于 `src/features/profiles/`；不新增第三方 UI 依赖。

## 我的连接页面

- 页面没有连接类型、分组、标签、搜索、排序或管理分组入口，也没有通用“筛选、分组、排序”工具按钮。
- 表格边框内的右上角操作区始终保留固定高度；零选中时该区纯白且没有文字、图标或占位符，表头和数据行不发生垂直位移。
- 选中后，批量删除、批量启动、批量停止在同一固定操作区出现，不在表格上方另起一行。
- 批量操作严格资格、Tooltip、确认弹层、执行期禁用与凭据清理保持原有验收标准。
- 表格仅保留名称、描述、规则、上次启动、固定右操作列与分页；不展示运行状态列，状态由右侧操作按钮表达。
- 表头复用白色飞书表头与列宽拖拽手柄；操作列仍固定在右侧。表格根字号为 13px，正文按信息层级降至 12px 或 11px。
- 单项启动为白底/无填充的绿色 `RunIcon` 图标按钮，不带蓝色背景；仍可通过 Tooltip 和 `aria-label` 识别。

## 规则协议

- TCP 为蓝色、UDP 为青色、HTTP 为绿色、HTTPS 为紫色、未知类型为灰色；协议标识不显示圆点。
- 端口映射仍是 `本地端口 → 远程端口`，多规则折叠和详情弹层可用。
- 规则详情表中使用相同的协议颜色；不出现 Token、密码、密钥、TOML 或完整配置对象。

## 桌面壳层

- 右侧主区域不存在全局页面标题/说明顶栏。
- 左侧品牌与导航仍正常，路由页面本身标题和内容可访问。
- 窗口缩小后，表格的操作列表头和内容固定在右侧，其余列可水平滚动。

## 验证命令

- `pnpm test`
- `pnpm build`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `git diff --check`
- `git diff -- src/components/ui/feishu-table/FeishuDataTable.tsx src/components/ui/feishu-table/FeishuToolbar.tsx`（应为空）
