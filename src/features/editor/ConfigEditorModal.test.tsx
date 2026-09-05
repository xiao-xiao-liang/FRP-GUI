import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigEditorModal } from './ConfigEditorModal';
import * as ScenarioWizardModule from './ScenarioWizard';
import { testServerConnectivity } from '../../services/ipc';
import { FrpCore, Profile, FrpcConfig, FrpsConfig } from '../../types/frp';

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

const mockEditingProfile: Profile = {
  id: 'prof_test_edit',
  name: '测试生产SSH',
  type: 'frpc',
  description: '用于远程管理的SSH连接',
  config: {
    serverAddr: 'ssh.mycompany.com',
    serverPort: 7000,
    authToken: 'ssh_token_888',
    transport: { protocol: 'tcp', tls: { enable: true } },
    log: { level: 'debug' },
    proxies: [
      {
        name: 'ssh-proxy',
        type: 'tcp',
        localIP: '127.0.0.1',
        localPort: 22,
        remotePort: 6022,
      },
    ],
    visitors: [],
  },
  rawToml: `serverAddr = "ssh.mycompany.com"
serverPort = 7000
auth.token = "ssh_token_888"

[[proxies]]
name = "ssh-proxy"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 6022`,
  status: 'stopped',
  stats: {
    bytesIn: 0,
    bytesOut: 0,
    curConns: 0,
    uptimeSeconds: 0,
  },
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
};

