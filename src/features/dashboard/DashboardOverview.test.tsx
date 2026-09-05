import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { DashboardOverview } from './DashboardOverview';
import { makeProfile, makeCore } from '../../test/fixtures';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

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
    expect(screen.getByText(/公司 Web 服务/)).toBeInTheDocument();
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

    expect(screen.getByText(/处连接异常中断/)).toBeInTheDocument();
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

  it('顶部工具栏与快捷操作条无重复入口，且新建连接文案统一', async () => {
    const user = userEvent.setup();
    const onOpenDiagnostics = vi.fn();
    const onOpenLogs = vi.fn();
    const onCreateNew = vi.fn();

    render(
      <DashboardOverview
        profiles={[]}
        activeCore={makeCore()}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
        onCreateNew={onCreateNew}
        onOpenLogs={onOpenLogs}
        onOpenDiagnostics={onOpenDiagnostics}
        onOpenCores={vi.fn()}
        onOpenProfiles={vi.fn()}
      />
    );

    // 1. “网络连通性检测”和“实时日志看板”各只出现一次
    const diagBtns = screen.getAllByRole('button', { name: /网络连通性检测/ });
    expect(diagBtns).toHaveLength(1);
    await user.click(diagBtns[0]);
    expect(onOpenDiagnostics).toHaveBeenCalledWith(null);

    const logBtns = screen.getAllByRole('button', { name: /实时日志看板/ });
    expect(logBtns).toHaveLength(1);
    await user.click(logBtns[0]);
    expect(onOpenLogs).toHaveBeenCalledTimes(1);

    // 2. “新建连接”文案统一，且不出现“新建穿透方案”
    const createBtn = screen.getByRole('button', { name: '新建连接' });
    expect(createBtn).toBeInTheDocument();
    expect(screen.queryByText('新建穿透方案')).not.toBeInTheDocument();
    await user.click(createBtn);
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });

  it('未配置核心时不显示固定版本或模拟速率', () => {
    render(
      <DashboardOverview
        profiles={[makeProfile({ status: 'error' })]}
        activeCore={null}
        onStartAll={vi.fn()}
        onStopAll={vi.fn()}
        onCreateNew={vi.fn()}
        onOpenLogs={vi.fn()}
        onOpenDiagnostics={vi.fn()}
        onOpenCores={vi.fn()}
        onOpenProfiles={vi.fn()}
      />
    );

    expect(screen.getByText('未配置')).toBeInTheDocument();
    expect(screen.getByText('需要处理')).toBeInTheDocument();
    expect(screen.queryByText('1.2 MB/s')).not.toBeInTheDocument();
    expect(screen.queryByText('v0.61.1')).not.toBeInTheDocument();
  });
});
