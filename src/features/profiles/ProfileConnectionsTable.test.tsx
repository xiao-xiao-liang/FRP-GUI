import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { ProfileConnectionsTable } from './ProfileConnectionsTable';
import { Profile } from '../../types/frp';
import { makeProfile } from '../../test/fixtures';

describe('ProfileConnectionsTable', () => {
  afterEach(() => {
    cleanup();
  });

  const mockProfiles: Profile[] = [
    makeProfile({
      id: 'p-tcp',
      name: 'TCP服务',
      description: 'TCP端口映射',
      status: 'stopped',
      type: 'frpc',
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        visitors: [],
        proxies: [
          { name: 'tcp-rule', type: 'tcp', localIP: '127.0.0.1', localPort: 8080, remotePort: 18080 },
        ],
      },
    }),
    makeProfile({
      id: 'p-multi',
      name: '多协议服务',
      status: 'running',
      type: 'frpc',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, startTime: 1700000000000 },
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        visitors: [],
        proxies: [
          { name: 'udp-rule', type: 'udp', localIP: '127.0.0.1', localPort: 53, remotePort: 153 },
          { name: 'http-rule', type: 'http', localIP: '127.0.0.1', localPort: 80, remotePort: 180 },
        ],
      },
    }),
    makeProfile({
      id: 'p-https-stcp',
      name: 'HTTPS与STCP服务',
      status: 'stopped',
      type: 'frpc',
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        visitors: [],
        proxies: [
          { name: 'https-rule', type: 'https', localIP: '127.0.0.1', localPort: 443, remotePort: 1443 },
          { name: 'stcp-rule', type: 'stcp', localIP: '127.0.0.1', localPort: 9000, remotePort: 19000 },
        ],
      },
    }),
  ];

  const defaultProps = {
    profiles: mockProfiles,
    selectedRowKeys: [] as string[],
    onSelectionChange: vi.fn(),
    isBatchOperating: false,
    onBatchStart: vi.fn(),
    onBatchStop: vi.fn(),
    onBatchDelete: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onClone: vi.fn(),
    onDelete: vi.fn(),
    onSync: vi.fn(),
    onViewLogs: vi.fn(),
    onDiagnose: vi.fn(),
    onRepairCore: vi.fn(),
    onTogglePin: vi.fn(),
    onViewRuleDetails: vi.fn(),
  };

  describe('局部批量操作区', () => {
    it('零选择时保留纯白的固定批量操作区，但不渲染批量按钮', () => {
      render(<ProfileConnectionsTable {...defaultProps} selectedRowKeys={[]} />);

      const batchSlot = screen.getByTestId('profile-batch-action-slot');
      expect(batchSlot).toHaveClass('min-h-[52px]', 'bg-white');
      expect(screen.queryByRole('button', { name: /批量删除/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /批量启动/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /批量停止/ })).not.toBeInTheDocument();
    });

    it('选中项时在同一个固定操作区内显示批量删除、批量启动、批量停止', () => {
      render(<ProfileConnectionsTable {...defaultProps} selectedRowKeys={['p-tcp']} />);

      const batchSlot = screen.getByTestId('profile-batch-action-slot');
      expect(batchSlot).toHaveClass('min-h-[52px]', 'bg-white');

      // 仅包含批量删除、批量启动、批量停止
      expect(screen.getByRole('button', { name: '批量删除' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '批量启动' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '批量停止' })).toBeInTheDocument();

      // 不包含任何外层筛选/分组/排序等非批量按钮
      expect(screen.queryByText(/全部分组/)).not.toBeInTheDocument();
      expect(screen.queryByText(/全部类型/)).not.toBeInTheDocument();
      expect(screen.queryByText(/管理分组/)).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/搜索/)).not.toBeInTheDocument();
    });

    it('停止连接的单项启动按钮使用绿色 SVG，透明底色无边框且不保留蓝色填充与白底', () => {
      render(<ProfileConnectionsTable {...defaultProps} selectedRowKeys={[]} />);

      const startButtons = screen.getAllByRole('button', { name: '启动连接' });
      expect(startButtons).not.toHaveLength(0);
      for (const startButton of startButtons) {
        expect(startButton).toHaveClass('text-[#00B42A]', 'bg-transparent');
        expect(startButton).not.toHaveClass('bg-[#165DFF]');
        expect(startButton).not.toHaveClass('bg-white');
        expect(startButton).not.toHaveClass('border');
        expect(startButton).not.toHaveClass('border-[#DEE0E3]');
      }
    });

    it('操作列的全部操作按钮（启动、停止、删除、更多）均取消边框与白底，使用透明底色跟随行背景', () => {
      render(<ProfileConnectionsTable {...defaultProps} selectedRowKeys={[]} />);

      const actionButtons = [
        ...screen.getAllByRole('button', { name: '启动连接' }),
        ...screen.getAllByRole('button', { name: '停止连接' }),
        ...screen.getAllByRole('button', { name: '删除连接' }),
        ...screen.getAllByRole('button', { name: '更多操作' }),
      ];

      expect(actionButtons.length).toBeGreaterThan(0);
      for (const btn of actionButtons) {
        expect(btn).toHaveClass('bg-transparent');
        expect(btn).not.toHaveClass('border');
        expect(btn).not.toHaveClass('border-[#DEE0E3]');
        expect(btn).not.toHaveClass('bg-white');
      }
    });

    it('单项删除按钮使用红色警示样式，且更多操作弹层不再重复包含删除连接', async () => {
      const { userEvent } = await import('@testing-library/user-event');
      const user = userEvent.setup();
      render(<ProfileConnectionsTable {...defaultProps} selectedRowKeys={[]} />);

      // 操作列的单项删除按钮为红色警示
      const deleteButtons = screen.getAllByRole('button', { name: '删除连接' });
      expect(deleteButtons.length).toBeGreaterThan(0);
      for (const btn of deleteButtons) {
        expect(btn).toHaveClass('text-[#F53F3F]');
      }

      // 打开第一个更多操作菜单
      const moreButtons = screen.getAllByRole('button', { name: '更多操作' });
      await user.click(moreButtons[0]);

      // 菜单项包含编辑配置与置顶项，且为紧凑左对齐
      expect(screen.getByText('编辑配置')).toBeInTheDocument();
      const editItem = screen.getByText('编辑配置').closest('[role="menuitem"]');
      expect(editItem).toHaveClass('justify-start');

      // 菜单内绝不重复渲染删除连接
      expect(screen.queryByRole('menuitem', { name: /删除连接/ })).not.toBeInTheDocument();
    });
  });

  describe('协议高亮与端口映射', () => {
    it('TCP、UDP、HTTP、HTTPS 带有 data-proxy-type 和蓝、青、绿、紫样式，无圆点；未知协议为灰色；端口映射为 本地端口 → 远程端口', () => {
      render(<ProfileConnectionsTable {...defaultProps} />);

      // TCP pill: blue
      const tcpPill = screen.getByText('TCP');
      expect(tcpPill).toBeInTheDocument();
      const tcpContainer = tcpPill.closest('[data-proxy-type="tcp"]');
      expect(tcpContainer).toBeInTheDocument();
      expect(tcpContainer?.querySelector('.bg-\\[\\#DEE9FE\\]')).toBeInTheDocument();
      expect(tcpContainer?.querySelector('.w-\\[6px\\]')).not.toBeInTheDocument(); // 无圆点

      // UDP pill: cyan
      const udpPill = screen.getByText('UDP');
      expect(udpPill).toBeInTheDocument();
      const udpContainer = udpPill.closest('[data-proxy-type="udp"]');
      expect(udpContainer).toBeInTheDocument();
      expect(udpContainer?.querySelector('.bg-\\[\\#CEF0FF\\]')).toBeInTheDocument();

      // HTTP pill: green
      const httpPill = screen.getByText('HTTP');
      expect(httpPill).toBeInTheDocument();
      const httpContainer = httpPill.closest('[data-proxy-type="http"]');
      expect(httpContainer).toBeInTheDocument();
      expect(httpContainer?.querySelector('.bg-\\[\\#CFF4EC\\]')).toBeInTheDocument();

      // HTTPS pill: purple
      const httpsPill = screen.getByText('HTTPS');
      expect(httpsPill).toBeInTheDocument();
      const httpsContainer = httpsPill.closest('[data-proxy-type="https"]');
      expect(httpsContainer).toBeInTheDocument();
      expect(httpsContainer?.querySelector('.bg-\\[\\#F2E9FE\\]')).toBeInTheDocument();

      // STCP pill (未知协议): gray
      const stcpPill = screen.getByText('STCP');
      expect(stcpPill).toBeInTheDocument();
      const stcpContainer = stcpPill.closest('[data-proxy-type="stcp"]');
      expect(stcpContainer).toBeInTheDocument();
      expect(stcpContainer?.querySelector('.bg-\\[\\#F2F3F5\\]')).toBeInTheDocument();

      // 本地与远程地址映射文本
      expect(screen.getByText('127.0.0.1:8080 → 1.2.3.4:18080')).toBeInTheDocument();
      expect(screen.getByText('127.0.0.1:53 → 1.2.3.4:153')).toBeInTheDocument();
      expect(screen.getByText('127.0.0.1:80 → 1.2.3.4:180')).toBeInTheDocument();
      expect(screen.getByText('127.0.0.1:443 → 1.2.3.4:1443')).toBeInTheDocument();
    });
  });

  describe('固定右操作列与表格结构', () => {
    it('复用白底飞书表头与列宽拖拽手柄', () => {
      const { container } = render(<ProfileConnectionsTable {...defaultProps} />);

      expect(container.querySelector('thead.feishu-table-head.bg-white')).toBeInTheDocument();
      expect(container.querySelector('.cursor-col-resize')).toBeInTheDocument();
    });

    it('移除运行状态列，并使用紧凑的表格字号', () => {
      const { container } = render(<ProfileConnectionsTable {...defaultProps} />);

      expect(screen.queryByText('运行状态')).not.toBeInTheDocument();
      expect(container.querySelector('table.text-\\[13px\\]')).toBeInTheDocument();
    });

    it('操作表头和内容单元格具备 sticky right-0 样式', () => {
      const { container } = render(<ProfileConnectionsTable {...defaultProps} />);

      const stickyHeader = container.querySelector('th.sticky.right-0');
      expect(stickyHeader).toBeInTheDocument();

      const stickyCells = container.querySelectorAll('td.sticky.right-0');
      expect(stickyCells.length).toBeGreaterThan(0);
    });
  });

  describe('连接名称与描述呈现', () => {
    it('表头不含“连接描述”列，描述呈现在连接名称下方且具有 truncate 与飞书次级文字样式', () => {
      render(<ProfileConnectionsTable {...defaultProps} />);

      // 表头不含“连接描述”
      expect(screen.queryByText('连接描述')).not.toBeInTheDocument();
      expect(screen.getByText('连接名称')).toBeInTheDocument();
      expect(screen.getByText('穿透规则')).toBeInTheDocument();
      expect(screen.getByText('上次启动')).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();

      // 描述呈现在连接名称下方，具有 truncate 和 text-[#646A75] 样式
      const descElement = screen.getByText('TCP端口映射');
      expect(descElement).toBeInTheDocument();
      expect(descElement).toHaveClass('truncate', 'text-[#646A75]', 'text-[12px]');

      // 处于同一个单元格内部（名称下方）
      const cell = descElement.closest('td');
      expect(cell).toContainElement(screen.getByText('TCP服务'));
    });

    it('描述为空时不渲染下方描述节点', () => {
      const profileWithoutDesc = makeProfile({
        id: 'p-no-desc',
        name: '无描述服务',
        description: '',
        status: 'stopped',
        type: 'frpc',
      });

      render(<ProfileConnectionsTable {...defaultProps} profiles={[profileWithoutDesc]} />);

      expect(screen.getByText('无描述服务')).toBeInTheDocument();
      const cell = screen.getByText('无描述服务').closest('td');
      expect(cell?.querySelector('.text-\\[12px\\]')).toBeNull();
    });

    it('默认模式下表格占满 100% 空间，连接名称列自适应伸缩，其他列保持预设宽度', () => {
      const { container } = render(<ProfileConnectionsTable {...defaultProps} />);

      const table = container.querySelector('table');
      expect(table).toHaveClass('w-full', 'min-w-[620px]');
      expect(table).toHaveStyle({ width: '100%' });

      const cols = container.querySelectorAll('colgroup col');
      expect(cols).toHaveLength(5);
      // col 0: 选择列 48px
      expect(cols[0]).toHaveStyle({ width: '48px' });
      // col 1: 连接名称列作为弹性主列，不设置固定死像素
      expect((cols[1] as HTMLElement).style.width).toBe('');
      // col 2: 穿透规则列
      expect(cols[2]).toHaveStyle({ width: '340px' });
      // col 3: 上次启动列
      expect(cols[3]).toHaveStyle({ width: '130px' });
      // col 4: 操作列
      expect(cols[4]).toHaveStyle({ width: '140px' });
    });

    it('已停止或异常连接若有 startTime 依然展示上次启动时间而非显示 —', () => {
      const stoppedProfile = makeProfile({
        id: 'p-stopped-with-time',
        name: '已停止服务',
        status: 'stopped',
        type: 'frpc',
        stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, startTime: 1788967815000 },
      });

      render(<ProfileConnectionsTable {...defaultProps} profiles={[stoppedProfile]} />);

      const expectedTimeStr = new Date(1788967815000).toLocaleString('zh-CN', { hour12: false });
      expect(screen.getByText(expectedTimeStr)).toBeInTheDocument();
      expect(screen.queryByText('—')).not.toBeInTheDocument();
    });
  });
});
