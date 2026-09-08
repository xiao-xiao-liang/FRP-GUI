import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { ProfileMetricsCards } from './ProfileMetricsCards';
import { makeProfile, makeCore } from '../../test/fixtures';

afterEach(() => {
  cleanup();
});

describe('ProfileMetricsCards', () => {
  it('渲染 4 个指标卡片：运行实例、在线穿透隧道、需要处理、FRP 核心引擎', () => {
    const runningProfile = makeProfile({
      id: 'p1',
      name: '运行方案',
      status: 'running',
      config: {
        serverAddr: 'frp.test.com',
        serverPort: 7000,
        proxies: [
          { name: 'p-1', type: 'tcp', localIP: '127.0.0.1', localPort: 22, remotePort: 6022 },
          { name: 'p-2', type: 'http', localIP: '127.0.0.1', localPort: 80, customDomains: ['app.test.com'] },
        ],
        visitors: [],
      },
    });

    const stoppedProfile = makeProfile({
      id: 'p2',
      name: '停止方案',
      status: 'stopped',
      config: {
        serverAddr: 'frp.test.com',
        serverPort: 7000,
        proxies: [
          { name: 'p-3', type: 'tcp', localIP: '127.0.0.1', localPort: 3389, remotePort: 6389 },
        ],
        visitors: [],
      },
    });

    const core = makeCore({
      version: 'v0.61.1',
      path: 'C:\\tools\\frpc.exe',
      status: 'ready',
    });

    render(
      <ProfileMetricsCards
        profiles={[runningProfile, stoppedProfile]}
        activeCore={core}
        onOpenCores={vi.fn()}
      />
    );

    // 运行实例
    expect(screen.getByText('运行实例')).toBeInTheDocument();
    expect(screen.getAllByText(/\/ 2 方案/)).toHaveLength(2);
    expect(screen.getByText('1 运行中')).toBeInTheDocument();

    // 在线穿透隧道 (运行方案有 2 条规则，共 3 条规则)
    expect(screen.getByText('在线穿透隧道')).toBeInTheDocument();
    expect(screen.getByText(/\/ 3 规则/)).toBeInTheDocument();
    expect(screen.getByText('正常工作')).toBeInTheDocument();

    // 需要处理
    expect(screen.getByText('需要处理')).toBeInTheDocument();
    expect(screen.getByText('全部正常')).toBeInTheDocument();

    // FRP 核心引擎
    expect(screen.getByText('FRP 核心引擎')).toBeInTheDocument();
    expect(screen.getByText('v0.61.1')).toBeInTheDocument();
    expect(screen.getByText('就绪')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '切换核心' })).toBeInTheDocument();
  });

  it('存在异常连接时展示引导横幅并定向打开首个异常方案诊断', async () => {
    const user = userEvent.setup();
    const onDiagnose = vi.fn();
    const errorProfile = makeProfile({ id: 'p-err', name: 'NAS-异常', status: 'error' });

    render(
      <ProfileMetricsCards
        profiles={[errorProfile]}
        onDiagnose={onDiagnose}
      />
    );

    expect(screen.getByText(/处连接异常中断/)).toBeInTheDocument();
    const probeBtn = screen.getByRole('button', { name: '排查首个异常连接' });
    await user.click(probeBtn);
    expect(onDiagnose).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-err' }));
  });

  it('未配置核心时展示未配置和配置核心按钮', async () => {
    const user = userEvent.setup();
    const onOpenCores = vi.fn();

    render(
      <ProfileMetricsCards
        profiles={[]}
        activeCore={null}
        onOpenCores={onOpenCores}
      />
    );

    expect(screen.getByText('未配置')).toBeInTheDocument();
    expect(screen.getByText('待配置')).toBeInTheDocument();

    const configBtn = screen.getByRole('button', { name: '配置核心' });
    await user.click(configBtn);
    expect(onOpenCores).toHaveBeenCalledTimes(1);
  });
});
