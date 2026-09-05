import { beforeEach, afterEach, expect, it, vi, describe } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './App';
import { makeProfile } from './test/fixtures';
import type { ProcessStatus } from './types/frp';

import { startProfileInstance, stopProfileInstance, isTauriEnv, getRuntimeStates, getRuntimeLogs, subscribeRuntimeEvents } from './services/ipc';

let stateEventHandler: ((event: any) => void) | null = null;
let runtimeLogHandler: ((event: any) => void) | null = null;

vi.mock('./services/ipc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/ipc')>();
  return {
    ...actual,
    isTauriEnv: vi.fn(() => true),
    getRuntimeStates: vi.fn(() => Promise.resolve([])),
    getRuntimeLogs: vi.fn(() => Promise.resolve([])),
    subscribeRuntimeEvents: vi.fn(async (onLog, onState) => {
      runtimeLogHandler = onLog || null;
      stateEventHandler = onState || null;
      return async () => {
        runtimeLogHandler = null;
        stateEventHandler = null;
      };
    }),
    startProfileInstance: vi.fn(),
    stopProfileInstance: vi.fn(),
    runServerPreflight: vi.fn(),
    runFrpsOperation: vi.fn(),
    storeFrpsSecrets: vi.fn(),
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
  vi.mocked(getRuntimeLogs).mockResolvedValue([]);
  vi.mocked(getRuntimeStates).mockResolvedValue([]);
});

it('根路径默认重定向并渲染“我的连接”工作台', async () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <AppLayout />
    </MemoryRouter>
  );
  expect(screen.getByRole('heading', { name: '我的连接' })).toBeInTheDocument();
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

  expect(screen.getByText(/处连接异常中断/)).toBeInTheDocument();
  const fixBtn = screen.getByRole('button', { name: '排查首个异常连接' });
  await user.click(fixBtn);

  expect(screen.getByText('网络节点连通性测试与延迟探测')).toBeInTheDocument();
  expect(screen.getByDisplayValue('err.example.test')).toBeInTheDocument();
});

it('未配置核心时启动方案跳转到核心管理且不显示启动成功', async () => {
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

it('从 A 打开诊断并探测 B，结果只更新 B', async () => {
  const user = userEvent.setup();
  const profileA = makeProfile({
    id: 'prof-a',
    name: '方案 A',
    status: 'error',
    config: {
      serverAddr: 'a.example.test',
      serverPort: 7000,
      proxies: [],
      visitors: [],
    },
    stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '握手失败' },
  });
  const profileB = makeProfile({
    id: 'prof-b',
    name: '方案 B',
    status: 'stopped',
    config: {
      serverAddr: 'b.example.test',
      serverPort: 7001,
      proxies: [],
      visitors: [],
    },
    stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
  });

  localStorage.setItem('frp_gui_profiles', JSON.stringify([profileA, profileB]));

  render(
    <MemoryRouter initialEntries={['/profiles']}>
      <AppLayout />
    </MemoryRouter>
  );

  // 从方案 A 卡片的“更多操作”下拉菜单中打开“网络连通性检测”
  const moreBtns = screen.getAllByRole('button', { name: '更多操作' });
  await user.click(moreBtns[0]);
  const diagnoseItem = await screen.findByText('网络连通性检测');
  await user.click(diagnoseItem);

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

it('从“我的连接”创建 RDP 连接，探测成功后弹窗关闭、列表出现新连接且页面不出现 Token 明文', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/profiles']}>
      <AppLayout />
    </MemoryRouter>
  );

  // 点击“新建连接”打开向导弹窗
  const createBtn = screen.getAllByRole('button', { name: /新建连接/ })[0];
  await user.click(createBtn);

  expect(screen.getByTestId('scenario-wizard')).toBeInTheDocument();
  expect(screen.getByText('选择应用场景')).toBeInTheDocument();

  // 选择 Windows 远程桌面场景
  await user.click(screen.getAllByText(/Windows 远程桌面/)[0]);
  await waitFor(() => expect(screen.getByLabelText(/服务器地址/)).toBeInTheDocument());

  // 编辑连接名称与服务器地址、Token
  const nameInput = screen.getByLabelText(/连接名称/);
  await user.clear(nameInput);
  await user.type(nameInput, '居家办公电脑');

  const serverInput = screen.getByLabelText(/服务器地址/);
  await user.clear(serverInput);
  await user.type(serverInput, 'rdp-e2e.frp.com');

  const tokenInput = screen.getByLabelText(/认证 Token/);
  await user.clear(tokenInput);
  await user.type(tokenInput, 'super_secret_e2e_token_999');

  // 点击“检查并保存”
  const saveBtn = screen.getByRole('button', { name: /检查并保存/ });
  await user.click(saveBtn);

  // 断言弹窗关闭、新连接出现在列表中
  await waitFor(() => {
    expect(screen.queryByTestId('scenario-wizard')).not.toBeInTheDocument();
    expect(screen.getByText('居家办公电脑')).toBeInTheDocument();
  });

  // 验证页面没有任何明文 Token 泄露
  expect(screen.queryByText('super_secret_e2e_token_999')).not.toBeInTheDocument();

  // 验证 localStorage 已持久化该连接且包含对应配置
  const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
  const rdpProfile = saved.find((p: any) => p.name === '居家办公电脑');
  expect(rdpProfile).toBeDefined();
  expect(rdpProfile.config.serverAddr).toBe('rdp-e2e.frp.com');
  expect(rdpProfile.config.proxies[0].remotePort).toBe(33389);
});

it('服务器节点仅持久化元数据，并能从侧边栏进入节点工作台', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/profiles']}>
      <AppLayout />
    </MemoryRouter>
  );

  await user.click(screen.getByRole('button', { name: /服务器节点/ }));
  expect(await screen.findByRole('heading', { name: '服务器节点' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '添加服务器节点' }));
  await user.type(screen.getByLabelText('节点名称'), '东京节点');
  await user.type(screen.getByLabelText('服务器地址'), '203.0.113.10');
  await user.clear(screen.getByLabelText('SSH 用户名'));
  await user.type(screen.getByLabelText('SSH 用户名'), 'ubuntu');
  await user.type(screen.getByLabelText('SSH 密码'), 'not-in-local-storage');
  await user.click(screen.getByRole('button', { name: '保存节点' }));

  await waitFor(() => expect(screen.getByText('东京节点')).toBeInTheDocument());
  const stored = localStorage.getItem('frp_gui_server_nodes') || '';
  expect(stored).toContain('东京节点');
  expect(stored).not.toContain('not-in-local-storage');
});

