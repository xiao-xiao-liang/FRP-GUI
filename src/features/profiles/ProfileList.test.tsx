import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { ProfileList } from './ProfileList';
import { makeProfile } from '../../test/fixtures';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

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
        onRepairCore={vi.fn()}
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
        onRepairCore={vi.fn()}
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
    // 构造 15 个连接，默认分页每页 6 个
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
        onRepairCore={vi.fn()}
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
        onRepairCore={vi.fn()}
        onCreateNew={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    // 切换到表格视图 (通过 aria-label)
    await user.click(screen.getByRole('button', { name: '切换到表格视图' }));
    expect(screen.getByRole('button', { name: '停止连接' })).toBeInTheDocument();

    // 确认表格内部不再渲染内置搜索输入
    expect(screen.queryByPlaceholderText('在列表中搜索')).not.toBeInTheDocument();
    // 确认外层搜索输入框依然存在
    expect(screen.getByPlaceholderText('搜索连接名称、服务器地址或描述...')).toBeInTheDocument();
    // 确认“运行中”状态 Tab 只出现一次，防止双 Tab 回归
    expect(screen.getAllByRole('button', { name: /运行中/ })).toHaveLength(1);

    const moreBtn = screen.getByRole('button', { name: '更多操作' });
    await user.click(moreBtn);
    expect(screen.getByText('编辑配置')).toBeInTheDocument();
    await user.click(screen.getByText('编辑配置'));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('表格视图下，core_invalid 错误状态主操作显示“修复 FRPC 核心”，点击触发 onRepairCore', async () => {
    const user = userEvent.setup();
    const onRepairCore = vi.fn();
    const onDiagnose = vi.fn();

    const errorProfile = makeProfile({
      id: 'prof-err-core',
      name: '核心异常连接',
      status: 'error',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '校验失败', lastFailureKind: 'core_invalid' },
    });

    render(
      <ProfileList
        profiles={[errorProfile]}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={onDiagnose}
        onRepairCore={onRepairCore}
        onCreateNew={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '切换到表格视图' }));
    const repairBtn = screen.getByRole('button', { name: '修复 FRPC 核心' });
    expect(repairBtn).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '立即排查' })).not.toBeInTheDocument();
    await user.click(repairBtn);
    expect(onRepairCore).toHaveBeenCalledTimes(1);
    expect(onDiagnose).not.toHaveBeenCalled();
  });

  it('表格视图下，early_exit 错误状态主操作显示“查看启动日志”，点击触发 onViewLogs', async () => {
    const user = userEvent.setup();
    const onViewLogs = vi.fn();

    const errorProfile = makeProfile({
      id: 'prof-early-exit',
      name: '启动早退连接',
      status: 'error',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '早退', lastFailureKind: 'early_exit' },
    });

    render(
      <ProfileList
        profiles={[errorProfile]}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={onViewLogs}
        onDiagnose={vi.fn()}
        onRepairCore={vi.fn()}
        onCreateNew={vi.fn()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: '切换到表格视图' }));
    const logBtn = screen.getByRole('button', { name: '查看启动日志' });
    expect(logBtn).toBeInTheDocument();
    await user.click(logBtn);
    expect(onViewLogs).toHaveBeenCalledWith(expect.objectContaining({ id: 'prof-early-exit' }));
  });
});
