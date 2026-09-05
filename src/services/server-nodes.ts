import type { FrpServerNode, ServerNodeFormValues, ServerPreflightResult } from '../types/frp';

export const createCredentialRef = (nodeId: string) => `frp-gui/server-node/${nodeId}`;
const validPort = (value: number) => Number.isInteger(value) && value >= 1 && value <= 65535;

const PREFLIGHT_ERROR_MESSAGES: Record<NonNullable<ServerPreflightResult['errorCode']>, string> = {
  host_key_changed: 'SSH 主机指纹发生变化，连接已安全中断',
  authentication_failed: '无法使用当前 SSH 凭据登录',
  network_failed: '无法建立 SSH 网络连接',
  unsupported_os: '仅支持 Ubuntu 与 Debian 操作系统',
  unsupported_architecture: '仅支持 x86_64 (amd64) 或 aarch64 (arm64) 架构',
  sudo_required: '该账号需要交互式 sudo 密码，当前不可部署',
  systemd_unavailable: '目标服务器未检测到可用的 systemd 服务管理器',
  credential_required: '需要提供 SSH 认证凭据',
  command_failed: '服务器拒绝执行预检命令',
  unknown: 'SSH 预检未通过',
};


function getSafePreflightErrorMessage(result: ServerPreflightResult): string {
  if (result.errorCode && PREFLIGHT_ERROR_MESSAGES[result.errorCode]) {
    return PREFLIGHT_ERROR_MESSAGES[result.errorCode];
  }
  if (result.outcome === 'needs_host_trust') {
    return '请确认 SSH 主机指纹';
  }
  if (result.outcome === 'needs_credentials') {
    return '需要提供 SSH 认证凭据';
  }
  return 'SSH 主机指纹尚未确认或预检未通过';
}

export function validateServerNodeForm(values: ServerNodeFormValues) {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = '请输入节点名称';
  if (!values.host.trim()) errors.host = '请输入服务器地址';
  if (!values.username.trim()) errors.username = '请输入 SSH 用户名';
  if (!validPort(values.sshPort)) errors.sshPort = 'SSH 端口需在 1 - 65535 之间';
  if (!validPort(values.frpsBindPort)) errors.frpsBindPort = 'FRPS 端口需在 1 - 65535 之间';
  if (values.authMethod === 'password' && !values.credentials.password?.trim()) errors.credentials = '请输入 SSH 密码';
  if (values.authMethod === 'private_key' && !values.credentials.privateKey?.trim()) errors.credentials = '请选择或粘贴 SSH 私钥';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function buildServerNode(values: ServerNodeFormValues, id: string, existing?: FrpServerNode): FrpServerNode {
  const now = Date.now();
  const trimmedName = values.name.trim();
  const trimmedHost = values.host.trim();
  const trimmedUsername = values.username.trim();
  const trimmedInstallDir = values.installDir.trim() || '/opt/frp';

  // 检查是否修改了影响 SSH 身份的核心字段
  const identityChanged =
    !existing ||
    existing.host !== trimmedHost ||
    existing.sshPort !== values.sshPort ||
    existing.username !== trimmedUsername ||
    existing.authMethod !== values.authMethod;

  return {
    id,
    name: trimmedName,
    host: trimmedHost,
    sshPort: values.sshPort,
    username: trimmedUsername,
    authMethod: values.authMethod,
    credentialRef: existing?.credentialRef || createCredentialRef(id),
    credentialsRemembered: values.rememberCredentials,
    frpsBindPort: values.frpsBindPort,
    frpsDashboardPort: values.frpsDashboardPort,
    installDir: trimmedInstallDir,
    frpsVersion: values.frpsVersion,
    status: identityChanged ? 'draft' : existing.status,
    isDefault: existing?.isDefault ?? false,
    trustedHostKeyFingerprint: identityChanged ? undefined : existing.trustedHostKeyFingerprint,
    remoteOs: identityChanged ? undefined : existing.remoteOs,
    remoteArchitecture: identityChanged ? undefined : existing.remoteArchitecture,
    privilege: identityChanged ? undefined : existing.privilege,
    systemd: identityChanged ? undefined : existing.systemd,
    requiresSudoPassword: identityChanged ? undefined : existing.requiresSudoPassword,
    sudoCredentialsRemembered: identityChanged ? undefined : existing.sudoCredentialsRemembered,
    deployment: identityChanged ? undefined : existing.deployment,
    serviceStatus: identityChanged ? undefined : existing.serviceStatus,
    lastOperation: identityChanged ? undefined : existing.lastOperation,
    lastPreflight: identityChanged ? undefined : existing.lastPreflight,
    lastCheckedAt: identityChanged ? undefined : existing.lastCheckedAt,
    lastError: identityChanged ? undefined : existing.lastError,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function applyServerPreflightResult(node: FrpServerNode, result: ServerPreflightResult): FrpServerNode {
  const isSupportedOs = result.os === 'ubuntu' || result.os === 'debian';
  const isSupportedArch = result.architecture === 'amd64' || result.architecture === 'arm64';
  const isSystemdOk = result.systemd === true;
  const isPrivilegeOk =
    result.privilege === 'root' ||
    result.privilege === 'sudo_passwordless' ||
    result.privilege === 'sudo_password_required';

  const isReady =
    result.outcome === 'ready' &&
    Boolean(result.hostKeyFingerprint) &&
    isSupportedOs &&
    isSupportedArch &&
    isPrivilegeOk &&
    isSystemdOk;

  const requiresSudoPassword =
    isReady && (result.privilege === 'sudo_password_required' || Boolean(result.requiresSudoPassword));

  // 显式白名单字段重建，绝不展开 ...node
  return {
    id: node.id,
    name: node.name,
    host: node.host,
    sshPort: node.sshPort,
    username: node.username,
    authMethod: node.authMethod,
    credentialRef: node.credentialRef || createCredentialRef(node.id),
    credentialsRemembered: node.credentialsRemembered,
    frpsBindPort: node.frpsBindPort,
    frpsDashboardPort: node.frpsDashboardPort,
    installDir: node.installDir,
    frpsVersion: node.frpsVersion,
    isDefault: node.isDefault,
    status: isReady ? 'ready_to_deploy' : 'error',
    trustedHostKeyFingerprint: isReady ? result.hostKeyFingerprint : node.trustedHostKeyFingerprint,
    remoteOs: isReady ? (result.os as 'ubuntu' | 'debian') : undefined,
    remoteArchitecture: isReady ? (result.architecture as 'amd64' | 'arm64') : undefined,
    privilege: isReady ? result.privilege : undefined,
    systemd: isReady ? result.systemd : undefined,
    requiresSudoPassword,
    sudoCredentialsRemembered: node.sudoCredentialsRemembered,
    deployment: node.deployment,
    serviceStatus: node.serviceStatus,
    lastOperation: node.lastOperation,
    lastPreflight: isReady
      ? { privilege: result.privilege!, systemd: true, checkedAt: result.checkedAt }
      : undefined,
    lastCheckedAt: result.checkedAt,
    lastError: isReady ? undefined : getSafePreflightErrorMessage(result),
    createdAt: node.createdAt,
    updatedAt: Date.now(),
  };
}
