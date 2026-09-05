import React, { useState } from 'react';
import {
  CircleAlert,
  Download,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Server,
  ShieldCheck,
  Square,
  Star,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { FrpServerNode, ServerOperationKind } from '../../types/frp';
import { deleteServerCredentials, isTauriEnv, runFrpsOperation } from '../../services/ipc';
import { applyFrpsOperationResult } from '../../services/frps-deployment';
import { createCredentialRef } from '../../services/server-nodes';
import { Button } from '../../components/ui/button';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { FeishuInput } from '../../components/ui/feishu-table/FeishuInput';
import { feishuToast } from '../../components/ui/FeishuToast';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { FeishuActionDropdown, FeishuActionDropdownItem } from '../../components/ui/feishu-table/FeishuActionDropdown';
import { ServerNodeEditorModal } from './ServerNodeEditorModal';
import { ServerNodePreflightModal } from './ServerNodePreflightModal';
import { FrpsDeploymentModal } from './FrpsDeploymentModal';

interface ServerNodeManagerPageProps {
  nodes: FrpServerNode[];
  onSaveNode: (node: FrpServerNode) => void;
  onDeleteNode: (id: string) => void;
  onSetDefault: (id: string) => void;
}

const statusMeta: Record<FrpServerNode['status'], { label: string; variant: 'gray' | 'blue' | 'green' | 'orange' | 'red' }> = {
  draft: { label: '待部署', variant: 'gray' },
  checking: { label: '正在预检', variant: 'blue' },
  ready_to_deploy: { label: '可部署', variant: 'blue' },
  deploying: { label: '部署中', variant: 'orange' },
  running: { label: '运行中', variant: 'green' },
  stopped: { label: '已停止', variant: 'gray' },
  error: { label: '异常', variant: 'red' },
};

export const ServerNodeManagerPage: React.FC<ServerNodeManagerPageProps> = ({
  nodes,
  onSaveNode,
  onDeleteNode,
  onSetDefault,
}) => {
  const [editingNode, setEditingNode] = useState<FrpServerNode | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [preflightNode, setPreflightNode] = useState<FrpServerNode | null>(null);
  const [deployingNode, setDeployingNode] = useState<FrpServerNode | null>(null);
  const [deletingNode, setDeletingNode] = useState<FrpServerNode | null>(null);
  const [deleteCredentials, setDeleteCredentials] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const desktopAvailable = isTauriEnv();

  // 临时凭据执行弹窗状态
  const [promptNode, setPromptNode] = useState<{ node: FrpServerNode; op: ServerOperationKind } | null>(null);
  const [promptSshPwd, setPromptSshPwd] = useState('');
  const [promptSshKey, setPromptSshKey] = useState('');
  const [promptSshKeyPass, setPromptSshKeyPass] = useState('');
  const [promptSudoPwd, setPromptSudoPwd] = useState('');
  const [isExecutingOp, setIsExecutingOp] = useState(false);

  // 查看日志弹窗状态
  const [viewingLogs, setViewingLogs] = useState<{ nodeName: string; lines: string[] } | null>(null);

  const wipePromptSecrets = () => {
    setPromptSshPwd('');
    setPromptSshKey('');
    setPromptSshKeyPass('');
    setPromptSudoPwd('');
  };

  const openCreate = () => {
    setEditingNode(null);
    setIsEditorOpen(true);
  };

  const openEdit = (node: FrpServerNode) => {
    setEditingNode(node);
    setIsEditorOpen(true);
  };

  const openDelete = (node: FrpServerNode) => {
    setDeletingNode(node);
    setDeleteCredentials(false);
  };

  const confirmDelete = async () => {
    if (!deletingNode) return;
    setIsDeleting(true);
    try {
      if (deleteCredentials) {
        const effectiveCredentialRef = deletingNode.credentialRef ?? createCredentialRef(deletingNode.id);
        await deleteServerCredentials(effectiveCredentialRef);
      }
      onDeleteNode(deletingNode.id);
      feishuToast.success('服务器节点已删除');
      setDeletingNode(null);
    } catch {
      feishuToast.error('删除系统安全凭据失败，服务器节点未移除');
    } finally {
      setIsDeleting(false);
    }
  };

  // 检查是否需要临时凭据
  const needsEphemeralCredentials = (node: FrpServerNode, op: ServerOperationKind): boolean => {
    if (!node.credentialsRemembered) return true;
    if (op !== 'refresh_status') {
      if (node.privilege === 'sudo_password_required' && !node.sudoCredentialsRemembered) {
        return true;
      }
    }
    return false;
  };

  const executeOperationDirectly = async (
    node: FrpServerNode,
    op: ServerOperationKind,
    ephemeral?: {
      sshPwd?: string;
      sshKey?: string;
      sshPass?: string;
      sudoPwd?: string;
    }
  ) => {
    const effectiveCredentialRef = node.credentialRef ?? createCredentialRef(node.id);
    const targetNode = node.credentialRef ? node : { ...node, credentialRef: effectiveCredentialRef };
    try {
      const res = await runFrpsOperation({
        node: targetNode,
        operation: op,
        ephemeralSshCredentials: !targetNode.credentialsRemembered && (ephemeral?.sshPwd || ephemeral?.sshKey)
          ? {
              password: targetNode.authMethod === 'password' ? ephemeral.sshPwd : undefined,
              privateKey: targetNode.authMethod === 'private_key' ? ephemeral.sshKey : undefined,
              privateKeyPassphrase: targetNode.authMethod === 'private_key' ? ephemeral.sshPass : undefined,
            }
          : undefined,
        ephemeralSudoPassword: ephemeral?.sudoPwd || undefined,
      });

      const updated = applyFrpsOperationResult(targetNode, res);
      onSaveNode(updated);

      if (op === 'read_logs') {
        if (res.outcome === 'completed') {
          setViewingLogs({ nodeName: node.name, lines: res.logs || [] });
        } else {
          feishuToast.error(res.errorMessage || '读取服务日志失败');
        }
        return;
      }

      if (res.outcome === 'completed') {
        const actionLabels: Record<string, string> = {
          start: '服务已启动',
          stop: '服务已停止',
          restart: '服务已重启',
          refresh_status: '服务状态已刷新',
        };
        feishuToast.success(actionLabels[op] || '操作已完成');
      } else {
        feishuToast.error(res.errorMessage || '操作失败');
      }
    } catch (err: any) {
      feishuToast.error(err?.message || '操作请求失败');
    }
  };

  const handleServiceOperation = (node: FrpServerNode, op: ServerOperationKind) => {
    if (!desktopAvailable) {
      feishuToast.error('该操作需要桌面版应用');
      return;
    }

    if (needsEphemeralCredentials(node, op)) {
      wipePromptSecrets();
      setPromptNode({ node, op });
    } else {
      executeOperationDirectly(node, op);
    }
  };

  const handlePromptSubmit = async () => {
    if (!promptNode) return;
    setIsExecutingOp(true);
    const ephemeralParams = {
      sshPwd: promptSshPwd,
      sshKey: promptSshKey,
      sshPass: promptSshKeyPass,
      sudoPwd: promptSudoPwd,
    };
    // 立即清空状态中的机密
    wipePromptSecrets();
    try {
      await executeOperationDirectly(promptNode.node, promptNode.op, ephemeralParams);
      setPromptNode(null);
    } finally {
      wipePromptSecrets();
      setIsExecutingOp(false);
    }
  };

  const getOverflowItems = (node: FrpServerNode): FeishuActionDropdownItem[] => {
    const items: FeishuActionDropdownItem[] = [];

    if (node.status === 'running') {
      items.push({
        key: 'restart',
        label: '重启服务',
        onClick: () => handleServiceOperation(node, 'restart'),
      });
    }

    if (['running', 'stopped', 'error'].includes(node.status)) {
      items.push({
        key: 'refresh_status',
        label: '刷新状态',
        onClick: () => handleServiceOperation(node, 'refresh_status'),
      });
      items.push({
        key: 'read_logs',
        label: '查看日志',
        onClick: () => handleServiceOperation(node, 'read_logs'),
      });
      items.push({
        key: 'redeploy',
        label: '重新部署',
        onClick: () => setDeployingNode(node),
      });
    }

    items.push({
      key: 'preflight',
      label: '检查连接',
      onClick: () => setPreflightNode(node),
    });

    return items;
  };

  return (
    <main className="min-h-full bg-white px-7 py-6">
      <div className="mx-auto max-w-[1280px]">
        <header className="mb-6 flex items-start justify-between gap-4 border-b border-[#EFF0F1] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-[#3370FF]" />
              <h1 className="text-[20px] font-semibold leading-7 text-[#1F2329]">服务器节点</h1>
            </div>
            <p className="mt-1 text-[13px] leading-5 text-[#646A73]">集中维护远程 Ubuntu/Debian FRPS 节点，预检会执行只读检查，不会写入、下载、sudo 或管理 systemd。</p>
          </div>
          {nodes.length > 0 && (
            <Button type="button" onClick={openCreate} className="shrink-0">
              <Plus className="mr-1.5 h-4 w-4" />添加服务器节点
            </Button>
          )}
        </header>

        {nodes.length === 0 ? (
          <section className="flex min-h-72 flex-col items-center justify-center rounded-[12px] border border-dashed border-[#DEE0E3] bg-white px-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-[12px] bg-[#F0F4FF] text-[#3370FF]">
              <Server className="h-6 w-6" />
            </div>
            <h2 className="text-[16px] font-medium text-[#1F2329]">还没有服务器节点</h2>
            <p className="mt-1 max-w-md text-[13px] leading-5 text-[#646A73]">先添加一台远程 Ubuntu 或 Debian 云服务器。后续可在应用内完成预检、FRPS 部署和运行管理。</p>
            <Button type="button" onClick={openCreate} className="mt-4">
              <Plus className="mr-1.5 h-4 w-4" />添加服务器节点
            </Button>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="服务器节点列表">
            {nodes.map((node) => {
              const meta = statusMeta[node.status];
              const overflowItems = getOverflowItems(node);
              return (
                <article key={node.id} className="rounded-[12px] border border-[#DEE0E3] bg-white p-5 shadow-none transition-colors hover:border-[#3370FF]/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#F0F4FF] text-[#3370FF]">
                        <Server className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h2 className="truncate text-[16px] font-semibold text-[#1F2329]">{node.name}</h2>
                          {node.isDefault && <Star aria-label="默认服务器节点" className="h-3.5 w-3.5 shrink-0 fill-[#FFB400] text-[#FFB400]" />}
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-[#8F959E]">{node.username}@{node.host}:{node.sshPort}</p>
                      </div>
                    </div>
                    <FeishuPill variant={meta.variant} showDot className="h-[22px] shrink-0 px-2 text-[11px]">{meta.label}</FeishuPill>
                  </div>

                  <dl className="mt-4 space-y-2 rounded-[8px] border border-[#EFF0F1] bg-[#F9FAFB] px-3 py-2.5 text-[12px]">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#8F959E]">FRPS 监听</dt>
                      <dd className="tabular-nums text-[#1F2329]">:{node.deployment?.summary.bindPort ?? node.frpsBindPort}</dd>
                    </div>
                    {node.deployment && (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-[#8F959E]">已部署版本</dt>
                        <dd className="font-medium text-[#1F2329]">{node.deployment.summary.version}</dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#8F959E]">安装目录</dt>
                      <dd className="max-w-[190px] truncate font-mono text-[#1F2329]">{node.installDir}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[#8F959E]">认证方式</dt>
                      <dd className="flex items-center gap-1 text-[#1F2329]">
                        <KeyRound className="h-3.5 w-3.5 text-[#646A73]" />
                        {node.authMethod === 'password' ? '密码' : '私钥'}
                        {node.credentialsRemembered ? ' · 已记住' : ''}
                      </dd>
                    </div>
                  </dl>
                  {node.lastError && (
                    <p className="mt-3 flex gap-1.5 text-[12px] leading-5 text-[#F53F3F]">
                      <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {node.lastError}
                    </p>
                  )}
                  {!desktopAvailable && (
                    <p className="mt-2 text-[12px] text-[#8F959E]">
                      {['draft', 'checking'].includes(node.status)
                        ? 'SSH 预检需要在桌面版应用中执行'
                        : 'FRPS 部署需要桌面版应用'}
                    </p>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-[#EFF0F1] pt-3">
                    <div className="flex items-center gap-2">
                      {desktopAvailable && (
                        <>
                          {node.status === 'ready_to_deploy' && (
                            <Button
                              type="button"
                              size="sm"
                              aria-label={`部署 FRPS：${node.name}`}
                              onClick={() => setDeployingNode(node)}
                              className="h-8 px-2.5 text-[12px]"
                            >
                              <Download className="mr-1 h-3.5 w-3.5" />
                              部署 FRPS
                            </Button>
                          )}
                          {node.status === 'running' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`停止服务：${node.name}`}
                              onClick={() => handleServiceOperation(node, 'stop')}
                              className="h-8 px-2.5 text-[12px] text-[#F53F3F] hover:bg-[#FFECEC]"
                            >
                              <Square className="mr-1 h-3.5 w-3.5" />
                              停止服务
                            </Button>
                          )}
                          {node.status === 'stopped' && (
                            <Button
                              type="button"
                              size="sm"
                              aria-label={`启动服务：${node.name}`}
                              onClick={() => handleServiceOperation(node, 'start')}
                              className="h-8 px-2.5 text-[12px]"
                            >
                              <Play className="mr-1 h-3.5 w-3.5" />
                              启动服务
                            </Button>
                          )}
                          {node.status === 'error' && (
                            <Button
                              type="button"
                              size="sm"
                              aria-label={`重新部署：${node.name}`}
                              onClick={() => setDeployingNode(node)}
                              className="h-8 px-2.5 text-[12px]"
                            >
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              重新部署
                            </Button>
                          )}
                          {['draft', 'checking'].includes(node.status) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`检查连接：${node.name}`}
                              onClick={() => setPreflightNode(node)}
                              className="h-8 px-2.5 text-[12px]"
                            >
                              <ShieldCheck className="mr-1 h-3.5 w-3.5 text-[#3370FF]" />
                              检查连接
                            </Button>
                          )}

                          {overflowItems.length > 0 && node.status !== 'draft' && node.status !== 'checking' && (
                            <FeishuActionDropdown
                              items={overflowItems}
                              trigger={
                                <span
                                  aria-label={`更多操作：${node.name}`}
                                  className="flex items-center justify-center h-8 w-8 rounded-[6px] border border-[#DEE0E3] hover:bg-[#F2F3F5] text-[#646A73]"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </span>
                              }
                            />
                          )}
                        </>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onSetDefault(node.id)}
                        disabled={node.isDefault}
                        className="h-8 px-2 text-[13px] text-[#3370FF]"
                      >
                        <Star className="mr-1 h-3.5 w-3.5" />
                        {node.isDefault ? '默认节点' : '设为默认'}
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="iconSm"
                        aria-label={`编辑节点：${node.name}`}
                        onClick={() => openEdit(node)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="iconSm"
                        aria-label={`删除节点：${node.name}`}
                        onClick={() => openDelete(node)}
                        className="text-[#F53F3F] hover:bg-[#FFECEC] hover:text-[#F53F3F]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>

      <ServerNodeEditorModal
        visible={isEditorOpen}
        node={editingNode}
        onClose={() => setIsEditorOpen(false)}
        onSave={onSaveNode}
      />

      <ServerNodePreflightModal
        visible={Boolean(preflightNode)}
        node={preflightNode}
        onClose={() => setPreflightNode(null)}
        onComplete={(updatedNode) => {
          onSaveNode(updatedNode);
        }}
        onEditCredentials={(node) => {
          setPreflightNode(null);
          openEdit(node);
        }}
      />

      <FrpsDeploymentModal
        visible={Boolean(deployingNode)}
        node={deployingNode}
        onClose={() => setDeployingNode(null)}
        onComplete={(updatedNode) => {
          onSaveNode(updatedNode);
        }}
      />

      {/* 临时凭据输入弹窗 */}
      {promptNode && (
        <FeishuDialog
          visible
          title={`输入操作凭据 - ${promptNode.node.name}`}
          width={460}
          onCancel={isExecutingOp ? undefined : () => {
            wipePromptSecrets();
            setPromptNode(null);
          }}
          footer={
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  wipePromptSecrets();
                  setPromptNode(null);
                }}
                disabled={isExecutingOp}
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={handlePromptSubmit}
                disabled={isExecutingOp}
              >
                确认执行
              </Button>
            </div>
          }
        >
          <div className="space-y-3 py-1">
            <p className="text-[12px] text-[#646A73]">
              该节点未记住全部必要凭据。本次输入的机密仅在内存中单次使用，执行后即销毁，不会写入任何文件或凭据库。
            </p>

            {!promptNode.node.credentialsRemembered && (
              <div className="space-y-2 rounded-[6px] border border-[#EFF0F1] bg-[#F9FAFB] p-3 text-[12px]">
                <p className="font-medium text-[#1F2329]">本次 SSH 凭据</p>
                {promptNode.node.authMethod === 'password' ? (
                  <div>
                    <label className="block text-[11px] text-[#646A73]">SSH 密码</label>
                    <FeishuInput
                      type="password"
                      value={promptSshPwd}
                      onChange={(val) => setPromptSshPwd(val)}
                      placeholder="请输入 SSH 登录密码"
                      className="mt-1"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] text-[#646A73]">SSH 私钥内容</label>
                      <textarea
                        value={promptSshKey}
                        onChange={(e) => setPromptSshKey(e.target.value)}
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        rows={3}
                        className="mt-1 block w-full rounded-[6px] border border-[#DEE0E3] p-2 font-mono text-[11px] text-[#1F2329] focus:border-[#3370FF] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#646A73]">私钥口令（如有）</label>
                      <FeishuInput
                        type="password"
                        value={promptSshKeyPass}
                        onChange={(val) => setPromptSshKeyPass(val)}
                        placeholder="口令可选"
                        className="mt-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {promptNode.op !== 'refresh_status' &&
              promptNode.node.privilege === 'sudo_password_required' &&
              !promptNode.node.sudoCredentialsRemembered && (
                <div className="space-y-2 rounded-[6px] border border-[#EFF0F1] bg-[#F9FAFB] p-3 text-[12px]">
                  <p className="font-medium text-[#1F2329]">sudo 提权密码</p>
                  <FeishuInput
                    type="password"
                    value={promptSudoPwd}
                    onChange={(val) => setPromptSudoPwd(val)}
                    placeholder="请输入 sudo 密码"
                    className="mt-1"
                  />
                </div>
              )}
          </div>
        </FeishuDialog>
      )}

      {/* 服务日志查看弹窗 */}
      {viewingLogs && (
        <FeishuDialog
          visible
          title={
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-[#3370FF]" />
              <span>FRPS 服务日志 - {viewingLogs.nodeName}</span>
            </div>
          }
          width={640}
          onCancel={() => setViewingLogs(null)}
          footer={
            <div className="flex justify-end">
              <Button type="button" onClick={() => setViewingLogs(null)}>关闭</Button>
            </div>
          }
        >
          <div className="space-y-3">
            <div
              className="max-h-[60vh] overflow-y-auto rounded-[8px] bg-[#1F2329] p-3.5 font-mono text-[12px] text-[#F2F3F5]"
              data-testid="frps-logs-container"
            >
              {viewingLogs.lines.length === 0 ? (
                <p className="text-[#8F959E]">暂无日志记录</p>
              ) : (
                viewingLogs.lines.map((line, idx) => (
                  <div key={idx} className="whitespace-pre-wrap break-all leading-5">
                    {line}
                  </div>
                ))
              )}
            </div>
            <p className="text-[11px] text-[#8F959E]">
              日志仅显示最近 200 行，且所有 FRP 认证 Token、控制台密码与系统凭据均已自动脱敏。
            </p>
          </div>
        </FeishuDialog>
      )}

      {deletingNode && (
        <FeishuDialog
          visible
          type="danger"
          title="确认删除服务器节点？"
          okText="确认删除"
          cancelText="取消"
          onCancel={isDeleting ? undefined : () => setDeletingNode(null)}
          onOk={confirmDelete}
        >
          <div className="space-y-3">
            <p className="text-[13px] text-[#646A73]">将移除“{deletingNode.name}”的节点配置。本阶段不会删除远程服务器上的任何文件或服务。</p>
            {(deletingNode.credentialRef || Boolean(deletingNode.id)) && (
              <label className="flex cursor-pointer items-start gap-2 rounded-[6px] border border-[#DEE0E3] bg-[#F9FAFB] px-3 py-2.5 text-[13px] text-[#1F2329]">
                <input
                  aria-label="同时删除系统安全凭据"
                  type="checkbox"
                  checked={deleteCredentials}
                  onChange={(event) => setDeleteCredentials(event.target.checked)}
                  disabled={isDeleting}
                  className="mt-0.5 h-4 w-4 rounded border-[#DEE0E3] text-[#3370FF] focus:ring-[#3370FF]"
                />
                <div className="space-y-0.5">
                  <span className="font-medium">同时删除系统安全凭据</span>
                  <p className="text-[12px] leading-5 text-[#8F959E]">
                    从系统安全凭据库中彻底清理该节点关联的 FRP Token、Dashboard 密码及保存的 SSH/sudo 凭据。
                  </p>
                </div>
              </label>
            )}
          </div>
        </FeishuDialog>
      )}
    </main>
  );
};
