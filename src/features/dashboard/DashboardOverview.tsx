import React from 'react';
import { FrpCore, Profile } from '../../types/frp';
import { Button } from '../../components/ui/button';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { FeishuEmptyState } from '../../components/ui/feishu-table/FeishuEmptyState';
import { FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';
import { RunIcon, StopIcon, TerminalIcon } from '../../components/icons';
import { 
  Plus, Activity, Copy, 
  Zap, AlertCircle
} from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';

interface DashboardOverviewProps {
  profiles: Profile[];
  activeCore: FrpCore | null;
  onStartAll: () => void;
  onStopAll: () => void;
  onCreateNew: () => void;
  onOpenLogs: () => void;
  onOpenDiagnostics: (profile?: Profile | null) => void;
  onOpenCores: () => void;
  onOpenProfiles: () => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  profiles,
  activeCore,
  onStartAll,
  onStopAll,
  onCreateNew,
  onOpenLogs,
  onOpenDiagnostics,
  onOpenCores,
  onOpenProfiles,
}) => {
  const runningProfiles = profiles.filter((p) => p.status === 'running');
  const runningCount = runningProfiles.length;
  const errorCount = profiles.filter((profile) => profile.status === 'error').length;
  const coreReady = Boolean(activeCore?.path) && activeCore?.status !== 'not_downloaded';
  
  // 汇总所有运行中的穿透隧道
  const activeTunnels: Array<{
    profileName: string;
    profileId: string;
    proxyName: string;
    type: string;
    local: string;
    remote: string;
    connectCmd: string;
  }> = [];

  let totalTunnelsCount = 0;
  profiles.forEach((p) => {
    const proxies = (p.config as any)?.proxies || [];
    totalTunnelsCount += proxies.length;
    if (p.status === 'running') {
      const serverAddr = (p.config as any)?.serverAddr || 'frp.example.com';
      proxies.forEach((proxy: any) => {
        let remoteDisplay = '';
        let cmd = '';
        if (['tcp', 'udp'].includes(proxy.type)) {
          remoteDisplay = `${serverAddr}:${proxy.remotePort || '自动'}`;
          if (proxy.type === 'tcp' && proxy.localPort === 22) {
            cmd = `ssh user@${serverAddr} -p ${proxy.remotePort}`;
          } else if (proxy.type === 'tcp' && proxy.localPort === 3389) {
            cmd = `${serverAddr}:${proxy.remotePort}`;
          } else {
            cmd = `${serverAddr}:${proxy.remotePort}`;
          }
        } else if (['http', 'https'].includes(proxy.type)) {
          const domain = proxy.customDomains?.[0] || `${proxy.subdomain}.${serverAddr}`;
          remoteDisplay = `${proxy.type}://${domain}`;
          cmd = `${proxy.type}://${domain}`;
        } else {
          remoteDisplay = `STCP P2P: ${proxy.name}`;
          cmd = proxy.name;
        }

        activeTunnels.push({
          profileName: p.name,
          profileId: p.id,
          proxyName: proxy.name,
          type: proxy.type,
          local: `${proxy.localIP}:${proxy.localPort}`,
          remote: remoteDisplay,
          connectCmd: cmd,
        });
      });
    }
  });

  const handleCopyCmd = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    feishuToast.success(`已复制连接地址: ${cmd}`);
  };

  return (
    <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-4 max-w-7xl mx-auto select-none">
      {/* 1. 顶部 Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-[18px] font-bold text-[#1F2329] tracking-tight">FRP 运行状态</h1>
          <p className="mt-0.5 text-[13px] text-[#646A73]">
            实时监控在线穿透隧道、运行实例与连接访问入口
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={onOpenProfiles}
            className="h-8 rounded-[6px] text-[13px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer"
          >
            管理我的连接
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenDiagnostics(null)}
            className="h-8 rounded-[6px] text-[13px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer"
          >
            <Activity className="mr-1.5 w-3.5 h-3.5 text-[#165DFF]" />
            网络连通性检测
          </Button>
          <Button
            variant="outline"
            onClick={onOpenLogs}
            className="h-8 rounded-[6px] text-[13px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer"
          >
            <TerminalIcon className="mr-1.5 w-3.5 h-3.5 text-[#646A75]" />
            实时日志看板
          </Button>
        </div>
      </div>

      {/* 2. 异常引导横幅 */}
      {errorCount > 0 && (
        <div className="flex items-center justify-between p-3.5 bg-[#FFF3E5] border border-[#FF7D00]/30 rounded-[10px] text-[13px] text-[#1F2329]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#FF7D00] shrink-0" />
            <span>发现 <strong className="text-[#D82727]">{errorCount}</strong> 处连接异常中断，建议立即排查。</span>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const firstErrorProfile = profiles.find((p) => p.status === 'error') || null;
              onOpenDiagnostics(firstErrorProfile);
            }}
            className="h-7 px-3 text-[12px] rounded-[6px] bg-[#FF7D00] text-white hover:bg-[#E06D00] cursor-pointer"
          >
            排查首个异常连接
          </Button>
        </div>
      )}

      {/* 3. 紧凑高利用率数据统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* 指标卡 1: 运行实例 */}
        <div className="rounded-[12px] border border-[#DEE0E3] bg-white p-3.5 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <span className="text-[13px] text-[#646A75] font-normal block">运行实例</span>
            <div className="mt-1 text-[24px] font-bold text-[#1F2329] tracking-tight leading-none tabular-nums">
              {runningCount}
              <span className="text-[12px] font-normal text-[#8F959E] ml-1.5">/ {profiles.length} 方案</span>
            </div>
          </div>
          {runningCount > 0 ? (
            <FeishuPill variant="green" showDot={true} className="text-[11px] h-[22px] px-2">
              {runningCount} 运行中
            </FeishuPill>
          ) : (
            <FeishuPill variant="gray" showDot={false} className="text-[11px] h-[22px] px-2">
              未运行
            </FeishuPill>
          )}
        </div>

        {/* 指标卡 2: 在线隧道 */}
        <div className="rounded-[12px] border border-[#DEE0E3] bg-white p-3.5 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <span className="text-[13px] text-[#646A75] font-normal block">在线穿透隧道</span>
            <div className="mt-1 text-[24px] font-bold text-[#165DFF] tracking-tight leading-none tabular-nums">
              {activeTunnels.length}
              <span className="text-[12px] font-normal text-[#8F959E] ml-1.5">/ {totalTunnelsCount} 规则</span>
            </div>
          </div>
          <FeishuPill variant={activeTunnels.length > 0 ? 'green' : 'gray'} showDot={true} className="text-[11px] h-[22px] px-2">
            {activeTunnels.length > 0 ? '正常工作' : '待命'}
          </FeishuPill>
        </div>

        {/* 指标卡 3: 异常待处理 */}
        <div className="rounded-[12px] border border-[#DEE0E3] bg-white p-3.5 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <span className="text-[13px] text-[#646A75] font-normal block">需要处理</span>
            <div className={`mt-1 text-[24px] font-bold tracking-tight leading-none tabular-nums ${errorCount > 0 ? 'text-[#F53F3F]' : 'text-[#1F2329]'}`}>
              {errorCount}
              <span className="text-[12px] font-normal text-[#8F959E] ml-1.5">/ {profiles.length} 方案</span>
            </div>
          </div>
          {errorCount > 0 ? (
            <FeishuPill variant="red" showDot={true} className="text-[11px] h-[22px] px-2">
              {errorCount} 处异常
            </FeishuPill>
          ) : (
            <FeishuPill variant="green" showDot={true} className="text-[11px] h-[22px] px-2">
              全部正常
            </FeishuPill>
          )}
        </div>

        {/* 指标卡 4: FRP 核心引擎 */}
        <div className="rounded-[12px] border border-[#DEE0E3] bg-white p-3.5 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <span className="text-[13px] text-[#646A75] font-normal block">FRP 核心引擎</span>
            <div className="mt-1 flex items-center gap-1.5 leading-none">
              <span className="text-[20px] font-bold text-[#1F2329] tracking-tight tabular-nums truncate max-w-[110px]" title={activeCore?.name}>
                {coreReady ? (activeCore?.version || '就绪') : '未配置'}
              </span>
              <FeishuPill variant={coreReady ? 'green' : 'gray'} showDot={coreReady} className="text-[11px] h-[20px] px-1.5 shrink-0">
                {coreReady ? '就绪' : '待配置'}
              </FeishuPill>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onOpenCores}
            className="h-7 text-[12px] px-2.5 rounded-[6px] border-[#DEE0E3] bg-white text-[#165DFF] hover:bg-[#F0F4FF] hover:border-[#165DFF] cursor-pointer"
          >
            {coreReady ? '切换核心' : '配置核心'}
          </Button>
        </div>
      </div>

      {/* 4. 快捷操作条 */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white rounded-[12px] border border-[#DEE0E3] shadow-2xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="default"
            size="sm"
            onClick={onCreateNew}
            className="h-8 rounded-[6px] px-3.5 text-[13px] bg-[#165DFF] text-white hover:bg-[#0E4FD9] cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            新建连接
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onStartAll}
            className="h-8 rounded-[6px] px-3.5 text-[13px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer"
          >
            <RunIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            一键全部启动
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={onStopAll}
            className="h-8 rounded-[6px] px-3.5 text-[13px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer"
          >
            <StopIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
            一键全部停止
          </Button>
        </div>
      </div>

      {/* 5. 在线穿透隧道大卡片 */}
      <div className="rounded-[12px] border border-[#DEE0E3] bg-white shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-[#DEE0E3] flex items-center justify-between">
          <div>
            <div className="text-[16px] font-semibold text-[#1F2329] flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#165DFF]" />
              在线穿透隧道与公网访问入口
            </div>
            <p className="text-[13px] text-[#646A73] mt-0.5">
              当前正在工作的穿透端点，点击可直接复制远程访问命令或公网链接
            </p>
          </div>
          <FeishuPill variant={activeTunnels.length > 0 ? 'green' : 'gray'} showDot={true} className="text-[12px]">
            {activeTunnels.length} 条在线
          </FeishuPill>
        </div>

        <div>
          {activeTunnels.length === 0 ? (
            <FeishuEmptyState
              title="暂无正在运行的穿透隧道"
              description="在方案列表中启动任意 FRP 穿透方案即可在此处查看公网连接入口"
              className="py-12"
            />
          ) : (
            <div className="divide-y divide-[#F0F1F2]">
              {activeTunnels.map((tun, i) => (
                <div key={i} className="p-4 flex items-center justify-between hover:bg-[#F9FAFB] transition-colors gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-[8px] bg-[#E8F3FF] text-[#165DFF] flex items-center justify-center text-[11px] font-bold uppercase shrink-0">
                      {tun.type}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[14px] text-[#1F2329]">{tun.proxyName}</span>
                        <span className="text-[12px] text-[#8F959E]">({tun.profileName})</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[13px] tabular-nums text-[#646A75]">
                        <span className="text-[#8F959E]">本地: {tun.local}</span>
                        <span>➔</span>
                        <span className="text-[#165DFF] font-semibold">{tun.remote}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopyCmd(tun.connectCmd)}
                      className="text-[13px] h-8 px-3 rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5] cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5 text-[#646A75]" />
                      复制连接地址
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
