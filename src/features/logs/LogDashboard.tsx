import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LogEntry, LogLevel, Profile } from '../../types/frp';
import { isTauriEnv } from '../../services/ipc';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FeishuSelect } from '../../components/ui/feishu-select';
import { FeishuPill, FeishuPillVariant } from '../../components/ui/feishu-table/FeishuPill';
import { FeishuInput } from '../../components/ui/feishu-table/FeishuInput';
import { FeishuEmptyState } from '../../components/ui/feishu-table/FeishuEmptyState';
import { FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';
import { 
  TerminalIcon, PauseIcon, ResumeIcon, CopyIcon, DownloadIcon, ClearIcon, ErrorIcon, WarningIcon 
} from '../../components/icons';
import { ArrowDownCircle, Terminal } from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';

interface LogDashboardProps {
  profiles: Profile[];
  logs: LogEntry[];
  onClearLogs: () => void;
  activeProfileId?: string | null;
}

export const LogDashboard: React.FC<LogDashboardProps> = ({
  profiles,
  logs,
  onClearLogs,
  activeProfileId = null,
}) => {
  const desktopAvailable = isTauriEnv();
  const [selectedProfileId, setSelectedProfileId] = useState<string>(activeProfileId || 'all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [wrapLogLines, setWrapLogLines] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [frozenLogs, setFrozenLogs] = useState<LogEntry[] | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleTogglePause = () => {
    setIsPaused((prev) => {
      const next = !prev;
      if (next) {
        setFrozenLogs(logs);
      } else {
        setFrozenLogs(null);
      }
      return next;
    });
  };

  const activeLogs = isPaused && frozenLogs !== null ? frozenLogs : logs;

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && !isPaused && logEndRef.current && typeof logEndRef.current.scrollIntoView === 'function') {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeLogs, autoScroll, isPaused]);

  // 过滤后的日志
  const filteredLogs = useMemo(() => {
    return activeLogs.filter((log) => {
      if (selectedProfileId !== 'all' && log.profileId !== selectedProfileId) {
        return false;
      }
      if (selectedLevel !== 'all' && log.level.toLowerCase() !== selectedLevel.toLowerCase()) {
        return false;
      }
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        return (
          log.message.toLowerCase().includes(kw) ||
          log.profileName.toLowerCase().includes(kw) ||
          log.raw.toLowerCase().includes(kw)
        );
      }
      return true;
    });
  }, [activeLogs, selectedProfileId, selectedLevel, searchKeyword]);

  // 统计信息
  const stats = useMemo(() => {
    let errors = 0;
    let warns = 0;
    let infos = 0;
    activeLogs.forEach((l) => {
      if (l.level === 'error') errors++;
      else if (l.level === 'warn') warns++;
      else infos++;
    });
    return { total: activeLogs.length, errors, warns, infos };
  }, [activeLogs]);

  // 清空日志
  const handleClear = () => {
    onClearLogs();
    if (isPaused) {
      setFrozenLogs([]);
    }
    feishuToast.info('已清空当前控制台日志缓存');
  };

  // 复制所有日志
  const handleCopy = () => {
    if (filteredLogs.length === 0) {
      feishuToast.warning('暂无日志可复制');
      return;
    }
    const content = filteredLogs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.profileName}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(content);
    feishuToast.success(`已复制 ${filteredLogs.length} 条日志到剪贴板`);
  };

  // 导出日志文件
  const handleExport = () => {
    if (filteredLogs.length === 0) {
      feishuToast.warning('暂无日志可导出');
      return;
    }
    const content = filteredLogs.map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.profileName}] ${l.message}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frp-logs-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
    feishuToast.success('日志文件已开始下载');
  };

  const getLevelBadge = (level: LogLevel) => {
    const lvl = level.toLowerCase();
    let variant: FeishuPillVariant = 'blue';
    if (lvl === 'error') variant = 'red';
    else if (lvl === 'warn') variant = 'orange';
    else if (lvl === 'debug' || lvl === 'trace') variant = 'purple';

    return (
      <FeishuPill variant={variant} showDot={false} className="text-[11px] h-[19px] px-1.5 font-medium select-none">
        {level.toUpperCase()}
      </FeishuPill>
    );
  };

  const profileOptions = [
    { value: 'all', label: `全部方案 (${profiles.length})` },
    ...profiles.map((p) => ({ value: p.id, label: `${p.name} (${p.type})` })),
  ];

  if (!desktopAvailable) {
    return (
      <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="flex flex-col h-full bg-white rounded-[12px] border border-[#DEE0E3] shadow-2xs overflow-hidden">
        <div className="flex items-center justify-between p-3.5 border-b border-[#DEE0E3] bg-white">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-4 h-4 text-[#165DFF]" />
            <span className="font-semibold text-[15px] text-[#1F2329] leading-[22px]">实时日志监控</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 bg-[#F7F8FA]">
          <FeishuEmptyState
            title="实时运行日志仅可在桌面版应用中查看"
            description="浏览器预览不会启动 FRPC，也不会生成模拟日志。请使用 pnpm tauri dev 打开的桌面窗口。"
            className="max-w-[420px]"
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="flex flex-col h-full bg-white rounded-[12px] border border-[#DEE0E3] shadow-2xs overflow-hidden">
      {/* 顶部飞书工具栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 border-b border-[#DEE0E3] bg-white">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-4 h-4 text-[#165DFF]" />
            <span className="font-semibold text-[15px] text-[#1F2329] leading-[22px]">实时日志监控</span>
            {!isPaused && (
              <FeishuPill variant="green" showDot={true} className="text-[11px] h-[22px] px-2.5">
                实时流
              </FeishuPill>
            )}
          </div>

          {/* 飞书 Select 下拉选择器 */}
          <div className="flex items-center gap-1.5 text-[13px] text-[#646A75]">
            <span>方案:</span>
            <div className="w-48">
              <FeishuSelect
                options={profileOptions}
                value={selectedProfileId}
                onChange={(val) => setSelectedProfileId(val)}
                size="sm"
              />
            </div>
          </div>

          {/* 级别分段选择器 */}
          <div className="inline-flex h-8 items-center bg-[#F2F3F5] rounded-[6px] p-0.5 text-[13px] text-[#646A75]">
            {['all', 'info', 'warn', 'error', 'debug', 'trace'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setSelectedLevel(lvl)}
                className={`px-3 py-1 rounded-[4px] font-normal transition-all cursor-pointer ${
                  selectedLevel === lvl
                    ? 'bg-white text-[#165DFF] font-medium shadow-xs'
                    : 'text-[#646A75] hover:text-[#1F2329]'
                }`}
              >
                {lvl.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧控制 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-48">
            <FeishuInput
              placeholder="搜索日志..."
              value={searchKeyword}
              onChange={(val) => setSearchKeyword(val)}
              onClear={() => setSearchKeyword('')}
              containerClassName="h-8"
            />
          </div>

          <Button
            size="sm"
            variant={isPaused ? 'warning' : 'outline'}
            onClick={handleTogglePause}
            className="h-8 px-3 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]"
          >
            {isPaused ? <ResumeIcon className="w-3.5 h-3.5 mr-1" /> : <PauseIcon className="w-3.5 h-3.5 mr-1" />}
            {isPaused ? '已暂停' : '暂停'}
          </Button>

          <Button
            size="sm"
            variant={autoScroll ? 'default' : 'outline'}
            onClick={() => setAutoScroll(!autoScroll)}
            className="h-8 px-3 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]"
          >
            <ArrowDownCircle className="w-3.5 h-3.5 mr-1" />
            滚屏
          </Button>

          <Button
            size="sm"
            variant={wrapLogLines ? 'default' : 'outline'}
            onClick={() => setWrapLogLines((current) => !current)}
            aria-pressed={wrapLogLines}
            className="h-8 px-3 text-[13px] rounded-[6px]"
          >
            自动换行
          </Button>

          <Button size="sm" variant="outline" onClick={handleCopy} className="h-8 px-3 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]">
            <CopyIcon className="w-3.5 h-3.5 mr-1" />
            复制
          </Button>

          <Button size="sm" variant="outline" onClick={handleExport} className="h-8 px-3 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]">
            <DownloadIcon className="w-3.5 h-3.5 mr-1" />
            导出
          </Button>

          <Button size="sm" variant="ghost" onClick={handleClear} className="w-8 h-8 rounded-[6px] p-0" title="清空日志流">
            <ClearIcon className="w-4 h-4 text-[#F53F3F]" />
          </Button>
        </div>
      </div>

      {/* 统计横条 */}
      <div className="flex items-center justify-between px-5 py-2 bg-[#F7F8FA] border-b border-[#DEE0E3] text-[13px] text-[#646A75]">
        <div className="flex items-center gap-4">
          <span>总计条目: <strong className="text-[#1F2329]">{stats.total}</strong></span>
          <span>当前显示: <strong className="text-[#165DFF]">{filteredLogs.length}</strong></span>
          <span className="flex items-center gap-1 text-[#F53F3F]">
            <ErrorIcon className="w-3.5 h-3.5" /> 错误: <strong>{stats.errors}</strong>
          </span>
          <span className="flex items-center gap-1 text-[#FF7D00]">
            <WarningIcon className="w-3.5 h-3.5" /> 警告: <strong>{stats.warns}</strong>
          </span>
        </div>
        <div className="text-[#8F959E] text-[12px]">
          FRP 实时标准输出管道
        </div>
      </div>

      {/* 日志终端视图 */}
      <div
        ref={scrollContainerRef}
        data-testid="runtime-log-viewport"
        className={`flex-1 min-h-0 overflow-y-auto ${wrapLogLines ? 'overflow-x-hidden' : 'overflow-x-auto'} bg-[#F7F8FA] p-3 text-[13px] leading-relaxed text-[#1F2329] select-text`}
      >
        <div className={wrapLogLines ? 'min-w-0' : 'min-w-max'}>
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#646A75] py-16">
              <Terminal className="w-10 h-10 mb-2 stroke-[1.5] text-[#8F959E]" />
              <p className="text-[14px]">暂无符合条件的日志记录</p>
              <p className="text-[12px] text-[#8F959E] mt-1">启动 FRP 穿透方案后，此处将实时输出运行日志与连接状态</p>
            </div>
          ) : (
            filteredLogs.map((log, idx) => {
              const levelClass =
                log.level === 'error'
                  ? 'text-[#F53F3F] font-medium'
                  : log.level === 'warn'
                  ? 'text-[#FF7D00]'
                  : log.level === 'debug' || log.level === 'trace'
                  ? 'text-[#722ED1]'
                  : 'text-[#1F2329]';

              return (
                <div
                  key={log.id || idx}
                  className={`flex min-w-0 items-start gap-2.5 rounded-[4px] px-2 py-1 transition-colors hover:bg-[#EFF3FF] ${wrapLogLines ? '' : 'w-max min-w-full'}`}
                >
                  <span className="text-[#8F959E] select-none text-[12px] w-8 text-right shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-[#8F959E] shrink-0 select-none text-[12px]">
                    {log.timestamp}
                  </span>
                  <span className="shrink-0 select-none">
                    {getLevelBadge(log.level)}
                  </span>
                  <span className="px-1.5 py-0.2 rounded-[4px] text-[11px] bg-[#EFF3FF] text-[#1456C8] shrink-0 select-none">
                    {log.profileName}
                  </span>
                  <span
                    data-testid={`runtime-log-message-${log.id}`}
                    className={`min-w-0 flex-1 ${wrapLogLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} ${levelClass}`}
                  >
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
};
