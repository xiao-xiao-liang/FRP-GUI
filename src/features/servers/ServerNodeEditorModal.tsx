import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, LockKeyhole, Server, ShieldCheck } from 'lucide-react';
import type { FrpServerNode, ServerCredentialDraft, ServerNodeFormValues } from '../../types/frp';
import { buildServerNode, validateServerNodeForm } from '../../services/server-nodes';
import { deleteServerCredentials, isTauriEnv, storeServerCredential } from '../../services/ipc';
import { Button } from '../../components/ui/button';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { FeishuInput } from '../../components/ui/feishu-table/FeishuInput';

interface ServerNodeEditorModalProps {
  visible: boolean;
  node?: FrpServerNode | null;
  onClose: () => void;
  onSave: (node: FrpServerNode) => void;
}

const createFormValues = (node?: FrpServerNode | null): ServerNodeFormValues => ({
  name: node?.name ?? '',
  host: node?.host ?? '',
  sshPort: node?.sshPort ?? 22,
  username: node?.username ?? 'root',
  authMethod: node?.authMethod ?? 'password',
  frpsBindPort: node?.frpsBindPort ?? 7000,
  frpsDashboardPort: node?.frpsDashboardPort ?? 7500,
  installDir: node?.installDir ?? '/opt/frp',
  frpsVersion: node?.frpsVersion,
  rememberCredentials: node?.credentialsRemembered ?? false,
  credentials: {},
});

const safeErrorMessage = () => '无法保存到系统安全凭据库，请检查系统权限后重试';

