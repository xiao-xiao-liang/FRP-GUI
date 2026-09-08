# FRP 核心引擎管理列表 UI 精细化改良实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除核心引擎管理列表中冗余的“+ 选择本地 FRP 文件夹”按钮；将“核心版本”字段更名为“版本”并保留紫色胶囊但取消加粗；将下载量显示为真实数字，并在鼠标悬浮时通过飞书 Tooltip 展示真实累计下载量。

**Architecture:** 
1. 在 `CoreManagerPage.tsx` 中移除 `FeishuDataTable` 工具栏的 `addButtonText` 与 `onAdd`，卡片视图同步移除重复的导入按钮，保留顶部主操作区的“导入本地 FRP”功能。
2. 表格与卡片组件中的“核心版本”统一调整为“版本”，紫色胶囊中的 `font-bold` 调整为 `font-normal`，确保视觉克制舒适。
3. 数据层与呈现层统一采用 `count.toLocaleString()` 格式化真实数字（如 `52,300`），并在表格单元格和卡片中使用 `FeishuTooltip` 悬浮呈现诸如 `GitHub 累计下载：52,300 次` 的真实数据提示。

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Radix UI (FeishuTooltip), Vitest, React Testing Library.

## Global Constraints

- 严格遵循飞书 Universe Design (UD) 风格规范：文字无衬线、数字使用 `tabular-nums`、边框与层级符合 UD Token。
- 保证测试覆盖率，遵循测试驱动开发（TDD）流程，所有已有回归用例和新增断言必须全部绿灯。
- 不破坏已有核心下载、解压、校验、扫描与导入逻辑。

---

## User Review Required

> [!NOTE]
> 1. 顶部操作区保留“导入本地 FRP”按钮，仅移除列表工具栏左侧重复的“+ 选择本地 FRP 文件夹”按钮，保证页面操作单一明确、不重复冗余。
> 2. 下载量展示方案：在表格和卡片中直接呈现真实千分位数字（例如 `52,300` 而非 `52.3k`），鼠标悬浮时触发黑色气泡飞书 Tooltip 显示 `GitHub 累计下载：52,300 次`，兼顾直观性与高保真交互。

---

## Proposed Changes

### FRP 核心引擎展示与管理模块

#### [MODIFY] [CoreManagerPage.tsx](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src/features/cores/CoreManagerPage.tsx)
- 在 `FeishuDataTable` 属性中移除 `addButtonText="+ 选择本地 FRP 文件夹"` 和 `onAdd={handleImportLocalDirectory}`。
- 在卡片视图的工具栏中移除重复的 `<Button onClick={handleImportLocalDirectory}>...选择本地 FRP 文件夹</Button>`。
- 将表格列定义的 `title: '核心版本'` 改为 `title: '版本'`。
- 将表格版本单元格 `FeishuPill` 样式中的 `font-bold` 改为 `font-normal`。
- 修改 `formatDownloadCount` 函数直接返回 `count.toLocaleString()`（若无下载量则返回 `—`）。
- 在下载量列 render 中，使用 `<FeishuTooltip title={`GitHub 累计下载：${record.downloadCount.toLocaleString()} 次`}>` 包装真实数字，实现悬浮展示。

#### [MODIFY] [CoreCard.tsx](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src/features/cores/CoreCard.tsx)
- 将卡片头部版本 `FeishuPill` 样式中的 `font-bold` 改为 `font-normal`。
- 引入 `FeishuTooltip`，在下载量元数据项中包裹真实下载数字，鼠标悬浮显示 `GitHub 累计下载：${core.downloadCount.toLocaleString()} 次`。

#### [MODIFY] [CoreManagerPage.test.tsx](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src/features/cores/CoreManagerPage.test.tsx)
- 将本地导入按钮的点击从之前的旧文案或表格内按钮统一为顶部的“导入本地 FRP”按钮。
- 断言列表中不再渲染“+ 选择本地 FRP 文件夹”按钮。
- 表头断言从“核心版本”更新为“版本”，并断言页面不存在“核心版本”。
- 胶囊断言从包含 `.font-bold` 更新为不包含 `.font-bold`（采用 `.font-normal`）。
- 下载量断言从 `52.3k` 更新为真实数字 `52,300` 以及 Tooltip 文本支持。

