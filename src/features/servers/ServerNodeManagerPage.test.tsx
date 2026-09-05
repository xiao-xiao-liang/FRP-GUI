import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FrpServerNode } from '../../types/frp';
import { ServerNodeManagerPage } from './ServerNodeManagerPage';
import {
  deleteServerCredentials,
  isTauriEnv,
  runFrpsOperation,
  runServerPreflight,
  storeFrpsSecrets,
  storeServerCredential,
} from '../../services/ipc';

vi.mock('../../services/ipc', () => ({
  isTauriEnv: vi.fn(() => true),
  storeServerCredential: vi.fn(),
  deleteServerCredentials: vi.fn(),
  runServerPreflight: vi.fn(),
  runFrpsOperation: vi.fn(),
  storeFrpsSecrets: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(isTauriEnv).mockReturnValue(true);
});

const savedNode: FrpServerNode = {
  id: 'node_tokyo',
  name: '东京 Ubuntu 节点',
  host: '203.0.113.10',
  sshPort: 22,
  username: 'ubuntu',
  authMethod: 'password',
  credentialRef: 'frp-gui/server-node/node_tokyo',
  credentialsRemembered: true,
  frpsBindPort: 7000,
  frpsDashboardPort: 7500,
  installDir: '/opt/frp',
  status: 'draft',
  isDefault: false,
  createdAt: 1,
  updatedAt: 1,
};

const unrememberedNode: FrpServerNode = {
  id: 'node_unremembered',
  name: '临时凭据节点',
  host: '203.0.113.20',
  sshPort: 22,
  username: 'root',
  authMethod: 'password',
  credentialsRemembered: false,
  frpsBindPort: 7000,
  installDir: '/opt/frp',
  status: 'draft',
  isDefault: false,
  createdAt: 1,
  updatedAt: 1,
};

describe('ServerNodeManagerPage', () => {
  it('保存记住密码的节点时仅向安全凭据 IPC 传递秘密，节点回调不含秘密', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    render(<ServerNodeManagerPage nodes={[]} onSaveNode={onSaveNode} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '添加服务器节点' }));
    await user.type(screen.getByLabelText('节点名称'), '东京节点');
    await user.type(screen.getByLabelText('服务器地址'), '203.0.113.10');
    await user.type(screen.getByLabelText('SSH 用户名'), 'ubuntu');
    await user.type(screen.getByLabelText('SSH 密码'), 'secret-password');
    await user.click(screen.getByRole('checkbox', { name: '记住凭据到系统安全凭据库' }));
    await user.click(screen.getByRole('button', { name: '保存节点' }));

    await waitFor(() => expect(storeServerCredential).toHaveBeenCalledTimes(1));
    expect(storeServerCredential).toHaveBeenCalledWith(expect.stringMatching(/^frp-gui\/server-node\/node_/), 'password', 'secret-password');
    const node = onSaveNode.mock.calls[0][0] as FrpServerNode;
    expect(JSON.stringify(node)).not.toContain('secret-password');
    expect(node.credentialRef).toMatch(/^frp-gui\/server-node\/node_/);
  });

  it('支持私钥登录的多行输入，并且不会渲染密码输入框', async () => {
    const user = userEvent.setup();
    render(<ServerNodeManagerPage nodes={[]} onSaveNode={vi.fn()} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '添加服务器节点' }));
    await user.click(screen.getByRole('radio', { name: '私钥登录' }));
    expect(screen.queryByLabelText('SSH 密码')).not.toBeInTheDocument();
    const privateKey = screen.getByLabelText('SSH 私钥');
    await user.type(privateKey, '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----');
    expect((privateKey as HTMLTextAreaElement).value).toContain('BEGIN OPENSSH');
    expect(screen.getByLabelText('私钥口令')).toHaveAttribute('type', 'password');
  });

  it('浏览器模拟模式禁用记住凭据，且不会降级保存秘密', async () => {
    const user = userEvent.setup();
    vi.mocked(isTauriEnv).mockReturnValue(false);
    render(<ServerNodeManagerPage nodes={[]} onSaveNode={vi.fn()} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '添加服务器节点' }));
    expect(screen.getByRole('checkbox', { name: '记住凭据到系统安全凭据库' })).toBeDisabled();
    expect(screen.getByText('仅桌面版可记住凭据')).toBeInTheDocument();
  });

  it('删除节点时可选择同时删除操作系统中的凭据', async () => {
    const user = userEvent.setup();
    const onDeleteNode = vi.fn();
    render(<ServerNodeManagerPage nodes={[savedNode]} onSaveNode={vi.fn()} onDeleteNode={onDeleteNode} onSetDefault={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '删除节点：东京 Ubuntu 节点' }));
    await user.click(screen.getByRole('checkbox', { name: '同时删除系统安全凭据' }));
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(deleteServerCredentials).toHaveBeenCalledWith('frp-gui/server-node/node_tokyo'));
    expect(onDeleteNode).toHaveBeenCalledWith('node_tokyo');
  });

  it('未记住 SSH 凭据的节点删除时，仍展示选项并支持删除系统安全凭据中的 FRP Token 等秘密', async () => {
    const user = userEvent.setup();
    const onDeleteNode = vi.fn();
    const unrememberedWithTokenNode: FrpServerNode = {
      ...unrememberedNode,
      credentialRef: 'frp-gui/server-node/node_unremembered',
      credentialsRemembered: false,
    };

    render(
      <ServerNodeManagerPage
        nodes={[unrememberedWithTokenNode]}
        onSaveNode={vi.fn()}
        onDeleteNode={onDeleteNode}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `删除节点：${unrememberedWithTokenNode.name}` }));

    // 确认框中必须展示“同时删除系统安全凭据”选项，文案明确涵盖 FRP Token 与 Dashboard 密码
    expect(screen.getByRole('checkbox', { name: '同时删除系统安全凭据' })).toBeInTheDocument();
    expect(screen.getByText(/从系统安全凭据库中彻底清理该节点关联的 FRP Token、Dashboard 密码及保存的 SSH\/sudo 凭据/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: '同时删除系统安全凭据' }));
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(deleteServerCredentials).toHaveBeenCalledWith('frp-gui/server-node/node_unremembered'));
    expect(onDeleteNode).toHaveBeenCalledWith('node_unremembered');
  });

  it('旧节点缺失 credentialRef 时，删除若勾选清理凭据，统一使用按节点 ID 派生的稳定引用调用 deleteServerCredentials', async () => {
    const user = userEvent.setup();
    const onDeleteNode = vi.fn();
    const legacyNodeWithoutRef: FrpServerNode = {
      ...unrememberedNode,
      id: 'node_legacy_999',
      name: '旧版无引用节点',
      credentialRef: undefined, // 模拟未设置 credentialRef 的旧版本节点
      credentialsRemembered: false,
    };

    render(
      <ServerNodeManagerPage
        nodes={[legacyNodeWithoutRef]}
        onSaveNode={vi.fn()}
        onDeleteNode={onDeleteNode}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `删除节点：${legacyNodeWithoutRef.name}` }));

    // 确认框中展示清理选项
    const checkbox = screen.getByRole('checkbox', { name: '同时删除系统安全凭据' });
    expect(checkbox).toBeInTheDocument();

    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: '确认删除' }));

    // 核心断言：无论旧节点是否已有 credentialRef，确认删除时必须使用派生引用清理 Keyring
    await waitFor(() => {
      expect(deleteServerCredentials).toHaveBeenCalledWith('frp-gui/server-node/node_legacy_999');
    });
    expect(onDeleteNode).toHaveBeenCalledWith('node_legacy_999');
  });

  it('首次检查只展示 SSH 指纹确认，确认前不把节点标记为可部署', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    vi.mocked(runServerPreflight).mockResolvedValueOnce({
      outcome: 'needs_host_trust',
      hostKeyFingerprint: 'SHA256:new-host-key-fingerprint',
      checkedAt: 1_726_000_000_000,
    });

    render(<ServerNodeManagerPage nodes={[savedNode]} onSaveNode={onSaveNode} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: `检查连接：${savedNode.name}` }));
    await user.click(screen.getByRole('button', { name: '开始检查' }));

    expect(await screen.findByText('请确认 SSH 主机指纹')).toBeInTheDocument();
    expect(screen.getByText('SHA256:new-host-key-fingerprint')).toBeInTheDocument();
    expect(onSaveNode).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'ready_to_deploy' }));
  });

  it('确认指纹后重试预检，仅保存公开结果且更新为可部署', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    vi.mocked(runServerPreflight)
      .mockResolvedValueOnce({
        outcome: 'needs_host_trust',
        hostKeyFingerprint: 'SHA256:new-host-key-fingerprint',
        checkedAt: 1_726_000_000_000,
      })
      .mockResolvedValueOnce({
        outcome: 'ready',
        hostKeyFingerprint: 'SHA256:new-host-key-fingerprint',
        os: 'ubuntu',
        architecture: 'amd64',
        privilege: 'sudo_passwordless',
        systemd: true,
        checkedAt: 1_726_000_000_100,
      });

    render(<ServerNodeManagerPage nodes={[savedNode]} onSaveNode={onSaveNode} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: `检查连接：${savedNode.name}` }));
    await user.click(screen.getByRole('button', { name: '开始检查' }));

    expect(await screen.findByText('请确认 SSH 主机指纹')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '确认并继续检查' }));

    expect(await screen.findByText('服务器预检通过')).toBeInTheDocument();
    expect(onSaveNode).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ready_to_deploy',
        trustedHostKeyFingerprint: 'SHA256:new-host-key-fingerprint',
        remoteOs: 'ubuntu',
        remoteArchitecture: 'amd64',
      })
    );
    expect(JSON.stringify(onSaveNode.mock.calls)).not.toContain('secret-password');
  });

  it('浏览器模式不显示可执行的检查连接按钮，并展示桌面版说明', () => {
    vi.mocked(isTauriEnv).mockReturnValue(false);
    render(<ServerNodeManagerPage nodes={[savedNode]} onSaveNode={vi.fn()} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);
    expect(screen.getByText('SSH 预检需要在桌面版应用中执行')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `检查连接：${savedNode.name}` })).not.toBeInTheDocument();
  });

  it('未记住凭据的节点要求输入临时凭据，关闭弹窗后清空内存秘密', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    vi.mocked(runServerPreflight).mockResolvedValueOnce({
      outcome: 'ready',
      hostKeyFingerprint: 'SHA256:temp-fingerprint',
      os: 'debian',
      architecture: 'arm64',
      privilege: 'root',
      systemd: true,
      checkedAt: 1_726_000_000_000,
    });

    render(<ServerNodeManagerPage nodes={[unrememberedNode]} onSaveNode={onSaveNode} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: `检查连接：${unrememberedNode.name}` }));

    const passwordInput = screen.getByLabelText('SSH 密码');
    await user.type(passwordInput, 'ephemeral-password-789');
    await user.click(screen.getByRole('button', { name: '开始检查' }));

    await waitFor(() => expect(runServerPreflight).toHaveBeenCalledTimes(1));
    expect(runServerPreflight).toHaveBeenCalledWith(
      expect.objectContaining({
        ephemeralCredentials: { password: 'ephemeral-password-789' },
      })
    );
    expect(await screen.findByText('服务器预检通过')).toBeInTheDocument();

    // 关闭弹窗
    await user.click(screen.getByRole('button', { name: '完成' }));
    expect(screen.queryByText('服务器预检通过')).not.toBeInTheDocument();

    // 重新打开弹窗，检查密码输入框是否已清空
    await user.click(screen.getByRole('button', { name: `检查连接：${unrememberedNode.name}` }));
    expect((screen.getByLabelText('SSH 密码') as HTMLInputElement).value).toBe('');
  });

  it('已记住凭据的节点展示系统安全凭据提示，不渲染秘密输入框', async () => {
    const user = userEvent.setup();
    render(<ServerNodeManagerPage nodes={[savedNode]} onSaveNode={vi.fn()} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: `检查连接：${savedNode.name}` }));

    expect(screen.getByText('将使用系统安全凭据库中已保存的 SSH 凭据')).toBeInTheDocument();
    expect(screen.queryByLabelText('SSH 密码')).not.toBeInTheDocument();
  });

  it('主机指纹变化时提示中断风险，节点更新为异常且不进入可部署状态', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    vi.mocked(runServerPreflight).mockResolvedValueOnce({
      outcome: 'failed',
      hostKeyFingerprint: 'SHA256:changed-host-key',
      errorCode: 'host_key_changed',
      errorMessage: 'SSH 主机指纹发生变化，连接已安全中断',
      checkedAt: 1_726_000_000_000,
    });

    render(<ServerNodeManagerPage nodes={[savedNode]} onSaveNode={onSaveNode} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: `检查连接：${savedNode.name}` }));
    await user.click(screen.getByRole('button', { name: '开始检查' }));

    expect(await screen.findByText('SSH 主机指纹不匹配')).toBeInTheDocument();
    expect(screen.getByText('SSH 主机指纹发生变化，连接已安全中断')).toBeInTheDocument();
    expect(onSaveNode).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
      })
    );
    expect(onSaveNode).not.toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ready_to_deploy',
      })
    );
  });

  it('预检失败时支持重试和返回编辑节点', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    vi.mocked(runServerPreflight)
      .mockResolvedValueOnce({
        outcome: 'failed',
        errorCode: 'network_failed',
        errorMessage: '无法建立 SSH 网络连接',
        checkedAt: 1_726_000_000_000,
      })
      .mockResolvedValueOnce({
        outcome: 'ready',
        hostKeyFingerprint: 'SHA256:tokyo-key',
        os: 'ubuntu',
        architecture: 'amd64',
        privilege: 'root',
        systemd: true,
        checkedAt: 1_726_000_000_200,
      });

    render(<ServerNodeManagerPage nodes={[savedNode]} onSaveNode={onSaveNode} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: `检查连接：${savedNode.name}` }));
    await user.click(screen.getByRole('button', { name: '开始检查' }));

    expect(await screen.findByText('无法建立 SSH 网络连接')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回编辑节点' })).toBeInTheDocument();

    // 点击重试
    await user.click(screen.getByRole('button', { name: '重试检查' }));
    expect(await screen.findByText('服务器预检通过')).toBeInTheDocument();
  });

  it('未记住凭据在预检失败路径下，重试界面临时凭据被清空且持久化节点对象不含秘密', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    vi.mocked(runServerPreflight).mockResolvedValueOnce({
      outcome: 'failed',
      errorCode: 'authentication_failed',
      errorMessage: 'SSH 用户名或密码错误',
      checkedAt: 1_726_000_000_000,
    });

    render(<ServerNodeManagerPage nodes={[unrememberedNode]} onSaveNode={onSaveNode} onDeleteNode={vi.fn()} onSetDefault={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: `检查连接：${unrememberedNode.name}` }));

    const passwordInput = screen.getByLabelText('SSH 密码');
    await user.type(passwordInput, 'wrong-ephemeral-secret-123');
    await user.click(screen.getByRole('button', { name: '开始检查' }));

    // 验证展示失败信息
    expect(await screen.findByText('SSH 用户名或密码错误')).toBeInTheDocument();

    // 验证重试界面的临时密码输入框已被清空
    const retryPasswordInput = screen.getByLabelText('SSH 密码') as HTMLInputElement;
    expect(retryPasswordInput.value).toBe('');

    // 验证在回调中保存的节点对象严格不包含秘密
    expect(onSaveNode).toHaveBeenCalledWith(
      expect.objectContaining({
        id: unrememberedNode.id,
        status: 'error',
      })
    );
    expect(JSON.stringify(onSaveNode.mock.calls)).not.toContain('wrong-ephemeral-secret-123');
  });

  const readyToDeployNode: FrpServerNode = {
    id: 'node_ready',
    name: '可部署节点',
    host: '203.0.113.30',
    sshPort: 22,
    username: 'ubuntu',
    authMethod: 'password',
    credentialRef: 'frp-gui/server-node/node_ready',
    credentialsRemembered: true,
    frpsBindPort: 7000,
    installDir: '/opt/frp',
    status: 'ready_to_deploy',
    isDefault: false,
    trustedHostKeyFingerprint: 'SHA256:ready-key',
    remoteOs: 'ubuntu',
    remoteArchitecture: 'amd64',
    privilege: 'sudo_password_required',
    systemd: true,
    requiresSudoPassword: true,
    sudoCredentialsRemembered: false,
    createdAt: 1,
    updatedAt: 1,
  };

  it('桌面端部署必须经过三阶段：配置 -> 确认 -> 执行，且确认前不调用执行 IPC', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    vi.mocked(storeFrpsSecrets).mockResolvedValue(undefined);
    vi.mocked(runFrpsOperation).mockResolvedValue({
      operation: 'deploy',
      outcome: 'completed',
      serviceStatus: 'running',
      checkedAt: 1_726_000_000_000,
      deployment: {
        summary: {
          version: '0.71.0',
          bindPort: 7000,
          transportProtocol: 'tcp',
          tlsForce: true,
          dashboardEnabled: false,
        },
        serviceName: 'frp-gui-frps.service',
        installedAt: 1_726_000_000_000,
        enabled: true,
      },
    });

    render(
      <ServerNodeManagerPage
        nodes={[readyToDeployNode]}
        onSaveNode={onSaveNode}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `部署 FRPS：${readyToDeployNode.name}` }));

    // 阶段 1：配置参数
    expect(screen.getByText('配置参数')).toBeInTheDocument();
    expect(screen.getByLabelText(/FRP 认证 Token/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('客户端连接服务端时必填的密钥'), 'my-super-secret-token');
    await user.type(screen.getByPlaceholderText('执行远程 systemd 管理需要 sudo 密码'), 'my-sudo-pass');

    // 未确认前绝对未调用部署 IPC
    expect(runFrpsOperation).not.toHaveBeenCalled();

    // 点击下一步进入阶段 2：确认
    await user.click(screen.getByRole('button', { name: '下一步：确认部署' }));
    expect(screen.getByText('确认变更')).toBeInTheDocument();
    expect(screen.getByText(/将从官方 GitHub Release 下载对应架构安装包/)).toBeInTheDocument();
    expect(screen.getByText('/opt/frp/frps.toml（候选验证后原子替换）')).toBeInTheDocument();

    // 点击确认部署进入阶段 3：执行
    await user.click(screen.getByRole('button', { name: '确认部署' }));

    await waitFor(() => expect(runFrpsOperation).toHaveBeenCalledTimes(1));
    expect(storeFrpsSecrets).toHaveBeenCalledWith('frp-gui/server-node/node_ready', expect.objectContaining({
      authToken: 'my-super-secret-token',
    }));

    // 完成后回调保存节点，且节点对象严格不含机密
    expect(onSaveNode).toHaveBeenCalledWith(
      expect.objectContaining({
        id: readyToDeployNode.id,
        status: 'running',
        serviceStatus: 'running',
      })
    );
    expect(JSON.stringify(onSaveNode.mock.calls)).not.toContain('my-super-secret-token');
    expect(JSON.stringify(onSaveNode.mock.calls)).not.toContain('my-sudo-pass');
  });

  it('浏览器环境阻断部署操作，且不暴露部署按钮', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(false);
    render(
      <ServerNodeManagerPage
        nodes={[readyToDeployNode]}
        onSaveNode={vi.fn()}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: `部署 FRPS：${readyToDeployNode.name}` })).not.toBeInTheDocument();
    expect(screen.getByText('FRPS 部署需要桌面版应用')).toBeInTheDocument();
  });

  it('未记住凭据的节点在部署取消或失败时，内存中的机密均被清空', async () => {
    const user = userEvent.setup();
    const unrememberedReadyNode: FrpServerNode = {
      ...readyToDeployNode,
      credentialsRemembered: false,
    };

    render(
      <ServerNodeManagerPage
        nodes={[unrememberedReadyNode]}
        onSaveNode={vi.fn()}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `部署 FRPS：${unrememberedReadyNode.name}` }));

    // 输入临时 SSH 密码与 Token
    const sshPwdInput = screen.getByPlaceholderText('请输入 SSH 密码') as HTMLInputElement;
    const tokenInput = screen.getByPlaceholderText('客户端连接服务端时必填的密钥') as HTMLInputElement;

    await user.type(sshPwdInput, 'temp-ssh-secret');
    await user.type(tokenInput, 'temp-token-secret');

    // 取消弹窗
    await user.click(screen.getByRole('button', { name: '取消' }));

    // 重新打开弹窗验证已完全清空
    await user.click(screen.getByRole('button', { name: `部署 FRPS：${unrememberedReadyNode.name}` }));
    const newSshPwdInput = screen.getByPlaceholderText('请输入 SSH 密码') as HTMLInputElement;
    const newTokenInput = screen.getByPlaceholderText('客户端连接服务端时必填的密钥') as HTMLInputElement;

    expect(newSshPwdInput.value).toBe('');
    expect(newTokenInput.value).toBe('');
  });

  it('sudo_password_required 节点根据已记住状态正确展示系统安全凭据库提示或密码输入框', async () => {
    const user = userEvent.setup();
    // 1. 已记住 sudo 密码
    const rememberedSudoNode: FrpServerNode = {
      ...readyToDeployNode,
      sudoCredentialsRemembered: true,
    };

    const { rerender } = render(
      <ServerNodeManagerPage
        nodes={[rememberedSudoNode]}
        onSaveNode={vi.fn()}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `部署 FRPS：${rememberedSudoNode.name}` }));
    expect(screen.getByText('已记住 sudo 密码到系统安全凭据库')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('执行远程 systemd 管理需要 sudo 密码')).not.toBeInTheDocument();

    // 关闭
    await user.click(screen.getByRole('button', { name: '取消' }));

    // 2. 未记住 sudo 密码
    rerender(
      <ServerNodeManagerPage
        nodes={[readyToDeployNode]}
        onSaveNode={vi.fn()}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `部署 FRPS：${readyToDeployNode.name}` }));
    expect(screen.getByPlaceholderText('执行远程 systemd 管理需要 sudo 密码')).toBeInTheDocument();
    expect(screen.getByText('记住 sudo 密码到系统安全凭据库')).toBeInTheDocument();
  });

  it('运行中节点支持停止服务，并向 IPC 传递正确操作类型', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    const runningNode: FrpServerNode = {
      ...readyToDeployNode,
      status: 'running',
      serviceStatus: 'running',
      sudoCredentialsRemembered: true,
    };

    vi.mocked(runFrpsOperation).mockResolvedValue({
      operation: 'stop',
      outcome: 'completed',
      serviceStatus: 'stopped',
      checkedAt: 1_726_000_000_000,
    });

    render(
      <ServerNodeManagerPage
        nodes={[runningNode]}
        onSaveNode={onSaveNode}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `停止服务：${runningNode.name}` }));

    await waitFor(() => expect(runFrpsOperation).toHaveBeenCalledTimes(1));
    expect(runFrpsOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'stop',
      })
    );

    expect(onSaveNode).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'stopped',
        serviceStatus: 'stopped',
      })
    );
  });

  it('已停止节点支持启动服务，并向 IPC 传递 start 操作类型', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    const stoppedNode: FrpServerNode = {
      ...readyToDeployNode,
      status: 'stopped',
      serviceStatus: 'stopped',
      sudoCredentialsRemembered: true,
    };

    vi.mocked(runFrpsOperation).mockResolvedValue({
      operation: 'start',
      outcome: 'completed',
      serviceStatus: 'running',
      checkedAt: 1_726_000_000_000,
    });

    render(
      <ServerNodeManagerPage
        nodes={[stoppedNode]}
        onSaveNode={onSaveNode}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `启动服务：${stoppedNode.name}` }));

    await waitFor(() => expect(runFrpsOperation).toHaveBeenCalledTimes(1));
    expect(runFrpsOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'start',
      })
    );

    expect(onSaveNode).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'running',
        serviceStatus: 'running',
      })
    );
  });

  it('校验安装包 SHA-256 失败时，节点更新为异常状态而不是运行中', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();

    vi.mocked(storeFrpsSecrets).mockResolvedValue(undefined);
    vi.mocked(runFrpsOperation).mockResolvedValue({
      operation: 'deploy',
      outcome: 'failed',
      errorCode: 'asset_checksum_failed',
      errorMessage: '远程校验安装包 SHA-256 失败',
      serviceStatus: 'failed',
      checkedAt: 1_726_000_000_000,
    });

    render(
      <ServerNodeManagerPage
        nodes={[readyToDeployNode]}
        onSaveNode={onSaveNode}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `部署 FRPS：${readyToDeployNode.name}` }));
    await user.type(screen.getByPlaceholderText('客户端连接服务端时必填的密钥'), 'my-token');
    await user.type(screen.getByPlaceholderText('执行远程 systemd 管理需要 sudo 密码'), 'my-sudo');
    await user.click(screen.getByRole('button', { name: '下一步：确认部署' }));
    await user.click(screen.getByRole('button', { name: '确认部署' }));

    const errorElements = await screen.findAllByText('远程校验安装包 SHA-256 失败');
    expect(errorElements.length).toBeGreaterThan(0);
    expect(screen.queryByText('运行中')).not.toBeInTheDocument();
    expect(onSaveNode).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
      })
    );
  });

  it('日志查看能正常渲染，且脱敏的 Token 与密码保持星号掩蔽', async () => {
    const user = userEvent.setup();
    const runningNode: FrpServerNode = {
      ...readyToDeployNode,
      status: 'running',
      serviceStatus: 'running',
      sudoCredentialsRemembered: true,
    };

    vi.mocked(runFrpsOperation).mockResolvedValue({
      operation: 'read_logs',
      outcome: 'completed',
      serviceStatus: 'running',
      checkedAt: 1_726_000_000_000,
      logs: [
        '2026-09-02 12:00:00 [I] frps started: auth.token = ******',
        '2026-09-02 12:00:01 [I] dashboard listen on :7500',
      ],
    });

    render(
      <ServerNodeManagerPage
        nodes={[runningNode]}
        onSaveNode={vi.fn()}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    // 打开更多菜单
    await user.click(screen.getByRole('button', { name: `更多操作：${runningNode.name}` }));
    await user.click(screen.getByText('查看日志'));

    await waitFor(() => expect(runFrpsOperation).toHaveBeenCalledWith(expect.objectContaining({ operation: 'read_logs' })));

    expect(screen.getByText(/FRPS 服务日志/)).toBeInTheDocument();
    expect(screen.getByText(/auth.token = \*\*\*\*\*\*/)).toBeInTheDocument();
    expect(screen.getByText(/dashboard listen on :7500/)).toBeInTheDocument();
  });

  it('Keyring 写入成功且远程操作仍处于 pending 时，组件内部敏感机密 state 已完全清空', async () => {
    const user = userEvent.setup();
    let resolveRemoteOp!: (res: any) => void;
    const remoteOpPromise = new Promise((resolve) => {
      resolveRemoteOp = resolve;
    });

    vi.mocked(storeFrpsSecrets).mockResolvedValue(undefined);
    vi.mocked(runFrpsOperation).mockImplementation(() => remoteOpPromise as any);

    render(
      <ServerNodeManagerPage
        nodes={[readyToDeployNode]}
        onSaveNode={vi.fn()}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `部署 FRPS：${readyToDeployNode.name}` }));

    // 录入机密前，验证探针状态
    expect(screen.getByTestId('secret-state-probe')).toHaveAttribute('data-secrets-cleared', 'true');

    // 录入机密
    await user.type(screen.getByPlaceholderText('客户端连接服务端时必填的密钥'), 'pending-check-secret-token');
    await user.type(screen.getByPlaceholderText('执行远程 systemd 管理需要 sudo 密码'), 'pending-check-sudo-password');

    // 录入后探针显示含有机密
    expect(screen.getByTestId('secret-state-probe')).toHaveAttribute('data-secrets-cleared', 'false');

    // 点击下一步进入确认阶段
    await user.click(screen.getByRole('button', { name: '下一步：确认部署' }));
    // 点击确认部署触发执行
    await user.click(screen.getByRole('button', { name: '确认部署' }));

    // 等待 Keyring 写入完毕且 runFrpsOperation 已被调用
    await waitFor(() => {
      expect(storeFrpsSecrets).toHaveBeenCalledWith('frp-gui/server-node/node_ready', expect.objectContaining({
        authToken: 'pending-check-secret-token',
      }));
      expect(runFrpsOperation).toHaveBeenCalledTimes(1);
    });

    // 核心断言：此时 runFrpsOperation 仍处于 pending 状态未 resolve，但组件内部秘密 state 必须已被清空！
    expect(screen.getByTestId('secret-state-probe')).toHaveAttribute('data-secrets-cleared', 'true');

    // 解决 pending 的远程操作 Promise
    resolveRemoteOp({
      operation: 'deploy',
      outcome: 'completed',
      serviceStatus: 'running',
      checkedAt: 1_726_000_000_000,
    });

    // 完成后依然保持清空
    await waitFor(() => {
      expect(screen.getAllByText('FRPS 服务部署并启动成功').length).toBeGreaterThan(0);
    });
    expect(screen.getByTestId('secret-state-probe')).toHaveAttribute('data-secrets-cleared', 'true');
  });

  it('未记住 SSH 凭据的节点部署时写入 frp_token 到 Keyring，并将一次性 SSH 凭据传给部署 IPC，持久化节点只有公开 credentialRef', async () => {
    const user = userEvent.setup();
    const onSaveNode = vi.fn();
    const unrememberedReadyNode: FrpServerNode = {
      ...readyToDeployNode,
      id: 'node_unremembered_deploy',
      credentialRef: undefined, // 测试旧节点缺失 credentialRef 兼容
      credentialsRemembered: false,
    };

    vi.mocked(storeFrpsSecrets).mockResolvedValue(undefined);
    vi.mocked(runFrpsOperation).mockResolvedValue({
      operation: 'deploy',
      outcome: 'completed',
      serviceStatus: 'running',
      checkedAt: 1_726_000_000_000,
      deployment: {
        summary: {
          version: '0.71.0',
          bindPort: 7000,
          transportProtocol: 'tcp',
          tlsForce: true,
          dashboardEnabled: false,
        },
        serviceName: 'frp-gui-frps.service',
        installedAt: 1_726_000_000_000,
        enabled: true,
      },
    });

    render(
      <ServerNodeManagerPage
        nodes={[unrememberedReadyNode]}
        onSaveNode={onSaveNode}
        onDeleteNode={vi.fn()}
        onSetDefault={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: `部署 FRPS：${unrememberedReadyNode.name}` }));

    // 录入一次性 SSH 密码、Token 和 sudo 密码
    await user.type(screen.getByPlaceholderText('请输入 SSH 密码'), 'one-time-ssh-pwd');
    await user.type(screen.getByPlaceholderText('客户端连接服务端时必填的密钥'), 'frp-token-unremembered');
    await user.type(screen.getByPlaceholderText('执行远程 systemd 管理需要 sudo 密码'), 'one-time-sudo-pwd');

    await user.click(screen.getByRole('button', { name: '下一步：确认部署' }));
    await user.click(screen.getByRole('button', { name: '确认部署' }));

    await waitFor(() => {
      // 必须写入 Keyring，且使用稳定的衍生引用
      expect(storeFrpsSecrets).toHaveBeenCalledWith(
        'frp-gui/server-node/node_unremembered_deploy',
        expect.objectContaining({
          authToken: 'frp-token-unremembered',
        })
      );
      // 必须向 IPC 传递一次性 SSH 凭据
      expect(runFrpsOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          node: expect.objectContaining({
            id: 'node_unremembered_deploy',
            credentialRef: 'frp-gui/server-node/node_unremembered_deploy',
          }),
          ephemeralSshCredentials: {
            password: 'one-time-ssh-pwd',
          },
          ephemeralSudoPassword: 'one-time-sudo-pwd',
        })
      );
    });

    // 验证回调保存的节点包含稳定公开 credentialRef，且绝不包含 Token、SSH 密码或 sudo 密码
    expect(onSaveNode).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'node_unremembered_deploy',
        credentialRef: 'frp-gui/server-node/node_unremembered_deploy',
        credentialsRemembered: false,
      })
    );
    const saved = onSaveNode.mock.calls[0][0] as FrpServerNode;
    expect(saved.credentialRef).toBe('frp-gui/server-node/node_unremembered_deploy');
    const json = JSON.stringify(saved);
    expect(json).not.toContain('frp-token-unremembered');
    expect(json).not.toContain('one-time-ssh-pwd');
    expect(json).not.toContain('one-time-sudo-pwd');
  });
});

