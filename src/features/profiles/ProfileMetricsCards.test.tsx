import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { ProfileMetricsCards } from './ProfileMetricsCards';
import { makeProfile } from '../../test/fixtures';
import { mergeRuntimeTraffic } from '../../services/runtime-traffic';

afterEach(() => {
  cleanup();
});

describe('ProfileMetricsCards', () => {
  it('渲染运行实例、配置规则、需要处理和实时流量，停止连接规则仍计入总数', () => {
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

    render(
      <ProfileMetricsCards
        profiles={[runningProfile, stoppedProfile]}
      />
    );

    // 运行实例
    expect(screen.getByText('运行实例')).toBeInTheDocument();
    expect(screen.getAllByText(/\/ 2 方案/)).toHaveLength(2);
    expect(screen.getByText('1 运行中')).toBeInTheDocument();

    // 规则数量只表示配置，不推断隧道在线状态。
    expect(screen.getByText('穿透规则').parentElement).toHaveTextContent('3条');
    expect(screen.getByText('已配置')).toBeInTheDocument();
    expect(screen.queryByText('在线穿透隧道')).not.toBeInTheDocument();
    expect(screen.queryByText('正常工作')).not.toBeInTheDocument();

    // 需要处理
    expect(screen.getByText('需要处理')).toBeInTheDocument();
    expect(screen.getByText('全部正常')).toBeInTheDocument();

    expect(screen.getByText('实时流量')).toBeInTheDocument();
    expect(screen.getByText('等待流量样本')).toBeInTheDocument();
    expect(screen.queryByText('FRP 核心引擎')).not.toBeInTheDocument();
  });

  it('逐项显示异常原因与建议，并将编辑和诊断操作交给对应连接', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDiagnose = vi.fn();
    const onViewLogs = vi.fn();
    const portProfile = makeProfile({
      id: 'p-port',
      name: 'NAS-端口占用',
      status: 'error',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: 'start error: port already used' },
    });
    const networkProfile = makeProfile({
      id: 'p-network',
      name: '网站-网络超时',
      status: 'error',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: 'login to the server failed: dial tcp 203.0.113.10:7000: i/o timeout' },
    });

    render(
      <ProfileMetricsCards
        profiles={[portProfile, networkProfile]}
        onEdit={onEdit}
        onDiagnose={onDiagnose}
        onViewLogs={onViewLogs}
      />
    );

    expect(screen.queryByText(/处连接异常中断/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '排查首个异常连接' })).not.toBeInTheDocument();
    const issuePanel = screen.getByRole('region', { name: '待处理连接' });
    const issueRows = within(issuePanel).getAllByRole('listitem');
    expect(issueRows).toHaveLength(2);
    expect(within(issueRows[0]).getByText('NAS-端口占用')).toBeInTheDocument();
    expect(within(issueRows[0]).getByText('连接使用的端口已被占用')).toBeInTheDocument();
    expect(within(issueRows[0]).getByText(/^建议：/)).toBeInTheDocument();
    expect(within(issueRows[1]).getByText('网站-网络超时')).toBeInTheDocument();
    expect(within(issueRows[1]).getByText('连接超时')).toBeInTheDocument();

    await user.click(within(issueRows[0]).getByRole('button', { name: '编辑配置：NAS-端口占用' }));
    expect(onEdit).toHaveBeenCalledWith(portProfile);
    await user.click(within(issueRows[1]).getByRole('button', { name: '检测连通性：网站-网络超时' }));
    expect(onDiagnose).toHaveBeenCalledWith(networkProfile);
    await user.click(within(issueRows[0]).getByRole('button', { name: /查看.*日志/ }));
    await user.click(within(issueRows[1]).getByRole('button', { name: /查看.*日志/ }));
    expect(onViewLogs.mock.calls).toEqual([[portProfile], [networkProfile]]);
  });

  it('需要处理计入运行中的警告，不计入停止连接的旧警告', () => {
    const runningProfile = makeProfile({
      id: 'p-warning',
      name: '运行中-认证警告',
      status: 'running',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastWarning: 'token in login does not match token from configuration' },
    });
    const stoppedProfile = makeProfile({
      id: 'p-stopped',
      name: '已停止-旧警告',
      status: 'stopped',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastWarning: 'start error: port already used' },
    });

    render(<ProfileMetricsCards profiles={[runningProfile, stoppedProfile]} />);

    const issueMetric = screen.getByText('需要处理').parentElement;
    expect(issueMetric).toHaveTextContent('1/ 2 方案');
    const issuePanel = screen.getByRole('region', { name: '待处理连接' });
    expect(within(issuePanel).getAllByRole('listitem')).toHaveLength(1);
    expect(within(issuePanel).getByText('运行中-认证警告')).toBeInTheDocument();
    expect(within(issuePanel).getByText('服务端认证失败')).toBeInTheDocument();
    expect(within(issuePanel).queryByText('已停止-旧警告')).not.toBeInTheDocument();
  });

  it('核心无效时提供核心修复，未知错误只提供该连接的日志入口', async () => {
    const user = userEvent.setup();
    const onRepairCore = vi.fn();
    const onViewLogs = vi.fn();
    const onDiagnose = vi.fn();
    const coreProfile = makeProfile({
      id: 'p-core',
      name: '核心校验失败',
      status: 'error',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastFailureKind: 'core_invalid', lastError: '核心程序校验失败' },
    });
    const unknownProfile = makeProfile({
      id: 'p-unknown',
      name: '未知启动错误',
      status: 'error',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: 'unexpected runtime failure code 120' },
    });

    render(
      <ProfileMetricsCards
        profiles={[coreProfile, unknownProfile]}
        onRepairCore={onRepairCore}
        onViewLogs={onViewLogs}
        onDiagnose={onDiagnose}
      />
    );

    const issueRows = within(screen.getByRole('region', { name: '待处理连接' })).getAllByRole('listitem');
    await user.click(within(issueRows[0]).getByRole('button', { name: '配置核心：核心校验失败' }));
    expect(onRepairCore).toHaveBeenCalledTimes(1);
    expect(within(issueRows[1]).getAllByRole('button')).toHaveLength(1);
    await user.click(within(issueRows[1]).getByRole('button', { name: /查看.*日志/ }));
    expect(onViewLogs).toHaveBeenCalledWith(unknownProfile);
    expect(onDiagnose).not.toHaveBeenCalled();
  });

  it('原始报错默认收起，展开后可选择复制且长行可换行', async () => {
    const user = userEvent.setup();
    const detail = `unexpected runtime failure: ${'x'.repeat(500)}`;
    const profile = makeProfile({
      status: 'error',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: detail },
    });

    render(<ProfileMetricsCards profiles={[profile]} />);

    const disclosure = screen.getByText('原始报错');
    const details = disclosure.closest('details');
    const rawError = screen.getByText(detail, { selector: 'pre' });
    expect(details).not.toHaveAttribute('open');
    expect(rawError).not.toBeVisible();
    await user.click(disclosure);
    expect(details).toHaveAttribute('open');
    expect(rawError).toBeVisible();
    expect(rawError).toHaveClass('select-text', 'whitespace-pre-wrap', '[overflow-wrap:anywhere]');
    expect(disclosure).toHaveClass('focus-visible:ring-2');
  });

  it('回调不可用时保留原因与建议，不显示无效处理按钮', () => {
    const profile = makeProfile({
      status: 'error',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: 'start error: port already used' },
    });

    render(<ProfileMetricsCards profiles={[profile]} />);

    const issuePanel = screen.getByRole('region', { name: '待处理连接' });
    expect(within(issuePanel).getByText(/^建议：/)).toBeInTheDocument();
    expect(within(issuePanel).queryByRole('button')).not.toBeInTheDocument();
  });

  it('没有待处理连接时保持全部正常且不显示空问题面板', () => {
    render(<ProfileMetricsCards profiles={[]} />);

    expect(screen.getByText('全部正常')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '待处理连接' })).not.toBeInTheDocument();
  });

  it('没有运行连接时显示双向零速率和未运行', () => {
    render(<ProfileMetricsCards profiles={[]} />);
    const traffic = screen.getByRole('region', { name: '实时流量' });
    expect(within(traffic).getByText('↑ 0 B/s')).toBeInTheDocument();
    expect(within(traffic).getByText('↓ 0 B/s')).toBeInTheDocument();
    expect(within(traffic).getByText('未运行')).toBeInTheDocument();
  });

  it('部分连接采集成功时展示合计和覆盖连接数', () => {
    const traffic = mergeRuntimeTraffic({}, [{
      profileId: 'p1', runId: 'run-1', startedAt: Date.now() - 1_000, sequence: 2, timestamp: Date.now(),
      availability: 'available', uploadBytesPerSecond: 1_500, downloadBytesPerSecond: 1_000_000,
    }]);
    render(<ProfileMetricsCards profiles={[makeProfile({ id: 'p1', status: 'running' }), makeProfile({ id: 'p2', status: 'running' })]} traffic={traffic} />);
    expect(screen.getByText('↑ 1.5 KB/s')).toBeInTheDocument();
    expect(screen.getByText('↓ 1 MB/s')).toBeInTheDocument();
    expect(screen.getByText('已统计 1 / 2 个运行连接')).toBeInTheDocument();
  });

  it('每秒检查样本时效，过期后显示不可用而非零流量', async () => {
    vi.useFakeTimers();
    try {
      const traffic = mergeRuntimeTraffic({}, [{
        profileId: 'p1', runId: 'run-1', startedAt: Date.now() - 1_000, sequence: 2, timestamp: Date.now(),
        availability: 'available', uploadBytesPerSecond: 1_500, downloadBytesPerSecond: 0,
      }]);
      render(<ProfileMetricsCards profiles={[makeProfile({ id: 'p1', status: 'running' })]} traffic={traffic} />);
      expect(screen.getByText('↑ 1.5 KB/s')).toBeInTheDocument();
      await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
      expect(screen.getByText('流量采样已过期')).toBeInTheDocument();
      expect(screen.queryByText('↑ 0 B/s')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