describe('ConfigEditorModal (配置编辑器弹窗组件)', () => {
  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('新建模式（editingProfile 为 null）默认渲染场景向导', () => {
    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={null}
        activeCore={mockActiveCore}
      />
    );

    expect(screen.getByTestId('scenario-wizard')).toBeInTheDocument();
    expect(screen.getByText('选择应用场景')).toBeInTheDocument();
    expect(screen.getByText('Windows 远程桌面 (RDP)')).toBeInTheDocument();
  });

  it('编辑模式（传入 editingProfile）直接渲染完整高级表单且标题统一为“编辑连接: {名称}”', () => {
    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={mockEditingProfile}
        activeCore={mockActiveCore}
      />
    );

    expect(screen.queryByTestId('scenario-wizard')).not.toBeInTheDocument();
    expect(screen.getByText(`编辑连接: ${mockEditingProfile.name}`)).toBeInTheDocument();
    expect(screen.getByDisplayValue('测试生产SSH')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ssh.mycompany.com')).toBeInTheDocument();
  });

  it('新建向导中成功保存时，严格执行一次 onSave(profile) 并执行 onClose()', async () => {
    vi.mocked(testServerConnectivity).mockResolvedValueOnce({
      status: 'success',
      server: 'rdp.test.com',
      port: 7000,
      latencyMs: 15,
      timestamp: '',
    });

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={null}
        activeCore={mockActiveCore}
      />
    );

    fireEvent.click(screen.getAllByText(/Windows 远程桌面/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/服务器地址/)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/服务器地址/));
    await userEvent.type(screen.getByLabelText(/服务器地址/), 'rdp.test.com');

    fireEvent.click(screen.getByRole('button', { name: /检查并保存/ }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    const savedProfile = mockOnSave.mock.calls[0][0];
    expect(savedProfile.name).toBe('我的 Windows 远程桌面');
    expect(savedProfile.config.serverAddr).toBe('rdp.test.com');
  });

  it('从向导“转为高级编辑模式”完整接管草稿并在高级表单与 TOML 中呈现', async () => {
    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={null}
        activeCore={mockActiveCore}
      />
    );

    fireEvent.click(screen.getAllByText(/SSH 远程终端/)[0]);
    await waitFor(() => expect(screen.getByLabelText(/服务器地址/)).toBeInTheDocument());

    await userEvent.clear(screen.getByLabelText(/连接名称/));
    await userEvent.type(screen.getByLabelText(/连接名称/), '自定义SSH草稿');

    await userEvent.clear(screen.getByLabelText(/服务器地址/));
    await userEvent.type(screen.getByLabelText(/服务器地址/), 'adv-ssh.company.com');

    await userEvent.clear(screen.getByLabelText(/服务器端口/));
    await userEvent.type(screen.getByLabelText(/服务器端口/), '7001');

    await userEvent.clear(screen.getByLabelText(/认证 Token/));
    await userEvent.type(screen.getByLabelText(/认证 Token/), 'super-secret-ssh-token');

    fireEvent.click(screen.getByText(/高级设置与预览/));
    fireEvent.click(screen.getByRole('button', { name: /转为高级编辑模式/ }));

    // 向导已退出，完整编辑器展示
    expect(screen.queryByTestId('scenario-wizard')).not.toBeInTheDocument();
    expect(screen.getByText('新建连接 (高级模式)')).toBeInTheDocument();

    // 验证表单已接管草稿
    expect(screen.getByDisplayValue('自定义SSH草稿')).toBeInTheDocument();
    expect(screen.getByDisplayValue('adv-ssh.company.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7001')).toBeInTheDocument();
    expect(screen.getByDisplayValue('super-secret-ssh-token')).toBeInTheDocument();

    // 切换至 TOML tab 验证同步生成的内容
    fireEvent.click(screen.getByRole('button', { name: 'TOML 源码' }));
    const textarea = screen.getByPlaceholderText(/在此编写标准 FRP TOML 配置文件/) as HTMLTextAreaElement;
    expect(textarea.value).toContain('adv-ssh.company.com');
    expect(textarea.value).toContain('7001');
    expect(textarea.value).toContain('super-secret-ssh-token');
  });

  it('编辑模式修改并点击“保存修改”时，调用 onSave 和 onClose', async () => {
    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={mockEditingProfile}
        activeCore={mockActiveCore}
      />
    );

    const nameInput = screen.getByDisplayValue('测试生产SSH');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '生产SSH修改后');

    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    const saved = mockOnSave.mock.calls[0][0];
    expect(saved.id).toBe(mockEditingProfile.id);
    expect(saved.name).toBe('生产SSH修改后');
  });

  it('点击取消关闭弹窗', () => {
    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={mockEditingProfile}
        activeCore={mockActiveCore}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('向导草稿带入 kcp、TLS 开启、加密关闭、压缩关闭时，切换高级编辑在表单与 TOML 中完整保留', async () => {
    let capturedSwitchToAdvanced: ((draft: any) => void) | null = null;
    const wizardSpy = vi.spyOn(ScenarioWizardModule, 'ScenarioWizard').mockImplementation((props: any) => {
      capturedSwitchToAdvanced = props.onSwitchToAdvanced;
      return <div data-testid="scenario-wizard">Mock Wizard</div>;
    });

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={null}
        activeCore={mockActiveCore}
      />
    );

    expect(capturedSwitchToAdvanced).toBeDefined();

    // 触发草稿切换，注入特定传输协议与安全选项
    act(() => {
      capturedSwitchToAdvanced!({
        name: 'KCP与TLS安全连接',
        serverAddr: 'kcp.myfrp.com',
        serverPort: 7000,
        authToken: 'kcp-secret-token',
        scenarioId: 'custom',
        proxyName: 'kcp-service',
        proxyType: 'tcp',
        localIP: '127.0.0.1',
        localPort: 8080,
        remotePort: 18080,
        transportProtocol: 'kcp',
        tlsEnable: true,
        useEncryption: false,
        useCompression: false,
      });
    });

    // 验证高级模式已开启
    await waitFor(() => {
      expect(screen.getByText('新建连接 (高级模式)')).toBeInTheDocument();
    });

    // 验证表单基础字段
    expect(screen.getByDisplayValue('KCP与TLS安全连接')).toBeInTheDocument();
    expect(screen.getByDisplayValue('kcp.myfrp.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('kcp-secret-token')).toBeInTheDocument();

    // 验证协议与 TLS 表单状态
    expect(screen.getByText(/KCP 协议/)).toBeInTheDocument();
    const tlsCheckbox = screen.getByRole('checkbox', { name: /启用 TLS/ });
    expect(tlsCheckbox).toBeChecked();

    // 验证代理表格中的 加密 / 压缩 选项未勾选
    const encryptionCheckbox = screen.getByRole('checkbox', { name: '加密' });
    expect(encryptionCheckbox).not.toBeChecked();

    const compressionCheckbox = screen.getByRole('checkbox', { name: '压缩' });
    expect(compressionCheckbox).not.toBeChecked();

    // 切换至 TOML tab 验证源码完全同步
    fireEvent.click(screen.getByRole('button', { name: 'TOML 源码' }));
    const textarea = screen.getByPlaceholderText(/在此编写标准 FRP TOML 配置文件/) as HTMLTextAreaElement;
    expect(textarea.value).toContain('protocol = "kcp"');
    expect(textarea.value).toContain('tls.enable = true');
    expect(textarea.value).toContain('transport.useEncryption = false');
    expect(textarea.value).toContain('transport.useCompression = false');

    wizardSpy.mockRestore();
  });

  it('FRPC 编辑表单显示已有日志级别，并能写入 TOML 与保存结果', async () => {
    const user = userEvent.setup();
    render(<ConfigEditorModal isOpen onClose={mockOnClose} onSave={mockOnSave}
      editingProfile={mockEditingProfile} activeCore={mockActiveCore} />);

    expect(screen.getByText('DEBUG')).toBeInTheDocument();
    await user.click(screen.getByText('DEBUG'));
    await user.click(screen.getByText('TRACE'));
    expect(screen.getByText('适合协议级排障与完整调用链追踪。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'TOML 源码' }));
    expect((screen.getByPlaceholderText(/在此编写标准 FRP TOML 配置文件/) as HTMLTextAreaElement).value)
      .toContain('level = "trace"');

    fireEvent.click(screen.getByRole('button', { name: '可视化表单' }));
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    expect(mockOnSave.mock.calls[0][0].config.log.level).toBe('trace');
  });

  it('FRPS 编辑表单默认 INFO，且 TOML 回读的 WARN 同步到选择器', async () => {
    const frpsProfile = { ...mockEditingProfile, id: 'prof_frps', type: 'frps' as const,
      config: { bindPort: 7000 }, rawToml: 'bindPort = 7000' };
    render(<ConfigEditorModal isOpen onClose={mockOnClose} onSave={mockOnSave}
      editingProfile={frpsProfile} activeCore={mockActiveCore} />);

    expect(screen.getByText('INFO（默认）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'TOML 源码' }));
    const textarea = screen.getByPlaceholderText(/在此编写标准 FRP TOML 配置文件/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: `${textarea.value}\n\n[log]\nlevel = "warn"` } });
    fireEvent.click(screen.getByRole('button', { name: '同步到表单' }));
    expect(screen.getByText('WARN')).toBeInTheDocument();
  });

  it('修改普通表单字段后切换“TOML 源码”实时同步最新表单数据', async () => {
    render(<ConfigEditorModal isOpen onClose={mockOnClose} onSave={mockOnSave}
      editingProfile={mockEditingProfile} activeCore={mockActiveCore} />);

    const portInput = screen.getByDisplayValue('7000');
    await userEvent.clear(portInput);
    await userEvent.type(portInput, '7099');

    fireEvent.click(screen.getByRole('button', { name: 'TOML 源码' }));
    const textarea = screen.getByPlaceholderText(/在此编写标准 FRP TOML 配置文件/) as HTMLTextAreaElement;
    expect(textarea.value).toContain('serverPort = 7099');
  });

  it('FRPC 表单在切换日志级别与保存时完整保留 log.to 与 log.maxDays', async () => {
    const profileWithFullLog: Profile = {
      ...mockEditingProfile,
      id: 'prof_full_log',
      config: {
        ...mockEditingProfile.config,
        log: { to: 'console', level: 'warn', maxDays: 14 },
      },
    };
    const user = userEvent.setup();
    render(<ConfigEditorModal isOpen onClose={mockOnClose} onSave={mockOnSave}
      editingProfile={profileWithFullLog} activeCore={mockActiveCore} />);

    expect(screen.getByText('WARN')).toBeInTheDocument();
    await user.click(screen.getByText('WARN'));
    await user.click(screen.getByText('ERROR'));

    fireEvent.click(screen.getByRole('button', { name: 'TOML 源码' }));
    const textarea = screen.getByPlaceholderText(/在此编写标准 FRP TOML 配置文件/) as HTMLTextAreaElement;
    expect(textarea.value).toContain('to = "console"');
    expect(textarea.value).toContain('level = "error"');
    expect(textarea.value).toContain('maxDays = 14');

    fireEvent.click(screen.getByRole('button', { name: '可视化表单' }));
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    expect(mockOnSave).toHaveBeenCalledTimes(1);
    const savedConfig = mockOnSave.mock.calls[0][0].config as FrpcConfig;
    expect(savedConfig.log).toEqual({
      to: 'console',
      level: 'error',
      maxDays: 14,
    });
  });

  it('FRPS 表单在切换日志级别与保存时完整保留 log.to 与 log.maxDays', async () => {
    const frpsProfileWithFullLog: Profile = {
      ...mockEditingProfile,
      id: 'prof_frps_full_log',
      type: 'frps' as const,
      config: {
        bindPort: 7000,
        log: { to: 'console', level: 'warn', maxDays: 14 },
      },
      rawToml: 'bindPort = 7000\n\n[log]\nto = "console"\nlevel = "warn"\nmaxDays = 14',
    };
    const user = userEvent.setup();
    render(<ConfigEditorModal isOpen onClose={mockOnClose} onSave={mockOnSave}
      editingProfile={frpsProfileWithFullLog} activeCore={mockActiveCore} />);

    expect(screen.getByText('WARN')).toBeInTheDocument();
    await user.click(screen.getByText('WARN'));
    await user.click(screen.getByText('TRACE'));

    fireEvent.click(screen.getByRole('button', { name: 'TOML 源码' }));
    const textarea = screen.getByPlaceholderText(/在此编写标准 FRP TOML 配置文件/) as HTMLTextAreaElement;
    expect(textarea.value).toContain('to = "console"');
    expect(textarea.value).toContain('level = "trace"');
    expect(textarea.value).toContain('maxDays = 14');

    fireEvent.click(screen.getByRole('button', { name: '可视化表单' }));
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    expect(mockOnSave).toHaveBeenCalledTimes(1);
    const savedConfig = mockOnSave.mock.calls[0][0].config as FrpsConfig;
    expect(savedConfig.log).toEqual({
      to: 'console',
      level: 'trace',
      maxDays: 14,
    });
  });
});