#### [MODIFY] [CoreCard.test.tsx](file:///e:/Code/Projects/MyProject/Tools/FRP-GUI/src/features/cores/CoreCard.test.tsx)
- 更新版本胶囊字体断言（不再包含 `.font-bold`）。
- 更新下载量展示断言（从 `52.3k` 更新为真实格式化数字 `52,300`）。

---

## Tasks & Steps

### Task 1: 移除列表工具栏中的“+ 选择本地 FRP 文件夹”按钮并更新测试

**Files:**
- Modify: `src/features/cores/CoreManagerPage.tsx:905-970`
- Test: `src/features/cores/CoreManagerPage.test.tsx:75-205`

- [ ] **Step 1: 更新测试用例，将导入按钮统一为顶部的“导入本地 FRP”，并断言列表中不含“+ 选择本地 FRP 文件夹”**
- [ ] **Step 2: 运行测试，确认因旧选择器失败**
- [ ] **Step 3: 修改 `CoreManagerPage.tsx`，从 `FeishuDataTable` 和卡片视图工具栏中移除该按钮**
- [ ] **Step 4: 重新运行测试，确保导入相关测试全部通过**

---

### Task 2: 将“核心版本”字段更名为“版本”，紫色胶囊字体取消加粗

**Files:**
- Modify: `src/features/cores/CoreManagerPage.tsx:690-715`
- Modify: `src/features/cores/CoreCard.tsx:60-70`
- Test: `src/features/cores/CoreManagerPage.test.tsx:410-435`
- Test: `src/features/cores/CoreCard.test.tsx:40-100`

- [ ] **Step 1: 在 `CoreManagerPage.test.tsx` 与 `CoreCard.test.tsx` 中编写针对表头“版本”以及胶囊 `font-normal` 的测试**
- [ ] **Step 2: 运行测试，确认预期失败**
- [ ] **Step 3: 修改 `CoreManagerPage.tsx` 将表头设为“版本”，并将紫色胶囊 `font-bold` 替换为 `font-normal`**
- [ ] **Step 4: 修改 `CoreCard.tsx` 将卡片版本紫色胶囊 `font-bold` 替换为 `font-normal`**
- [ ] **Step 5: 运行测试，确认测试通过**

---

### Task 3: 下载量显示真实数字并在悬浮时呈现飞书 Tooltip

**Files:**
- Modify: `src/features/cores/CoreManagerPage.tsx:594-600, 730-745`
- Modify: `src/features/cores/CoreCard.tsx:132-140`
- Test: `src/features/cores/CoreManagerPage.test.tsx:430-440`
- Test: `src/features/cores/CoreCard.test.tsx:90-100`

- [ ] **Step 1: 在测试用例中增加真实数字（例如 `52,300`）及 Tooltip 内容的断言**
- [ ] **Step 2: 运行测试，确认测试失败（当前输出为 `52.3k`）**
- [ ] **Step 3: 在 `CoreManagerPage.tsx` 中修改 `formatDownloadCount` 使用 `count.toLocaleString()`，并在表格列 render 中接入 `FeishuTooltip`**
- [ ] **Step 4: 在 `CoreCard.tsx` 中接入 `FeishuTooltip` 并展示真实数字**
- [ ] **Step 5: 运行测试，确认测试通过**

---

### Task 4: 全量回归测试与代码检查

**Files:**
- All touched files

- [ ] **Step 1: 运行 `npm test` 确认所有相关测试全部通过**
- [ ] **Step 2: 运行 `git diff` 检查所有修改符合规范，无多余格式变动与未预期副作用**

---

## Verification Plan

### Automated Tests
- `npm test -- src/features/cores/CoreManagerPage.test.tsx`
- `npm test -- src/features/cores/CoreCard.test.tsx`
- `npm test -- src/features/cores/core-version-library.test.ts`

### Manual Verification
1. 打开 FRP 核心引擎管理列表，确认多维表格工具栏左侧不再有“+ 选择本地 FRP 文件夹”按钮，且顶部“导入本地 FRP”功能正常可用。
2. 查看多维表格列头，确认名称为“版本”，下方的版本号紫色胶囊文字保持清晰常规粗细（非粗体）。
3. 查看各行及卡片视图中的下载量，确认为真实数字（例如 `52,300`），鼠标移入时飞书 Tooltip 正常浮现累计下载次数提示。