it('在服务器节点页面可触发 SSH 预检、确认指纹并在成功后更新为可部署', async () => {
  const user = userEvent.setup();
  const testNode = {
    id: 'node-app-test',
    name: '首尔云主机',
    host: '203.0.113.88',
    sshPort: 22,
    username: 'ubuntu',
    authMethod: 'password',
    credentialsRemembered: true,
    credentialRef: 'frp-gui/server-node/node-app-test',
    frpsBindPort: 7000,
    installDir: '/opt/frp',
    status: 'draft',
    isDefault: false,
    createdAt: 1,
    updatedAt: 1,
  };
  localStorage.setItem('frp_gui_server_nodes', JSON.stringify([testNode]));

  const { runServerPreflight } = await import('./services/ipc');
  vi.mocked(runServerPreflight)
    .mockResolvedValueOnce({
      outcome: 'needs_host_trust',
      hostKeyFingerprint: 'SHA256:seoul-host-fingerprint',
      checkedAt: 1_726_000_000_000,
    })
    .mockResolvedValueOnce({
      outcome: 'ready',
      hostKeyFingerprint: 'SHA256:seoul-host-fingerprint',
      os: 'ubuntu',
      architecture: 'amd64',
      privilege: 'root',
      systemd: true,
      checkedAt: 1_726_000_000_100,
    });

  render(
    <MemoryRouter initialEntries={['/servers']}>
      <AppLayout />
    </MemoryRouter>
  );

  expect(await screen.findByText('首尔云主机')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '检查连接：首尔云主机' }));
  await user.click(screen.getByRole('button', { name: '开始检查' }));

  expect(await screen.findByText('请确认 SSH 主机指纹')).toBeInTheDocument();
  expect(screen.getByText('SHA256:seoul-host-fingerprint')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '确认并继续检查' }));
  expect(await screen.findByText('服务器预检通过')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '完成' }));

  // 断言列表卡片呈现“可部署”
  expect(await screen.findByText('可部署')).toBeInTheDocument();

  // 断言 localStorage 中的节点已更新为 ready_to_deploy
  const savedNodes = JSON.parse(localStorage.getItem('frp_gui_server_nodes') || '[]');
  const updatedSeoul = savedNodes.find((n: any) => n.id === 'node-app-test');
  expect(updatedSeoul?.status).toBe('ready_to_deploy');
  expect(updatedSeoul?.trustedHostKeyFingerprint).toBe('SHA256:seoul-host-fingerprint');
  expect(updatedSeoul?.remoteOs).toBe('ubuntu');
});

it('从服务器节点卡片发起部署，成功后更新节点为运行中且 localStorage 绝不包含 Token 与密码', async () => {
  const user = userEvent.setup();
  const deployableNode = {
    id: 'node-app-deploy',
    name: '法兰克福节点',
    host: '203.0.113.88',
    sshPort: 22,
    username: 'ubuntu',
    authMethod: 'password',
    credentialsRemembered: true,
    credentialRef: 'frp-gui/server-node/node-app-deploy',
    frpsBindPort: 7000,
    installDir: '/opt/frp',
    status: 'ready_to_deploy',
    isDefault: false,
    trustedHostKeyFingerprint: 'SHA256:frankfurt-fingerprint',
    remoteOs: 'ubuntu',
    remoteArchitecture: 'amd64',
    privilege: 'sudo_passwordless',
    systemd: true,
    createdAt: 1,
    updatedAt: 1,
  };
  localStorage.setItem('frp_gui_server_nodes', JSON.stringify([deployableNode]));

  const { runFrpsOperation, storeFrpsSecrets } = await import('./services/ipc');
  vi.mocked(storeFrpsSecrets).mockResolvedValue(undefined);
  vi.mocked(runFrpsOperation).mockResolvedValue({
    operation: 'deploy',
    outcome: 'completed',
    serviceStatus: 'running',
    checkedAt: 1_726_000_000_200,
    deployment: {
      summary: {
        version: '0.71.0',
        bindPort: 7000,
        transportProtocol: 'tcp',
        tlsForce: true,
        dashboardEnabled: false,
      },
      serviceName: 'frp-gui-frps.service',
      installedAt: 1_726_000_000_200,
      enabled: true,
    },
  });

  render(
    <MemoryRouter initialEntries={['/servers']}>
      <AppLayout />
    </MemoryRouter>
  );

  expect(await screen.findByText('法兰克福节点')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '部署 FRPS：法兰克福节点' }));

  // 填写配置
  await user.type(screen.getByPlaceholderText('客户端连接服务端时必填的密钥'), 'super-secret-app-token-12345');
  await user.click(screen.getByRole('button', { name: '下一步：确认部署' }));
  await user.click(screen.getByRole('button', { name: '确认部署' }));

  // 完成
  await user.click(await screen.findByRole('button', { name: '完成' }));

  // 验证节点卡片呈现运行中
  expect(await screen.findByText('运行中')).toBeInTheDocument();

  // 验证 localStorage 持久化的节点数据不含秘密
  const rawSaved = localStorage.getItem('frp_gui_server_nodes') || '';
  expect(rawSaved).not.toContain('super-secret-app-token-12345');
  const savedNodes = JSON.parse(rawSaved);
  const updatedNode = savedNodes.find((n: any) => n.id === 'node-app-deploy');
  expect(updatedNode.status).toBe('running');
  expect(updatedNode.serviceStatus).toBe('running');
  expect(updatedNode.deployment?.summary.version).toBe('0.71.0');
});

