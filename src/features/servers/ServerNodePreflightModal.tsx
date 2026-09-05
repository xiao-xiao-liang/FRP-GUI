import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  KeyRound,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { FrpServerNode, ServerPreflightRequest, ServerPreflightResult } from '../../types/frp';
import { applyServerPreflightResult } from '../../services/server-nodes';
import { isTauriEnv, runServerPreflight } from '../../services/ipc';
import { Button } from '../../components/ui/button';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { FeishuInput } from '../../components/ui/feishu-table/FeishuInput';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';

export interface ServerNodePreflightModalProps {
  node: FrpServerNode | null;
  visible: boolean;
  onClose: () => void;
  onComplete: (node: FrpServerNode) => void;
  onEditCredentials: (node: FrpServerNode) => void;
}

export const ServerNodePreflightModal: React.FC<ServerNodePreflightModalProps> = ({
  node,
  visible,
  onClose,
  onComplete,
  onEditCredentials,
}) => {
  const [checking, setChecking] = useState(false);
  const [ephemeralPassword, setEphemeralPassword] = useState('');
  const [ephemeralPrivateKey, setEphemeralPrivateKey] = useState('');
  const [ephemeralPassphrase, setEphemeralPassphrase] = useState('');
  const [presentedFingerprint, setPresentedFingerprint] = useState<string | null>(null);
  const [result, setResult] = useState<ServerPreflightResult | null>(null);
  const desktopAvailable = isTauriEnv();

  // 清空内存中的秘密凭据
  const wipeEphemeralCredentials = () => {
    setEphemeralPassword('');
    setEphemeralPrivateKey('');
    setEphemeralPassphrase('');
  };

  const handleModalClose = () => {
    wipeEphemeralCredentials();
    setResult(null);
    setPresentedFingerprint(null);
    setChecking(false);
    onClose();
  };

  useEffect(() => {
    if (visible && node) {
      wipeEphemeralCredentials();
      setResult(null);
      setPresentedFingerprint(null);
      setChecking(false);
    }
  }, [visible, node]);

  if (!node) return null;

  const executePreflight = async (acceptedFingerprint?: string) => {
    if (!desktopAvailable) return;

    setChecking(true);
    setResult(null);

    try {
      const request: ServerPreflightRequest = {
        node: {
          id: node.id,
          host: node.host,
          sshPort: node.sshPort,
          username: node.username,
          authMethod: node.authMethod,
          credentialRef: node.credentialRef,
          credentialsRemembered: node.credentialsRemembered,
          trustedHostKeyFingerprint: node.trustedHostKeyFingerprint,
        },
        acceptedHostKeyFingerprint: acceptedFingerprint,
        ephemeralCredentials: !node.credentialsRemembered
          ? {
              password: node.authMethod === 'password' ? ephemeralPassword : undefined,
              privateKey: node.authMethod === 'private_key' ? ephemeralPrivateKey : undefined,
              privateKeyPassphrase: node.authMethod === 'private_key' ? ephemeralPassphrase : undefined,
            }
          : undefined,
      };

      const res = await runServerPreflight(request);
      setResult(res);

      if (res.outcome === 'needs_host_trust') {
        setPresentedFingerprint(res.hostKeyFingerprint ?? null);
      } else if (res.outcome === 'ready') {
        setPresentedFingerprint(null);
        const updatedNode = applyServerPreflightResult(node, res);
        onComplete(updatedNode);
        wipeEphemeralCredentials();
      } else {
        setPresentedFingerprint(null);
        const updatedNode = applyServerPreflightResult(node, res);
        onComplete(updatedNode);
        wipeEphemeralCredentials();
      }
    } catch (e: any) {
      const fallbackResult: ServerPreflightResult = {
        outcome: 'failed',
        checkedAt: Date.now(),
        errorCode: 'network_failed',
        errorMessage: e?.message || '无法建立 SSH 网络连接',
      };
      setResult(fallbackResult);
      const updatedNode = applyServerPreflightResult(node, fallbackResult);
      onComplete(updatedNode);
      wipeEphemeralCredentials();
    } finally {
      setChecking(false);
    }
  };

  const handleConfirmHostKey = () => {
    if (presentedFingerprint) {
      executePreflight(presentedFingerprint);
    }
  };

  // 渲染不同的预检阶段内容
  const renderContent = () => {
    if (!desktopAvailable) {
      return (
        <div className="space-y-3 py-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FFF7E8] text-[#FF7D00]">
            <CircleAlert className="h-6 w-6" />
          </div>
          <h3 className="text-[15px] font-semibold text-[#1F2329]">SSH 预检需要在桌面版应用中执行</h3>
          <p className="text-[13px] leading-5 text-[#646A73]">
            浏览器环境不支持原生 SSH 连接与系统安全凭据库调用。请在已安装的 FRP-GUI 桌面应用中继续执行检查。
          </p>
        </div>
      );
    }

    // 1. 首次连接或需要指纹确认
    if (result?.outcome === 'needs_host_trust') {
      return (
        <div className="space-y-4 py-1">
          <div className="flex items-start gap-3 rounded-[8px] border border-[#FFECEC] bg-[#FFF5F5] p-3.5 text-[13px] text-[#1F2329]">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#F53F3F]" />
            <div className="min-w-0 flex-1">
              <h4 className="font-semibold text-[#1F2329]">请确认 SSH 主机指纹</h4>
              <p className="mt-1 leading-5 text-[#646A73]">
                这是首次连接目标服务器，或服务器的主机密钥已被更新。请核对下方公钥 SHA-256 指纹：
              </p>
              <div className="mt-2.5 rounded-[6px] border border-[#DEE0E3] bg-white p-2 font-mono text-[12px] font-medium text-[#1F2329] break-all select-all">
                {presentedFingerprint || result?.hostKeyFingerprint}
              </div>
            </div>
          </div>

          <dl className="space-y-1.5 rounded-[8px] border border-[#EFF0F1] bg-[#F9FAFB] p-3 text-[12px]">
            <div className="flex justify-between"><dt className="text-[#8F959E]">目标主机</dt><dd className="font-mono text-[#1F2329]">{node.host}:{node.sshPort}</dd></div>
            <div className="flex justify-between"><dt className="text-[#8F959E]">SSH 用户</dt><dd className="text-[#1F2329]">{node.username}</dd></div>
          </dl>
        </div>
      );
    }

    // 2. 预检成功完成
    if (result?.outcome === 'ready') {
      return (
        <div className="space-y-4 py-1">
          <div className="flex items-start gap-3 rounded-[8px] border border-[#E8FFEA] bg-[#F6FFED] p-3.5 text-[13px] text-[#1F2329]">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#00B42A]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-[#1F2329]">服务器预检通过</h4>
                <FeishuPill variant="green" className="h-[20px] px-1.5 text-[11px]">可部署</FeishuPill>
              </div>
              <p className="mt-1 leading-5 text-[#646A73]">
                已成功验证远程操作系统环境、CPU 架构与部署权限，该节点已满足 FRPS 服务端部署要求。
              </p>
            </div>
          </div>

          <dl className="space-y-2 rounded-[8px] border border-[#EFF0F1] bg-[#F9FAFB] p-3.5 text-[12px]">
            <div className="flex justify-between"><dt className="text-[#8F959E]">操作系统</dt><dd className="font-medium capitalize text-[#1F2329]">{result.os}</dd></div>
            <div className="flex justify-between"><dt className="text-[#8F959E]">CPU 架构</dt><dd className="font-medium uppercase text-[#1F2329]">{result.architecture}</dd></div>
            <div className="flex justify-between"><dt className="text-[#8F959E]">部署权限</dt><dd className="font-medium text-[#1F2329]">{result.privilege === 'root' ? 'root 权限' : result.privilege === 'sudo_password_required' || result.requiresSudoPassword ? '需 sudo 密码（部署时输入）' : '免密 sudo 权限'}</dd></div>
            <div className="flex justify-between"><dt className="text-[#8F959E]">服务管理器</dt><dd className="font-medium text-[#1F2329]">systemd 已就绪</dd></div>
          </dl>
        </div>
      );
    }

    // 3. 预检失败
    if (result?.outcome === 'failed' || result?.outcome === 'needs_credentials') {
      const isHostKeyChanged = result?.errorCode === 'host_key_changed';
      return (
        <div className="space-y-4 py-1">
          <div className="flex items-start gap-3 rounded-[8px] border border-[#FFECEC] bg-[#FFF5F5] p-3.5 text-[13px] text-[#1F2329]">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#F53F3F]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-[#1F2329]">
                  {isHostKeyChanged ? 'SSH 主机指纹不匹配' : '预检未通过'}
                </h4>
                <FeishuPill variant="red" className="h-[20px] px-1.5 text-[11px]">异常待处理</FeishuPill>
              </div>
              <p className="mt-1 leading-5 text-[#646A73]">
                {result.errorMessage || '服务器环境检查未通过，请检查配置后重试。'}
              </p>
            </div>
          </div>

          {!node.credentialsRemembered && (
            <div className="space-y-3 rounded-[8px] border border-[#DEE0E3] bg-white p-3.5">
              <h5 className="text-[13px] font-medium text-[#1F2329]">重新提供本次临时凭据</h5>
              {node.authMethod === 'password' ? (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[#646A73]">SSH 密码</label>
                  <FeishuInput
                    aria-label="SSH 密码"
                    type="password"
                    placeholder="请输入服务器 SSH 密码"
                    value={ephemeralPassword}
                    onChange={(val) => setEphemeralPassword(val)}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[#646A73]">SSH 私钥</label>
                    <textarea
                      aria-label="SSH 私钥"
                      rows={4}
                      placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                      value={ephemeralPrivateKey}
                      onChange={(e) => setEphemeralPrivateKey(e.target.value)}
                      className="w-full rounded-[6px] border border-[#DEE0E3] p-2 font-mono text-[12px] leading-relaxed text-[#1F2329] outline-none focus:border-[#3370FF]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[12px] font-medium text-[#646A73]">私钥口令（可选）</label>
                    <FeishuInput
                      aria-label="私钥口令"
                      type="password"
                      placeholder="私钥若设置了 Passphrase 请输入"
                      value={ephemeralPassphrase}
                      onChange={(val) => setEphemeralPassphrase(val)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // 4. 初始状态：准备发起检查
    return (
      <div className="space-y-4 py-1">
        <div className="flex items-start gap-3 rounded-[8px] border border-[#E1EAFF] bg-[#F0F4FF] p-3.5 text-[13px] text-[#1F2329]">
          <Server className="mt-0.5 h-5 w-5 shrink-0 text-[#3370FF]" />
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-[#1F2329]">SSH 只读安全预检</h4>
            <p className="mt-1 leading-5 text-[#646A73]">
              应用将通过只读白名单探测命令，确认 Ubuntu/Debian 发行版、CPU 架构、root/免密 sudo 权限及 systemd 服务管理器。本阶段不会向远程写入文件或下载任何内容。
            </p>
          </div>
        </div>

        {node.credentialsRemembered ? (
          <div className="flex items-center gap-2.5 rounded-[8px] border border-[#E8FFEA] bg-[#F6FFED] px-3.5 py-3 text-[13px] text-[#1F2329]">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[#00B42A]" />
            <span>将使用系统安全凭据库中已保存的 SSH 凭据</span>
          </div>
        ) : (
          <div className="space-y-3 rounded-[8px] border border-[#DEE0E3] bg-[#F9FAFB] p-3.5">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[#1F2329]">
              <KeyRound className="h-4 w-4 text-[#3370FF]" />
              <span>输入本次 SSH 凭据（不保存到系统）</span>
            </div>
            {node.authMethod === 'password' ? (
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[#646A73]">SSH 密码</label>
                <FeishuInput
                  aria-label="SSH 密码"
                  type="password"
                  placeholder="请输入服务器 SSH 密码"
                  value={ephemeralPassword}
                  onChange={(val) => setEphemeralPassword(val)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[#646A73]">SSH 私钥</label>
                  <textarea
                    aria-label="SSH 私钥"
                    rows={4}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                    value={ephemeralPrivateKey}
                    onChange={(e) => setEphemeralPrivateKey(e.target.value)}
                    className="w-full rounded-[6px] border border-[#DEE0E3] bg-white p-2 font-mono text-[12px] leading-relaxed text-[#1F2329] outline-none focus:border-[#3370FF]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-[#646A73]">私钥口令（可选）</label>
                  <FeishuInput
                    aria-label="私钥口令"
                    type="password"
                    placeholder="私钥若设置了 Passphrase 请输入"
                    value={ephemeralPassphrase}
                    onChange={(val) => setEphemeralPassphrase(val)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFooter = () => {
    if (!desktopAvailable) {
      return (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleModalClose}>关闭</Button>
        </div>
      );
    }

    if (result?.outcome === 'needs_host_trust') {
      return (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleModalClose} disabled={checking}>取消</Button>
          <Button type="button" onClick={handleConfirmHostKey} disabled={checking}>
            {checking ? '正在连接...' : '确认并继续检查'}
          </Button>
        </div>
      );
    }

    if (result?.outcome === 'ready') {
      return (
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={handleModalClose}>完成</Button>
        </div>
      );
    }

    if (result?.outcome === 'failed' || result?.outcome === 'needs_credentials') {
      return (
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              handleModalClose();
              onEditCredentials(node);
            }}
          >
            返回编辑节点
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleModalClose}>取消</Button>
            <Button
              type="button"
              onClick={() => executePreflight()}
              disabled={checking || (!node.credentialsRemembered && node.authMethod === 'password' && !ephemeralPassword.trim())}
            >
              {checking ? '正在检查...' : '重试检查'}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={handleModalClose} disabled={checking}>取消</Button>
        <Button
          type="button"
          onClick={() => executePreflight()}
          disabled={checking || (!node.credentialsRemembered && node.authMethod === 'password' && !ephemeralPassword.trim())}
        >
          {checking ? '正在检查...' : '开始检查'}
        </Button>
      </div>
    );
  };

  return (
    <FeishuDialog
      visible={visible}
      title={`检查服务器连接：${node.name}`}
      width={480}
      onCancel={handleModalClose}
      footer={renderFooter()}
    >
      {renderContent()}
    </FeishuDialog>
  );
};
