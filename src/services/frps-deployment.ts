import type {
  FrpServerNode,
  FrpsDeploymentDraft,
  FrpsDeploymentSummary,
  ServerOperationResult,
} from '../types/frp';

const validPort = (value: number | undefined): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535;

const VERSION_REGEX = /^0\.[0-9]+\.[0-9]+$/;

/**
 * 剥离 FRP 机密数据（authToken, dashboardPassword），生成安全的公开摘要
 */
export function sanitizeDeploymentSummary(draft: FrpsDeploymentDraft): FrpsDeploymentSummary {
  return {
    version: draft.version,
    bindPort: draft.bindPort,
    transportProtocol: draft.transportProtocol,
    tlsForce: Boolean(draft.tlsForce),
    dashboardEnabled: Boolean(draft.dashboardEnabled),
    dashboardPort: draft.dashboardEnabled ? draft.dashboardPort : undefined,
    dashboardUser: draft.dashboardEnabled ? draft.dashboardUser : undefined,
  };
}

/**
 * 校验 FRPS 部署表单草稿
 */
export function validateFrpsDeploymentDraft(draft: Partial<FrpsDeploymentDraft>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!draft.version || !VERSION_REGEX.test(draft.version.trim())) {
    errors.version = '版本格式需为 0.x.y（例如 0.71.0）';
  }

  if (!validPort(draft.bindPort)) {
    errors.bindPort = '服务监听端口需在 1 - 65535 之间';
  }

  if (!draft.transportProtocol || !['tcp', 'kcp', 'quic'].includes(draft.transportProtocol)) {
    errors.transportProtocol = '请选择有效的传输协议 (tcp / kcp / quic)';
  }

  if (!draft.authToken || !draft.authToken.trim()) {
    errors.authToken = '请输入 FRP 客户端连接鉴权 Token';
  }

  if (draft.dashboardEnabled) {
    if (!validPort(draft.dashboardPort)) {
      errors.dashboardPort = '控制台端口需在 1 - 65535 之间';
    } else if (draft.dashboardPort === draft.bindPort) {
      errors.dashboardPort = '控制台端口不能与服务监听端口相同';
    }

    if (!draft.dashboardUser || !draft.dashboardUser.trim()) {
      errors.dashboardUser = '请输入控制台用户名';
    }

    if (!draft.dashboardPassword || !draft.dashboardPassword.trim()) {
      errors.dashboardPassword = '请输入控制台密码';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * 将受控 FRPS 操作结果安全合并到节点对象中，确保不引入任何机密字段
 */
export function applyFrpsOperationResult(
  node: FrpServerNode,
  result: ServerOperationResult
): FrpServerNode {
  const now = Date.now();
  let nextStatus = node.status;
  if (result.outcome === 'completed') {
    if (result.serviceStatus === 'running') {
      nextStatus = 'running';
    } else if (result.serviceStatus === 'stopped') {
      nextStatus = 'stopped';
    }
  } else if (result.outcome === 'failed') {
    nextStatus = 'error';
  }

  return {
    id: node.id,
    name: node.name,
    host: node.host,
    sshPort: node.sshPort,
    username: node.username,
    authMethod: node.authMethod,
    credentialRef: node.credentialRef || `frp-gui/server-node/${node.id}`,
    credentialsRemembered: node.credentialsRemembered,
    frpsBindPort: result.deployment ? result.deployment.summary.bindPort : node.frpsBindPort,
    frpsDashboardPort: result.deployment ? result.deployment.summary.dashboardPort : node.frpsDashboardPort,
    installDir: node.installDir,
    frpsVersion: result.deployment ? result.deployment.summary.version : node.frpsVersion,
    status: nextStatus,
    isDefault: node.isDefault,
    trustedHostKeyFingerprint: node.trustedHostKeyFingerprint,
    remoteOs: node.remoteOs,
    remoteArchitecture: node.remoteArchitecture,
    privilege: node.privilege,
    systemd: node.systemd,
    requiresSudoPassword: node.requiresSudoPassword,
    sudoCredentialsRemembered: node.sudoCredentialsRemembered,
    deployment: result.deployment ? result.deployment : node.deployment,
    serviceStatus: result.serviceStatus,
    lastOperation: {
      operation: result.operation,
      checkedAt: result.checkedAt,
      errorCode: result.errorCode,
    },
    lastPreflight: node.lastPreflight,
    lastCheckedAt: node.lastCheckedAt,
    lastError: result.outcome === 'failed' ? result.errorMessage : undefined,
    createdAt: node.createdAt,
    updatedAt: now,
  };
}