it('未记住凭据节点部署后回写的 localStorage 拥有稳定公开 credentialRef，且绝无 Token、SSH 密码、私钥或 sudo 密码', async () => {
  const user = userEvent.setup();
  const unrememberedAppNode = {
    id: 'node-unremembered-app',
    name: '伦敦无凭据节点',
    host: '203.0.113.99',
    sshPort: 22,
    username: 'ubuntu',
    authMethod: 'password',
    credentialsRemembered: false,
    credentialRef: undefined, // 模拟未设置 credentialRef 的旧节点
    frpsBindPort: 7000,
    installDir: '/opt/frp',
    status: 'ready_to_deploy',
    isDefault: false,
    trustedHostKeyFingerprint: 'SHA256:london-fingerprint',
    remoteOs: 'ubuntu',
    remoteArchitecture: 'amd64',
    privilege: 'sudo_password_required',
    systemd: true,
    requiresSudoPassword: true,
    sudoCredentialsRemembered: false,
    createdAt: 1,
    updatedAt: 1,
  };
  localStorage.setItem('frp_gui_server_nodes', JSON.stringify([unrememberedAppNode]));

  const { runFrpsOperation, storeFrpsSecrets } = await import('./services/ipc');
  vi.mocked(storeFrpsSecrets).mockResolvedValue(undefined);
  vi.mocked(runFrpsOperation).mockResolvedValue({
    operation: 'deploy',
    outcome: 'completed',
    serviceStatus: 'running',
    checkedAt: 1_726_000_000_300,
    deployment: {
      summary: {
        version: '0.71.0',
        bindPort: 7000,
        transportProtocol: 'tcp',
        tlsForce: true,
        dashboardEnabled: false,
      },
      serviceName: 'frp-gui-frps.service',
      installedAt: 1_726_000_000_300,
      enabled: true,
    },
  });

  render(
    <MemoryRouter initialEntries={['/servers']}>
      <AppLayout />
    </MemoryRouter>
  );

  expect(await screen.findByText('伦敦无凭据节点')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '部署 FRPS：伦敦无凭据节点' }));

  // 录入一次性凭据
  await user.type(screen.getByPlaceholderText('请输入 SSH 密码'), 'one-time-app-ssh-secret');
  await user.type(screen.getByPlaceholderText('客户端连接服务端时必填的密钥'), 'one-time-app-frp-token');
  await user.type(screen.getByPlaceholderText('执行远程 systemd 管理需要 sudo 密码'), 'one-time-app-sudo-secret');

  await user.click(screen.getByRole('button', { name: '下一步：确认部署' }));
  await user.click(screen.getByRole('button', { name: '确认部署' }));

  // 完成
  await user.click(await screen.findByRole('button', { name: '完成' }));

  // 验证节点卡片呈现运行中
  expect(await screen.findByText('运行中')).toBeInTheDocument();

  // 验证 storeFrpsSecrets 被调用并使用衍生出来的稳定 credentialRef
  expect(storeFrpsSecrets).toHaveBeenCalledWith('frp-gui/server-node/node-unremembered-app', expect.objectContaining({
    authToken: 'one-time-app-frp-token',
  }));

  // 验证 localStorage 持久化的节点仅有公开 credentialRef，且绝无任何秘密
  const rawSaved = localStorage.getItem('frp_gui_server_nodes') || '';
  expect(rawSaved).toContain('"credentialRef":"frp-gui/server-node/node-unremembered-app"');
  expect(rawSaved).not.toContain('one-time-app-ssh-secret');
  expect(rawSaved).not.toContain('one-time-app-frp-token');
  expect(rawSaved).not.toContain('one-time-app-sudo-secret');
  const savedNodes = JSON.parse(rawSaved);
  const updatedNode = savedNodes.find((n: any) => n.id === 'node-unremembered-app');
  expect(updatedNode.credentialRef).toBe('frp-gui/server-node/node-unremembered-app');
  expect(updatedNode.status).toBe('running');
});

