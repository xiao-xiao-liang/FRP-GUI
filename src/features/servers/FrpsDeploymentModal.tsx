import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import type { FrpServerNode, FrpsDeploymentDraft, ServerOperationResult } from '../../types/frp';
import { isTauriEnv, runFrpsOperation, storeFrpsSecrets } from '../../services/ipc';
import { applyFrpsOperationResult, validateFrpsDeploymentDraft } from '../../services/frps-deployment';
import { createCredentialRef } from '../../services/server-nodes';
import { Button } from '../../components/ui/button';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { FeishuInput } from '../../components/ui/feishu-table/FeishuInput';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { feishuToast } from '../../components/ui/FeishuToast';

export interface FrpsDeploymentModalProps {
  node: FrpServerNode | null;
  visible: boolean;
  onClose: () => void;
  onComplete: (updatedNode: FrpServerNode) => void;
}

type DeploymentStage = 'config' | 'confirm' | 'progress';

export const FrpsDeploymentModal: React.FC<FrpsDeploymentModalProps> = ({
  node,
  visible,
  onClose,
  onComplete,
}) => {
  const desktopAvailable = isTauriEnv();
  const [stage, setStage] = useState<DeploymentStage>('config');

  // 配置项
  const [version, setVersion] = useState('0.71.0');
  const [bindPort, setBindPort] = useState(7000);
  const [transportProtocol, setTransportProtocol] = useState<'tcp' | 'kcp' | 'quic'>('tcp');
  const [tlsForce, setTlsForce] = useState(true);
  const [dashboardEnabled, setDashboardEnabled] = useState(false);
  const [dashboardPort, setDashboardPort] = useState(7500);
  const [dashboardUser, setDashboardUser] = useState('admin');

  // 机密字段（在内存中管理，取消/关闭/成功/失败时必须清空）
  const [authToken, setAuthToken] = useState('');
  const [dashboardPassword, setDashboardPassword] = useState('');
  const [sudoPassword, setSudoPassword] = useState('');
  const [rememberSudoPassword, setRememberSudoPassword] = useState(false);
  const [ephemeralSshPassword, setEphemeralSshPassword] = useState('');
  const [ephemeralPrivateKey, setEphemeralPrivateKey] = useState('');
  const [ephemeralPrivateKeyPassphrase, setEphemeralPrivateKeyPassphrase] = useState('');

  // 显隐切换
  const [showToken, setShowToken] = useState(false);
  const [showDashPwd, setShowDashPwd] = useState(false);
  const [showSudoPwd, setShowSudoPwd] = useState(false);
  const [showSshPwd, setShowSshPwd] = useState(false);

  // 执行状态与结果
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState<ServerOperationResult | null>(null);

  // 清空内存中所有秘密
  const wipeSecrets = () => {
    setAuthToken('');
    setDashboardPassword('');
    setSudoPassword('');
    setEphemeralSshPassword('');
    setEphemeralPrivateKey('');
    setEphemeralPrivateKeyPassphrase('');
  };

  const handleClose = () => {
    if (isDeploying) return;
    wipeSecrets();
    setErrors({});
    setDeploymentResult(null);
    setStage('config');
    onClose();
  };

  useEffect(() => {
    if (visible && node) {
      wipeSecrets();
      setStage('config');
      setErrors({});
      setDeploymentResult(null);
      setIsDeploying(false);
      setVersion(node.frpsVersion || '0.71.0');
      setBindPort(node.frpsBindPort || 7000);
      setDashboardPort(node.frpsDashboardPort || 7500);
      setRememberSudoPassword(Boolean(node.sudoCredentialsRemembered));
    }
    return () => {
      wipeSecrets();
    };
  }, [visible, node]);

  if (!node) return null;

  const validateConfigStage = (): boolean => {
    const draft: Partial<FrpsDeploymentDraft> = {
      version,
      bindPort,
      transportProtocol,
      tlsForce,
      authToken,
      dashboardEnabled,
      dashboardPort: dashboardEnabled ? dashboardPort : undefined,
      dashboardUser: dashboardEnabled ? dashboardUser : undefined,
      dashboardPassword: dashboardEnabled ? dashboardPassword : undefined,
    };

    const validation = validateFrpsDeploymentDraft(draft);
    const newErrors = { ...validation.errors };

    // Sudo 提权密码校验
    if (
      node.privilege === 'sudo_password_required' &&
      !node.sudoCredentialsRemembered &&
      !sudoPassword.trim()
    ) {
      newErrors.sudoPassword = '请输入该服务器的 sudo 提权密码';
    }

    // 未记住 SSH 凭据时的临时凭据校验
    if (!node.credentialsRemembered) {
      if (node.authMethod === 'password' && !ephemeralSshPassword.trim()) {
        newErrors.sshPassword = '请输入本次 SSH 登录密码';
      }
      if (node.authMethod === 'private_key' && !ephemeralPrivateKey.trim()) {
        newErrors.sshPrivateKey = '请输入本次 SSH 私钥';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNextToConfirm = () => {
    if (!validateConfigStage()) return;
    setStage('confirm');
  };

  const executeDeployment = async () => {
    if (!desktopAvailable) {
      feishuToast.error('FRPS 部署需要桌面版应用');
      return;
    }

    setIsDeploying(true);
    setStage('progress');
    setDeploymentResult(null);

    // 1. 先从 UI 状态中提取并构造操作请求所需的局部变量
    const secretAuthToken = authToken;
    const secretDashboardPassword = dashboardPassword;
    const secretSudoPassword = sudoPassword;
    const isRememberSudo = rememberSudoPassword;
    const secretSshPassword = ephemeralSshPassword;
    const secretPrivateKey = ephemeralPrivateKey;
    const secretPrivateKeyPassphrase = ephemeralPrivateKeyPassphrase;

    // 确保节点具有稳定的凭据引用（旧节点兼容兜底）
    const effectiveCredentialRef = node.credentialRef ?? createCredentialRef(node.id);
    const targetNode = node.credentialRef ? node : { ...node, credentialRef: effectiveCredentialRef };

    // 构造受控操作参数
    const operationParams = {
      node: targetNode,
      operation: 'deploy' as const,
      deployment: {
        version,
        bindPort,
        transportProtocol,
        tlsForce,
        dashboardEnabled,
        dashboardPort: dashboardEnabled ? dashboardPort : undefined,
        dashboardUser: dashboardEnabled ? dashboardUser : undefined,
      },
      confirmation: { accepted: true },
      ephemeralSshCredentials: !node.credentialsRemembered
        ? {
            password: node.authMethod === 'password' ? secretSshPassword : undefined,
            privateKey: node.authMethod === 'private_key' ? secretPrivateKey : undefined,
            privateKeyPassphrase:
              node.authMethod === 'private_key' ? secretPrivateKeyPassphrase : undefined,
          }
        : undefined,
      ephemeralSudoPassword:
        node.privilege === 'sudo_password_required' &&
        !node.sudoCredentialsRemembered &&
        !isRememberSudo
          ? secretSudoPassword
          : undefined,
    };

    try {
      // 2. FRP Token 与 Dashboard 密码始终写入稳定引用的 Keyring
      await storeFrpsSecrets(effectiveCredentialRef, {
        authToken: secretAuthToken,
        dashboardPassword: dashboardEnabled ? secretDashboardPassword : undefined,
        sudoPassword: (isRememberSudo && secretSudoPassword) ? secretSudoPassword : undefined,
        rememberSudoPassword: isRememberSudo,
      });

      // Keyring 写入成功后，立刻清空 Token、Dashboard 密码以及已记住的 sudo 密码
      setAuthToken('');
      setDashboardPassword('');
      if (isRememberSudo) {
        setSudoPassword('');
      }

      // 发起 runFrpsOperation 时，立即清空 UI state 中的全部临时凭据
      wipeSecrets();

      // 3. 调用受控 IPC 执行远程部署
      const res = await runFrpsOperation(operationParams);

      setDeploymentResult(res);

      if (res.outcome === 'completed') {
        feishuToast.success('FRPS 服务部署并启动成功');
        const updated = applyFrpsOperationResult(targetNode, res);
        if (isRememberSudo) {
          updated.sudoCredentialsRemembered = true;
        }
        if (!updated.credentialRef) {
          updated.credentialRef = effectiveCredentialRef;
        }
        onComplete(updated);
      } else {
        feishuToast.error(res.errorMessage || 'FRPS 部署失败');
        const updated = applyFrpsOperationResult(targetNode, res);
        if (!updated.credentialRef) {
          updated.credentialRef = effectiveCredentialRef;
        }
        onComplete(updated);
      }
    } catch (err: any) {
      const msg = err?.message || '执行部署操作失败';
      feishuToast.error(msg);
      const failResult: ServerOperationResult = {
        operation: 'deploy',
        outcome: 'failed',
        serviceStatus: 'failed',
        checkedAt: Date.now(),
        errorCode: 'unknown',
        errorMessage: msg,
      };
      setDeploymentResult(failResult);
      const updated = applyFrpsOperationResult(targetNode, failResult);
      if (!updated.credentialRef) {
        updated.credentialRef = effectiveCredentialRef;
      }
      onComplete(updated);
    } finally {
      // 关键安全原则：无论成功失败，确保清空内存中的敏感凭据
      wipeSecrets();
      setIsDeploying(false);
    }
  };

  return (
    <FeishuDialog
      visible={visible}
      title={
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-[#3370FF]" />
          <span>部署 FRPS 服务 - {node.name}</span>
        </div>
      }
      width={560}
      onCancel={handleClose}
      footer={null}
    >
      <div
        data-testid="secret-state-probe"
        data-secrets-cleared={
          !authToken &&
          !dashboardPassword &&
          !sudoPassword &&
          !ephemeralSshPassword &&
          !ephemeralPrivateKey
        }
        className="hidden"
      />
      {!desktopAvailable ? (
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 rounded-[8px] border border-[#DEE0E3] bg-[#F9FAFB] p-3 text-[13px] text-[#646A73]">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#ED6D0C]" />
            <div>
              <p className="font-medium text-[#1F2329]">需要桌面版应用环境</p>
              <p className="mt-1">FRPS 部署与远程服务管理需要 Tauri 桌面版应用。请在已安装的 FRP-GUI 客户端中执行部署。</p>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="button" onClick={handleClose}>关闭</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 阶段指示器 */}
          <div className="flex items-center justify-between border-b border-[#EFF0F1] pb-3 text-[12px]">
            <div className={`flex items-center gap-1.5 font-medium ${stage === 'config' ? 'text-[#3370FF]' : 'text-[#8F959E]'}`}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F0F4FF] text-[11px] font-semibold text-[#3370FF]">1</span>
              <span>配置参数</span>
            </div>
            <div className="h-[1px] w-8 bg-[#DEE0E3]" />
            <div className={`flex items-center gap-1.5 font-medium ${stage === 'confirm' ? 'text-[#3370FF]' : 'text-[#8F959E]'}`}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F0F4FF] text-[11px] font-semibold text-[#3370FF]">2</span>
              <span>确认变更</span>
            </div>
            <div className="h-[1px] w-8 bg-[#DEE0E3]" />
            <div className={`flex items-center gap-1.5 font-medium ${stage === 'progress' ? 'text-[#3370FF]' : 'text-[#8F959E]'}`}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F0F4FF] text-[11px] font-semibold text-[#3370FF]">3</span>
              <span>执行与结果</span>
            </div>
          </div>

          {/* 阶段 1：配置 */}
          {stage === 'config' && (
            <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="frps-version" className="block text-[12px] font-medium text-[#1F2329]">FRPS 版本</label>
                  <FeishuInput
                    id="frps-version"
                    aria-label="FRPS 版本"
                    value={version}
                    onChange={(val) => setVersion(val)}
                    placeholder="0.71.0"
                    status={errors.version ? 'error' : undefined}
                    className="mt-1"
                  />
                  {errors.version && <p className="mt-1 text-[11px] text-[#F53F3F]">{errors.version}</p>}
                </div>
                <div>
                  <label htmlFor="frps-bind-port" className="block text-[12px] font-medium text-[#1F2329]">服务监听端口 (bindPort)</label>
                  <FeishuInput
                    id="frps-bind-port"
                    aria-label="服务监听端口"
                    type="number"
                    value={bindPort ? String(bindPort) : ''}
                    onChange={(val) => setBindPort(Number(val))}
                    placeholder="7000"
                    status={errors.bindPort ? 'error' : undefined}
                    className="mt-1"
                  />
                  {errors.bindPort && <p className="mt-1 text-[11px] text-[#F53F3F]">{errors.bindPort}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#1F2329]">传输协议</label>
                  <select
                    value={transportProtocol}
                    onChange={(e) => setTransportProtocol(e.target.value as any)}
                    className="mt-1 block w-full rounded-[6px] border border-[#DEE0E3] bg-white px-2.5 py-1.5 text-[13px] text-[#1F2329] focus:border-[#3370FF] focus:outline-none"
                  >
                    <option value="tcp">TCP</option>
                    <option value="kcp">KCP</option>
                    <option value="quic">QUIC</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#1F2329]">
                    <input
                      type="checkbox"
                      checked={tlsForce}
                      onChange={(e) => setTlsForce(e.target.checked)}
                      className="h-4 w-4 rounded border-[#DEE0E3] text-[#3370FF] focus:ring-[#3370FF]"
                    />
                    <span>强制启用 TLS 传输加密</span>
                  </label>
                </div>
              </div>

              {/* FRP 认证 Token */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="frps-auth-token" className="block text-[12px] font-medium text-[#1F2329]">
                    FRP 认证 Token <span className="text-[#F53F3F]">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="flex items-center gap-1 text-[11px] text-[#646A73] hover:text-[#3370FF]"
                  >
                    {showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showToken ? '隐藏' : '显示'}
                  </button>
                </div>
                <FeishuInput
                  id="frps-auth-token"
                  aria-label="FRP 认证 Token"
                  type={showToken ? 'text' : 'password'}
                  value={authToken}
                  onChange={(val) => setAuthToken(val)}
                  placeholder="客户端连接服务端时必填的密钥"
                  status={errors.authToken ? 'error' : undefined}
                  className="mt-1"
                />
                {errors.authToken && <p className="mt-1 text-[11px] text-[#F53F3F]">{errors.authToken}</p>}
              </div>

              {/* 控制台设置 */}
              <div className="rounded-[8px] border border-[#EFF0F1] bg-[#F9FAFB] p-3">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-[#1F2329]">
                  <input
                    type="checkbox"
                    checked={dashboardEnabled}
                    onChange={(e) => setDashboardEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-[#DEE0E3] text-[#3370FF] focus:ring-[#3370FF]"
                  />
                  <span>启用 Web 控制台 (Dashboard)</span>
                </label>

                {dashboardEnabled && (
                  <div className="mt-3 space-y-2.5 border-t border-[#EFF0F1] pt-2.5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-[#646A73]">控制台端口</label>
                        <FeishuInput
                          type="number"
                          value={dashboardPort ? String(dashboardPort) : ''}
                          onChange={(val) => setDashboardPort(Number(val))}
                          placeholder="7500"
                          status={errors.dashboardPort ? 'error' : undefined}
                          className="mt-1"
                        />
                        {errors.dashboardPort && <p className="mt-1 text-[11px] text-[#F53F3F]">{errors.dashboardPort}</p>}
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#646A73]">控制台账号</label>
                        <FeishuInput
                          value={dashboardUser}
                          onChange={(val) => setDashboardUser(val)}
                          placeholder="admin"
                          status={errors.dashboardUser ? 'error' : undefined}
                          className="mt-1"
                        />
                        {errors.dashboardUser && <p className="mt-1 text-[11px] text-[#F53F3F]">{errors.dashboardUser}</p>}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] text-[#646A73]">控制台密码</label>
                        <button
                          type="button"
                          onClick={() => setShowDashPwd(!showDashPwd)}
                          className="flex items-center gap-1 text-[11px] text-[#646A73] hover:text-[#3370FF]"
                        >
                          {showDashPwd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          {showDashPwd ? '隐藏' : '显示'}
                        </button>
                      </div>
                      <FeishuInput
                        type={showDashPwd ? 'text' : 'password'}
                        value={dashboardPassword}
                        onChange={(val) => setDashboardPassword(val)}
                        placeholder="请输入 Dashboard 登录密码"
                        status={errors.dashboardPassword ? 'error' : undefined}
                        className="mt-1"
                      />
                      {errors.dashboardPassword && <p className="mt-1 text-[11px] text-[#F53F3F]">{errors.dashboardPassword}</p>}
                    </div>
                  </div>
                )}
              </div>

              {/* SSH 认证补充（若未记住凭据） */}
              {!node.credentialsRemembered && (
                <div className="rounded-[8px] border border-[#EFF0F1] bg-[#F9FAFB] p-3 text-[12px]">
                  <p className="font-medium text-[#1F2329]">本次操作 SSH 凭据</p>
                  <p className="mt-0.5 text-[#8F959E]">
                    该节点未记住 SSH 凭据，需输入本次连接秘密（仅在本次内存中使用，不会持久化）。
                  </p>
                  {node.authMethod === 'password' ? (
                    <div className="mt-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] text-[#646A73]">SSH 密码</label>
                        <button
                          type="button"
                          onClick={() => setShowSshPwd(!showSshPwd)}
                          className="flex items-center gap-1 text-[11px] text-[#646A73] hover:text-[#3370FF]"
                        >
                          {showSshPwd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          {showSshPwd ? '隐藏' : '显示'}
                        </button>
                      </div>
                      <FeishuInput
                        type={showSshPwd ? 'text' : 'password'}
                        value={ephemeralSshPassword}
                        onChange={(val) => setEphemeralSshPassword(val)}
                        placeholder="请输入 SSH 密码"
                        status={errors.sshPassword ? 'error' : undefined}
                        className="mt-1"
                      />
                      {errors.sshPassword && <p className="mt-1 text-[11px] text-[#F53F3F]">{errors.sshPassword}</p>}
                    </div>
                  ) : (
                    <div className="mt-2.5 space-y-2">
                      <div>
                        <label className="block text-[11px] text-[#646A73]">SSH 私钥内容</label>
                        <textarea
                          value={ephemeralPrivateKey}
                          onChange={(e) => setEphemeralPrivateKey(e.target.value)}
                          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                          rows={3}
                          className="mt-1 block w-full rounded-[6px] border border-[#DEE0E3] p-2 font-mono text-[11px] text-[#1F2329] focus:border-[#3370FF] focus:outline-none"
                        />
                        {errors.sshPrivateKey && <p className="mt-1 text-[11px] text-[#F53F3F]">{errors.sshPrivateKey}</p>}
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#646A73]">私钥口令（如有）</label>
                        <FeishuInput
                          type="password"
                          value={ephemeralPrivateKeyPassphrase}
                          onChange={(val) => setEphemeralPrivateKeyPassphrase(val)}
                          placeholder="口令可选"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Sudo 提权设置 */}
              {node.privilege === 'sudo_password_required' && (
                <div className="rounded-[8px] border border-[#EFF0F1] bg-[#F9FAFB] p-3 text-[12px]">
                  <p className="font-medium text-[#1F2329]">sudo 提权设置</p>
                  {node.sudoCredentialsRemembered ? (
                    <p className="mt-1 flex items-center gap-1.5 text-[#3370FF]">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      已记住 sudo 密码到系统安全凭据库
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] text-[#646A73]">sudo 密码</label>
                        <button
                          type="button"
                          onClick={() => setShowSudoPwd(!showSudoPwd)}
                          className="flex items-center gap-1 text-[11px] text-[#646A73] hover:text-[#3370FF]"
                        >
                          {showSudoPwd ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          {showSudoPwd ? '隐藏' : '显示'}
                        </button>
                      </div>
                      <FeishuInput
                        type={showSudoPwd ? 'text' : 'password'}
                        value={sudoPassword}
                        onChange={(val) => setSudoPassword(val)}
                        placeholder="执行远程 systemd 管理需要 sudo 密码"
                        status={errors.sudoPassword ? 'error' : undefined}
                      />
                      {errors.sudoPassword && <p className="text-[11px] text-[#F53F3F]">{errors.sudoPassword}</p>}
                      <label className="flex cursor-pointer items-center gap-2 pt-1 text-[12px] text-[#1F2329]">
                        <input
                          type="checkbox"
                          checked={rememberSudoPassword}
                          onChange={(e) => setRememberSudoPassword(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-[#DEE0E3] text-[#3370FF] focus:ring-[#3370FF]"
                        />
                        <span>记住 sudo 密码到系统安全凭据库</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-[#EFF0F1] pt-3">
                <Button type="button" variant="outline" onClick={handleClose}>取消</Button>
                <Button type="button" onClick={handleNextToConfirm}>下一步：确认部署</Button>
              </div>
            </div>
          )}

          {/* 阶段 2：确认 */}
          {stage === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-[8px] border border-[#E1EAFF] bg-[#F0F4FF] p-3 text-[13px] text-[#3370FF]">
                <p className="font-medium">⚠️ 部署前确认</p>
                <p className="mt-1 text-[12px] leading-5 text-[#646A73]">
                  将从官方 GitHub Release 下载对应架构安装包并写入远程服务器，创建 systemd 服务并开机自启。
                </p>
              </div>

              <dl className="space-y-2 rounded-[8px] border border-[#EFF0F1] bg-[#F9FAFB] p-3.5 text-[12px]">
                <div className="flex justify-between"><dt className="text-[#8F959E]">目标服务器</dt><dd className="font-medium text-[#1F2329]">{node.name} ({node.host})</dd></div>
                <div className="flex justify-between"><dt className="text-[#8F959E]">系统与架构</dt><dd className="text-[#1F2329]">{node.remoteOs} / {node.remoteArchitecture}</dd></div>
                <div className="flex justify-between"><dt className="text-[#8F959E]">部署版本</dt><dd className="font-medium text-[#1F2329]">{version}</dd></div>
                <div className="flex justify-between"><dt className="text-[#8F959E]">固定安装根目录</dt><dd className="font-mono text-[#1F2329]">/opt/frp</dd></div>
                <div className="flex justify-between"><dt className="text-[#8F959E]">安全配置文件</dt><dd className="font-mono text-[#1F2329]">/opt/frp/frps.toml（候选验证后原子替换）</dd></div>
                <div className="flex justify-between"><dt className="text-[#8F959E]">systemd 服务单元</dt><dd className="font-mono text-[#1F2329]">/etc/systemd/system/frp-gui-frps.service</dd></div>
                <div className="flex justify-between"><dt className="text-[#8F959E]">监听端口</dt><dd className="tabular-nums text-[#1F2329]">:{bindPort} ({transportProtocol.toUpperCase()}{tlsForce ? ' + TLS' : ''})</dd></div>
                {dashboardEnabled && (
                  <div className="flex justify-between"><dt className="text-[#8F959E]">控制台 (Dashboard)</dt><dd className="tabular-nums text-[#1F2329]">:{dashboardPort} (用户: {dashboardUser})</dd></div>
                )}
              </dl>

              <div className="flex justify-end gap-2 border-t border-[#EFF0F1] pt-3">
                <Button type="button" variant="outline" onClick={() => setStage('config')}>返回修改</Button>
                <Button type="button" onClick={executeDeployment}>确认部署</Button>
              </div>
            </div>
          )}

          {/* 阶段 3：执行与结果 */}
          {stage === 'progress' && (
            <div className="space-y-4 py-2">
              {isDeploying ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[#3370FF]" />
                  <p className="mt-3 text-[14px] font-medium text-[#1F2329]">正在执行受控远程部署...</p>
                  <p className="mt-1 text-[12px] text-[#8F959E]">正在流式校验资产并原子写入配置，请稍候</p>
                </div>
              ) : deploymentResult?.outcome === 'completed' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-[8px] border border-[#E4FAE1] bg-[#F5FCF4] p-4 text-[13px] text-[#32A645]">
                    <CheckCircle2 className="h-6 w-6 shrink-0" />
                    <div>
                      <p className="font-semibold text-[#1F2329]">FRPS 服务部署并启动成功</p>
                      <p className="mt-0.5 text-[12px] text-[#646A73]">服务单元已设置开机自启，当前运行状态正常。</p>
                    </div>
                  </div>

                  <dl className="space-y-2 rounded-[8px] border border-[#EFF0F1] bg-[#F9FAFB] p-3 text-[12px]">
                    <div className="flex justify-between"><dt className="text-[#8F959E]">服务状态</dt><dd><FeishuPill variant="green" showDot>运行中</FeishuPill></dd></div>
                    <div className="flex justify-between"><dt className="text-[#8F959E]">版本</dt><dd className="font-medium text-[#1F2329]">{version}</dd></div>
                    <div className="flex justify-between"><dt className="text-[#8F959E]">服务单元</dt><dd className="font-mono text-[#1F2329]">frp-gui-frps.service (已启用)</dd></div>
                  </dl>

                  <div className="flex justify-end pt-2">
                    <Button type="button" onClick={handleClose}>完成</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-[8px] border border-[#FEF1F1] bg-[#FEF6F6] p-4 text-[13px] text-[#F53F3F]">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-semibold text-[#1F2329]">FRPS 部署失败</p>
                      <p className="mt-0.5 text-[12px] text-[#646A73]">
                        {deploymentResult?.errorMessage || '服务部署或启动失败，请检查配置或远程系统环境'}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setStage('config')}>返回修改</Button>
                    <Button type="button" onClick={handleClose}>关闭</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </FeishuDialog>
  );
};
