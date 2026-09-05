# FRP-GUI P1-A「我的连接工作台」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有穿透方案管理升级为面向普通用户的“我的连接”工作台，将应用默认入口设为“我的连接”，收敛概览页为“运行状态”，合并重复筛选，并将连接卡/表格操作统一收敛为单一主操作与“更多”下拉菜单。

**Architecture:** 保持现有 `Profile` 与 `FrpCore` 数据模型、`/profiles` 与 `/dashboard` 路由兼容，重构 UI 交互层级：
1. `App.tsx` 将默认重定向由 `/dashboard` 调整为 `/profiles`，侧边栏导航调整为“我的连接、运行状态、实时日志、FRP 核心管理”，顶栏文案同步更新，并使用现有的 `handleStartAll`、`handleStopAll` 与新建连接回调，向 `DashboardOverview` 注入 `onOpenDiagnostics={handleOpenDiagnostics}` 与 `onOpenProfiles={() => navigate('/profiles')}`；
2. `ProfileCard.tsx` 复用 `src/components/ui/dropdown-menu.tsx`，按连接状态渲染唯一主操作（`启动连接` / `停止连接` / `立即排查` / `启动中...`），消除错误卡片内重复的“立即排查”按钮，次级动作（编辑、日志、扫码、克隆、删除）全部收敛入“更多操作”菜单；
3. `ProfileList.tsx` 定义清晰的 `TabKey`（`all` / `running` / `stopped` / `error`），从 `src/components/ui/feishu-select.tsx` 引入 `FeishuSelect`，实现与类型（`all` / `frpc` / `frps`）及关键字搜索的正交过滤，并在条件变更时显式重置分页至第 1 页；表格视图调用移除内置 `tabs` 与内部搜索框，操作列统一采用“单一主操作 + 更多菜单”，视图切换按钮补充 `aria-label`；
4. `DashboardOverview.tsx` 标题更新为“FRP 运行状态”，新增“管理我的连接”入口；当存在异常连接时展示引导横幅，点击直接定向打开首个异常连接的诊断上下文；
5. 保留 P0 验证通过的所有测试（网络诊断、核心可用性阻断、跨方案定向探测隔离等）。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS、Radix UI (`@radix-ui/react-dropdown-menu`)、Vitest、React Testing Library。

---

## 范围和文件结构

本阶段仅实现 P1-A「我的连接工作台」，不包含场景化创建向导、TOML 编辑器结构重构、独立排障中心页面或移动端重构。

| 文件 | 责任 |
| --- | --- |
| `src/components/ui/dropdown-menu.tsx` | 项目已有 Radix 下拉菜单封装，供连接卡与表格操作列直接复用。 |
| `src/components/ui/feishu-select.tsx` | 项目已有飞书下拉选择器，供连接类型筛选使用。 |
| `src/features/profiles/ProfileCard.tsx` | 连接卡组件：按状态展示单一主操作，错误提示改为纯说明 Popover（无重复排查按钮），次级操作收敛至 `DropdownMenu`。 |
| `src/features/profiles/ProfileList.tsx` | 我的连接列表：正交筛选（TabKey + FeishuSelect 类型 + 搜索），重置分页，视图切换按钮增加可访问标签，表格模式去除重复内嵌筛选，卡片与表格操作列统一。 |
| `src/features/dashboard/DashboardOverview.tsx` | 运行状态看板：更新标题为“FRP 运行状态”，展示在线隧道与快捷命令，提供“管理我的连接”跳转与首个异常定向诊断横幅。 |
| `src/App.tsx` | 默认入口重定向到 `/profiles`；侧栏/顶栏文案更新；使用已有函数将 `handleOpenDiagnostics` 与 `navigate('/profiles')` 正确传入 `DashboardOverview`。 |
| `README.md` | 同步更新导航体系与功能描述。 |
| `src/features/profiles/ProfileCard.test.tsx` | 测试卡片各状态的唯一主操作、启动中禁用态、错误 Popover 纯展示、唯一排查入口以及 `DropdownMenu` 所有次级菜单项触发。 |
| `src/features/profiles/ProfileList.test.tsx` | 测试状态 Tab（含 error）、类型筛选、关键字搜索三条件组合过滤，测试分页重置，以及表格视图操作列交互与无重复内嵌控件。 |
| `src/features/dashboard/DashboardOverview.test.tsx` | 测试运行状态看板标题、跳转连接列表、异常横幅渲染与定向首个异常诊断触发。 |
| `src/App.test.tsx` | 测试应用默认根路由进入“我的连接”，运行状态横幅定向带入首个异常方案诊断，且原有 P0 核心阻断、跨方案探测隔离保持稳固。 |

当前项目未初始化 Git 仓库，执行时不包含 `git commit` 步骤。

---

### Task 1: 连接卡操作收敛与单一主操作状态分流

**Files:**
- Modify: `src/features/profiles/ProfileCard.tsx`
- Test: `src/features/profiles/ProfileCard.test.tsx`

- [ ] **Step 1: 编写连接卡主操作、“启动中”禁用态与“更多”次级菜单的失败测试**

更新 `src/features/profiles/ProfileCard.test.tsx`，覆盖已停止、运行中、启动中、异常中断状态下的唯一主操作、错误 Popover 纯展示（确保整个卡片只有 1 个“立即排查”按钮），并逐一点击断言 `DropdownMenu` 中的编辑、日志、扫码、克隆、删除：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { ProfileCard } from './ProfileCard';
import { makeProfile } from '../../test/fixtures';

