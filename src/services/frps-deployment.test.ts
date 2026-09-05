import { describe, expect, it } from 'vitest';
import type { FrpServerNode, FrpsDeploymentDraft } from '../types/frp';
import { applyFrpsOperationResult, sanitizeDeploymentSummary, validateFrpsDeploymentDraft } from './frps-deployment';

const validDraft: FrpsDeploymentDraft = {
  version: '0.71.0',
  bindPort: 7000,
  transportProtocol: 'tcp',
  tlsForce: true,
  dashboardEnabled: true,
  dashboardPort: 7500,
  dashboardUser: 'admin',
  authToken: 'token-never-persist-secret',
  dashboardPassword: 'dashboard-never-persist-secret',
};

const readyNode: FrpServerNode = {
  id: 'node-test-1',
  name: '测试部署节点',
  host: '203.0.113.50',
  sshPort: 22,
  username: 'ubuntu',
  authMethod: 'password',
  credentialsRemembered: true,
  credentialRef: 'frp-gui/server-node/node-test-1',
  frpsBindPort: 7000,
  installDir: '/opt/frp',
  status: 'ready_to_deploy',
  isDefault: false,
  trustedHostKeyFingerprint: 'SHA256:valid-host-key',
  remoteOs: 'ubuntu',
  remoteArchitecture: 'amd64',
  createdAt: 1,
  updatedAt: 1,
};

describe('frps-deployment pure service', () => {
  it('公开摘要和节点更新绝不保留 FRP 秘密', () => {
    const summary = sanitizeDeploymentSummary(validDraft);
    expect(summary).toEqual({
      version: '0.71.0',
      bindPort: 7000,
      transportProtocol: 'tcp',
      tlsForce: true,
      dashboardEnabled: true,
      dashboardPort: 7500,
      dashboardUser: 'admin',
    });
    expect((summary as any).authToken).toBeUndefined();
    expect((summary as any).dashboardPassword).toBeUndefined();

    const updated = applyFrpsOperationResult(readyNode, {
      operation: 'deploy',
      outcome: 'completed',
      serviceStatus: 'running',
      checkedAt: 1_726_000_000_000,
      deployment: {
        summary,
        serviceName: 'frp-gui-frps.service',
        installedAt: 1_726_000_000_000,
        enabled: true,
      },
    });

    expect(updated.serviceStatus).toBe('running');
    expect(updated.deployment?.summary.version).toBe('0.71.0');
    expect(JSON.stringify(updated)).not.toContain('token-never-persist-secret');
    expect(JSON.stringify(updated)).not.toContain('dashboard-never-persist-secret');
  });

  it('校验规则：拒绝非 0.x.y 版本、非法端口、缺少 Token 与 dashboard 凭据', () => {
    // 版本校验
    expect(validateFrpsDeploymentDraft({ ...validDraft, version: 'latest' }).errors.version).toBeTruthy();
    expect(validateFrpsDeploymentDraft({ ...validDraft, version: '1.0.0' }).errors.version).toBeTruthy();
    expect(validateFrpsDeploymentDraft({ ...validDraft, version: '0.71' }).errors.version).toBeTruthy();
    expect(validateFrpsDeploymentDraft({ ...validDraft, version: '0.71.0' }).errors.version).toBeFalsy();

    // 端口校验
    expect(validateFrpsDeploymentDraft({ ...validDraft, bindPort: 0 }).errors.bindPort).toBeTruthy();
    expect(validateFrpsDeploymentDraft({ ...validDraft, bindPort: 70000 }).errors.bindPort).toBeTruthy();
    expect(validateFrpsDeploymentDraft({ ...validDraft, bindPort: 7000 }).errors.bindPort).toBeFalsy();

    // Token 必填
    expect(validateFrpsDeploymentDraft({ ...validDraft, authToken: '' }).errors.authToken).toBeTruthy();
    expect(validateFrpsDeploymentDraft({ ...validDraft, authToken: '   ' }).errors.authToken).toBeTruthy();

    // Dashboard 启用时字段必填与端口冲突校验
    expect(validateFrpsDeploymentDraft({ ...validDraft, dashboardPassword: '' }).errors.dashboardPassword).toBeTruthy();
    expect(validateFrpsDeploymentDraft({ ...validDraft, dashboardUser: '' }).errors.dashboardUser).toBeTruthy();
    expect(validateFrpsDeploymentDraft({ ...validDraft, dashboardPort: undefined }).errors.dashboardPort).toBeTruthy();
    expect(validateFrpsDeploymentDraft({ ...validDraft, dashboardPort: 7000, bindPort: 7000 }).errors.dashboardPort).toContain('相同');

    // Dashboard 关闭时不需要填写 dashboard 密码与端口
    const withoutDashboard = { ...validDraft, dashboardEnabled: false, dashboardPassword: '', dashboardPort: undefined, dashboardUser: '' };
    const result = validateFrpsDeploymentDraft(withoutDashboard);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('状态归并：操作失败时更新 serviceStatus 与 lastError，且不进入 running', () => {
    const updated = applyFrpsOperationResult(readyNode, {
      operation: 'start',
      outcome: 'failed',
      serviceStatus: 'failed',
      errorCode: 'service_failed',
      errorMessage: 'FRPS 服务启动失败，端口可能已被占用',
      checkedAt: 1_726_000_000_100,
    });

    expect(updated.serviceStatus).toBe('failed');
    expect(updated.lastError).toBe('FRPS 服务启动失败，端口可能已被占用');
    expect(updated.lastOperation?.operation).toBe('start');
    expect(updated.lastOperation?.errorCode).toBe('service_failed');
  });
});
