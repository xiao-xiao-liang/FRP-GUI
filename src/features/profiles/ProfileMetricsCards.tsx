import React, { useMemo } from 'react';
import { FrpCore, Profile } from '../../types/frp';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { Button } from '../../components/ui/button';
import { AlertCircle } from 'lucide-react';

export interface ProfileMetricsCardsProps {
  profiles: Profile[];
  activeCore?: FrpCore | null;
  onOpenCores?: () => void;
  onDiagnose?: (profile: Profile) => void;
}

export const ProfileMetricsCards: React.FC<ProfileMetricsCardsProps> = ({
  profiles,
  activeCore,
  onOpenCores,
  onDiagnose,
}) => {
  const runningProfiles = useMemo(() => profiles.filter((p) => p.status === 'running'), [profiles]);
  const runningCount = runningProfiles.length;
  const errorCount = useMemo(() => profiles.filter((p) => p.status === 'error').length, [profiles]);
  const coreReady = Boolean(activeCore?.path) && activeCore?.status !== 'not_downloaded';

  const { activeTunnelsCount, totalTunnelsCount } = useMemo(() => {
    let active = 0;
    let total = 0;
    profiles.forEach((p) => {
      const proxies = (p.config as any)?.proxies || [];
      total += proxies.length;
      if (p.status === 'running') {
        active += proxies.length;
      }
    });
    return { activeTunnelsCount: active, totalTunnelsCount: total };
  }, [profiles]);

  return (
    <div className="space-y-3.5">
      {/* 异常引导横幅 */}
      {errorCount > 0 && (
        <div className="flex items-center justify-between p-3.5 bg-[#FFF3E5] border border-[#FF7D00]/30 rounded-[10px] text-[13px] text-[#1F2329]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#FF7D00] shrink-0" />
            <span>发现 <strong className="text-[#D82727]">{errorCount}</strong> 处连接异常中断，建议立即排查。</span>
          </div>
          {onDiagnose && (
            <Button
              size="sm"
              onClick={() => {
                const firstErrorProfile = profiles.find((p) => p.status === 'error') || null;
                if (firstErrorProfile) onDiagnose(firstErrorProfile);
              }}
              className="h-7 px-3 text-[12px] rounded-[6px] bg-[#FF7D00] text-white hover:bg-[#E06D00] cursor-pointer"
            >
              排查首个异常连接
            </Button>
          )}
        </div>
      )}

      {/* 4 个紧凑统计卡片 */}
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
              {activeTunnelsCount}
              <span className="text-[12px] font-normal text-[#8F959E] ml-1.5">/ {totalTunnelsCount} 规则</span>
            </div>
          </div>
          <FeishuPill variant={activeTunnelsCount > 0 ? 'green' : 'gray'} showDot={true} className="text-[11px] h-[22px] px-2">
            {activeTunnelsCount > 0 ? '正常工作' : '待命'}
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
    </div>
  );
};
