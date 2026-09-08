import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { ProfileList } from './ProfileList';
import { makeProfile } from '../../test/fixtures';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('ProfileList (我的连接表格化呈现)', () => {
  const mockProfiles = [
    makeProfile({
      id: 'p1',
      name: '办公室 NAS',
      description: '公司内网存储',
      status: 'running',
      type: 'frpc',
      isPinned: true,
      stats: { bytesIn: 100, bytesOut: 200, curConns: 1, uptimeSeconds: 60, startTime: 1700000000000 },
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        visitors: [],
        proxies: [
          { name: 'nas-web', type: 'tcp', localIP: '127.0.0.1', localPort: 5000, remotePort: 15000 },
        ],
      },
    }),
    makeProfile({
      id: 'p2',
      name: '家庭 Web 远程',
      description: '',
      status: 'running',
      type: 'frpc',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, startTime: 1700000005000 },
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        visitors: [],
        proxies: [
          { name: 'web1', type: 'http', localIP: '127.0.0.1', localPort: 80, remotePort: 8080 },
          { name: 'web2', type: 'https', localIP: '127.0.0.1', localPort: 443, remotePort: 8443 },
        ],
      },
    }),
    makeProfile({
      id: 'p3',
      name: '多规则服务',
      description: '包含四条穿透规则的服务',
      status: 'stopped',
      type: 'frpc',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        visitors: [],
        proxies: [
          { name: 'rule-1', type: 'tcp', localIP: '127.0.0.1', localPort: 1001, remotePort: 2001 },
          { name: 'rule-2', type: 'tcp', localIP: '127.0.0.1', localPort: 1002, remotePort: 2002 },
          { name: 'rule-3', type: 'udp', localIP: '127.0.0.1', localPort: 1003, remotePort: 2003 },
          { name: 'rule-4', type: 'tcp', localIP: '127.0.0.1', localPort: 1004, remotePort: 2004 },
        ],
      },
    }),
    makeProfile({
      id: 'p4',
      name: '异常核心连接',
      description: '核心损坏',
      status: 'error',
      type: 'frpc',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastFailureKind: 'core_invalid' },
    }),
    makeProfile({
      id: 'p5',
      name: '异常早退连接',
      description: '早退错误',
      status: 'error',
      type: 'frpc',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastFailureKind: 'early_exit' },
    }),
    makeProfile({
      id: 'p6',
      name: '正在启动连接',
      status: 'starting',
      type: 'frpc',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
    }),
    makeProfile({
      id: 'p7',
      name: '正在停止连接',
      status: 'stopping',
      type: 'frpc',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
    }),
  ];

  describe('任务 3：单一表格视图与列定义', () => {
    it('默认直接渲染表格，不存在卡片/表格视图切换，无状态 Tab 与全部启动/全部停止按钮', () => {
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
        />
      );

      // 不存在卡片/表格切换按钮
      expect(screen.queryByRole('button', { name: '切换到卡片视图' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '切换到表格视图' })).not.toBeInTheDocument();
      expect(screen.queryByText('卡片视图')).not.toBeInTheDocument();
      expect(screen.queryByText('表格视图')).not.toBeInTheDocument();

      // 不存在四个状态 Tab
      expect(screen.queryByRole('button', { name: /全部连接/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /异常待处理/ })).not.toBeInTheDocument();

      // 不存在页面级全部启动/全部停止按钮
      expect(screen.queryByRole('button', { name: '全部启动' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '全部停止' })).not.toBeInTheDocument();

      // 包含表格头部
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('列定义固定为：选择、连接名称、穿透规则、上次启动、操作；不展示运行状态、服务端、流量/连接、分组或标签列，不展示独立连接描述列', () => {
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
        />
      );

      // 存在固定 4 个文本表头（选择列为 checkbox）
      expect(screen.getByText('连接名称')).toBeInTheDocument();
      expect(screen.queryByText('连接描述')).not.toBeInTheDocument();
      expect(screen.getByText('穿透规则')).toBeInTheDocument();
      expect(screen.getByText('上次启动')).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();

      // 不显示运行状态、服务端、流量/连接、分组或标签列表头
      expect(screen.queryByText('运行状态')).not.toBeInTheDocument();
      expect(screen.queryByText('服务端')).not.toBeInTheDocument();
      expect(screen.queryByText('流量/连接')).not.toBeInTheDocument();
      expect(screen.queryByText('分组与标签')).not.toBeInTheDocument();
    });

    it('页面不渲染任何筛选、分组、标签、搜索、排序及管理分组控件', () => {
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
        />
      );

      // 不存在筛选/分组/标签/搜索/排序/管理分组
      expect(screen.queryByText('连接类型')).not.toBeInTheDocument();
      expect(screen.queryByText('全部类型')).not.toBeInTheDocument();
      expect(screen.queryByText('分组')).not.toBeInTheDocument();
      expect(screen.queryByText('全部分组')).not.toBeInTheDocument();
      expect(screen.queryByText('标签')).not.toBeInTheDocument();
      expect(screen.queryByText('全部标签')).not.toBeInTheDocument();
      expect(screen.queryByText('排序')).not.toBeInTheDocument();
      expect(screen.queryByText('管理分组')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/搜索/)).not.toBeInTheDocument();
      expect(screen.queryByText('筛选')).not.toBeInTheDocument();
    });

    it('连接名称单元格展示名称和置顶标识，描述置于名称下方并单行截断', () => {
      render(
        <ProfileList
          profiles={[mockProfiles[0], mockProfiles[1]]}
          onToggle={vi.fn()}
          onEdit={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onSync={vi.fn()}
          onViewLogs={vi.fn()}
          onDiagnose={vi.fn()}
          onRepairCore={vi.fn()}
          onCreateNew={vi.fn()}
        />
      );

      // p1 有置顶
      expect(screen.getByText('置顶')).toBeInTheDocument();
      expect(screen.getByText('办公室 NAS')).toBeInTheDocument();

      // p1 描述有值并置于名称下方
      const p1Desc = screen.getByText('公司内网存储');
      expect(p1Desc).toBeInTheDocument();
      expect(p1Desc).toHaveClass('truncate');

      // p2 名称渲染正常
      expect(screen.getByText('家庭 Web 远程')).toBeInTheDocument();
    });

    it('上次启动读取 stats.startTime 并本地化显示，无值显示 —', () => {
      render(
        <ProfileList
          profiles={[mockProfiles[0], mockProfiles[2]]}
          onToggle={vi.fn()}
          onEdit={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onSync={vi.fn()}
          onViewLogs={vi.fn()}
          onDiagnose={vi.fn()}
          onRepairCore={vi.fn()}
          onCreateNew={vi.fn()}
        />
      );

      // p1 stats.startTime 有值
      const expectedTimeStr = new Date(1700000000000).toLocaleString('zh-CN', { hour12: false });
      expect(screen.getByText(expectedTimeStr)).toBeInTheDocument();

      // p3 没有 startTime，显示 —
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  describe('任务 4：规则预览、弹层与固定 SVG 操作列', () => {
    it('1~3 条规则纵向显示每条映射（type localPort → remotePort）；4 条规则显示前两条和“查看更多（+2 条）”', () => {
      render(
        <ProfileList
          profiles={[mockProfiles[0], mockProfiles[1], mockProfiles[2]]}
          onToggle={vi.fn()}
          onEdit={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onSync={vi.fn()}
          onViewLogs={vi.fn()}
          onDiagnose={vi.fn()}
          onRepairCore={vi.fn()}
          onCreateNew={vi.fn()}
        />
      );

      // p1: 1 条规则 TCP 5000 → 15000
      expect(screen.getByText('5000 → 15000')).toBeInTheDocument();

      // p2: 2 条规则 HTTP 80 → 8080 和 HTTPS 443 → 8443
      expect(screen.getByText('80 → 8080')).toBeInTheDocument();
      expect(screen.getByText('443 → 8443')).toBeInTheDocument();

      // p3: 4 条规则，显示前两条和查看更多（+2 条）
      expect(screen.getByText('1001 → 2001')).toBeInTheDocument();
      expect(screen.getByText('1002 → 2002')).toBeInTheDocument();
      expect(screen.getByText(/查看更多（\+2 条）/)).toBeInTheDocument();
      expect(screen.queryByText('1003 → 2003')).not.toBeInTheDocument();
    });

    it('点击规则预览区域打开规则详情弹层，展示全部规则', async () => {
      const user = userEvent.setup();
      render(
        <ProfileList
          profiles={[mockProfiles[2]]} // 4 条规则
          onToggle={vi.fn()}
          onEdit={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onSync={vi.fn()}
          onViewLogs={vi.fn()}
          onDiagnose={vi.fn()}
          onRepairCore={vi.fn()}
          onCreateNew={vi.fn()}
        />
      );

      const ruleBtn = screen.getByRole('button', { name: /查看 多规则服务 的穿透规则详情/ });
      await user.click(ruleBtn);

      // 弹层打开
      expect(screen.getByText('规则详情')).toBeInTheDocument();
      expect(screen.getByText('rule-1')).toBeInTheDocument();
      expect(screen.getByText('rule-2')).toBeInTheDocument();
      expect(screen.getByText('rule-3')).toBeInTheDocument();
      expect(screen.getByText('rule-4')).toBeInTheDocument();
    });

    it('操作列使用项目 SVG 图标按钮且无文字，运行中为停止图标，停止为启动图标，过渡为刷新图标', async () => {
      const user = userEvent.setup();
      const onToggle = vi.fn();
      const onRepairCore = vi.fn();
      const onViewLogs = vi.fn();

      render(
        <ProfileList
          profiles={[mockProfiles[0], mockProfiles[2], mockProfiles[3], mockProfiles[4], mockProfiles[5], mockProfiles[6]]}
          onToggle={onToggle}
          onEdit={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onSync={vi.fn()}
          onViewLogs={onViewLogs}
          onDiagnose={vi.fn()}
          onRepairCore={onRepairCore}
          onCreateNew={vi.fn()}
        />
      );

      // 运行中 (p1): 停止图标按钮，aria-label="停止连接"
      const stopBtn = screen.getByRole('button', { name: '停止连接' });
      expect(stopBtn).toBeInTheDocument();
      expect(stopBtn).not.toHaveTextContent('停止连接'); // 无文字
      await user.click(stopBtn);
      expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));

      // 已停止 (p3): 启动图标按钮，aria-label="启动连接"
      const startBtn = screen.getByRole('button', { name: '启动连接' });
      expect(startBtn).toBeInTheDocument();
      expect(startBtn).not.toHaveTextContent('启动连接'); // 无文字
      await user.click(startBtn);
      expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'p3' }));

      // 核心异常 (p4): 修复核心
      const repairBtn = screen.getByRole('button', { name: '修复 FRPC 核心' });
      expect(repairBtn).toBeInTheDocument();
      await user.click(repairBtn);
      expect(onRepairCore).toHaveBeenCalledTimes(1);

      // 早退异常 (p5): 查看日志
      const logBtn = screen.getByRole('button', { name: '查看启动日志' });
      expect(logBtn).toBeInTheDocument();
      await user.click(logBtn);
      expect(onViewLogs).toHaveBeenCalledWith(expect.objectContaining({ id: 'p5' }));

      // 启动中 (p6) 与 停止中 (p7): 禁用的刷新图标按钮
      const startingBtn = screen.getByRole('button', { name: '启动中...' });
      expect(startingBtn).toBeDisabled();
      const stoppingBtn = screen.getByRole('button', { name: '停止中...' });
      expect(stoppingBtn).toBeDisabled();
    });
  });

  describe('任务 5：严格批量工具条', () => {
    it('零选择时批量工具条完全不存在，且无“已选择 N 项”文字', () => {
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
        />
      );

      expect(screen.queryByText(/已选择/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /批量启动/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /批量停止/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /批量删除/ })).not.toBeInTheDocument();
    });

    it('全 stopped 选择时：批量启动与批量删除可用，批量停止禁用并有 Tooltip 提示', async () => {
      const user = userEvent.setup();
      const onBatchStart = vi.fn();
      const onBatchDelete = vi.fn();

      const stoppedProfiles = [
        makeProfile({ id: 'p-s1', name: '离线连接 1', status: 'stopped' }),
        makeProfile({ id: 'p-s2', name: '离线连接 2', status: 'stopped' }),
      ];

      render(
        <ProfileList
          profiles={stoppedProfiles}
          onBatchStart={onBatchStart}
          onBatchDelete={onBatchDelete}
          onToggle={vi.fn()}
          onEdit={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onSync={vi.fn()}
          onViewLogs={vi.fn()}
          onDiagnose={vi.fn()}
          onRepairCore={vi.fn()}
          onCreateNew={vi.fn()}
        />
      );

      // 勾选两项
      await user.click(screen.getByRole('checkbox', { name: '选择 离线连接 1' }));
      await user.click(screen.getByRole('checkbox', { name: '选择 离线连接 2' }));

      // 批量工具条出现且仅有删除、启动、停止三个操作（无移动分组、无已选择文字、无取消选择文字）
      expect(screen.queryByText(/已选择/)).not.toBeInTheDocument();
      expect(screen.queryByText('取消选择')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '移动分组' })).not.toBeInTheDocument();

      const startBtn = screen.getByRole('button', { name: '批量启动' });
      const deleteBtn = screen.getByRole('button', { name: '批量删除' });
      const stopBtn = screen.getByRole('button', { name: '批量停止' });

      expect(startBtn).not.toBeDisabled();
      expect(deleteBtn).not.toBeDisabled();
      expect(stopBtn).toBeDisabled();

      // 点击批量启动触发回调
      await user.click(startBtn);
      expect(onBatchStart).toHaveBeenCalledWith(stoppedProfiles);

      // 点击批量删除触发确认弹窗
      await user.click(deleteBtn);
      expect(screen.getByText('批量删除确认')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '确认删除' }));
      expect(onBatchDelete).toHaveBeenCalledWith(stoppedProfiles);
    });

    it('全 running 选择时：批量停止可用，批量启动与批量删除禁用', async () => {
      const user = userEvent.setup();
      const onBatchStop = vi.fn();

      const runningProfiles = [
        makeProfile({ id: 'p-r1', name: '运行连接 1', status: 'running' }),
        makeProfile({ id: 'p-r2', name: '运行连接 2', status: 'running' }),
      ];

      render(
        <ProfileList
          profiles={runningProfiles}
          onBatchStop={onBatchStop}
          onToggle={vi.fn()}
          onEdit={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onSync={vi.fn()}
          onViewLogs={vi.fn()}
          onDiagnose={vi.fn()}
          onRepairCore={vi.fn()}
          onCreateNew={vi.fn()}
        />
      );

      await user.click(screen.getByRole('checkbox', { name: '选择 运行连接 1' }));
      await user.click(screen.getByRole('checkbox', { name: '选择 运行连接 2' }));

      const startBtn = screen.getByRole('button', { name: '批量启动' });
      const deleteBtn = screen.getByRole('button', { name: '批量删除' });
      const stopBtn = screen.getByRole('button', { name: '批量停止' });

      expect(stopBtn).not.toBeDisabled();
      expect(startBtn).toBeDisabled();
      expect(deleteBtn).toBeDisabled();

      // 点击批量停止触发确认弹层
      await user.click(stopBtn);
      expect(screen.getByText('批量停止确认')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '确认停止' }));
      expect(onBatchStop).toHaveBeenCalledWith(runningProfiles);
    });

    it('混合状态选择时：启动、停止、删除三个批量按钮均被禁用', async () => {
      const user = userEvent.setup();
      const mixed = [
        makeProfile({ id: 'p-m1', name: '运行连接', status: 'running' }),
        makeProfile({ id: 'p-m2', name: '停止连接', status: 'stopped' }),
      ];

      render(
        <ProfileList
          profiles={mixed}
          onToggle={vi.fn()}
          onEdit={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onSync={vi.fn()}
          onViewLogs={vi.fn()}
          onDiagnose={vi.fn()}
          onRepairCore={vi.fn()}
          onCreateNew={vi.fn()}
        />
      );

      await user.click(screen.getByRole('checkbox', { name: '选择 运行连接' }));
      await user.click(screen.getByRole('checkbox', { name: '选择 停止连接' }));

      expect(screen.getByRole('button', { name: '批量启动' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '批量停止' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '批量删除' })).toBeDisabled();
    });

    it('isBatchOperating 为 true 时禁用所有批量按钮、选择框和单项操作', async () => {
      const testProfiles = [
        makeProfile({ id: 'p-1', name: '测试连接 1', status: 'stopped' }),
      ];

      render(
        <ProfileList
          profiles={testProfiles}
          isBatchOperating={true}
          onToggle={vi.fn()}
          onEdit={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          onSync={vi.fn()}
          onViewLogs={vi.fn()}
          onDiagnose={vi.fn()}
          onRepairCore={vi.fn()}
          onCreateNew={vi.fn()}
        />
      );

      // 选择框被禁用
      expect(screen.getByRole('checkbox', { name: '选择全部连接' })).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: '选择 测试连接 1' })).toBeDisabled();

      // 单项操作按钮被禁用
      expect(screen.getByRole('button', { name: '启动连接' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '删除连接' })).toBeDisabled();
    });
  });

  describe('顶部 4 个大盘指标卡片与异常引导', () => {
    it('在页面顶部渲染运行实例、在线穿透隧道、需要处理、FRP 核心引擎 4 个指标卡片', () => {
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
        />
      );

      expect(screen.getByText('运行实例')).toBeInTheDocument();
      expect(screen.getByText('在线穿透隧道')).toBeInTheDocument();
      expect(screen.getByText('需要处理')).toBeInTheDocument();
      expect(screen.getByText('FRP 核心引擎')).toBeInTheDocument();
    });
  });
});