describe('Task 3: FRPC 桌面端真实生命周期与状态收敛', () => {
  const setupTestProfileAndCore = (status: ProcessStatus = 'stopped') => {
    const testProfile = makeProfile({
      id: 'prof-lifecycle',
      name: '生命周期测试方案',
      status,
      config: { serverAddr: 'test.frp.com', serverPort: 7000, proxies: [], visitors: [] },
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
    });
    const testCore = {
      id: 'core-test',
      name: '测试核心',
      version: '0.61.1',
      path: 'C:\\tools\\frpc.exe',
      family: 'frpc',
      status: 'installed',
    };
    localStorage.setItem('frp_gui_profiles', JSON.stringify([testProfile]));
    localStorage.setItem('frp_gui_cores', JSON.stringify([testCore]));
    localStorage.setItem('frp_gui_active_core_id', 'core-test');
    return { testProfile, testCore };
  };

  it('启动请求被接受后只显示启动中，收到 running 事件后才显示运行中', async () => {
    const user = userEvent.setup();
    (startProfileInstance as any).mockResolvedValue({ accepted: true, pid: 8123 });
    setupTestProfileAndCore('stopped');

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    const startBtn = await screen.findByRole('button', { name: '启动连接' });
    await user.click(startBtn);

    // 启动请求被接受后只能保持 starting，显示“启动中...”且按钮禁用
    const startingBtn = screen.getByRole('button', { name: /启动中/ });
    expect(startingBtn).toBeInTheDocument();
    expect(startingBtn).toBeDisabled();
    // 绝不因 Promise resolve 直接呈现“运行中”
    expect(screen.queryByText(/运行中 \(PID/)).not.toBeInTheDocument();

    // 模拟后端事件派发 running
    expect(stateEventHandler).not.toBeNull();
    stateEventHandler!({
      profileId: 'prof-lifecycle',
      status: 'running',
      pid: 8123,
      timestamp: Date.now(),
    });

    // 收到真实 running 事件后才显示运行中
    expect(await screen.findByText(/运行中 \(PID: 8123\)/)).toBeInTheDocument();
  });

  it('启动响应成功但 running 事件缺失时，运行时快照仍使卡片收敛到运行中', async () => {
    const user = userEvent.setup();
    (startProfileInstance as any).mockResolvedValue({ accepted: true, pid: 8123 });
    (getRuntimeStates as any)
      .mockResolvedValueOnce([]) // App 初次挂载快照
      .mockResolvedValueOnce([
        { profileId: 'prof-lifecycle', status: 'running', pid: 8123, timestamp: Date.now() },
      ]);
    setupTestProfileAndCore('stopped');

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole('button', { name: '启动连接' }));

    expect(await screen.findByText(/运行中 \(PID: 8123\)/)).toBeInTheDocument();
    expect(stateEventHandler).not.toBeNull();
  });

  it('启动确认阶段失败或运行期意外退出绝不显示运行中', async () => {
    const user = userEvent.setup();
    (startProfileInstance as any).mockResolvedValue({
      accepted: false,
      error: 'FRPC 在启动确认阶段退出，请查看桌面端真实日志',
    });
    setupTestProfileAndCore('stopped');

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    const startBtn = await screen.findByRole('button', { name: '启动连接' });
    await user.click(startBtn);

    // 启动确认失败，直接落入 error，显示查看启动日志，绝不显示运行中
    expect(await screen.findByRole('button', { name: '查看启动日志' })).toBeInTheDocument();
    expect(screen.queryByText(/运行中 \(PID/)).not.toBeInTheDocument();
  });

  it('停止请求后若快照为 stopping 则保持停止中，收到 stopped 事件后变已停止', async () => {
    const user = userEvent.setup();
    (getRuntimeStates as any)
      .mockResolvedValueOnce([{ profileId: 'prof-lifecycle', status: 'running', pid: 8123, timestamp: 1 }])
      .mockResolvedValue([{ profileId: 'prof-lifecycle', status: 'stopping', timestamp: 2 }]);
    (stopProfileInstance as any).mockResolvedValue({ accepted: true });
    setupTestProfileAndCore('running');

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    const stopBtn = await screen.findByRole('button', { name: '停止连接' });
    await user.click(stopBtn);

    // 停止请求被接受且快照为 stopping，显示“停止中...”且按钮禁用
    const stoppingBtn = screen.getByRole('button', { name: /停止中/ });
    expect(stoppingBtn).toBeInTheDocument();
    expect(stoppingBtn).toBeDisabled();
    // 绝不因 Promise resolve 直接呈现启动连接
    expect(screen.queryByRole('button', { name: '启动连接' })).not.toBeInTheDocument();

    // 模拟后端事件派发 stopped
    expect(stateEventHandler).not.toBeNull();
    stateEventHandler!({
      profileId: 'prof-lifecycle',
      status: 'stopped',
      timestamp: Date.now(),
    });

    // 收到真实 stopped 事件后才显示启动连接
    expect(await screen.findByRole('button', { name: '启动连接' })).toBeInTheDocument();
  });

  it('启动日志事件缺失时仍从后端快照显示 FRPC 启动输出', async () => {
    (startProfileInstance as any).mockResolvedValue({ accepted: true, pid: 8123 });
    (getRuntimeStates as any).mockResolvedValue([{ profileId: 'prof-lifecycle', status: 'running', pid: 8123, timestamp: Date.now() }]);
    (getRuntimeLogs as any).mockResolvedValue([{ sequence: 1, profileId: 'prof-lifecycle', timestamp: '2026-09-04 16:18:19', level: 'info', message: 'login to server success' }]);
    setupTestProfileAndCore('stopped');
    render(<MemoryRouter initialEntries={['/profiles']}><AppLayout /></MemoryRouter>);

    await userEvent.setup().click(await screen.findByRole('button', { name: '启动连接' }));
    await userEvent.setup().click(screen.getByRole('button', { name: /实时日志/ }));
    expect(await screen.findByText('login to server success')).toBeInTheDocument();
  });

  it('停止成功但 stopped 事件缺失时由快照收敛为已停止', async () => {
    (stopProfileInstance as any).mockResolvedValue({ accepted: true });
    (getRuntimeStates as any)
      .mockResolvedValueOnce([{ profileId: 'prof-lifecycle', status: 'running', pid: 8123, timestamp: 1 }])
      .mockResolvedValue([{ profileId: 'prof-lifecycle', status: 'stopped', timestamp: 2 }]);
    setupTestProfileAndCore('running');
    render(<MemoryRouter initialEntries={['/profiles']}><AppLayout /></MemoryRouter>);

    await userEvent.setup().click(await screen.findByRole('button', { name: '停止连接' }));
    expect(await screen.findByRole('button', { name: '启动连接' })).toBeInTheDocument();
  });

  it('浏览器模式点击启动被阻断且 profile 保持原状态，不产生成功 Toast', async () => {
    const user = userEvent.setup();
    (isTauriEnv as any).mockReturnValue(false);
    (startProfileInstance as any).mockResolvedValue({
      accepted: false,
      error: 'FRPC 运行功能仅可在桌面版应用中使用',
    });
    setupTestProfileAndCore('stopped');

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    const startBtn = await screen.findByRole('button', { name: '启动连接' });
    await user.click(startBtn);

    // 浏览器模式下 profile 状态保持原样 (stopped)，未变成 starting 或 error
    expect(screen.getByRole('button', { name: '启动连接' })).toBeInTheDocument();
    expect(screen.getAllByText('已停止').length).toBeGreaterThan(0);
    expect(screen.queryByText(/已成功启动/)).not.toBeInTheDocument();
    expect(await screen.findByText('FRPC 运行功能仅可在桌面版应用中使用')).toBeInTheDocument();

    // 恢复 isTauriEnv
    (isTauriEnv as any).mockReturnValue(true);
  });

  it('应用启动时把 localStorage 中残留的 starting/running/stopping 状态安全归一为 stopped', async () => {
    (getRuntimeStates as any).mockResolvedValue([]);
    const profStarting = makeProfile({ id: 'p-start', name: '方案1', status: 'starting' });
    const profRunning = makeProfile({ id: 'p-run', name: '方案2', status: 'running' });
    const profStopping = makeProfile({ id: 'p-stop', name: '方案3', status: 'stopping' });

    localStorage.setItem('frp_gui_profiles', JSON.stringify([profStarting, profRunning, profStopping]));

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    // 页面加载后，3 个方案均应归一为 stopped，且 lastError 包含提示
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
      expect(saved[0].status).toBe('stopped');
      expect(saved[0].stats.lastError).toContain('桌面端已重新启动，请重新启动连接');
      expect(saved[1].status).toBe('stopped');
      expect(saved[1].stats.lastError).toContain('桌面端已重新启动，请重新启动连接');
      expect(saved[2].status).toBe('stopped');
      expect(saved[2].stats.lastError).toContain('桌面端已重新启动，请重新启动连接');
    });
  });

  it('较旧快照绝不能覆盖较新的 running 事件（解决快照与事件订阅竞态）', async () => {
    let resolveSnapshot: (states: any[]) => void;
    (getRuntimeStates as any).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSnapshot = resolve;
        })
    );

    setupTestProfileAndCore('stopped');

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    // 订阅建立后，先收到 timestamp 更大的 running 事件 (timestamp: 2000)
    await waitFor(() => expect(stateEventHandler).not.toBeNull());
    stateEventHandler!({
      profileId: 'prof-lifecycle',
      status: 'running',
      pid: 9999,
      timestamp: 2000,
    });

    // 此时页面已变为 running
    expect(await screen.findByText(/运行中 \(PID: 9999\)/)).toBeInTheDocument();

    // 较早发起但延迟返回的 stopped 快照 (timestamp: 1000) 此时才 resolve
    resolveSnapshot!([
      {
        profileId: 'prof-lifecycle',
        status: 'stopped',
        timestamp: 1000,
      },
    ]);

    // 验证旧快照未将状态回退为 stopped，依然是 running
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText(/运行中 \(PID: 9999\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '启动连接' })).not.toBeInTheDocument();
  });

  it('收到 running 事件时会写入 stats.startTime', async () => {
    setupTestProfileAndCore('stopped');

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    await waitFor(() => expect(stateEventHandler).not.toBeNull());

    const beforeEmit = Date.now();
    stateEventHandler!({
      profileId: 'prof-lifecycle',
      status: 'running',
      pid: 8888,
      timestamp: Date.now(),
    });

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
      const target = saved.find((p: any) => p.id === 'prof-lifecycle');
      expect(target).toBeDefined();
      expect(target.status).toBe('running');
      expect(target.stats.pid).toBe(8888);
      expect(typeof target.stats.startTime).toBe('number');
      expect(target.stats.startTime).toBeGreaterThanOrEqual(beforeEmit);
    });
  });

  it('一键全部启动仅处理 stopped 与 error 方案，严格排除 starting、running、stopping', async () => {
    const user = userEvent.setup();
    (startProfileInstance as any).mockResolvedValue({ accepted: true });

    (getRuntimeStates as any).mockResolvedValue([
      { profileId: 'p-starting', status: 'starting', timestamp: 100 },
      { profileId: 'p-running', status: 'running', pid: 1234, timestamp: 100 },
      { profileId: 'p-stopping', status: 'stopping', timestamp: 100 },
    ]);

    const pStopped = makeProfile({ id: 'p-stopped', name: '方案-已停止', status: 'stopped' });
    const pError = makeProfile({ id: 'p-error', name: '方案-错误', status: 'error' });
    const pStarting = makeProfile({ id: 'p-starting', name: '方案-启动中', status: 'starting' });
    const pRunning = makeProfile({ id: 'p-running', name: '方案-运行中', status: 'running' });
    const pStopping = makeProfile({ id: 'p-stopping', name: '方案-停止中', status: 'stopping' });

    localStorage.setItem(
      'frp_gui_profiles',
      JSON.stringify([pStopped, pError, pStarting, pRunning, pStopping])
    );
    const testCore = {
      id: 'core-test',
      name: '测试核心',
      version: '0.61.1',
      path: 'C:\\tools\\frpc.exe',
      family: 'frpc',
      status: 'installed',
    };
    localStorage.setItem('frp_gui_cores', JSON.stringify([testCore]));
    localStorage.setItem('frp_gui_active_core_id', 'core-test');

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    const startAllBtn = await screen.findByRole('button', { name: '全部启动' });
    await user.click(startAllBtn);

    // 验证 startProfileInstance 仅对 pStopped 和 pError 被调用
    await waitFor(() => {
      const calledProfileIds = (startProfileInstance as any).mock.calls.map(
        (call: any) => call[0].id
      );
      expect(calledProfileIds).toContain('p-stopped');
      expect(calledProfileIds).toContain('p-error');
      expect(calledProfileIds).not.toContain('p-starting');
      expect(calledProfileIds).not.toContain('p-running');
      expect(calledProfileIds).not.toContain('p-stopping');
    });
  });

  it('异步订阅在组件卸载后会立即解绑，防止监听器泄漏', async () => {
    let resolveSubscribe: ((unlisten: any) => void) | null = null;
    const mockUnlisten = vi.fn().mockResolvedValue(undefined);
    (subscribeRuntimeEvents as any).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSubscribe = resolve;
        })
    );

    const { unmount } = render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    // 在订阅 resolve 之前就卸载组件
    unmount();

    // 随后订阅异步完成
    expect(resolveSubscribe).not.toBeNull();
    resolveSubscribe!(mockUnlisten);

    // 必须立即调用 unlisten 进行解绑
    await waitFor(() => {
      expect(mockUnlisten).toHaveBeenCalled();
    });
  });

  describe('Task 3: Error card action routing and failureKind lifecycle', () => {
    it('核心校验失败显示“修复 FRPC 核心”，点击后进入核心管理，不打开网络诊断', async () => {
      const user = userEvent.setup();
      const mockCore = {
        id: 'c1',
        name: 'test-core',
        version: 'v0.71.0',
        arch: 'x64',
        os: 'windows',
        path: 'C:\\frp\\frpc.exe',
        status: 'ready' as const,
        isDefault: true,
      };
      const testProfile = makeProfile({
        id: 'prof-core-invalid',
        name: '核心损坏连接',
        status: 'stopped',
        config: { serverAddr: '1.2.3.4', serverPort: 7000, proxies: [], visitors: [] },
        stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
      });

      localStorage.setItem('frp_gui_cores', JSON.stringify([mockCore]));
      localStorage.setItem('frp_gui_active_core_id', 'c1');
      localStorage.setItem('frp_gui_profiles', JSON.stringify([testProfile]));

      vi.mocked(startProfileInstance).mockResolvedValueOnce({
        accepted: false,
        failureKind: 'core_invalid',
        error: '核心程序校验失败',
      });

      render(
        <MemoryRouter initialEntries={['/profiles']}>
          <AppLayout />
        </MemoryRouter>
      );

      // 点击启动
      const startBtn = await screen.findByRole('button', { name: '启动连接' });
      await user.click(startBtn);

      // 断言主按钮变为“修复 FRPC 核心”
      const repairBtn = await screen.findByRole('button', { name: '修复 FRPC 核心' });
      expect(repairBtn).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '立即排查' })).not.toBeInTheDocument();

      // 点击“修复 FRPC 核心”
      await user.click(repairBtn);

      // 断言导航到 /cores 且展示核心引擎管理，绝无网络诊断弹窗
      expect(await screen.findByText('FRP 核心引擎管理')).toBeInTheDocument();
      expect(screen.queryByText('网络节点连通性测试与延迟探测')).not.toBeInTheDocument();
    });

    it('启动确认期早退显示“查看启动日志”，点击后按方案过滤日志', async () => {
      const user = userEvent.setup();
      const mockCore = {
        id: 'c1',
        name: 'test-core',
        version: 'v0.71.0',
        arch: 'x64',
        os: 'windows',
        path: 'C:\\frp\\frpc.exe',
        status: 'ready' as const,
        isDefault: true,
      };
      const testProfile = makeProfile({
        id: 'prof-early-exit',
        name: '早退连接',
        status: 'stopped',
        config: { serverAddr: '1.2.3.4', serverPort: 7000, proxies: [], visitors: [] },
        stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
      });

      localStorage.setItem('frp_gui_cores', JSON.stringify([mockCore]));
      localStorage.setItem('frp_gui_active_core_id', 'c1');
      localStorage.setItem('frp_gui_profiles', JSON.stringify([testProfile]));

      vi.mocked(startProfileInstance).mockResolvedValueOnce({
        accepted: false,
        failureKind: 'early_exit',
        error: 'FRPC 在启动确认阶段退出',
      });

      render(
        <MemoryRouter initialEntries={['/profiles']}>
          <AppLayout />
        </MemoryRouter>
      );

      // 点击启动
      const startBtn = await screen.findByRole('button', { name: '启动连接' });
      await user.click(startBtn);

      // 断言主按钮变为“查看启动日志”
      const viewLogsBtn = await screen.findByRole('button', { name: '查看启动日志' });
      expect(viewLogsBtn).toBeInTheDocument();

      // 点击“查看启动日志”
      await user.click(viewLogsBtn);

      // 断言导航至日志界面并携带 profileId 过滤
      expect(await screen.findByText('实时日志监控')).toBeInTheDocument();
      expect(await screen.findByText(/早退连接 \(frpc\)/)).toBeInTheDocument();
    });

    it('启动失败时 App 保存 stats.lastFailureKind；运行中或已停止状态必须清除该字段', async () => {
      const user = userEvent.setup();
      const mockCore = {
        id: 'c1',
        name: 'test-core',
        version: 'v0.71.0',
        arch: 'x64',
        os: 'windows',
        path: 'C:\\frp\\frpc.exe',
        status: 'ready' as const,
        isDefault: true,
      };
      const testProfile = makeProfile({
        id: 'prof-lifecycle',
        name: '生命周期连接',
        status: 'stopped',
        config: { serverAddr: '1.2.3.4', serverPort: 7000, proxies: [], visitors: [] },
        stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
      });

      localStorage.setItem('frp_gui_cores', JSON.stringify([mockCore]));
      localStorage.setItem('frp_gui_active_core_id', 'c1');
      localStorage.setItem('frp_gui_profiles', JSON.stringify([testProfile]));

      vi.mocked(startProfileInstance).mockResolvedValueOnce({
        accepted: false,
        failureKind: 'core_invalid',
        error: '核心错误',
      });

      render(
        <MemoryRouter initialEntries={['/profiles']}>
          <AppLayout />
        </MemoryRouter>
      );

      // 启动并失败
      const startBtn = await screen.findByRole('button', { name: '启动连接' });
      await user.click(startBtn);

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
        const p = saved.find((item: any) => item.id === 'prof-lifecycle');
        expect(p?.stats?.lastFailureKind).toBe('core_invalid');
      });

      // 模拟收到运行中事件 -> lastFailureKind 必须被清除
      stateEventHandler?.({
        profileId: 'prof-lifecycle',
        status: 'running',
        pid: 9999,
        timestamp: Date.now() + 100,
      });

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
        const p = saved.find((item: any) => item.id === 'prof-lifecycle');
        expect(p?.stats?.lastFailureKind).toBeUndefined();
      });

      // 模拟收到停止事件 -> lastFailureKind 仍必须为 undefined
      stateEventHandler?.({
        profileId: 'prof-lifecycle',
        status: 'stopped',
        timestamp: Date.now() + 200,
      });

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
        const p = saved.find((item: any) => item.id === 'prof-lifecycle');
        expect(p?.stats?.lastFailureKind).toBeUndefined();
      });
    });
  });

  it('从连接页启动后进入日志页仍显示已收到的运行日志', async () => {
    let runtimeLogHandler: ((event: any) => void) | undefined;
    (subscribeRuntimeEvents as any).mockImplementationOnce(async (onLog: any, onState: any) => {
      runtimeLogHandler = onLog;
      stateEventHandler = onState;
      return async () => {};
    });

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );
    await waitFor(() => expect(runtimeLogHandler).toBeDefined());
    runtimeLogHandler!({
      sequence: 1,
      profileId: 'profile_1',
      timestamp: '2026-09-04 14:27:17',
      level: 'warn',
      message: '[backend-8009] Start error: port already used',
    });

    await userEvent.setup().click(screen.getByRole('button', { name: /实时日志/ }));
    expect(await screen.findByText(/port already used/)).toBeInTheDocument();
  });

  it('重新启动连接时清除上一次记录的 lastWarning 警告信息', async () => {
    const user = userEvent.setup();
    const testProfile = makeProfile({
      id: 'prof-lifecycle',
      name: '生命周期测试方案',
      status: 'stopped',
      config: { serverAddr: 'test.frp.com', serverPort: 7000, proxies: [], visitors: [] },
      stats: {
        bytesIn: 0,
        bytesOut: 0,
        curConns: 0,
        uptimeSeconds: 0,
        lastWarning: '远程端口 8009 已被占用',
      },
    });
    const testCore = {
      id: 'core-test',
      name: '测试核心',
      version: '0.61.1',
      path: 'C:\\tools\\frpc.exe',
      family: 'frpc',
      status: 'installed',
    };
    localStorage.setItem('frp_gui_profiles', JSON.stringify([testProfile]));
    localStorage.setItem('frp_gui_cores', JSON.stringify([testCore]));
    localStorage.setItem('frp_gui_active_core_id', 'core-test');

    (startProfileInstance as any).mockResolvedValue({ accepted: true, pid: 8123 });

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    // 点击启动连接
    const startBtn = await screen.findByRole('button', { name: '启动连接' });
    await user.click(startBtn);

    // 启动中卡片不再显示旧 warning
    expect(screen.queryByText('远程端口 8009 已被占用')).not.toBeInTheDocument();
  });

  it('运行中的连接收到 stopped 状态事件或快照时清除 stats.lastWarning', async () => {
    setupTestProfileAndCore('stopped');

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    // 转换为运行中并触发警告日志
    await waitFor(() => expect(stateEventHandler).not.toBeNull());
    stateEventHandler!({
      profileId: 'prof-lifecycle',
      status: 'running',
      pid: 8123,
      timestamp: Date.now(),
    });
    runtimeLogHandler!({
      sequence: 1,
      profileId: 'prof-lifecycle',
      timestamp: '14:27:17',
      level: 'warn',
      message: '远程端口 8009 已被占用',
    });

    // 确认卡片显示警告
    expect(await screen.findByText(/远程端口 8009 已被占用/)).toBeInTheDocument();

    // 收到 stopped 状态事件
    stateEventHandler!({
      profileId: 'prof-lifecycle',
      status: 'stopped',
      timestamp: Date.now() + 100,
    });

    // 停止后警告必须被清除，且已写回到 localStorage
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
      const target = saved.find((p: any) => p.id === 'prof-lifecycle');
      expect(target.status).toBe('stopped');
      expect(target.stats.lastWarning).toBeUndefined();
    });
    expect(screen.queryByText(/远程端口 8009 已被占用/)).not.toBeInTheDocument();
  });

  it('运行中的连接点击停止进入 stopping 状态时立即清除 stats.lastWarning', async () => {
    const user = userEvent.setup();
    setupTestProfileAndCore('stopped');
    (stopProfileInstance as any).mockResolvedValue({ accepted: true });

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    // 转换为运行中并触发警告日志
    await waitFor(() => expect(stateEventHandler).not.toBeNull());
    stateEventHandler!({
      profileId: 'prof-lifecycle',
      status: 'running',
      pid: 8123,
      timestamp: Date.now(),
    });
    runtimeLogHandler!({
      sequence: 1,
      profileId: 'prof-lifecycle',
      timestamp: '14:27:17',
      level: 'warn',
      message: '远程端口 8009 已被占用',
    });

    expect(await screen.findByText(/远程端口 8009 已被占用/)).toBeInTheDocument();

    // 点击停止连接
    const stopBtn = screen.getByRole('button', { name: '停止连接' });
    await user.click(stopBtn);

    // stopping 状态下警告条应立即消失，且 localStorage 中 lastWarning 亦被清理
    expect(screen.queryByText(/远程端口 8009 已被占用/)).not.toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
      const target = saved.find((p: any) => p.id === 'prof-lifecycle');
      expect(target.status).toBe('stopping');
      expect(target.stats.lastWarning).toBeUndefined();
    });
  });

  it('应用初始化时把 localStorage 中残留的 lastWarning 字段清空，保证仅有运行期语义', async () => {
    const testProfile = makeProfile({
      id: 'prof-lifecycle',
      name: '已停止方案',
      status: 'stopped',
      stats: {
        bytesIn: 0,
        bytesOut: 0,
        curConns: 0,
        uptimeSeconds: 0,
        lastWarning: '残留的陈旧警告',
      },
    });
    localStorage.setItem('frp_gui_profiles', JSON.stringify([testProfile]));

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('frp_gui_profiles') || '[]');
      const target = saved.find((p: any) => p.id === 'prof-lifecycle');
      expect(target.stats.lastWarning).toBeUndefined();
    });
  });

  it('重启同一方案时清除旧运行期日志，新日志不足旧条数时旧尾部日志不再显示', async () => {
    const user = userEvent.setup();
    setupTestProfileAndCore('stopped');
    (startProfileInstance as any).mockResolvedValue({ accepted: true, pid: 8123 });
    (stopProfileInstance as any).mockResolvedValue({ accepted: true });

    render(
      <MemoryRouter initialEntries={['/profiles']}>
        <AppLayout />
      </MemoryRouter>
    );

    // 1. 第一次启动方案并产生 4 条日志 (sequence 1..4)
    await waitFor(() => expect(stateEventHandler).not.toBeNull());
    stateEventHandler!({
      profileId: 'prof-lifecycle',
      status: 'running',
      pid: 8123,
      timestamp: Date.now(),
    });

    runtimeLogHandler!({
      sequence: 1,
      profileId: 'prof-lifecycle',
      timestamp: '14:27:17',
      level: 'info',
      message: '第一次运行日志 1',
    });
    runtimeLogHandler!({
      sequence: 2,
      profileId: 'prof-lifecycle',
      timestamp: '14:27:18',
      level: 'info',
      message: '第一次运行日志 2',
    });
    runtimeLogHandler!({
      sequence: 3,
      profileId: 'prof-lifecycle',
      timestamp: '14:27:19',
      level: 'info',
      message: '第一次运行日志 3 - 旧尾部',
    });
    runtimeLogHandler!({
      sequence: 4,
      profileId: 'prof-lifecycle',
      timestamp: '14:27:20',
      level: 'info',
      message: '第一次运行日志 4 - 旧尾部',
    });

    // 2. 停止方案
    stateEventHandler!({
      profileId: 'prof-lifecycle',
      status: 'stopped',
      timestamp: Date.now(),
    });

    // 3. 点击重新启动连接
    const startBtn = await screen.findByRole('button', { name: '启动连接' });
    await user.click(startBtn);

    // 4. 第二次运行仅产生了 2 条日志 (sequence 1..2)
    stateEventHandler!({
      profileId: 'prof-lifecycle',
      status: 'running',
      pid: 8124,
      timestamp: Date.now(),
    });
    runtimeLogHandler!({
      sequence: 1,
      profileId: 'prof-lifecycle',
      timestamp: '14:28:01',
      level: 'info',
      message: '第二次运行日志 1',
    });
    runtimeLogHandler!({
      sequence: 2,
      profileId: 'prof-lifecycle',
      timestamp: '14:28:02',
      level: 'info',
      message: '第二次运行日志 2',
    });

    // 5. 切换至日志页面验证：仅存在第二次运行的 2 条日志，第一次运行的旧尾部日志彻底消除
    const logsBtn = screen.getByRole('button', { name: /实时日志/ });
    await user.click(logsBtn);

    expect(await screen.findByText('第二次运行日志 1')).toBeInTheDocument();
    expect(await screen.findByText('第二次运行日志 2')).toBeInTheDocument();
    expect(screen.queryByText('第一次运行日志 3 - 旧尾部')).not.toBeInTheDocument();
    expect(screen.queryByText('第一次运行日志 4 - 旧尾部')).not.toBeInTheDocument();
  });
});