export const ServerNodeEditorModal: React.FC<ServerNodeEditorModalProps> = ({
  visible,
  node,
  onClose,
  onSave,
}) => {
  const [values, setValues] = useState<ServerNodeFormValues>(() => createFormValues(node));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const desktopAvailable = isTauriEnv();
  const isEditing = Boolean(node);
  const canReuseStoredCredential = Boolean(
    node?.credentialsRemembered &&
      values.rememberCredentials &&
      node.authMethod === values.authMethod,
  );

  useEffect(() => {
    if (visible) {
      setValues(createFormValues(node));
      setErrors({});
      setSaving(false);
    }
  }, [visible, node]);

  const fieldErrors = useMemo(() => errors, [errors]);

  const updateCredentials = (credentials: Partial<ServerCredentialDraft>) => {
    setValues((current) => ({
      ...current,
      credentials: { ...current.credentials, ...credentials },
    }));
  };

  const save = async () => {
    const validation = validateServerNodeForm(values);
    const nextErrors = { ...validation.errors };
    if (canReuseStoredCredential) delete nextErrors.credentials;

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const id = node?.id ?? `node_${Date.now()}`;
    const nextNode = buildServerNode(values, id, node ?? undefined);
    setSaving(true);
    try {
      if (nextNode.credentialsRemembered && nextNode.credentialRef) {
        if (values.authMethod === 'password' && values.credentials.password?.trim()) {
          await storeServerCredential(nextNode.credentialRef, 'password', values.credentials.password);
        } else if (values.authMethod === 'private_key' && values.credentials.privateKey?.trim()) {
          await storeServerCredential(nextNode.credentialRef, 'private_key', values.credentials.privateKey);
          if (values.credentials.privateKeyPassphrase) {
            await storeServerCredential(
              nextNode.credentialRef,
              'private_key_passphrase',
              values.credentials.privateKeyPassphrase,
            );
          }
        }
      } else if (node?.credentialRef && node.credentialsRemembered) {
        await deleteServerCredentials(node.credentialRef);
      }

      onSave(nextNode);
      setValues((current) => ({ ...current, credentials: {} }));
      onClose();
    } catch {
      setErrors((current) => ({ ...current, submit: safeErrorMessage() }));
    } finally {
      setSaving(false);
    }
  };

  const inputClassName = 'h-9 text-[14px]';
  const labelClassName = 'mb-1.5 block text-[12px] font-medium text-[#1F2329]';

  return (
    <FeishuDialog
      visible={visible}
      onCancel={saving ? undefined : onClose}
      title={isEditing ? '编辑服务器节点' : '添加服务器节点'}
      width={620}
      showIcon={false}
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            取消
          </Button>
          <Button type="button" onClick={save} disabled={saving} aria-busy={saving}>
            {saving ? '正在保存...' : '保存节点'}
          </Button>
        </div>
      }
    >
      <div className="max-h-[68vh] space-y-4 overflow-y-auto pr-1">
        <div className="rounded-[8px] border border-[#C9DCFF] bg-[#F0F4FF] px-3 py-2.5 text-[12px] leading-5 text-[#3C5B9B]">
          节点信息仅用于后续 SSH 预检与部署。密码、私钥和口令不会写入节点配置或本地存储。
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClassName} htmlFor="server-node-name">节点名称</label>
            <FeishuInput id="server-node-name" aria-label="节点名称" value={values.name} onChange={(name) => setValues((current) => ({ ...current, name }))} placeholder="例如：东京 Ubuntu 节点" containerClassName={inputClassName} />
            {fieldErrors.name && <p className="mt-1 text-[12px] text-[#F53F3F]">{fieldErrors.name}</p>}
          </div>
          <div>
            <label className={labelClassName} htmlFor="server-node-host">服务器地址</label>
            <FeishuInput id="server-node-host" aria-label="服务器地址" value={values.host} onChange={(host) => setValues((current) => ({ ...current, host }))} placeholder="IP 地址或域名" containerClassName={inputClassName} />
            {fieldErrors.host && <p className="mt-1 text-[12px] text-[#F53F3F]">{fieldErrors.host}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClassName} htmlFor="server-node-username">SSH 用户名</label>
            <FeishuInput id="server-node-username" aria-label="SSH 用户名" value={values.username} onChange={(username) => setValues((current) => ({ ...current, username }))} placeholder="root 或 ubuntu" containerClassName={inputClassName} />
            {fieldErrors.username && <p className="mt-1 text-[12px] text-[#F53F3F]">{fieldErrors.username}</p>}
          </div>
          <div>
            <label className={labelClassName} htmlFor="server-node-ssh-port">SSH 端口</label>
            <input id="server-node-ssh-port" aria-label="SSH 端口" type="number" min={1} max={65535} value={values.sshPort || ''} onChange={(event) => setValues((current) => ({ ...current, sshPort: Number(event.target.value) }))} className="h-9 w-full rounded-[6px] border border-[#DEE0E3] bg-white px-3 text-[14px] text-[#1F2329] outline-none transition-colors hover:border-[#BBBFC4] focus:border-[#3370FF] focus:ring-2 focus:ring-[#3370FF]/15" />
            {fieldErrors.sshPort && <p className="mt-1 text-[12px] text-[#F53F3F]">{fieldErrors.sshPort}</p>}
          </div>
        </div>

        <fieldset>
          <legend className={labelClassName}>认证方式</legend>
          <div className="flex gap-2">
            <label className={`flex h-8 cursor-pointer items-center gap-2 rounded-[6px] border px-3 text-[13px] ${values.authMethod === 'password' ? 'border-[#3370FF] bg-[#F0F4FF] text-[#3370FF]' : 'border-[#DEE0E3] text-[#646A73]'}`}>
              <input type="radio" name="server-auth-method" checked={values.authMethod === 'password'} onChange={() => setValues((current) => ({ ...current, authMethod: 'password', credentials: {} }))} />
              <LockKeyhole className="h-3.5 w-3.5" />密码登录
            </label>
            <label className={`flex h-8 cursor-pointer items-center gap-2 rounded-[6px] border px-3 text-[13px] ${values.authMethod === 'private_key' ? 'border-[#3370FF] bg-[#F0F4FF] text-[#3370FF]' : 'border-[#DEE0E3] text-[#646A73]'}`}>
              <input type="radio" name="server-auth-method" checked={values.authMethod === 'private_key'} onChange={() => setValues((current) => ({ ...current, authMethod: 'private_key', credentials: {} }))} />
              <KeyRound className="h-3.5 w-3.5" />私钥登录
            </label>
          </div>
        </fieldset>

        {values.authMethod === 'password' ? (
          <div>
            <label className={labelClassName} htmlFor="server-node-password">SSH 密码</label>
            <FeishuInput id="server-node-password" aria-label="SSH 密码" type="password" allowClear={false} value={values.credentials.password ?? ''} onChange={(password) => updateCredentials({ password })} placeholder={canReuseStoredCredential ? '已保存，可留空保持不变' : '请输入 SSH 密码'} containerClassName={inputClassName} />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={labelClassName} htmlFor="server-node-private-key">SSH 私钥</label>
              <textarea id="server-node-private-key" aria-label="SSH 私钥" spellCheck={false} value={values.credentials.privateKey ?? ''} onChange={(event) => updateCredentials({ privateKey: event.target.value })} placeholder={canReuseStoredCredential ? '已保存，可留空保持不变' : '粘贴完整的 OpenSSH 或 PEM 私钥内容'} className="min-h-28 w-full resize-y rounded-[6px] border border-[#DEE0E3] bg-white px-3 py-2 text-[12px] leading-5 text-[#1F2329] outline-none transition-colors hover:border-[#BBBFC4] focus:border-[#3370FF] focus:ring-2 focus:ring-[#3370FF]/15" />
            </div>
            <div>
              <label className={labelClassName} htmlFor="server-node-private-key-passphrase">私钥口令</label>
              <FeishuInput id="server-node-private-key-passphrase" aria-label="私钥口令" type="password" allowClear={false} value={values.credentials.privateKeyPassphrase ?? ''} onChange={(privateKeyPassphrase) => updateCredentials({ privateKeyPassphrase })} placeholder="如私钥未设置口令可留空" containerClassName={inputClassName} />
            </div>
          </div>
        )}
        {fieldErrors.credentials && <p className="text-[12px] text-[#F53F3F]">{fieldErrors.credentials}</p>}

        <label className="flex cursor-pointer items-start gap-2 text-[13px] text-[#1F2329]">
          <input aria-label="记住凭据到系统安全凭据库" type="checkbox" checked={values.rememberCredentials} disabled={!desktopAvailable} onChange={(event) => setValues((current) => ({ ...current, rememberCredentials: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-[#DEE0E3] text-[#3370FF] focus:ring-[#3370FF]" />
          <span>
            记住凭据到系统安全凭据库
            {!desktopAvailable && <span className="ml-2 text-[12px] text-[#8F959E]">仅桌面版可记住凭据</span>}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3 border-t border-[#EFF0F1] pt-4">
          <div>
            <label className={labelClassName} htmlFor="server-node-frps-port">FRPS 监听端口</label>
            <input id="server-node-frps-port" aria-label="FRPS 监听端口" type="number" min={1} max={65535} value={values.frpsBindPort || ''} onChange={(event) => setValues((current) => ({ ...current, frpsBindPort: Number(event.target.value) }))} className="h-9 w-full rounded-[6px] border border-[#DEE0E3] bg-white px-3 text-[14px] text-[#1F2329] outline-none transition-colors hover:border-[#BBBFC4] focus:border-[#3370FF] focus:ring-2 focus:ring-[#3370FF]/15" />
            {fieldErrors.frpsBindPort && <p className="mt-1 text-[12px] text-[#F53F3F]">{fieldErrors.frpsBindPort}</p>}
          </div>
          <div>
            <label className={labelClassName} htmlFor="server-node-dashboard-port">管理端口（可选）</label>
            <input id="server-node-dashboard-port" aria-label="管理端口" type="number" min={1} max={65535} value={values.frpsDashboardPort ?? ''} onChange={(event) => setValues((current) => ({ ...current, frpsDashboardPort: event.target.value ? Number(event.target.value) : undefined }))} className="h-9 w-full rounded-[6px] border border-[#DEE0E3] bg-white px-3 text-[14px] text-[#1F2329] outline-none transition-colors hover:border-[#BBBFC4] focus:border-[#3370FF] focus:ring-2 focus:ring-[#3370FF]/15" />
          </div>
          <div className="col-span-2">
            <label className={labelClassName} htmlFor="server-node-install-dir">远程安装目录</label>
            <FeishuInput id="server-node-install-dir" aria-label="远程安装目录" value={values.installDir} onChange={(installDir) => setValues((current) => ({ ...current, installDir }))} prefix={<Server className="h-3.5 w-3.5" />} containerClassName={inputClassName} />
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-[6px] bg-[#F7F8FA] px-3 py-2 text-[12px] text-[#646A73]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#00B42A]" />
          P1-C1 仅保存节点草稿；SSH 预检与 FRPS 部署将在下一阶段执行。
        </div>
        {fieldErrors.submit && <p role="alert" className="text-[12px] text-[#F53F3F]">{fieldErrors.submit}</p>}
      </div>
    </FeishuDialog>
  );
};
