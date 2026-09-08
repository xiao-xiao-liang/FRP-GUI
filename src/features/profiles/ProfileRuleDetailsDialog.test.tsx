import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileRuleDetailsDialog } from './ProfileRuleDetailsDialog';
import type { Profile } from '../../types/frp';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('ProfileRuleDetailsDialog', () => {
  const mockProfile: Profile = {
    id: 'p-1',
    name: '办公工作站',
    type: 'frpc',
    status: 'running',
    config: {
      serverAddr: '1.2.3.4',
      serverPort: 7000,
      authToken: 'secret_token_12345',
      visitors: [],
      proxies: [
        {
          name: 'ssh-tunnel',
          type: 'tcp',
          localIP: '127.0.0.1',
          localPort: 22,
          remotePort: 60022,
        },
        {
          name: 'web-portal',
          type: 'http',
          localIP: '192.168.1.100',
          localPort: 8080,
          // remotePort 缺失
        },
        {
          name: 'rdp-desktop',
          type: 'tcp',
          localIP: '127.0.0.1',
          localPort: 3389,
          remotePort: 33389,
        },
      ],
    },
    stats: {
      bytesIn: 1024,
      bytesOut: 2048,
      curConns: 3,
      uptimeSeconds: 120,
    },
    createdAt: 1000,
    updatedAt: 2000,
    rawToml: '',
  };

  it('visible 为 false 时不渲染弹层内容', () => {
    render(
      <ProfileRuleDetailsDialog
        visible={false}
        profile={mockProfile}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText('规则详情')).not.toBeInTheDocument();
    expect(screen.queryByText('ssh-tunnel')).not.toBeInTheDocument();
  });

  it('传入三条 ProxyRule 时，弹层显示“名称、协议类型、本地 IP、本地端口、远程端口”五列且缺失 remotePort 显示 —', () => {
    render(
      <ProfileRuleDetailsDialog
        visible={true}
        profile={mockProfile}
        onClose={vi.fn()}
      />
    );

    // 检查弹层标题
    expect(screen.getByText('规则详情')).toBeInTheDocument();

    // 检查表头列名
    expect(screen.getByText('名称')).toBeInTheDocument();
    expect(screen.getByText('协议类型')).toBeInTheDocument();
    expect(screen.getByText('本地 IP')).toBeInTheDocument();
    expect(screen.getByText('本地端口')).toBeInTheDocument();
    expect(screen.getByText('远程端口')).toBeInTheDocument();

    // 检查数据行
    expect(screen.getByText('ssh-tunnel')).toBeInTheDocument();
    expect(screen.getByText('60022')).toBeInTheDocument();

    expect(screen.getByText('web-portal')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.100')).toBeInTheDocument();
    expect(screen.getByText('8080')).toBeInTheDocument();

    // 缺失 remotePort 显示 —
    expect(screen.getByText('—')).toBeInTheDocument();

    expect(screen.getByText('rdp-desktop')).toBeInTheDocument();
    expect(screen.getByText('33389')).toBeInTheDocument();
  });

  it('点击关闭触发 onClose 回调', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <ProfileRuleDetailsDialog
        visible={true}
        profile={mockProfile}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByRole('button', { name: '关闭' });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('不泄露敏感配置（不包含 authToken 或密码等机密）', () => {
    render(
      <ProfileRuleDetailsDialog
        visible={true}
        profile={mockProfile}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText('secret_token_12345')).not.toBeInTheDocument();
  });

  it('协议类型列渲染彩色协议 Pill 并带有 data-proxy-type 标识', () => {
    render(
      <ProfileRuleDetailsDialog
        visible={true}
        profile={mockProfile}
        onClose={vi.fn()}
      />
    );

    const tcpPills = screen.getAllByText('TCP');
    expect(tcpPills.length).toBeGreaterThan(0);
    const tcpContainer = tcpPills[0].closest('[data-proxy-type="tcp"]');
    expect(tcpContainer).toBeInTheDocument();
    expect(tcpContainer?.querySelector('.bg-\\[\\#DEE9FE\\]')).toBeInTheDocument();

    const httpPills = screen.getAllByText('HTTP');
    expect(httpPills.length).toBeGreaterThan(0);
    const httpContainer = httpPills[0].closest('[data-proxy-type="http"]');
    expect(httpContainer).toBeInTheDocument();
    expect(httpContainer?.querySelector('.bg-\\[\\#CFF4EC\\]')).toBeInTheDocument();
  });
});
