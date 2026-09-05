import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runFrpsOperation, storeFrpsSecrets } from './ipc';
import { FrpServerNode } from '../types/frp';

describe('FRPS Deployment IPC', () => {
  const readyNode: FrpServerNode = {
    id: 'node-1',
    name: 'Production Node',
    host: '1.2.3.4',
    sshPort: 22,
    username: 'deploy',
    authMethod: 'password',
    credentialRef: 'frp-gui/server-node/node-1',
    credentialsRemembered: false,
    frpsBindPort: 7000,
    installDir: '/opt/frp',
    status: 'ready_to_deploy',
    isDefault: false,
    remoteOs: 'ubuntu',
    remoteArchitecture: 'amd64',
    privilege: 'sudo_password_required',
    systemd: true,
    requiresSudoPassword: true,
    trustedHostKeyFingerprint: 'SHA256:abcd1234efgh5678',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const publicDraft = {
    version: '0.71.0',
    bindPort: 7000,
    transportProtocol: 'tcp' as const,
    tlsForce: true,
    dashboardEnabled: true,
    dashboardPort: 7500,
    dashboardUser: 'admin',
    authToken: 'my-token',
    dashboardPassword: 'my-dash-pwd',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('在非桌面浏览器环境中明确拒绝部署与操作调用', async () => {
    await expect(
      runFrpsOperation({
        node: readyNode,
        operation: 'deploy',
        deployment: publicDraft,
        confirmation: { accepted: true },
      })
    ).rejects.toThrow(/桌面版/);

    await expect(
      storeFrpsSecrets('ref-1', { authToken: 'token' })
    ).rejects.toThrow(/桌面版/);
  });

  it('部署 IPC 只发送白名单字段，不透传命令、URL 和路径', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      operation: 'deploy',
      outcome: 'completed',
      serviceStatus: 'running',
      checkedAt: Date.now(),
    });

    (window as any).__TAURI__ = {
      core: {
        invoke: mockInvoke,
      },
    };

    await runFrpsOperation({
      node: readyNode,
      operation: 'deploy',
      deployment: {
        ...publicDraft,
        command: 'id',
        downloadUrl: 'https://evil.com/malicious.tar.gz',
        installDir: 'C:/x',
        evilScript: 'rm -rf /',
      } as any,
      confirmation: { accepted: true, shell: 'bash', dangerousFlag: true } as any,
      ephemeralSshCredentials: { password: 'ssh-secret' },
      ephemeralSudoPassword: 'sudo-secret',
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockInvoke.mock.calls[0];
    expect(cmd).toBe('run_frps_operation');

    const request = args.request;
    const json = JSON.stringify(request);

    // 确保绝对不包含 command / downloadUrl / evilScript 等任意命令字段
    expect(json).not.toContain('"command"');
    expect(json).not.toContain('downloadUrl');
    expect(json).not.toContain('evilScript');
    expect(json).not.toContain('"shell"');
    expect(json).not.toContain('dangerousFlag');

    // 校验 deployment 对象内部已彻底剔除 Token、Dashboard 密码和注入字段
    expect('command' in request.deployment).toBe(false);
    expect('downloadUrl' in request.deployment).toBe(false);
    expect('installDir' in request.deployment).toBe(false);
    expect('authToken' in request.deployment).toBe(false);
    expect('dashboardPassword' in request.deployment).toBe(false);
    expect('shell' in request.confirmation).toBe(false);

    // 校验白名单正常传递
    expect(request.deployment.version).toBe('0.71.0');
    expect(request.deployment.bindPort).toBe(7000);
    expect(request.deployment.transportProtocol).toBe('tcp');
    expect(request.confirmation.accepted).toBe(true);
    expect(request.ephemeralSudoPassword).toBe('sudo-secret');
    expect(request.ephemeralSshCredentials?.password).toBe('ssh-secret');
  });

  it('已记住凭据节点不发送 ephemeralSshCredentials，未记住节点才发送', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      operation: 'start',
      outcome: 'completed',
      serviceStatus: 'running',
      checkedAt: Date.now(),
    });

    (window as any).__TAURI__ = {
      core: {
        invoke: mockInvoke,
      },
    };

    // 已记住节点
    const rememberedNode: FrpServerNode = {
      ...readyNode,
      credentialsRemembered: true,
    };

    await runFrpsOperation({
      node: rememberedNode,
      operation: 'start',
      ephemeralSshCredentials: { password: 'should-be-stripped' },
    });

    let request = mockInvoke.mock.calls[0][1].request;
    expect(request.ephemeralSshCredentials).toBeUndefined();

    // 未记住节点
    await runFrpsOperation({
      node: readyNode,
      operation: 'start',
      ephemeralSshCredentials: { password: 'one-time-pwd' },
    });

    request = mockInvoke.mock.calls[1][1].request;
    expect(request.ephemeralSshCredentials?.password).toBe('one-time-pwd');
  });

  it('storeFrpsSecrets 仅在明确选择时持久化 sudo 密码，必须写入 Token', async () => {
    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    (window as any).__TAURI__ = {
      core: {
        invoke: mockInvoke,
      },
    };

    // 1. 不记住 sudo 密码
    await storeFrpsSecrets('ref-1', {
      authToken: 'token-abc',
      dashboardPassword: 'dash-pwd',
      sudoPassword: 'sudo-pwd',
      rememberSudoPassword: false,
    });

    expect(mockInvoke).toHaveBeenCalledWith('store_server_credential', {
      reference: 'ref-1',
      kind: 'frp_token',
      secret: 'token-abc',
    });
    expect(mockInvoke).toHaveBeenCalledWith('store_server_credential', {
      reference: 'ref-1',
      kind: 'dashboard_password',
      secret: 'dash-pwd',
    });
    expect(mockInvoke).not.toHaveBeenCalledWith('store_server_credential', expect.objectContaining({
      kind: 'sudo_password',
    }));

    // 2. 勾选记住 sudo 密码
    mockInvoke.mockClear();
    await storeFrpsSecrets('ref-1', {
      authToken: 'token-abc',
      sudoPassword: 'sudo-pwd',
      rememberSudoPassword: true,
    });

    expect(mockInvoke).toHaveBeenCalledWith('store_server_credential', {
      reference: 'ref-1',
      kind: 'sudo_password',
      secret: 'sudo-pwd',
    });
  });

  it('root、免密 sudo、已记住 sudo 密码以及刷新状态操作均严格剥离 ephemeralSudoPassword', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      operation: 'start',
      outcome: 'completed',
      serviceStatus: 'running',
      checkedAt: Date.now(),
    });

    (window as any).__TAURI__ = {
      core: {
        invoke: mockInvoke,
      },
    };

    // 1. root 节点：即使调用方传入 ephemeralSudoPassword，IPC 仍剥离
    const rootNode: FrpServerNode = {
      ...readyNode,
      privilege: 'root',
      requiresSudoPassword: false,
    };
    await runFrpsOperation({
      node: rootNode,
      operation: 'start',
      ephemeralSudoPassword: 'leak-sudo-password-1',
    });
    let request = mockInvoke.mock.calls[0][1].request;
    expect(request.ephemeralSudoPassword).toBeUndefined();

    // 2. 免密 sudo 节点：即使调用方传入 ephemeralSudoPassword，IPC 仍剥离
    const passwordlessNode: FrpServerNode = {
      ...readyNode,
      privilege: 'sudo_passwordless',
      requiresSudoPassword: false,
    };
    await runFrpsOperation({
      node: passwordlessNode,
      operation: 'start',
      ephemeralSudoPassword: 'leak-sudo-password-2',
    });
    request = mockInvoke.mock.calls[1][1].request;
    expect(request.ephemeralSudoPassword).toBeUndefined();

    // 3. 已记住 sudo 密码节点：即使调用方传入 ephemeralSudoPassword，IPC 仍剥离
    const rememberedSudoNode: FrpServerNode = {
      ...readyNode,
      privilege: 'sudo_password_required',
      sudoCredentialsRemembered: true,
    };
    await runFrpsOperation({
      node: rememberedSudoNode,
      operation: 'start',
      ephemeralSudoPassword: 'leak-sudo-password-3',
    });
    request = mockInvoke.mock.calls[2][1].request;
    expect(request.ephemeralSudoPassword).toBeUndefined();

    // 4. refresh_status 操作：即使是 sudo_password_required 且未记住，IPC 仍剥离
    await runFrpsOperation({
      node: readyNode,
      operation: 'refresh_status',
      ephemeralSudoPassword: 'leak-sudo-password-4',
    });
    request = mockInvoke.mock.calls[3][1].request;
    expect(request.ephemeralSudoPassword).toBeUndefined();
  });

  it('密码认证节点仅透传 password，不透传私钥字段；私钥认证节点仅透传 privateKey，不透传密码字段', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      operation: 'start',
      outcome: 'completed',
      serviceStatus: 'running',
      checkedAt: Date.now(),
    });

    (window as any).__TAURI__ = {
      core: {
        invoke: mockInvoke,
      },
    };

    // 1. 密码认证节点：即使被混入了私钥字段，IPC 仅透传 password
    const pwdNode: FrpServerNode = {
      ...readyNode,
      authMethod: 'password',
      credentialsRemembered: false,
    };
    await runFrpsOperation({
      node: pwdNode,
      operation: 'start',
      ephemeralSshCredentials: {
        password: 'valid-ssh-password',
        privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nshould_be_stripped',
        privateKeyPassphrase: 'stripped-passphrase',
      },
    });

    let request = mockInvoke.mock.calls[0][1].request;
    expect(request.ephemeralSshCredentials).toEqual({
      password: 'valid-ssh-password',
    });
    expect('privateKey' in request.ephemeralSshCredentials).toBe(false);
    expect('privateKeyPassphrase' in request.ephemeralSshCredentials).toBe(false);

    // 2. 私钥认证节点：即使被混入了密码字段，IPC 仅透传 privateKey 与 passphrase
    const keyNode: FrpServerNode = {
      ...readyNode,
      authMethod: 'private_key',
      credentialsRemembered: false,
    };
    await runFrpsOperation({
      node: keyNode,
      operation: 'start',
      ephemeralSshCredentials: {
        password: 'should_be_stripped_pwd',
        privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nmy_key',
        privateKeyPassphrase: 'my-passphrase',
      },
    });

    request = mockInvoke.mock.calls[1][1].request;
    expect(request.ephemeralSshCredentials).toEqual({
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nmy_key',
      privateKeyPassphrase: 'my-passphrase',
    });
    expect('password' in request.ephemeralSshCredentials).toBe(false);
  });
});
