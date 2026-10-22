import React, { useEffect, useMemo, useState } from 'react';
import { Profile } from '../../types/frp';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { getProfileIssue } from '../../services/profile-issues';
import { formatTrafficRate, summarizeRuntimeTraffic, type RuntimeTrafficState } from '../../services/runtime-traffic';

export interface ProfileMetricsCardsProps {
  profiles: Profile[];
  traffic?: RuntimeTrafficState;
  onViewIssues?: () => void;
  onDiagnose?: (profile: Profile) => void;
  onViewLogs?: (profile: Profile) => void;
  onEdit?: (profile: Profile) => void;
  onRepairCore?: () => void;
}

export const ProfileMetricsCards: React.FC<ProfileMetricsCardsProps> = ({
  profiles,
  traffic = {},
  onViewIssues,
}) => {
  const runningProfiles = useMemo(() => profiles.filter((p) => p.status === 'running'), [profiles]);
  const runningCount = runningProfiles.length;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (runningCount === 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [runningCount]);
  const trafficSummary = summarizeRuntimeTraffic(profiles, traffic, Math.max(now, Date.now()));
  const profileIssues = useMemo(() => profiles.flatMap((profile) => {
    const issue = getProfileIssue(profile);
    return issue ? [{ profile, issue }] : [];
  }), [profiles]);
  const issueCount = profileIssues.length;
  const totalRulesCount = useMemo(() => profiles.reduce((total, profile) => (
    total + ('proxies' in profile.config ? profile.config.proxies.length : 0)
  ), 0), [profiles]);

  return (
    <div className="space-y-3.5">
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

        {/* 指标卡 2: 已配置穿透规则 */}
        <div className="rounded-[12px] border border-[#DEE0E3] bg-white p-3.5 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <span className="text-[13px] text-[#646A75] font-normal block">穿透规则</span>
            <div className="mt-1 text-[24px] font-bold text-[#165DFF] tracking-tight leading-none tabular-nums">
              {totalRulesCount}
              <span className="text-[12px] font-normal text-[#8F959E] ml-1.5">条</span>
            </div>
          </div>
          <FeishuPill variant="gray" showDot={false} className="text-[11px] h-[22px] px-2">
            已配置
          </FeishuPill>
        </div>

        {/* 指标卡 3: 异常待处理 */}
        <div className="rounded-[12px] border border-[#DEE0E3] bg-white p-3.5 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between">
          <div>
            <span className="text-[13px] text-[#646A75] font-normal block">需要处理</span>
            <div className={`mt-1 text-[24px] font-bold tracking-tight leading-none tabular-nums ${issueCount > 0 ? 'text-[#F53F3F]' : 'text-[#1F2329]'}`}>
              {issueCount}
              <span className="text-[12px] font-normal text-[#8F959E] ml-1.5">/ {profiles.length} 方案</span>
            </div>
          </div>
          {issueCount > 0 ? (
            <button
              type="button"
              data-profile-issues-trigger
              onClick={onViewIssues}
              aria-label={`查看 ${issueCount} 项待处理连接`}
              aria-haspopup="dialog"
              className="shrink-0 cursor-pointer rounded-full no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3370FF] focus-visible:ring-offset-2"
            >
              <FeishuPill variant="red" showDot={true} className="text-[11px] h-[22px] px-2 transition-colors hover:bg-[#FFE0E0]">
                {issueCount} 项待处理
              </FeishuPill>
            </button>
          ) : (
            <FeishuPill variant="green" showDot={true} className="text-[11px] h-[22px] px-2">
              全部正常
            </FeishuPill>
          )}
        </div>

        {/* 指标卡 4: 当前运行实例的传输连接速率 */}
        <section aria-label="实时流量" className="min-w-0 rounded-[12px] border border-[#DEE0E3] bg-white p-3.5 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[13px] text-[#646A75] font-normal block">实时流量</span>
            {trafficSummary.uploadBytesPerSecond === null ? (
              <div className="mt-1 text-[20px] font-bold leading-none text-[#8F959E]">—</div>
            ) : (
              <div className="mt-1 flex items-center gap-2 whitespace-nowrap text-[16px] font-semibold leading-none tabular-nums">
                <span className="text-[#3370FF]" aria-label={`上行 ${formatTrafficRate(trafficSummary.uploadBytesPerSecond)}`}>↑ {formatTrafficRate(trafficSummary.uploadBytesPerSecond)}</span>
                <span className="text-[#00856A]" aria-label={`下行 ${formatTrafficRate(trafficSummary.downloadBytesPerSecond!)}`}>↓ {formatTrafficRate(trafficSummary.downloadBytesPerSecond!)}</span>
              </div>
            )}
            {trafficSummary.status !== 'idle' && (
              <p
                className="mt-1.5 truncate text-[11px] leading-4 text-[#646A75]"
                title={trafficSummary.reason || trafficSummary.label}
              >
                {trafficSummary.label}
              </p>
            )}
          </div>
          {trafficSummary.status === 'idle' && (
            <FeishuPill variant="gray" showDot={false} className="shrink-0 text-[11px] h-[22px] px-2">
              未运行
            </FeishuPill>
          )}
        </section>
      </div>

    </div>
  );
};