describe('ProfileCard (我的连接卡片)', () => {
  it('已停止状态显示“启动连接”主操作，并在更多菜单中逐一触发全部次级操作', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onEdit = vi.fn();
    const onViewLogs = vi.fn();
    const onSync = vi.fn();
    const onClone = vi.fn();
    const onDelete = vi.fn();

    const { unmount } = render(
      <ProfileCard
        profile={makeProfile({ status: 'stopped' })}
        onToggle={onToggle}
        onEdit={onEdit}
        onClone={onClone}
        onDelete={onDelete}
        onSync={onSync}
        onViewLogs={onViewLogs}
        onDiagnose={vi.fn()}
      />
    );

    // 1. 唯一主按钮
    const startBtn = screen.getByRole('button', { name: '启动连接' });
    expect(startBtn).toBeInTheDocument();
    await user.click(startBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    // 2. 依次测试更多操作下拉菜单中的 5 个次级操作
    // 2.1 编辑配置
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByText('编辑配置'));
    expect(onEdit).toHaveBeenCalledTimes(1);

    // 2.2 查看日志
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByText('查看日志'));
    expect(onViewLogs).toHaveBeenCalledTimes(1);

    // 2.3 扫码分享
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByText('扫码分享'));
    expect(onSync).toHaveBeenCalledTimes(1);

    // 2.4 克隆副本
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByText('克隆副本'));
    expect(onClone).toHaveBeenCalledTimes(1);

    // 2.5 删除连接
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByText('删除连接'));
    expect(onDelete).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('运行中状态显示“停止连接”主操作', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <ProfileCard
        profile={makeProfile({ status: 'running' })}
        onToggle={onToggle}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={vi.fn()}
      />
    );

    const stopBtn = screen.getByRole('button', { name: '停止连接' });
    expect(stopBtn).toBeInTheDocument();
    await user.click(stopBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('启动中状态显示“启动中...”且按钮处于禁用状态', () => {
    render(
      <ProfileCard
        profile={makeProfile({ status: 'starting' })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={vi.fn()}
      />
    );

    const startingBtn = screen.getByRole('button', { name: /启动中/ });
    expect(startingBtn).toBeInTheDocument();
    expect(startingBtn).toBeDisabled();
  });

  it('异常中断状态突出“立即排查”为唯一主排障入口，错误浮层只展示说明而不产生重复按钮', async () => {
    const user = userEvent.setup();
    const onDiagnose = vi.fn();

    render(
      <ProfileCard
        profile={makeProfile({
          status: 'error',
          stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '端口已被占用' },
        })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={onDiagnose}
      />
    );

    // 验证卡片中只有 1 个“立即排查”按钮
    const diagnoseButtons = screen.getAllByRole('button', { name: '立即排查' });
    expect(diagnoseButtons).toHaveLength(1);

    // 点击主操作按钮触发排查
    await user.click(diagnoseButtons[0]);
    expect(onDiagnose).toHaveBeenCalledWith(expect.objectContaining({ id: 'profile-nas' }));

    // 点击异常状态胶囊打开说明浮层，浮层内不应有重复的“立即排查”按钮
    await user.click(screen.getByRole('button', { name: '异常中断 ▾' }));
    expect(screen.getByText('端口已被占用')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '立即排查' })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行：
```powershell
pnpm test src/features/profiles/ProfileCard.test.tsx
```
预期：FAIL，找不到“启动连接”、“停止连接”或“更多操作”按钮。

- [ ] **Step 3: 实施 ProfileCard 组件操作区与“更多”下拉菜单**

修改 `src/features/profiles/ProfileCard.tsx`：
1. 完整导入 `src/components/ui/dropdown-menu.tsx`、图标库与工具函数：
   ```tsx
   import {
     DropdownMenu,
     DropdownMenuTrigger,
     DropdownMenuContent,
     DropdownMenuItem,
     DropdownMenuSeparator,
   } from '../../components/ui/dropdown-menu';
   import { MoreHorizontal, Terminal, Edit3, QrCode, Copy, Trash2, AlertCircle } from 'lucide-react';
   import { RunIcon, StopIcon, RefreshIcon } from '../../components/icons';
   import { cn } from '../../lib/utils';
   ```
2. 消除状态胶囊内部的重复“立即排查”按钮，将其改造为纯信息展示与去日志引导：
   ```tsx
   {showErrorPopover && (
     <div
       onClick={(e) => e.stopPropagation()}
       className="absolute right-0 top-7 z-30 w-64 p-3 bg-white rounded-[8px] border border-[#DEE0E3] shadow-lg text-[12px] animate-in fade-in zoom-in-95 duration-100"
     >
       <div className="flex items-center gap-1.5 text-[#F53F3F] font-semibold mb-1">
         <AlertCircle className="w-4 h-4" />
         <span>方案启动失败排查</span>
       </div>
       <p className="text-[#646A75] text-[11px] leading-relaxed mb-2.5">
         {profile.stats.lastError || '服务端握手超时、Token认证失败或远程端口已被占用。'}
       </p>
       <div className="flex items-center justify-between pt-2 border-t border-[#EFF0F1]">
         <button
           type="button"
           onClick={() => {
             setShowErrorPopover(false);
             onViewLogs(profile);
           }}
           className="text-[#165DFF] hover:underline font-medium cursor-pointer"
         >
           去日志查看详细报错 ➔
         </button>
         <button
           type="button"
           onClick={() => setShowErrorPopover(false)}
           className="text-[#8F959E] hover:text-[#1F2329] cursor-pointer"
         >
           关闭
         </button>
       </div>
     </div>
   )}
   ```
3. 重构底部操作栏为“单一主按钮 + 更多操作下拉菜单”：
   ```tsx
   {/* 底部操作工具栏 */}
   <div className="mt-5 pt-3.5 border-t border-[#F0F1F2] flex items-center justify-between gap-2">
     <div>
       {isError ? (
         <Button
           size="sm"
           onClick={() => onDiagnose(profile)}
           className="h-8 px-3.5 text-[13px] rounded-[6px] bg-[#F53F3F] text-white hover:bg-[#D82727] cursor-pointer"
         >
           <AlertCircle className="w-3.5 h-3.5 mr-1.5 shrink-0" />
           立即排查
         </Button>
       ) : isRunning ? (
         <Button
           size="sm"
           variant="outline"
           onClick={() => onToggle(profile)}
           className="h-8 px-3.5 text-[13px] rounded-[6px] border-[#DEE0E3] text-[#F53F3F] hover:bg-[#FFECEC] hover:border-[#F53F3F] cursor-pointer"
         >
           <StopIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
           停止连接
         </Button>
       ) : (
         <Button
           size="sm"
           onClick={() => onToggle(profile)}
           disabled={isStarting}
           className="h-8 px-3.5 text-[13px] rounded-[6px] bg-[#165DFF] text-white hover:bg-[#0E4FD9] cursor-pointer"
         >
           {isStarting ? (
             <>
               <RefreshIcon className="w-3.5 h-3.5 mr-1.5 shrink-0 animate-spin" />
               启动中...
             </>
           ) : (
             <>
               <RunIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
               启动连接
             </>
           )}
         </Button>
       )}
     </div>

     <DropdownMenu>
       <DropdownMenuTrigger asChild>
         <Button
           size="sm"
           variant="outline"
           aria-label="更多操作"
           className="h-8 px-2 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white text-[#646A75] hover:bg-[#F2F3F5] cursor-pointer"
         >
           <MoreHorizontal className="w-4 h-4 text-[#646A75]" />
         </Button>
       </DropdownMenuTrigger>
       <DropdownMenuContent align="end" className="min-w-[140px] p-1 shadow-lg border border-[#DEE0E3] bg-white rounded-[8px]">
         <DropdownMenuItem onClick={() => onEdit(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
           <Edit3 className="w-3.5 h-3.5 text-[#646A75]" />
           <span>编辑配置</span>
         </DropdownMenuItem>
         <DropdownMenuItem onClick={() => onViewLogs(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
           <Terminal className="w-3.5 h-3.5 text-[#646A75]" />
           <span>查看日志</span>
         </DropdownMenuItem>
         <DropdownMenuItem onClick={() => onSync(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
           <QrCode className="w-3.5 h-3.5 text-[#646A75]" />
           <span>扫码分享</span>
         </DropdownMenuItem>
         <DropdownMenuItem onClick={() => onClone(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
           <Copy className="w-3.5 h-3.5 text-[#646A75]" />
           <span>克隆副本</span>
         </DropdownMenuItem>
         <DropdownMenuSeparator className="my-1 bg-[#EFF0F1]" />
         <DropdownMenuItem onClick={() => onDelete(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#F53F3F] hover:bg-[#FFECEC] rounded-[4px] cursor-pointer">
           <Trash2 className="w-3.5 h-3.5 text-[#F53F3F]" />
           <span>删除连接</span>
         </DropdownMenuItem>
       </DropdownMenuContent>
     </DropdownMenu>
   </div>
   ```

- [ ] **Step 4: 运行 ProfileCard 单元测试**

运行：
```powershell
pnpm test src/features/profiles/ProfileCard.test.tsx
```
预期：PASS，全部 4 个测试用例通过。

---

### Task 2: “我的连接”列表页合并筛选与表格视图统一

**Files:**
- Modify: `src/features/profiles/ProfileList.tsx`
- Create: `src/features/profiles/ProfileList.test.tsx`

- [ ] **Step 1: 编写 ProfileList 正交筛选、分页重置、表格视图操作与无重复内嵌控件测试**

创建 `src/features/profiles/ProfileList.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { ProfileList } from './ProfileList';
import { makeProfile } from '../../test/fixtures';

describe('ProfileList (我的连接工作台列表)', () => {
  const mockProfiles = [
    makeProfile({ id: 'p1', name: '办公室 NAS', status: 'running', type: 'frpc' }),
    makeProfile({ id: 'p2', name: '家庭 Web 远程', status: 'running', type: 'frpc' }),
    makeProfile({ id: 'p3', name: '云端中继 Web', status: 'running', type: 'frps' }),
    makeProfile({ id: 'p4', name: '家庭远程桌面', status: 'stopped', type: 'frpc' }),
    makeProfile({ id: 'p5', name: '外网游戏服', status: 'stopped', type: 'frps' }),
    makeProfile({ id: 'p6', name: '测试中继异常', status: 'error', type: 'frps' }),
  ];

  it('支持状态 Tab 筛选', async () => {
    const user = userEvent.setup();
    render(
      <ProfileList
        profiles={mockProfiles}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={vi.fn()}
        onCreateNew={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByText('我的连接')).toBeInTheDocument();

    // 1. 切换到“运行中”
    await user.click(screen.getByRole('button', { name: /运行中/ }));
    expect(screen.getByText('办公室 NAS')).toBeInTheDocument();
    expect(screen.getByText('家庭 Web 远程')).toBeInTheDocument();
    expect(screen.getByText('云端中继 Web')).toBeInTheDocument();
    expect(screen.queryByText('家庭远程桌面')).not.toBeInTheDocument();

    // 2. 切换到“异常待处理”
    await user.click(screen.getByRole('button', { name: /异常待处理/ }));
    expect(screen.getByText('测试中继异常')).toBeInTheDocument();
    expect(screen.queryByText('办公室 NAS')).not.toBeInTheDocument();
  });

  it('支持状态 Tab + 类型 + 关键字三条件正交组合过滤', async () => {
    const user = userEvent.setup();
    render(
      <ProfileList
        profiles={mockProfiles}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={vi.fn()}
        onCreateNew={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    // 1. 切换到“运行中” (p1, p2, p3)
    await user.click(screen.getByRole('button', { name: /运行中/ }));

    // 2. 选择类型为“客户端 (FRPC)”(剩 p1, p2)
    await user.click(screen.getByText('全部类型'));
    await user.click(screen.getByText('客户端 (FRPC)'));
    expect(screen.getByText('办公室 NAS')).toBeInTheDocument();
    expect(screen.getByText('家庭 Web 远程')).toBeInTheDocument();
    expect(screen.queryByText('云端中继 Web')).not.toBeInTheDocument();

    // 3. 输入搜索词“Web”(应仅剩 p2)
    const searchInput = screen.getByPlaceholderText(/搜索连接名称/);
    await user.type(searchInput, 'Web');
    expect(screen.getByText('家庭 Web 远程')).toBeInTheDocument();
    expect(screen.queryByText('办公室 NAS')).not.toBeInTheDocument();
  });

  it('修改筛选条件或搜索词时自动重置分页至第 1 页', async () => {
    const user = userEvent.setup();
    // 构造 15 个连接，分页每页 6 个
    const manyProfiles = Array.from({ length: 15 }, (_, i) =>
      makeProfile({ id: `p-${i}`, name: `连接项目-${i + 1}`, status: i === 14 ? 'error' : 'stopped' })
    );

    render(
      <ProfileList
        profiles={manyProfiles}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={vi.fn()}
        onCreateNew={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    // 当前在第 1 页展示“连接项目-1”
    expect(screen.getByText('连接项目-1')).toBeInTheDocument();

    // 点击分页器第 2 页
    const page2Btn = screen.getByRole('button', { name: '2' });
    await user.click(page2Btn);
    expect(screen.getByText('连接项目-7')).toBeInTheDocument();
    expect(screen.queryByText('连接项目-1')).not.toBeInTheDocument();

    // 切换 Tab 到“异常待处理”，应自动重置分页到第 1 页展示“连接项目-15”
    await user.click(screen.getByRole('button', { name: /异常待处理/ }));
    expect(screen.getByText('连接项目-15')).toBeInTheDocument();
  });

  it('表格视图操作列具备单一主操作与更多菜单，且不再出现重复内嵌 Tabs 与内部搜索', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onEdit = vi.fn();

    render(
      <ProfileList
        profiles={[mockProfiles[0]]} // running
        onToggle={onToggle}
        onEdit={onEdit}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={vi.fn()}
        onCreateNew={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    // 切换到表格视图 (通过 aria-label)
    await user.click(screen.getByRole('button', { name: '切换到表格视图' }));
    expect(screen.getByRole('button', { name: '停止连接' })).toBeInTheDocument();

    // 确认表格视图不再渲染内嵌的第二组搜索框
    expect(screen.queryByPlaceholderText('在列表中搜索方案名称、服务器节点或描述...')).not.toBeInTheDocument();

    const moreBtn = screen.getByRole('button', { name: '更多操作' });
    await user.click(moreBtn);
    expect(screen.getByText('编辑配置')).toBeInTheDocument();
    await user.click(screen.getByText('编辑配置'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行：
```powershell
pnpm test src/features/profiles/ProfileList.test.tsx
```
预期：FAIL，找不到组件或 Tab 状态与类型筛选不一致。

- [ ] **Step 3: 实施 ProfileList 筛选模型、表格操作列与文案**

修改 `src/features/profiles/ProfileList.tsx`：
1. 完整引入 `DropdownMenu`、`FeishuSelect`、图标库与工具函数：
   ```tsx
   import {
     DropdownMenu,
     DropdownMenuTrigger,
     DropdownMenuContent,
     DropdownMenuItem,
     DropdownMenuSeparator,
   } from '../../components/ui/dropdown-menu';
   import { MoreHorizontal, Terminal, Edit3, QrCode, Copy, Trash2, AlertCircle, Plus, Search as SearchIcon, LayoutGrid, Table as TableIcon } from 'lucide-react';
   import { RunIcon, StopIcon, RefreshIcon } from '../../components/icons';
   import { FeishuSelect, FeishuSelectOption } from '../../components/ui/feishu-select';
   import { cn } from '../../lib/utils';
   ```
2. 定义 `TabKey` 与类型选项：
   ```ts
   export type TabKey = 'all' | 'running' | 'stopped' | 'error';

   const TYPE_FILTER_OPTIONS: FeishuSelectOption[] = [
     { value: 'all', label: '全部类型' },
     { value: 'frpc', label: '客户端 (FRPC)', pillVariant: 'blue' },
     { value: 'frps', label: '服务端 (FRPS)', pillVariant: 'purple' },
   ];
   ```
3. 正交过滤与分页计算：
   ```ts
   const [activeTab, setActiveTab] = useState<TabKey>('all');
   const [typeFilter, setTypeFilter] = useState<string>('all');
   const [searchKeyword, setSearchKeyword] = useState<string>('');
   const [currentPage, setCurrentPage] = useState<number>(1);
   const [pageSize, setPageSize] = useState<number>(6);
   const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

   const runningCount = useMemo(() => profiles.filter((p) => p.status === 'running').length, [profiles]);
   const stoppedCount = useMemo(() => profiles.filter((p) => p.status === 'stopped').length, [profiles]);
   const errorCount = useMemo(() => profiles.filter((p) => p.status === 'error').length, [profiles]);

   const filteredProfiles = useMemo(() => {
     return profiles.filter((p) => {
       // 1. Tab 状态过滤
       if (activeTab === 'running' && p.status !== 'running') return false;
       if (activeTab === 'stopped' && p.status !== 'stopped') return false;
       if (activeTab === 'error' && p.status !== 'error') return false;

       // 2. 类型过滤
       if (typeFilter === 'frpc' && p.type !== 'frpc') return false;
       if (typeFilter === 'frps' && p.type !== 'frps') return false;

       // 3. 关键字匹配
       if (searchKeyword.trim()) {
         const kw = searchKeyword.toLowerCase();
         const nameMatch = p.name.toLowerCase().includes(kw);
         const descMatch = (p.description || '').toLowerCase().includes(kw);
         const hostMatch = ((p.config as any)?.serverAddr || (p.config as any)?.bindAddr || '').toLowerCase().includes(kw);
         if (!nameMatch && !descMatch && !hostMatch) return false;
       }

       return true;
     });
   }, [profiles, activeTab, typeFilter, searchKeyword]);

   const paginatedProfiles = useMemo(() => {
     const start = (currentPage - 1) * pageSize;
     return filteredProfiles.slice(start, start + pageSize);
   }, [filteredProfiles, currentPage, pageSize]);
   ```
4. 完整定义 `columns`，其中使用 `(record.config as any)?.proxies` 安全访问，且 `actions` 列完整实现主操作与 `DropdownMenu`：
   ```tsx
   const columns = useMemo<FeishuColumn<Profile>[]>(() => [
     {
       key: 'name',
       title: '连接名称',
       dataIndex: 'name',
       dataType: 'text',
       width: 280,
       render: (_, record) => {
         const serverAddr = (record.config as any)?.serverAddr || (record.config as any)?.bindAddr || '127.0.0.1';
         const serverPort = (record.config as any)?.serverPort || (record.config as any)?.bindPort || 7000;
         return (
           <div className="min-w-0">
             <span
               onClick={() => onEdit(record)}
               className="font-medium text-[#1F2329] hover:text-[#165DFF] transition-colors cursor-pointer truncate block text-[14px]"
             >
               {record.name}
             </span>
             <span className="text-[12px] text-[#8F959E] truncate block mt-0.5">
               {record.description || `节点: ${serverAddr}:${serverPort}`}
             </span>
           </div>
         );
       },
     },
     {
       key: 'type',
       title: '类型',
       dataIndex: 'type',
       dataType: 'select',
       width: 120,
       render: (_, record) => (
         <FeishuPill variant={record.type === 'frps' ? 'purple' : 'blue'} showDot={false}>
           {record.type === 'frps' ? 'FRPS 服务端' : 'FRPC 客户端'}
         </FeishuPill>
       ),
     },
     {
       key: 'proxies',
       title: '穿透规则',
       width: 260,
       render: (_, record) => {
         const proxies = (record.config as any)?.proxies || [];
         if (proxies.length === 0) {
           return <span className="text-[13px] text-[#8F959E]">未配置规则</span>;
         }
         return (
           <div className="flex items-center gap-1.5 flex-wrap">
             {proxies.slice(0, 2).map((p: any, idx: number) => (
               <span
                 key={idx}
                 className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-[#F2F3F5] text-[11px] text-[#646A75] tabular-nums font-mono"
               >
                 <span className="font-semibold text-[#165DFF] uppercase">{p.type}</span>
                 <span>:{p.localPort}➔:{p.remotePort || p.customDomains?.[0] || 'auto'}</span>
               </span>
             ))}
             {proxies.length > 2 && (
               <span className="text-[11px] text-[#8F959E]">+{proxies.length - 2}</span>
             )}
           </div>
         );
       },
     },
     {
       key: 'status',
       title: '运行状态',
       dataIndex: 'status',
       dataType: 'select',
       width: 140,
       render: (_, record) => {
         if (record.status === 'running') {
           return <FeishuPill variant="green" showDot={true} className="text-[12px] h-[22px] px-2.5 font-medium">运行中</FeishuPill>;
         }
         if (record.status === 'error') {
           return <FeishuPill variant="red" showDot={true} className="text-[12px] h-[22px] px-2.5">异常中断</FeishuPill>;
         }
         if (record.status === 'starting') {
           return <FeishuPill variant="orange" showDot={true} className="text-[12px] h-[22px] px-2.5">正在启动...</FeishuPill>;
         }
         return <FeishuPill variant="gray" showDot={true} className="text-[12px] h-[22px] px-2.5">已停止</FeishuPill>;
       },
     },
     {
       key: 'actions',
       title: '操作',
       width: 180,
       render: (_, record) => {
         const isRunning = record.status === 'running';
         const isStarting = record.status === 'starting';
         const isError = record.status === 'error';

         return (
           <div className="flex items-center justify-start gap-1.5" onClick={(e) => e.stopPropagation()}>
             {isError ? (
               <Button
                 size="sm"
                 onClick={() => onDiagnose(record)}
                 className="h-7 px-2.5 text-[12px] rounded-[6px] bg-[#F53F3F] text-white hover:bg-[#D82727] cursor-pointer"
               >
                 <AlertCircle className="w-3 h-3 mr-1 shrink-0" />
                 立即排查
               </Button>
             ) : isRunning ? (
               <Button
                 size="sm"
                 variant="outline"
                 onClick={() => onToggle(record)}
                 className="h-7 px-2.5 text-[12px] rounded-[6px] border-[#DEE0E3] text-[#F53F3F] hover:bg-[#FFECEC] hover:border-[#F53F3F] cursor-pointer"
               >
                 <StopIcon className="w-3 h-3 mr-1 shrink-0" />
                 停止连接
               </Button>
             ) : (
               <Button
                 size="sm"
                 onClick={() => onToggle(record)}
                 disabled={isStarting}
                 className="h-7 px-2.5 text-[12px] rounded-[6px] bg-[#165DFF] text-white hover:bg-[#0E4FD9] cursor-pointer"
               >
                 {isStarting ? (
                   <>
                     <RefreshIcon className="w-3 h-3 mr-1 shrink-0 animate-spin" />
                     启动中...
                   </>
                 ) : (
                   <>
                     <RunIcon className="w-3 h-3 mr-1 shrink-0" />
                     启动连接
                   </>
                 )}
               </Button>
             )}

             <DropdownMenu>
               <DropdownMenuTrigger asChild>
                 <Button
                   size="sm"
                   variant="outline"
                   aria-label="更多操作"
                   className="h-7 px-1.5 text-[12px] rounded-[6px] border-[#DEE0E3] bg-white text-[#646A75] hover:bg-[#F2F3F5] cursor-pointer"
                 >
                   <MoreHorizontal className="w-3.5 h-3.5 text-[#646A75]" />
                 </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="min-w-[130px] p-1 shadow-lg border border-[#DEE0E3] bg-white rounded-[8px]">
                 <DropdownMenuItem onClick={() => onEdit(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                   <Edit3 className="w-3 h-3 text-[#646A75]" />
                   <span>编辑配置</span>
                 </DropdownMenuItem>
                 <DropdownMenuItem onClick={() => onViewLogs(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                   <Terminal className="w-3 h-3 text-[#646A75]" />
                   <span>查看日志</span>
                 </DropdownMenuItem>
                 <DropdownMenuItem onClick={() => onSync(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                   <QrCode className="w-3 h-3 text-[#646A75]" />
                   <span>扫码分享</span>
                 </DropdownMenuItem>
                 <DropdownMenuItem onClick={() => onClone(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                   <Copy className="w-3 h-3 text-[#646A75]" />
                   <span>克隆副本</span>
                 </DropdownMenuItem>
                 <DropdownMenuSeparator className="my-1 bg-[#EFF0F1]" />
                 <DropdownMenuItem onClick={() => onDelete(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#F53F3F] hover:bg-[#FFECEC] rounded-[4px] cursor-pointer">
                   <Trash2 className="w-3 h-3 text-[#F53F3F]" />
                   <span>删除连接</span>
                 </DropdownMenuItem>
               </DropdownMenuContent>
             </DropdownMenu>
           </div>
         );
       },
     },
   ], [onEdit, onToggle, onViewLogs, onSync, onClone, onDelete, onDiagnose]);
   ```
5. 渲染顶栏标题、类型筛选 `FeishuSelect`、关键字搜索、状态 Tab 与视图切换按钮（带 `aria-label`）：
   ```tsx
   {/* 顶部标题与新建按钮 */}
   <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
     <div>
       <h1 className="text-[18px] font-semibold text-[#1F2329] tracking-tight">我的连接</h1>
       <p className="text-[12px] text-[#8F959E] mt-0.5">统一管理与快速访问所有内网穿透连接</p>
     </div>
     <div className="flex items-center gap-2.5">
       <Button
         onClick={onCreateNew}
         className="h-8 rounded-[6px] px-3.5 text-[13px] bg-[#165DFF] text-white hover:bg-[#0E4FD9] font-medium shadow-xs cursor-pointer"
       >
         <Plus className="w-3.5 h-3.5 mr-1" />
         新建连接
       </Button>
     </div>
   </div>

   {/* 筛选与搜索工具栏 */}
   <div className="rounded-xl border border-[#DEE0E3] bg-white p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 select-none">
     <div className="flex items-center gap-3 flex-wrap flex-1">
       {/* 类型筛选 */}
       <div className="flex items-center gap-2">
         <span className="text-[13px] text-[#646A75] font-medium shrink-0">连接类型</span>
         <FeishuSelect
           options={TYPE_FILTER_OPTIONS}
           value={typeFilter}
           onChange={(val) => {
             setTypeFilter(val || 'all');
             setCurrentPage(1);
           }}
           size="sm"
           className="w-36"
         />
       </div>

       {/* 搜索框 */}
       <div className="relative flex-1 min-w-[200px] max-w-sm">
         <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8F959E]" />
         <input
           type="text"
           value={searchKeyword}
           onChange={(e) => {
             setSearchKeyword(e.target.value);
             setCurrentPage(1);
           }}
           placeholder="搜索连接名称、服务器地址或描述..."
           className="w-full h-8 pl-8 pr-3 text-[13px] rounded-[6px] border border-[#DEE0E3] bg-white text-[#1F2329] placeholder:text-[#8F959E] focus:outline-none focus:border-[#165DFF] transition-colors"
         />
       </div>
     </div>

     {/* 视图模式切换与批量操作 */}
     <div className="flex items-center gap-2.5">
       <div className="flex items-center rounded-[6px] bg-[#F2F3F5] p-0.5 text-[12px]">
         <button
           type="button"
           aria-label="切换到卡片视图"
           onClick={() => setViewMode('cards')}
           className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] font-medium transition-all cursor-pointer ${
             viewMode === 'cards' ? 'bg-white text-[#165DFF] shadow-2xs font-semibold' : 'text-[#646A75] hover:text-[#1F2329]'
           }`}
         >
           <LayoutGrid className="w-3.5 h-3.5" />
           <span>卡片视图</span>
         </button>
         <button
           type="button"
           aria-label="切换到表格视图"
           onClick={() => setViewMode('table')}
           className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] font-medium transition-all cursor-pointer ${
             viewMode === 'table' ? 'bg-white text-[#165DFF] shadow-2xs font-semibold' : 'text-[#646A75] hover:text-[#1F2329]'
           }`}
         >
           <TableIcon className="w-3.5 h-3.5" />
           <span>表格视图</span>
         </button>
       </div>

       <div className="h-4 w-[1px] bg-[#DEE0E3]" />

       <Button variant="outline" size="sm" onClick={onStartAll} className="h-8 rounded-[6px] px-2.5 text-[12px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer">
         <RunIcon className="w-3.5 h-3.5 mr-1 shrink-0" />
         全部启动
       </Button>
       <Button variant="outline" size="sm" onClick={onStopAll} className="h-8 rounded-[6px] px-2.5 text-[12px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer">
         <StopIcon className="w-3.5 h-3.5 mr-1 shrink-0" />
         全部停止
       </Button>
     </div>
   </div>

   {/* 状态 Tab 栏 */}
   <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
     {[
       { key: 'all' as TabKey, label: '全部连接', count: profiles.length },
       { key: 'running' as TabKey, label: '运行中', count: runningCount },
       { key: 'stopped' as TabKey, label: '已停止', count: stoppedCount },
       { key: 'error' as TabKey, label: '异常待处理', count: errorCount, isAlert: errorCount > 0 },
     ].map((tab) => (
       <button
         key={tab.key}
         type="button"
         onClick={() => {
           setActiveTab(tab.key);
           setCurrentPage(1);
         }}
         className={cn(
           "flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-all duration-150 cursor-pointer select-none",
           activeTab === tab.key
             ? "bg-[#165DFF] text-white shadow-2xs"
             : "bg-white border border-[#DEE0E3] text-[#646A75] hover:bg-[#F2F3F5] hover:text-[#1F2329]"
         )}
       >
         <span>{tab.label}</span>
         <span className={cn(
           "text-[11px] px-1.5 py-0.2 rounded-full tabular-nums",
           activeTab === tab.key ? "bg-white/20 text-white" : tab.isAlert ? "bg-[#FFECEC] text-[#F53F3F]" : "bg-[#F2F3F5] text-[#8F959E]"
         )}>
           {tab.count}
         </span>
       </button>
     ))}
   </div>
   ```
6. 表格视图调用改造（彻底移除内嵌的 tabs 与内部搜索）：
   ```tsx
   {viewMode === 'cards' ? (
     <div>
       {paginatedProfiles.length === 0 ? (
         <div className="bg-white rounded-xl border border-[#DEE0E3] shadow-2xs py-4">
           <FeishuEmptyState
             title="暂无匹配的连接"
             description="您可以调整筛选条件或点击下方按钮新建连接"
           />
           <div className="text-center pb-6">
             <Button
               size="sm"
               onClick={onCreateNew}
               className="h-8 px-4 text-[13px] rounded-[6px] bg-[#165DFF] text-white hover:bg-[#0E4FD9]"
             >
               <Plus className="w-3.5 h-3.5 mr-1" />
               立即新建连接
             </Button>
           </div>
         </div>
       ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {paginatedProfiles.map((profile) => (
             <ProfileCard
               key={profile.id}
               profile={profile}
               onToggle={onToggle}
               onEdit={onEdit}
               onClone={onClone}
               onDelete={onDelete}
               onSync={onSync}
               onViewLogs={onViewLogs}
               onDiagnose={onDiagnose}
             />
           ))}
         </div>
       )}

       {filteredProfiles.length > 0 && (
         <FeishuPagination
           current={currentPage}
           total={filteredProfiles.length}
           pageSize={pageSize}
           pageSizeOptions={[6, 12, 24, 48]}
           onChange={(p, s) => {
             setCurrentPage(p);
             if (s && s !== pageSize) {
               setPageSize(s);
               setCurrentPage(1);
             }
           }}
           className="px-2 pt-2"
         />
       )}
     </div>
   ) : (
     /* 纯净表格视图：不传 tabs、activeTabKey、onTabChange、searchPlaceholder，统一由外层状态过滤 */
     <FeishuDataTable
       columns={columns}
       data={filteredProfiles}
       rowKey="id"
       selectable={false}
       pagination={{
         current: currentPage,
         total: filteredProfiles.length,
         pageSize: pageSize,
         onChange: (p, s) => {
           setCurrentPage(p);
           if (s && s !== pageSize) {
             setPageSize(s);
             setCurrentPage(1);
           }
         },
       }}
     />
   )}
   ```

- [ ] **Step 4: 运行 ProfileList 单元测试**

运行：
```powershell
pnpm test src/features/profiles/ProfileList.test.tsx
```
预期：PASS，全部 4 个测试用例通过。

---

### Task 3: 概览页收敛为“运行状态”看板与异常定向排障

**Files:**
- Modify: `src/features/dashboard/DashboardOverview.tsx`
- Modify: `src/features/dashboard/DashboardOverview.test.tsx`

- [ ] **Step 1: 编写“运行状态”看板测试（含标题、跳转连接列表与定向排障）**

更新 `src/features/dashboard/DashboardOverview.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect } from 'vitest';
import { DashboardOverview } from './DashboardOverview';
import { makeProfile, makeCore } from '../../test/fixtures';

describe('DashboardOverview (运行状态看板)', () => {
  it('展示 FRP 运行状态标题、指标、在线隧道并支持跳转连接列表', async () => {
    const user = userEvent.setup();
    const onOpenProfiles = vi.fn();
    const runningProfile = makeProfile({
      id: 'p1',
      name: '公司 Web 服务',
      status: 'running',
      config: {
        serverAddr: 'frp.work.com',
        serverPort: 7000,
        proxies: [
          { name: 'web-app', type: 'http', localIP: '127.0.0.1', localPort: 3000, customDomains: ['app.work.com'] },
        ],
        visitors: [],
      },
    });

    render(
      <DashboardOverview
        profiles={[runningProfile]}
        activeCore={makeCore()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
        onCreateNew={vi.fn()}
        onOpenLogs={vi.fn()}
        onOpenDiagnostics={vi.fn()}
        onOpenCores={vi.fn()}
        onOpenProfiles={onOpenProfiles}
      />
    );

    expect(screen.getByText('FRP 运行状态')).toBeInTheDocument();
    expect(screen.getByText('实时监控在线穿透隧道、运行实例与连接访问入口')).toBeInTheDocument();
    expect(screen.getByText('公司 Web 服务')).toBeInTheDocument();
    expect(screen.getByText('http://app.work.com')).toBeInTheDocument();

    const openProfilesBtn = screen.getByRole('button', { name: '管理我的连接' });
    await user.click(openProfilesBtn);
    expect(onOpenProfiles).toHaveBeenCalledTimes(1);
  });

  it('存在异常连接时展示引导横幅并定向打开首个异常方案诊断', async () => {
    const user = userEvent.setup();
    const onOpenDiagnostics = vi.fn();
    const errorProfile = makeProfile({ id: 'p2', name: 'NAS-家庭云', status: 'error' });

    render(
      <DashboardOverview
        profiles={[errorProfile]}
        activeCore={makeCore()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
        onCreateNew={vi.fn()}
        onOpenLogs={vi.fn()}
        onOpenDiagnostics={onOpenDiagnostics}
        onOpenCores={vi.fn()}
        onOpenProfiles={vi.fn()}
      />
    );

    expect(screen.getByText(/发现 1 处连接异常中断/)).toBeInTheDocument();
    const probeBtn = screen.getByRole('button', { name: '排查首个异常连接' });
    await user.click(probeBtn);
    expect(onOpenDiagnostics).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }));
  });

  it('无异常连接时不渲染异常警告横幅', () => {
    render(
      <DashboardOverview
        profiles={[makeProfile({ status: 'running' })]}
        activeCore={makeCore()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
        onCreateNew={vi.fn()}
        onOpenLogs={vi.fn()}
        onOpenDiagnostics={vi.fn()}
        onOpenCores={vi.fn()}
        onOpenProfiles={vi.fn()}
      />
    );

    expect(screen.queryByText(/处连接异常中断/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

运行：
```powershell
pnpm test src/features/dashboard/DashboardOverview.test.tsx
```
预期：FAIL，找不到“FRP 运行状态”或 `onOpenProfiles` 缺失。

- [ ] **Step 3: 实施 DashboardOverviewProps、标题与定向排障横幅**

修改 `src/features/dashboard/DashboardOverview.tsx`：
1. 完整导入图标与工具函数：
   ```tsx
   import { Activity, AlertCircle } from 'lucide-react';
   import { TerminalIcon } from '../../components/icons';
   import { Button } from '../../components/ui/button';
   ```
2. 更新接口定义：
   ```ts
   interface DashboardOverviewProps {
     profiles: Profile[];
     activeCore: FrpCore | null;
     onStartAll: () => void;
     onStopAll: () => void;
     onCreateNew: () => void;
     onOpenLogs: () => void;
     onOpenDiagnostics: (profile?: Profile | null) => void;
     onOpenCores: () => void;
     onOpenProfiles: () => void;
   }
   ```
3. 更新顶部标题与工具栏 JSX：
   ```tsx
   {/* 顶部标题与快速操作栏 */}
   <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-[#DEE0E3]/60">
     <div>
       <h1 className="text-[18px] font-semibold text-[#1F2329] tracking-tight">
         FRP 运行状态
       </h1>
       <p className="text-[12px] text-[#8F959E] mt-0.5">
         实时监控在线穿透隧道、运行实例与连接访问入口
       </p>
     </div>
     <div className="flex items-center gap-2.5">
       <Button
         variant="outline"
         onClick={onOpenProfiles}
         className="h-8 rounded-[6px] px-3 text-[13px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer"
       >
         管理我的连接
       </Button>
       <Button
         variant="outline"
         onClick={() => onOpenDiagnostics(null)}
         className="h-8 rounded-[6px] px-3 text-[13px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer"
       >
         <Activity className="w-3.5 h-3.5 mr-1.5 text-[#165DFF]" />
         网络连通性检测
       </Button>
       <Button
         variant="outline"
         onClick={onOpenLogs}
         className="h-8 rounded-[6px] px-3 text-[13px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer"
       >
         <TerminalIcon className="w-3.5 h-3.5 mr-1.5 text-[#646A75]" />
         实时日志看板
       </Button>
     </div>
   </div>
   ```
4. 渲染异常引导横幅：
   ```tsx
   {errorCount > 0 && (
     <div className="flex items-center justify-between p-3.5 bg-[#FFF3E5] border border-[#FF7D00]/30 rounded-[10px] text-[13px] text-[#1F2329]">
       <div className="flex items-center gap-2">
         <AlertCircle className="w-4 h-4 text-[#FF7D00] shrink-0" />
         <span>发现 <strong className="text-[#D82727]">{errorCount}</strong> 处连接异常中断，建议立即排查。</span>
       </div>
       <Button
         size="sm"
         onClick={() => {
           const firstErrorProfile = profiles.find((p) => p.status === 'error') || null;
           onOpenDiagnostics(firstErrorProfile);
         }}
         className="h-7 px-3 text-[12px] rounded-[6px] bg-[#FF7D00] text-white hover:bg-[#E06D00] cursor-pointer"
       >
         排查首个异常连接
       </Button>
     </div>
   )}
   ```

- [ ] **Step 4: 运行 DashboardOverview 单元测试**

运行：
```powershell
pnpm test src/features/dashboard/DashboardOverview.test.tsx
```
预期：PASS，全部 3 个用例通过。

---

### Task 4: 调整应用默认入口、主导航路由与全链路回归

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

- [ ] **Step 1: 编写默认进入“我的连接”、横幅定向诊断与保留 P0 回归特性的测试**

更新 `src/App.test.tsx`：

```tsx
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './App';
import { makeProfile } from './test/fixtures';

vi.mock('./services/ipc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/ipc')>();
  return {
    ...actual,
    testServerConnectivity: vi.fn().mockImplementation((host: string) => {
      if (host === 'b.example.test') {
        return Promise.resolve({
          server: 'b.example.test',
          port: 7001,
          latencyMs: 42,
          status: 'success',
          timestamp: '10:00:00',
        });
      }
      return Promise.resolve({
        server: host,
        port: 7000,
        latencyMs: 15,
        status: 'success',
        timestamp: '10:00:00',
      });
    }),
  };
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

beforeEach(() => {
  localStorage.clear();
});

it('根路径默认重定向并渲染“我的连接”工作台', async () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <AppLayout />
    </MemoryRouter>
  );
  expect(screen.getByText('我的连接')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /新建连接/ })).toBeInTheDocument();
});

it('侧边栏切换“我的连接”与“运行状态”', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/profiles']}>
      <AppLayout />
    </MemoryRouter>
  );

  expect(screen.getAllByRole('button', { name: /我的连接/ })[0]).toBeInTheDocument();
  const runtimeNav = screen.getByRole('button', { name: /运行状态/ });
  await user.click(runtimeNav);
  expect(await screen.findByText('FRP 运行状态')).toBeInTheDocument();
});

it('从运行状态异常横幅进入诊断时定向携带首个异常方案地址', async () => {
  const user = userEvent.setup();
  const errorProfile = makeProfile({
    id: 'prof-err',
    name: 'NAS 异常',
    status: 'error',
    config: { serverAddr: 'err.example.test', serverPort: 7000, proxies: [], visitors: [] },
    stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '握手失败' },
  });

  localStorage.setItem('frp_gui_profiles', JSON.stringify([errorProfile]));

  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <AppLayout />
    </MemoryRouter>
  );

  expect(screen.getByText(/发现 1 处连接异常中断/)).toBeInTheDocument();
  const fixBtn = screen.getByRole('button', { name: '排查首个异常连接' });
  await user.click(fixBtn);

  expect(screen.getByText('网络节点连通性测试与延迟探测')).toBeInTheDocument();
  expect(screen.getByDisplayValue('err.example.test')).toBeInTheDocument();
});

it('保留 P0: 未配置核心时启动方案跳转到核心管理且不显示启动成功', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/profiles']}>
      <AppLayout />
    </MemoryRouter>
  );
  await user.click(screen.getAllByRole('button', { name: '启动连接' })[0]);
  expect(await screen.findByText('FRP 核心引擎管理')).toBeInTheDocument();
  expect(screen.queryByText(/已成功启动/)).not.toBeInTheDocument();
});

it('保留 P0: 从 A 打开诊断并探测 B，结果只更新 B', async () => {
  const user = userEvent.setup();
  const profileA = makeProfile({
    id: 'prof-a',
    name: '方案 A',
    status: 'error',
    config: { serverAddr: 'a.example.test', serverPort: 7000, proxies: [], visitors: [] },
    stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '握手失败' },
  });
  const profileB = makeProfile({
    id: 'prof-b',
    name: '方案 B',
    status: 'stopped',
    config: { serverAddr: 'b.example.test', serverPort: 7001, proxies: [], visitors: [] },
    stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
  });

  localStorage.setItem('frp_gui_profiles', JSON.stringify([profileA, profileB]));

  render(
    <MemoryRouter initialEntries={['/profiles']}>
      <AppLayout />
    </MemoryRouter>
  );

  // 从方案 A 卡片主按钮打开诊断
  const diagnoseBtn = await screen.findByRole('button', { name: '立即排查' });
  await user.click(diagnoseBtn);

  expect(screen.getByText('网络节点连通性测试与延迟探测')).toBeInTheDocument();
  expect(screen.getByDisplayValue('a.example.test')).toBeInTheDocument();

  // 在弹窗中一键探测方案 B
  await user.click(screen.getByRole('button', { name: /方案 B/ }));

  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
    const savedB = saved.find((p: any) => p.id === 'prof-b');
    expect(savedB?.stats?.lastPingMs).toBe(42);
  });

  const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
  const savedA = saved.find((p: any) => p.id === 'prof-a');
  const savedB = saved.find((p: any) => p.id === 'prof-b');

  expect(savedA?.stats?.lastPingMs).toBeUndefined();
  expect(savedA?.status).toBe('error');
  expect(savedB?.stats?.lastPingMs).toBe(42);
});
```

- [ ] **Step 2: 运行测试验证失败**

运行：
```powershell
pnpm test src/App.test.tsx
```
预期：FAIL，根路径未重定向至 `/profiles` 或 `DashboardOverview` 的 `onOpenDiagnostics` 丢失首个异常方案。

- [ ] **Step 3: 更新 App.tsx 路由与导航配置**

在 `src/App.tsx` 中：
1. 默认路由调整为重定向到 `/profiles`：
   ```tsx
   <Route path="/" element={<Navigate to="/profiles" replace />} />
   ```
2. 正确向 `<DashboardOverview>` 传入现有的 `handleStartAll`、`handleStopAll`、新建连接回调，以及 `onOpenDiagnostics={handleOpenDiagnostics}` 和 `onOpenProfiles={() => navigate('/profiles')}`：
   ```tsx
   <Route
     path="/dashboard"
     element={
       <DashboardOverview
         profiles={profiles}
         activeCore={activeCore}
         onStartAll={handleStartAll}
         onStopAll={handleStopAll}
         onCreateNew={() => {
           setEditingProfile(null);
           setIsEditorOpen(true);
         }}
         onOpenLogs={() => navigate('/logs')}
         onOpenDiagnostics={handleOpenDiagnostics}
         onOpenProfiles={() => navigate('/profiles')}
         onOpenCores={() => navigate('/cores')}
       />
     }
   />
   ```
3. 侧边栏导航条目顺序与文案：
   ```tsx
   <nav className="p-2 space-y-1">
     <button
       type="button"
       onClick={() => {
         setLogTargetProfileId(null);
         navigate('/profiles');
       }}
       className={cn(
         "relative flex h-9 w-full items-center justify-between rounded-[6px] px-2.5 text-[14px] leading-[22px] transition-colors duration-150 select-none cursor-pointer",
         currentNav === 'profiles'
           ? "bg-[#EBEDF0] font-medium text-[#1F2329]"
           : "text-[#1F2329] hover:bg-[rgba(31,35,41,0.05)]"
       )}
     >
       <div className="flex min-w-0 items-center gap-2.5">
         <ServicesIcon className="w-4 h-4 shrink-0" />
         <span className="truncate">我的连接</span>
       </div>
       <Badge variant="secondary" className="text-[11px] py-0 px-1.5 h-5 rounded-[4px] tabular-nums">
         {profiles.length}
       </Badge>
     </button>

     <button
       type="button"
       onClick={() => {
         setLogTargetProfileId(null);
         navigate('/dashboard');
       }}
       className={cn(
         "relative flex h-9 w-full items-center justify-between rounded-[6px] px-2.5 text-[14px] leading-[22px] transition-colors duration-150 select-none cursor-pointer",
         currentNav === 'dashboard'
           ? "bg-[#EBEDF0] font-medium text-[#1F2329]"
           : "text-[#1F2329] hover:bg-[rgba(31,35,41,0.05)]"
       )}
     >
       <div className="flex min-w-0 items-center gap-2.5">
         <DashboardIcon className="w-4 h-4 shrink-0" />
         <span className="truncate">运行状态</span>
       </div>
     </button>

     <button
       type="button"
       onClick={() => navigate('/logs')}
       className={cn(
         "relative flex h-9 w-full items-center justify-between rounded-[6px] px-2.5 text-[14px] leading-[22px] transition-colors duration-150 select-none cursor-pointer",
         currentNav === 'logs'
           ? "bg-[#EBEDF0] font-medium text-[#1F2329]"
           : "text-[#1F2329] hover:bg-[rgba(31,35,41,0.05)]"
       )}
     >
       <div className="flex min-w-0 items-center gap-2.5">
         <TerminalIcon className="w-4 h-4 shrink-0" />
         <span className="truncate">实时日志</span>
       </div>
       <span className="w-2 h-2 rounded-full bg-[#00B42A] animate-pulse shrink-0" title="实时流已就绪"></span>
     </button>

     <button
       type="button"
       onClick={() => navigate('/cores')}
       className={cn(
         "relative flex h-9 w-full items-center justify-between rounded-[6px] px-2.5 text-[14px] leading-[22px] transition-colors duration-150 select-none cursor-pointer",
         currentNav === 'cores'
           ? "bg-[#EBEDF0] font-medium text-[#1F2329]"
           : "text-[#1F2329] hover:bg-[rgba(31,35,41,0.05)]"
       )}
     >
       <div className="flex min-w-0 items-center gap-2.5">
         <PluginIcon className="w-4 h-4 shrink-0" />
         <span className="truncate">FRP 核心管理</span>
       </div>
       <span className={`text-[11px] font-medium tabular-nums ${cores.find((c) => c.id === activeCoreId) ? 'text-[#165DFF]' : 'text-[#8F959E]'}`}>
         {cores.find((c) => c.id === activeCoreId)?.version || '待配置'}
       </span>
     </button>
   </nav>
   ```
4. 顶栏标题及副标题映射：
   ```tsx
   <span className="text-[15px] font-medium text-[#1F2329]">
     {currentNav === 'profiles' && '我的连接'}
     {currentNav === 'dashboard' && '运行状态'}
     {currentNav === 'logs' && '实时日志监控看板'}
     {currentNav === 'cores' && 'FRP 核心引擎管理'}
   </span>
   <span className="text-[#DEE0E3]">|</span>
   <span className="text-[13px] text-[#8F959E]">
     {currentNav === 'profiles' && '统一管理与快速访问所有内网穿透连接'}
     {currentNav === 'dashboard' && '实时监控在线穿透隧道、运行实例与连接访问入口'}
     {currentNav === 'logs' && '实时捕获过滤 FRP 运行日志与连接事件'}
     {currentNav === 'cores' && '管理与无缝切换本地 FRP 引擎与 GitHub 官方版本库'}
   </span>
   ```

- [ ] **Step 4: 运行 App 集成测试**

运行：
```powershell
pnpm test src/App.test.tsx
```
预期：PASS，全部 5 个集成用例通过。

---

### Task 5: 同步文档与全量自动化构建验证

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README.md 功能导航说明**

在 `README.md` 中的“核心功能架构”部分同步最新命名与职责：

```markdown
### 核心功能架构

- **我的连接 (`/profiles`)**：默认工作台，面向普通用户直观展示穿透目标与运行状态；提供启动连接/停止连接/立即排查单一主操作，次级动作收敛于更多菜单；支持正交筛选与多维表格切换。
- **运行状态 (`/dashboard`)**：实时监控在线穿透隧道、可直接复制的访问命令与异常连接排障引导。
- **实时日志 (`/logs`)**：实时捕获、过滤并排查 FRP 运行时流式日志与连接事件。
- **FRP 核心管理 (`/cores`)**：管理与无缝切换本地 FRP 引擎与 GitHub 官方版本库。
```

- [ ] **Step 2: 运行全部单元与集成测试**

运行：
```powershell
pnpm test
```
预期：5 个测试套件（`DiagnosticModal.test.tsx`、`ProfileCard.test.tsx`、`ProfileList.test.tsx`、`DashboardOverview.test.tsx`、`App.test.tsx`）全部以状态码 0 PASS。

- [ ] **Step 3: 运行生产打包与类型校验**

运行：
```powershell
pnpm build
```
预期：TypeScript 编译通过，Vite 打包以状态码 0 成功完成。

- [ ] **Step 4: 人工走查普通用户三大操作路径**

启动本地开发模式：
```powershell
pnpm dev
```
按以下步骤走查：
1. **默认入口与卡片操作：** 打开应用直接进入“我的连接”，卡片直观显示连接名称、访问公网地址与状态；已停止卡片显示“启动连接”，运行中显示“停止连接”，异常卡片显示“立即排查”且无重复按钮；点击“更多操作”可正常触发编辑、日志、扫码、克隆与删除；
2. **正交筛选与表格切换：** 切换“运行中/已停止/异常待处理”Tab，配合“连接类型”下拉和搜索框，验证多条件正交过滤正常且能自动重置分页；点击“表格视图”验证操作列一致性，且确认无重复内嵌 Tabs 或搜索框；
3. **运行状态看盘与排障：** 切换到“运行状态”，查看在线隧道列表与一键复制命令；存在异常连接时点击“排查首个异常连接”，确认精准带入首个异常方案的地址与端口。

---

## 计划自检

- **规格覆盖：** 100% 覆盖全部 6 项最新评审意见（`App.tsx` 使用现有函数与定向诊断注入、`FeishuSelect` 正确导入路径、补齐所有缺失图标与 `cn` 导入、`record.config` 联合类型安全访问、表格视图彻底移除内嵌重复 Tabs/搜索框、补齐三条件正交搜索/分页重置/无重复控件测试）。
- **范围边界：** 严格排除场景创建向导、TOML 编辑器重写与移动端重构。
- **兼容性：** 数据模型零破坏，既有 TOML、导入导出、诊断与核心管理完全兼容。
- **无占位符：** 全部提供完整代码级接口、JSX 片段、测试代码与期望结果。
