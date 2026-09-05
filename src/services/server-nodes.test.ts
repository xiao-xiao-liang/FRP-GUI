import { describe, expect, it } from 'vitest';
import { applyServerPreflightResult, buildServerNode, createCredentialRef, validateServerNodeForm } from './server-nodes';
import type { FrpServerNode, ServerNodeFormValues } from '../types/frp';

const values: ServerNodeFormValues = {
  name: '东京 Ubuntu 节点',
  host: '203.0.113.10',
  sshPort: 22,
  username: 'ubuntu',
  authMethod: 'password',
  frpsBindPort: 7000,
  frpsDashboardPort: 7500,
  installDir: '/opt/frp',
  frpsVersion: undefined,
  rememberCredentials: true,
  credentials: { password: 'never-persist-this' },
};

describe('server-nodes', () => {
  it('拒绝缺失主机、用户名和非法 SSH/FRPS 端口', () => {
    const result = validateServerNodeForm({ ...values, host: '', username: '', sshPort: 0, frpsBindPort: 70000 });
    expect(result.valid).toBe(false);
    expect(result.errors).toMatchObject({
      host: '请输入服务器地址',
      username: '请输入 SSH 用户名',
      sshPort: 'SSH 端口需在 1 - 65535 之间',
      frpsBindPort: 'FRPS 端口需在 1 - 65535 之间',
    });
  });

  it('私钥认证要求私钥内容，密码认证要求密码', () => {
    expect(validateServerNodeForm({ ...values, credentials: {} }).errors.credentials).toBe('请输入 SSH 密码');
    expect(validateServerNodeForm({ ...values, authMethod: 'private_key', credentials: {} }).errors.credentials).toBe('请选择或粘贴 SSH 私钥');
  });

  it('构造节点时剥离所有秘密，只保留稳定的凭据引用', () => {
    const node = buildServerNode(values, 'node_tokyo');
    expect(node.credentialRef).toBe('frp-gui/server-node/node_tokyo');
    expect(node.credentialsRemembered).toBe(true);
    expect(JSON.stringify(node)).not.toContain('never-persist-this');
    expect(createCredentialRef('node_tokyo')).toBe('frp-gui/server-node/node_tokyo');
  });

  it('未记住 SSH 凭据的新节点仍有稳定的 credentialRef，且节点 JSON 不含 SSH 秘密', () => {
    const unrememberedValues: ServerNodeFormValues = {
      ...values,
      rememberCredentials: false,
      credentials: { password: 'ephemeral-ssh-password-123' },
    };
    const node = buildServerNode(unrememberedValues, 'node_unremembered');
    expect(node.credentialRef).toBe('frp-gui/server-node/node_unremembered');
    expect(node.credentialsRemembered).toBe(false);
    expect(JSON.stringify(node)).not.toContain('ephemeral-ssh-password-123');
  });

  it('编辑节点时，若未修改 SSH 身份字段则保留可信指纹与完整预检元数据', () => {
    const readyNode: FrpServerNode = {
      ...buildServerNode(values, 'node_tokyo'),
      status: 'ready_to_deploy',
      trustedHostKeyFingerprint: 'SHA256:trusted-key-123',
      remoteOs: 'ubuntu',
      remoteArchitecture: 'amd64',
      lastPreflight: { privilege: 'root', systemd: true, checkedAt: 1_700_000_000_000 },
      lastCheckedAt: 1_700_000_000_000,
    };

    // 仅修改名称与 FRPS 端口
    const updated = buildServerNode(
      { ...values, name: '东京生产节点 (已重命名)', frpsBindPort: 7001 },
      'node_tokyo',
      readyNode
    );

    expect(updated.name).toBe('东京生产节点 (已重命名)');
    expect(updated.frpsBindPort).toBe(7001);
    expect(updated.status).toBe('ready_to_deploy');
    expect(updated.trustedHostKeyFingerprint).toBe('SHA256:trusted-key-123');
    expect(updated.remoteOs).toBe('ubuntu');
    expect(updated.remoteArchitecture).toBe('amd64');
    expect(updated.lastPreflight).toEqual({ privilege: 'root', systemd: true, checkedAt: 1_700_000_000_000 });
  });

  it('编辑节点时，若修改 host、sshPort、username 或 authMethod 则清空预检与信任结果并重置为 draft', () => {
    const readyNode: FrpServerNode = {
      ...buildServerNode(values, 'node_tokyo'),
      status: 'ready_to_deploy',
      trustedHostKeyFingerprint: 'SHA256:trusted-key-123',
      remoteOs: 'ubuntu',
      remoteArchitecture: 'amd64',
      lastPreflight: { privilege: 'root', systemd: true, checkedAt: 1_700_000_000_000 },
      lastCheckedAt: 1_700_000_000_000,
    };

    // 修改服务器 host
    const hostChanged = buildServerNode({ ...values, host: '203.0.113.99' }, 'node_tokyo', readyNode);
    expect(hostChanged.status).toBe('draft');
    expect(hostChanged.trustedHostKeyFingerprint).toBeUndefined();
    expect(hostChanged.remoteOs).toBeUndefined();
    expect(hostChanged.lastPreflight).toBeUndefined();
    expect(hostChanged.lastCheckedAt).toBeUndefined();

    // 修改 sshPort
    const portChanged = buildServerNode({ ...values, sshPort: 2222 }, 'node_tokyo', readyNode);
    expect(portChanged.status).toBe('draft');
    expect(portChanged.trustedHostKeyFingerprint).toBeUndefined();

    // 修改 username
    const userChanged = buildServerNode({ ...values, username: 'debian' }, 'node_tokyo', readyNode);
    expect(userChanged.status).toBe('draft');
    expect(userChanged.trustedHostKeyFingerprint).toBeUndefined();

    // 修改 authMethod
    const authChanged = buildServerNode({ ...values, authMethod: 'private_key' }, 'node_tokyo', readyNode);
    expect(authChanged.status).toBe('draft');
    expect(authChanged.trustedHostKeyFingerprint).toBeUndefined();
  });

  it('只有完整且已信任的 Ubuntu/Debian 预检才能把节点置为可部署', () => {
    const savedNode = buildServerNode(values, 'node_tokyo');
    const next = applyServerPreflightResult(savedNode, {
      outcome: 'ready',
      hostKeyFingerprint: 'SHA256:server-key',
      os: 'ubuntu',
      architecture: 'amd64',
      privilege: 'root',
      systemd: true,
      checkedAt: 1_726_000_000_000,
    });
    expect(next).toMatchObject({
      status: 'ready_to_deploy',
      trustedHostKeyFingerprint: 'SHA256:server-key',
      remoteOs: 'ubuntu',
      remoteArchitecture: 'amd64',
      lastError: undefined,
    });
  });

  it('未确认或已变化的主机指纹绝不写入可信值，且不产生可部署状态', () => {
    const savedNode = buildServerNode(values, 'node_tokyo');
    const next = applyServerPreflightResult(
      { ...savedNode, trustedHostKeyFingerprint: 'SHA256:old' },
      {
        outcome: 'needs_host_trust',
        hostKeyFingerprint: 'SHA256:new',
        errorCode: 'host_key_changed',
        checkedAt: 1_726_000_000_000,
      }
    );
    expect(next.status).toBe('error');
    expect(next.trustedHostKeyFingerprint).toBe('SHA256:old');
    expect(next.lastError).toContain('SSH 主机指纹');
  });

  it('污染节点和污染错误信息经预检合并后均不泄露任何秘密，且使用映射后的固定安全文案', () => {
    // 模拟脏数据污染节点（包含非法运行时秘密字段）
    const pollutedNode = {
      ...buildServerNode(values, 'node_tokyo'),
      password: 'dirty-secret-password-123',
      privateKey: 'dirty-secret-pem-456',
    } as unknown as FrpServerNode;

    // 模拟包含敏感信息的异常后端/网络错误字符串
    const next = applyServerPreflightResult(pollutedNode, {
      outcome: 'failed',
      errorCode: 'authentication_failed',
      errorMessage: 'FATAL: failed auth with password=dirty-secret-password-123 and key=dirty-secret-pem-456',
      checkedAt: 1_726_000_000_000,
    });

    expect(next.status).toBe('error');
    expect(next.lastError).toBe('无法使用当前 SSH 凭据登录');
    expect((next as any).password).toBeUndefined();
    expect((next as any).privateKey).toBeUndefined();
    expect(JSON.stringify(next)).not.toContain('dirty-secret');
  });

  it('不支持系统、权限不足与缺 systemd 均不得进入 ready_to_deploy', () => {
    const savedNode = buildServerNode(values, 'node_tokyo');

    // 不支持系统 (CentOS / unsupported)
    const badOs = applyServerPreflightResult(savedNode, {
      outcome: 'ready',
      hostKeyFingerprint: 'SHA256:server-key',
      os: 'unsupported',
      architecture: 'amd64',
      privilege: 'root',
      systemd: true,
      errorCode: 'unsupported_os',
      checkedAt: 1_726_000_000_000,
    });
    expect(badOs.status).toBe('error');
    expect(badOs.lastError).toBe('仅支持 Ubuntu 与 Debian 操作系统');

    // 需要交互式 sudo 密码 (sudo_password_required) 的合格节点进入 ready_to_deploy 并标记 requiresSudoPassword
    const sudoPasswordNode = applyServerPreflightResult(savedNode, {
      outcome: 'ready',
      hostKeyFingerprint: 'SHA256:server-key',
      os: 'ubuntu',
      architecture: 'amd64',
      privilege: 'sudo_password_required',
      requiresSudoPassword: true,
      systemd: true,
      checkedAt: 1_726_000_000_000,
    });
    expect(sudoPasswordNode.status).toBe('ready_to_deploy');
    expect(sudoPasswordNode.requiresSudoPassword).toBe(true);
    expect(sudoPasswordNode.lastPreflight?.privilege).toBe('sudo_password_required');
    expect(sudoPasswordNode.serviceStatus).not.toBe('running');
    expect(sudoPasswordNode.lastError).toBeUndefined();

    // 无法获取 sudo 权限 (unavailable)
    const badPrivilege = applyServerPreflightResult(savedNode, {
      outcome: 'ready',
      hostKeyFingerprint: 'SHA256:server-key',
      os: 'ubuntu',
      architecture: 'amd64',
      privilege: 'unavailable',
      systemd: true,
      errorCode: 'sudo_required',
      checkedAt: 1_726_000_000_000,
    });
    expect(badPrivilege.status).toBe('error');
    expect(badPrivilege.lastError).toBe('该账号需要交互式 sudo 密码，当前不可部署');

    // 缺少 systemd
    const noSystemd = applyServerPreflightResult(savedNode, {
      outcome: 'ready',
      hostKeyFingerprint: 'SHA256:server-key',
      os: 'ubuntu',
      architecture: 'amd64',
      privilege: 'root',
      systemd: false,
      errorCode: 'systemd_unavailable',
      checkedAt: 1_726_000_000_000,
    });
    expect(noSystemd.status).toBe('error');
    expect(noSystemd.lastError).toBe('目标服务器未检测到可用的 systemd 服务管理器');

    // 命令执行拒绝 (command_failed)
    const cmdFailed = applyServerPreflightResult(savedNode, {
      outcome: 'failed',
      hostKeyFingerprint: 'SHA256:server-key',
      errorCode: 'command_failed',
      errorMessage: 'raw stderr from restricted shell: permission denied',
      checkedAt: 1_726_000_000_000,
    });
    expect(cmdFailed.status).toBe('error');
    expect(cmdFailed.lastError).toBe('服务器拒绝执行预检命令');
  });
});

