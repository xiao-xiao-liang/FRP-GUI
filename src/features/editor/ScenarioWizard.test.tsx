import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScenarioWizard } from './ScenarioWizard';
import { testServerConnectivity } from '../../services/ipc';
import { FrpCore } from '../../types/frp';

vi.mock('../../services/ipc', () => ({
  testServerConnectivity: vi.fn(),
}));

const mockActiveCore: FrpCore = {
  id: 'core-1',
  name: 'frpc_v0.61.0',
  version: '0.61.0',
  arch: 'amd64',
  os: 'windows',
  path: '/usr/local/bin/frpc',
  isDefault: true,
  isCustom: false,
  status: 'ready',
};

describe('ScenarioWizard (场景向导组件)', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();
  const mockOnSwitch = vi.fn();
  
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('填写表单并通过探测后成功保存（使用默认连接名称）', async () => {
    vi.mocked(testServerConnectivity).mockResolvedValueOnce({
      status: 'success', server: 'test.frp.com', port: 7000, latencyMs: 10, timestamp: ''
    });

    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/Windows 远程桌面/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/服务器地址/)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/服务器地址/));
    await userEvent.type(screen.getByLabelText(/服务器地址/), 'test.frp.com');
    await userEvent.clear(screen.getByLabelText(/服务器端口/));
    await userEvent.type(screen.getByLabelText(/服务器端口/), '7000');
    await userEvent.clear(screen.getByLabelText(/认证 Token/));
    await userEvent.type(screen.getByLabelText(/认证 Token/), 'secret123');

    fireEvent.click(screen.getByRole('button', { name: /检查并保存/ }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });

    const savedProfile = mockOnSave.mock.calls[0][0];
    expect(savedProfile.name).toBe('我的 Windows 远程桌面');
    expect(savedProfile.config.serverAddr).toBe('test.frp.com');
    expect(savedProfile.config.proxies[0].remotePort).toBe(33389);
  });

  it('支持自定义修改“连接名称”并保存', async () => {
    vi.mocked(testServerConnectivity).mockResolvedValueOnce({
      status: 'success', server: 'work.frp.com', port: 7000, latencyMs: 12, timestamp: ''
    });

    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/Windows 远程桌面/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/连接名称/)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/连接名称/));
    await userEvent.type(screen.getByLabelText(/连接名称/), '办公室电脑RDP');

    await userEvent.clear(screen.getByLabelText(/服务器地址/));
    await userEvent.type(screen.getByLabelText(/服务器地址/), 'work.frp.com');

    fireEvent.click(screen.getByRole('button', { name: /检查并保存/ }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });

    const savedProfile = mockOnSave.mock.calls[0][0];
    expect(savedProfile.name).toBe('办公室电脑RDP');
  });

  it('未配置核心时在表单顶部展示非阻断黄色提示', async () => {
    render(
      <ScenarioWizard 
        activeCore={null}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/Windows 远程桌面/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/服务器地址/)).toBeInTheDocument());

    expect(screen.getByText(/未检测到可用 FRP 核心/)).toBeInTheDocument();
  });

  it('探测失败后展示安全的原因与耗时，可通过重试成功保存', async () => {
    vi.mocked(testServerConnectivity)
      .mockResolvedValueOnce({ 
        status: 'failed', 
        server: 'fail.frp.com', 
        port: 7000, 
        latencyMs: 150, 
        timestamp: '', 
        error: '连接被拒绝 (ECONNREFUSED)' 
      })
      .mockResolvedValueOnce({ 
        status: 'success', 
        server: 'fail.frp.com', 
        port: 7000, 
        latencyMs: 20, 
        timestamp: '' 
      });

    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/Windows 远程桌面/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/服务器地址/)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/服务器地址/));
    await userEvent.type(screen.getByLabelText(/服务器地址/), 'fail.frp.com');
    
    fireEvent.click(screen.getByRole('button', { name: /检查并保存/ }));

    await waitFor(() => {
      expect(screen.getByText(/连通性探测失败/)).toBeInTheDocument();
      expect(screen.getByText(/连接被拒绝 \(ECONNREFUSED\)/)).toBeInTheDocument();
      expect(screen.getByText(/150ms/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /重试检测/ })).toBeInTheDocument();
    });
    expect(mockOnSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /重试检测/ }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  it('探测失败后，可以点击【仍然保存】强制保存', async () => {
    vi.mocked(testServerConnectivity).mockResolvedValueOnce({ 
      status: 'failed', 
      server: 'offline.frp.com', 
      port: 7000, 
      latencyMs: null, 
      timestamp: '', 
      error: '连接超时 (ETIMEDOUT)' 
    });

    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/Windows 远程桌面/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/服务器地址/)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/服务器地址/));
    await userEvent.type(screen.getByLabelText(/服务器地址/), 'offline.frp.com');

    fireEvent.click(screen.getByRole('button', { name: /检查并保存/ }));

    await waitFor(() => {
      expect(screen.getByText(/连通性探测失败/)).toBeInTheDocument();
      expect(screen.getByText(/连接超时 \(ETIMEDOUT\)/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /仍然保存/ }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled();
    });
  });

  it('NAS 场景支持变体联动（群晖 / Alist / Jellyfin）', async () => {
    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/家庭 NAS/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/本地监听端口/)).toBeInTheDocument());

    // 默认群晖 DSM (5000)
    expect(screen.getByLabelText(/本地监听端口/)).toHaveValue(5000);
    expect(screen.getByLabelText(/公网访问端口/)).toHaveValue(5000);
    expect(screen.getByLabelText(/连接名称/)).toHaveValue('群晖 NAS');

    // 切换到 Alist 网盘
    fireEvent.click(screen.getByRole('button', { name: /Alist 网盘/ }));
    expect(screen.getByLabelText(/本地监听端口/)).toHaveValue(5244);
    expect(screen.getByLabelText(/公网访问端口/)).toHaveValue(5244);
    expect(screen.getByLabelText(/连接名称/)).toHaveValue('Alist 私有网盘');

    // 切换到 Jellyfin
    fireEvent.click(screen.getByRole('button', { name: /Jellyfin/ }));
    expect(screen.getByLabelText(/本地监听端口/)).toHaveValue(8096);
    expect(screen.getByLabelText(/公网访问端口/)).toHaveValue(8096);
    expect(screen.getByLabelText(/连接名称/)).toHaveValue('Jellyfin 影视库');
  });

  it('游戏场景支持变体联动（Minecraft Java / 基岩版）', async () => {
    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/游戏联机/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/本地监听端口/)).toBeInTheDocument());

    // 默认 Java 版 25565
    expect(screen.getByLabelText(/本地监听端口/)).toHaveValue(25565);
    expect(screen.getByLabelText(/连接名称/)).toHaveValue('Minecraft Java 服务器');

    // 切换到基岩版
    fireEvent.click(screen.getByRole('button', { name: /Minecraft 基岩版/ }));
    expect(screen.getByLabelText(/本地监听端口/)).toHaveValue(19132);
    expect(screen.getByLabelText(/公网访问端口/)).toHaveValue(19132);
    expect(screen.getByLabelText(/连接名称/)).toHaveValue('Minecraft 基岩服务器');
  });

  it('Token 密码掩码与显隐切换', async () => {
    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/Windows 远程桌面/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/认证 Token/)).toBeInTheDocument());

    const tokenInput = screen.getByLabelText(/认证 Token/);
    expect(tokenInput).toHaveAttribute('type', 'password');

    const toggleBtn = screen.getByRole('button', { name: '显示密码' });
    fireEvent.click(toggleBtn);
    expect(tokenInput).toHaveAttribute('type', 'text');

    const hideBtn = screen.getByRole('button', { name: '隐藏密码' });
    fireEvent.click(hideBtn);
    expect(tokenInput).toHaveAttribute('type', 'password');
  });

  it('选择 Web 场景时不显示远程端口输入框，且不校验', async () => {
    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/公开网站/)[0]);

    await waitFor(() => {
      expect(screen.getByLabelText(/自定义域名/)).toBeInTheDocument();
      expect(screen.queryByLabelText(/公网访问端口/)).not.toBeInTheDocument();
    });
  });

  it('高级设置区提供只读 TOML 预览并脱敏 Token', async () => {
    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/Windows 远程桌面/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/服务器地址/)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/认证 Token/));
    await userEvent.type(screen.getByLabelText(/认证 Token/), 'super-secret-token-123456');

    fireEvent.click(screen.getByText(/高级设置与预览/));

    const tomlPreview = await screen.findByTestId('toml-preview');
    expect(tomlPreview).toBeInTheDocument();
    expect(tomlPreview).toHaveTextContent(/type = "tcp"/);
    expect(tomlPreview).toHaveTextContent(/token = "\*\*\*\*\*\*"/);
    expect(tomlPreview).not.toHaveTextContent('super-secret-token-123456');
  });

  it('点击转为高级编辑，传递完整未脱敏草稿状态', async () => {
    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/Windows 远程桌面/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/服务器地址/)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/服务器地址/));
    await userEvent.type(screen.getByLabelText(/服务器地址/), 'adv.frp.com');
    await userEvent.clear(screen.getByLabelText(/服务器端口/));
    await userEvent.type(screen.getByLabelText(/服务器端口/), '8888');
    await userEvent.clear(screen.getByLabelText(/认证 Token/));
    await userEvent.type(screen.getByLabelText(/认证 Token/), 'real-secret-token');

    fireEvent.click(screen.getByText(/高级设置与预览/));
    fireEvent.click(screen.getByRole('button', { name: /转为高级编辑模式/ }));

    expect(mockOnSwitch).toHaveBeenCalled();
    const draft = mockOnSwitch.mock.calls[0][0];
    expect(draft.serverAddr).toBe('adv.frp.com');
    expect(draft.serverPort).toBe(8888);
    expect(draft.authToken).toBe('real-secret-token');
    expect(draft.scenarioId).toBe('rdp');
  });

  it('选择自定义场景直接跳转高级编辑模式', async () => {
    render(
      <ScenarioWizard 
        activeCore={mockActiveCore}
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        onSwitchToAdvanced={mockOnSwitch}
      />
    );

    fireEvent.click(screen.getAllByText(/自定义连接/)[0]);

    expect(mockOnSwitch).toHaveBeenCalled();
    const draft = mockOnSwitch.mock.calls[0][0];
    expect(draft.scenarioId).toBe('custom');
    expect(draft.name).toBe('我的自定义连接');
  });
});
