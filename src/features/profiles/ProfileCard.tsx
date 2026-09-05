import React, { useState } from 'react';
import { Profile } from '../../types/frp';
import { Button } from '../../components/ui/button';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { FeishuActionLink, FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';
import { RunIcon, StopIcon, RefreshIcon } from '../../components/icons';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import { 
  Edit3, Copy, Trash2, QrCode, Server, 
  Wifi, Globe, ShieldCheck, Terminal, AlertCircle, MoreHorizontal, ExternalLink
} from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';

interface ProfileCardProps {
  profile: Profile;
  onToggle: (profile: Profile) => void;
  onEdit: (profile: Profile) => void;
  onClone: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
  onSync: (profile: Profile) => void;
  onViewLogs: (profile: Profile) => void;
  onDiagnose: (profile: Profile) => void;
  onRepairCore: () => void;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  onToggle,
  onEdit,
  onClone,
  onDelete,
  onSync,
  onViewLogs,
  onDiagnose,
  onRepairCore,
}) => {
  const isRunning = profile.status === 'running';
  const isStarting = profile.status === 'starting';
  const isStopping = profile.status === 'stopping';
  const isError = profile.status === 'error';

  const [showErrorPopover, setShowErrorPopover] = useState(false);

  const proxies = (profile.config as any)?.proxies || [];
  const serverAddr = (profile.config as any)?.serverAddr || (profile.config as any)?.bindAddr || '127.0.0.1';
  const serverPort = (profile.config as any)?.serverPort || (profile.config as any)?.bindPort || 7000;

  // 复制文本到剪贴板
  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    feishuToast.success(`已复制 ${label}: ${text}`);
  };

  const getStatusPill = () => {
    if (isRunning) {
      return (
        <FeishuPill variant="green" showDot={true} className="text-[12px] h-[22px] px-2.5 font-medium">
          运行中 (PID: {profile.stats.pid || '就绪'})
        </FeishuPill>
      );
    }
    if (isStarting) {
      return (
        <FeishuPill variant="orange" showDot={true} className="text-[12px] h-[22px] px-2.5">
          正在启动...
        </FeishuPill>
      );
    }
    if (isStopping) {
      return (
        <FeishuPill variant="orange" showDot={true} className="text-[12px] h-[22px] px-2.5">
          正在停止...
        </FeishuPill>
      );
    }
    if (isError) {
      return (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowErrorPopover(!showErrorPopover)}
            className="cursor-pointer"
          >
            <FeishuPill variant="red" showDot={true} className="text-[12px] h-[22px] px-2.5 hover:ring-2 hover:ring-red-200">
              异常中断 ▾
            </FeishuPill>
          </button>

          {showErrorPopover && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-7 z-30 w-64 p-3 bg-white rounded-[8px] border border-[#DEE0E3] shadow-lg text-[12px] animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="flex items-center gap-1.5 text-[#F53F3F] font-semibold mb-1">
                <AlertCircle className="w-4 h-4" />
                <span>方案启动失败排查</span>
              </div>
              <p className="text-[#646A75] text-[11px] leading-relaxed mb-2.5">
                {profile.stats.lastError || '服务端握手超时、Token认证失败或远程端口已被占用。'}
              </p>
              <div className="flex items-center justify-between pt-2 border-t border-[#EFF0F1]">
                <button
                  type="button"
                  onClick={() => {
                    setShowErrorPopover(false);
                    onViewLogs(profile);
                  }}
                  className="text-[#165DFF] hover:underline font-medium cursor-pointer"
                >
                  去日志查看详细报错 ➔
                </button>
                <button
                  type="button"
                  onClick={() => setShowErrorPopover(false)}
                  className="text-[#8F959E] hover:text-[#1F2329] cursor-pointer"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <FeishuPill variant="gray" showDot={true} className="text-[12px] h-[22px] px-2.5">
        已停止
      </FeishuPill>
    );
  };

  const getProxyIcon = (type: string) => {
    switch (type) {
      case 'http':
      case 'https':
        return <Globe className="w-3.5 h-3.5 text-[#3370FF]" />;
      case 'stcp':
      case 'xtcp':
        return <ShieldCheck className="w-3.5 h-3.5 text-[#8D55ED]" />;
      default:
        return <Terminal className="w-3.5 h-3.5 text-[#00B42A]" />;
    }
  };

  return (
    <div
      style={{ fontFamily: FEISHU_FONT_FAMILY }}
      className="group relative flex flex-col justify-between rounded-[12px] border border-[#DEE0E3] bg-white p-5 shadow-2xs transition-all duration-200 hover:border-[#165DFF]/60 hover:shadow-[0_8px_24px_rgba(31,35,41,0.06)] hover:-translate-y-0.5"
    >
      <div>
        {/* 卡片头部 */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] transition-transform duration-200 group-hover:scale-105 ${
                profile.type === 'frps'
                  ? 'bg-[#F2E9FE] text-[#8D55ED]'
                  : 'bg-[#E8F3FF] text-[#165DFF]'
              }`}
            >
              <Server className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3
                  onClick={() => onEdit(profile)}
                  className="truncate text-[16px] font-semibold text-[#1F2329] group-hover:text-[#165DFF] transition-colors cursor-pointer"
                >
                  {profile.name}
                </h3>
              </div>
              <p className="text-[13px] text-[#8F959E] mt-0.5 truncate">
                {profile.description || `节点: ${serverAddr}:${serverPort}`}
              </p>
            </div>
          </div>

          <div className="shrink-0">
            {getStatusPill()}
          </div>
        </div>

        {/* 服务器连接信息 */}
        <div className="mt-4 flex items-center justify-between text-[13px] bg-[#F7F8FA] px-3 py-2 rounded-[6px] border border-[#EBECEF]">
          <div className="flex items-center gap-2 text-[#646A75] min-w-0">
            <Wifi className="w-4 h-4 text-[#8F959E] shrink-0" />
            <span className="tabular-nums text-[12px] truncate font-mono">{serverAddr}:{serverPort}</span>
            {profile.stats.lastPingMs != null && (
              <span className="text-[11px] text-[#00B42A] bg-[#E8FFEA] px-1.5 py-0.2 rounded font-medium shrink-0">
                {profile.stats.lastPingMs}ms
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <FeishuPill variant={profile.type === 'frps' ? 'purple' : 'blue'} showDot={false} className="text-[10px] h-[20px] px-1.5">
              {profile.type.toUpperCase()}
            </FeishuPill>
          </div>
        </div>

        {/* 运行中警告提示条 (A 方案) */}
        {isRunning && profile.stats.lastWarning && (
          <button
            type="button"
            onClick={() => onViewLogs(profile)}
            className="mt-3 flex w-full items-start gap-2 rounded-lg border border-[#FFE7BA] bg-[#FFF8E8] px-3 py-2 text-left text-[12px] text-[#9C6200] hover:border-[#FFB400]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong>配置有警告：</strong>{profile.stats.lastWarning}</span>
          </button>
        )}

        {/* 规则预览与运行中“一键直达”快捷条 (顺手度核心升级) */}
        {profile.type === 'frpc' && proxies.length > 0 && (
          <div className="mt-3 space-y-2">
            {proxies.slice(0, 3).map((p: any, idx: number) => {
              const isHttp = p.type === 'http' || p.type === 'https';
              const isSsh = p.type === 'tcp' && (p.localPort === 22 || p.name.toLowerCase().includes('ssh'));
              const httpUrl = p.customDomains?.[0] ? `http://${p.customDomains[0]}` : `http://${serverAddr}:${p.remotePort || p.localPort}`;
              const sshCmd = `ssh user@${serverAddr} -p ${p.remotePort || p.localPort}`;
              const targetAddr = `${serverAddr}:${p.remotePort || p.localPort}`;

              return (
                <div
                  key={idx}
                  className="p-2 bg-white rounded-[6px] border border-[#EBECEF] hover:border-[#DEE0E3] transition-colors"
                >
                  <div className="flex items-center justify-between text-[12px] text-[#646A75]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {getProxyIcon(p.type)}
                      <span className="font-medium text-[#1F2329] truncate max-w-[120px]">{p.name}</span>
                      <span className="text-[10px] text-[#8F959E] uppercase">({p.type})</span>
                    </div>
                    <div className="tabular-nums text-[#165DFF] flex items-center gap-1 text-[12px] shrink-0 font-medium font-mono">
                      <span>本地 {p.localPort}</span>
                      <span>➔</span>
                      <span>公网 {p.remotePort || p.customDomains?.[0] || 'auto'}</span>
                    </div>
                  </div>

                  {/* 方案运行中显现的“临门一脚”快捷操作栏 */}
                  {isRunning && (
                    <div className="mt-1.5 pt-1.5 border-t border-[#F2F3F5] flex items-center justify-between text-[11px] gap-2">
                      {isHttp ? (
                        <>
                          <span className="truncate text-[#8F959E] font-mono text-[10px] max-w-[170px]">
                            {httpUrl}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <FeishuActionLink
                              variant="primary"
                              onClick={() => handleCopyText(httpUrl, '公网访问链接')}
                            >
                              复制URL
                            </FeishuActionLink>
                            <FeishuActionLink
                              variant="primary"
                              onClick={() => window.open(httpUrl, '_blank')}
                              className="inline-flex items-center gap-0.5"
                            >
                              <ExternalLink className="w-2.5 h-2.5" /> 打开
                            </FeishuActionLink>
                          </div>
                        </>
                      ) : isSsh ? (
                        <>
                          <span className="truncate text-[#8F959E] font-mono text-[10px] max-w-[170px]">
                            {sshCmd}
                          </span>
                          <FeishuActionLink
                            variant="primary"
                            onClick={() => handleCopyText(sshCmd, 'SSH 连接命令')}
                          >
                            复制 SSH 命令
                          </FeishuActionLink>
                        </>
                      ) : (
                        <>
                          <span className="truncate text-[#8F959E] font-mono text-[10px] max-w-[170px]">
                            {targetAddr}
                          </span>
                          <FeishuActionLink
                            variant="primary"
                            onClick={() => handleCopyText(targetAddr, '公网地址')}
                          >
                            复制公网地址
                          </FeishuActionLink>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {proxies.length > 3 && (
              <div className="text-center text-[11px] text-[#8F959E] pt-0.5">
                + 其余 {proxies.length - 3} 个规则...
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部操作工具栏 */}
      <div className="mt-5 pt-3.5 border-t border-[#F0F1F2] flex items-center justify-between gap-2">
        <div>
          {isError ? (
            profile.stats.lastFailureKind === 'core_invalid' ? (
              <Button
                size="sm"
                onClick={() => onRepairCore()}
                className="h-8 px-3.5 text-[13px] rounded-[6px] bg-[#F53F3F] text-white hover:bg-[#D82727] cursor-pointer"
              >
                <AlertCircle className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                修复 FRPC 核心
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => onViewLogs(profile)}
                className="h-8 px-3.5 text-[13px] rounded-[6px] bg-[#F53F3F] text-white hover:bg-[#D82727] cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                查看启动日志
              </Button>
            )
          ) : isRunning ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onToggle(profile)}
              className="h-8 px-3.5 text-[13px] rounded-[6px] border-[#DEE0E3] text-[#F53F3F] hover:bg-[#FFECEC] hover:border-[#F53F3F] cursor-pointer"
            >
              <StopIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
              停止连接
            </Button>
          ) : isStopping ? (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="h-8 px-3.5 text-[13px] rounded-[6px] border-[#DEE0E3] text-[#8F959E] bg-[#F2F3F5] cursor-not-allowed opacity-75"
            >
              <RefreshIcon className="w-3.5 h-3.5 mr-1.5 shrink-0 animate-spin" />
              停止中...
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => onToggle(profile)}
              disabled={isStarting}
              className="h-8 px-3.5 text-[13px] rounded-[6px] bg-[#165DFF] text-white hover:bg-[#0E4FD9] cursor-pointer"
            >
              {isStarting ? (
                <>
                  <RefreshIcon className="w-3.5 h-3.5 mr-1.5 shrink-0 animate-spin" />
                  启动中...
                </>
              ) : (
                <>
                  <RunIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  启动连接
                </>
              )}
            </Button>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              aria-label="更多操作"
              className="h-8 px-2 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white text-[#646A75] hover:bg-[#F2F3F5] cursor-pointer"
            >
              <MoreHorizontal className="w-4 h-4 text-[#646A75]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[140px] p-1 shadow-lg border border-[#DEE0E3] bg-white rounded-[8px]">
            <DropdownMenuItem onClick={() => onEdit(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
              <Edit3 className="w-3.5 h-3.5 text-[#646A75]" />
              <span>编辑配置</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewLogs(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
              <Terminal className="w-3.5 h-3.5 text-[#646A75]" />
              <span>查看日志</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDiagnose(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
              <Wifi className="w-3.5 h-3.5 text-[#646A75]" />
              <span>网络连通性检测</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSync(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
              <QrCode className="w-3.5 h-3.5 text-[#646A75]" />
              <span>扫码分享</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onClone(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
              <Copy className="w-3.5 h-3.5 text-[#646A75]" />
              <span>克隆副本</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="my-1 bg-[#EFF0F1]" />
            <DropdownMenuItem onClick={() => onDelete(profile)} className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[#F53F3F] hover:bg-[#FFECEC] rounded-[4px] cursor-pointer">
              <Trash2 className="w-3.5 h-3.5 text-[#F53F3F]" />
              <span>删除连接</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

