import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LogEntry, LogLevel, Profile } from '../../types/frp';
import { isTauriEnv } from '../../services/ipc';
import { Button } from '../../components/ui/button';
import { FeishuSelect } from '../../components/ui/feishu-select';
import { FeishuPill, FeishuPillVariant } from '../../components/ui/feishu-table/FeishuPill';
import { FeishuInput } from '../../components/ui/feishu-table/FeishuInput';
import { FeishuEmptyState } from '../../components/ui/feishu-table/FeishuEmptyState';
import { FeishuTooltip } from '../../components/ui/tooltip';
import { FEISHU_FONT_FAMILY, FeishuSearchIcon, FeishuAdvancedActivedIcon } from '../../components/ui/feishu-table';
import { cn } from '../../lib/utils';
import { 
  TerminalIcon, PauseIcon, ResumeIcon, CopyIcon, DownloadIcon, ClearIcon
} from '../../components/icons';
import { ArrowDownCircle, ArrowDown, Terminal } from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';

export const getLevelPillVariant = (level: string): FeishuPillVariant => {
  const lvl = level.toLowerCase();
  if (lvl === 'error') return 'red';
  if (lvl === 'warn') return 'orange';
  if (lvl === 'debug' || lvl === 'trace') return 'purple';
  return 'blue';
};

const ALL_LOG_LEVELS: LogLevel[] = ['info', 'warn', 'error', 'debug', 'trace'];

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
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>(ALL_LOG_LEVELS);
  const [isSearchSettingsOpen, setIsSearchSettingsOpen] = useState<boolean>(false);
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [wrapLogLines, setWrapLogLines] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [frozenLogs, setFrozenLogs] = useState<LogEntry[] | null>(null);
  const [scrollTop, setScrollTop] = useState<number>(0);
  const [containerHeight, setContainerHeight] = useState<number>(600);
  const [measuredRowHeights, setMeasuredRowHeights] = useState<Record<string, number>>({});
  const [isScrolledUp, setIsScrolledUp] = useState<boolean>(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const searchSettingsRef = useRef<HTMLDivElement>(null);

  const ITEM_HEIGHT = 28;
  const OVERSCAN = 8;

  // 监听容器尺寸调整
  useEffect(() => {
    const updateHeight = () => {
      if (scrollContainerRef.current) {
        const h = scrollContainerRef.current.clientHeight;
        if (h > 0) {
          setContainerHeight(h);
        }
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // 点击外部收起查找设置浮层
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchSettingsRef.current && !searchSettingsRef.current.contains(e.target as Node)) {
        setIsSearchSettingsOpen(false);
      }
    };
    if (isSearchSettingsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isSearchSettingsOpen]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
    if (target.clientHeight > 0 && target.clientHeight !== containerHeight) {
      setContainerHeight(target.clientHeight);
    }
    // 检测用户是否向上滚动查阅历史（距底部超过 48px）
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
    setIsScrolledUp(distanceFromBottom > 48);
  };

  // 过滤条件变化时重置滚动位置至顶部并恢复未上滑状态
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
    setScrollTop(0);
    setIsScrolledUp(false);
  }, [selectedProfileId, selectedLevels, searchKeyword]);

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

  // 智能自动滚动到底部（用户上滑查阅时挂起，不打扰阅读）
  useEffect(() => {
    if (autoScroll && !isPaused && !isScrolledUp && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      if (logEndRef.current && typeof logEndRef.current.scrollIntoView === 'function') {
        logEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [activeLogs, autoScroll, isPaused, isScrolledUp]);

  // 回到底部并恢复跟踪
  const handleScrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
    setIsScrolledUp(false);
    setAutoScroll(true);
  };

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

  // 日志等级状态判断
  const isAllLevelsSelected = selectedLevels.length === ALL_LOG_LEVELS.length;
  const isPartialLevelsSelected = selectedLevels.length > 0 && !isAllLevelsSelected;

  const handleToggleAllLevels = () => {
    if (isAllLevelsSelected) {
      setSelectedLevels([]);
    } else {
      setSelectedLevels(ALL_LOG_LEVELS);
    }
  };

  const handleToggleLevel = (lvl: LogLevel) => {
    if (selectedLevels.includes(lvl)) {
      setSelectedLevels(selectedLevels.filter((l) => l !== lvl));
    } else {
      setSelectedLevels([...selectedLevels, lvl]);
    }
  };

  // 过滤后的日志
  const filteredLogs = useMemo(() => {
    return activeLogs.filter((log) => {
      if (selectedProfileId !== 'all' && log.profileId !== selectedProfileId) {
        return false;
      }
      const lvl = log.level.toLowerCase() as LogLevel;
      if (!selectedLevels.includes(lvl)) {
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
  }, [activeLogs, selectedProfileId, selectedLevels, searchKeyword]);

  // 虚拟列表视口计算。自动换行后的行高由 ResizeObserver 测量，未测量行先采用估算值。
  const totalCount = filteredLogs.length;
  const effectiveHeight = containerHeight > 0 ? containerHeight : 600;
  const rowKeys = useMemo(
    () => filteredLogs.map((log, index) => log.id || `${log.sequence}-${index}`),
    [filteredLogs],
  );
  const rowOffsets = useMemo(() => {
    const offsets = [0];
    rowKeys.forEach((key, index) => {
      const rowHeight = wrapLogLines ? measuredRowHeights[key] || ITEM_HEIGHT : ITEM_HEIGHT;
      offsets[index + 1] = offsets[index] + rowHeight;
    });
    return offsets;
  }, [measuredRowHeights, rowKeys, wrapLogLines]);

  const findRowIndexAtOffset = (offset: number) => {
    let low = 0;
    let high = totalCount;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (rowOffsets[middle + 1] <= offset) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return Math.min(low, Math.max(0, totalCount - 1));
  };

  const startIndex = Math.max(0, findRowIndexAtOffset(scrollTop) - OVERSCAN);
  const endIndex = Math.min(
    totalCount,
    findRowIndexAtOffset(scrollTop + effectiveHeight) + OVERSCAN + 1,
  );
  const visibleLogs = useMemo(() => {
    return filteredLogs.slice(startIndex, endIndex);
  }, [filteredLogs, startIndex, endIndex]);
  const totalContentHeight = rowOffsets[totalCount] || 0;

  useEffect(() => {
    if (!wrapLogLines || typeof ResizeObserver === 'undefined') {
      return;
    }
    const list = scrollContainerRef.current?.querySelector<HTMLElement>('[data-testid="runtime-log-list"]');
    if (!list) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      setMeasuredRowHeights((current) => {
        let changed = false;
        const next = { ...current };
        entries.forEach((entry) => {
          const key = (entry.target as HTMLElement).dataset.logRowKey;
          const height = Math.ceil(entry.contentRect.height);
          if (key && height > 0 && current[key] !== height) {
            next[key] = height;
            changed = true;
          }
        });
        return changed ? next : current;
      });
    });
    list.querySelectorAll<HTMLElement>('[data-log-row-key]').forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [visibleLogs, wrapLogLines]);

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

  // 复制单行日志
  const handleCopySingleLine = (log: LogEntry) => {
    const content = `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.profileName}] ${log.message}`;
    navigator.clipboard.writeText(content);
    feishuToast.success('已复制单行日志');
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

  const getLevelBadge = (level: string) => {
    return (
      <FeishuPill
        variant={getLevelPillVariant(level)}
        showDot={false}
        className="text-[11px] h-[19px] px-1.5 font-medium select-none"
      >
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
    <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="flex flex-col h-full bg-white rounded-[12px] border border-[#DEE0E3] shadow-2xs overflow-hidden relative">
      {/* 顶层：标题状态认知、可点击指标徽标联动与全局数据操作 */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5 border-b border-[#DEE0E3] bg-white shrink-0 min-h-[44px]">
        {/* 左侧：标题与状态胶囊 */}
        <div className="flex items-center gap-2 shrink-0">
          <TerminalIcon className="w-4 h-4 text-[#165DFF]" />
          <span className="font-semibold text-[14px] text-[#1F2329] leading-[22px] whitespace-nowrap">实时日志监控</span>
          {!isPaused ? (
            <FeishuPill variant="green" showDot={true} className="text-[11px] h-[20px] px-2 whitespace-nowrap">
              实时流
            </FeishuPill>
          ) : (
            <FeishuPill variant="orange" showDot={true} className="text-[11px] h-[20px] px-2 whitespace-nowrap">
              已暂停
            </FeishuPill>
          )}
        </div>

        {/* 中间：可交互指标徽标（点击快速筛选对应级别） */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedLevels(ALL_LOG_LEVELS)}
            className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[11px] transition-all cursor-pointer select-none whitespace-nowrap ${
              isAllLevelsSelected
                ? 'bg-[#E8F3FF] text-[#3370FF] font-medium ring-1 ring-[#3370FF]'
                : 'bg-[#F2F3F5] text-[#646A75] hover:bg-[#E5E6EB]'
            }`}
            title="筛选全部日志"
          >
            <span>全部</span>
            <span className={isAllLevelsSelected ? 'text-[#3370FF] font-semibold' : 'text-[#1F2329]'}>
              {stats.total}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedLevels(['info'])}
            className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[11px] transition-all cursor-pointer select-none whitespace-nowrap ${
              selectedLevels.length === 1 && selectedLevels[0] === 'info'
                ? 'bg-[#E8F3FF] text-[#3370FF] font-medium ring-1 ring-[#3370FF]'
                : 'bg-[#DEE9FE]/60 text-[#1F2329] hover:bg-[#DEE9FE]'
            }`}
            title="快速筛选 INFO 级别"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#3370FF]" />
            <span>信息</span>
            <span className="text-[#3370FF] font-semibold">{stats.infos}</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedLevels(['warn'])}
            className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[11px] transition-all cursor-pointer select-none whitespace-nowrap ${
              selectedLevels.length === 1 && selectedLevels[0] === 'warn'
                ? 'bg-[#FFE6C7] text-[#D97706] font-medium ring-1 ring-[#D97706]'
                : stats.warns > 0
                ? 'bg-[#FFE6C7]/70 text-[#1F2329] hover:bg-[#FFE6C7]'
                : 'bg-[#F2F3F5] text-[#8F959E] hover:bg-[#E5E6EB]'
            }`}
            title="快速筛选 WARN 级别"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF8800]" />
            <span>警告</span>
            <span className={stats.warns > 0 ? 'text-[#D97706] font-semibold' : 'text-[#8F959E]'}>
              {stats.warns}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedLevels(['error'])}
            className={`inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[11px] transition-all cursor-pointer select-none whitespace-nowrap ${
              selectedLevels.length === 1 && selectedLevels[0] === 'error'
                ? 'bg-[#FFECEC] text-[#F53F3F] font-medium ring-1 ring-[#F53F3F]'
                : stats.errors > 0
                ? 'bg-[#FFECEC] text-[#F53F3F] font-medium hover:bg-[#FFD6D6]'
                : 'bg-[#F2F3F5] text-[#8F959E] hover:bg-[#E5E6EB]'
            }`}
            title="快速筛选 ERROR 级别"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#F53F3F]" />
            <span>错误</span>
            <span className={stats.errors > 0 ? 'text-[#F53F3F] font-semibold' : 'text-[#8F959E]'}>
              {stats.errors}
            </span>
          </button>
        </div>

        {/* 右侧：全局数据操作组 */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto sm:ml-0">
          <FeishuTooltip title="复制当前筛选的所有日志内容">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              className="h-7 px-2.5 text-[12px] rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5] text-[#1F2329] whitespace-nowrap"
            >
              <CopyIcon className="w-3.5 h-3.5 mr-1" />
              复制
            </Button>
          </FeishuTooltip>

          <FeishuTooltip title="导出日志为本地 .log 文本文件">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              className="h-7 px-2.5 text-[12px] rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5] text-[#1F2329] whitespace-nowrap"
            >
              <DownloadIcon className="w-3.5 h-3.5 mr-1" />
              导出
            </Button>
          </FeishuTooltip>

          <FeishuTooltip title="清空当前控制台日志缓存">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClear}
              className="h-7 px-2 text-[12px] rounded-[6px] text-[#F53F3F] hover:bg-[#FFECEC] hover:text-[#D93030] whitespace-nowrap"
              title="清空日志流"
            >
              <ClearIcon className="w-3.5 h-3.5 mr-1 text-[#F53F3F]" />
              清空
            </Button>
          </FeishuTooltip>
        </div>
      </div>

      {/* 次层：筛选与视图控制工具行 */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 border-b border-[#DEE0E3] bg-[#FAFAFB] shrink-0 min-h-[40px]">
        {/* 左侧：方案下拉 + 飞书定制搜索框 (含日志等级查找设置) */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* 方案下拉选择器 */}
          <div className="flex items-center gap-1.5 text-[12px] text-[#646A75] shrink-0">
            <span className="font-normal text-[#646A75] whitespace-nowrap">方案:</span>
            <div className="w-36 sm:w-44">
              <FeishuSelect
                options={profileOptions}
                value={selectedProfileId}
                onChange={(val) => setSelectedProfileId(val)}
                size="sm"
              />
            </div>
          </div>

          {/* 飞书表格风格搜索框（集成日志等级范围查找设置） */}
          <div ref={searchSettingsRef} className="relative flex-1 min-w-[160px] max-w-[280px]">
            <FeishuInput
              placeholder="搜索日志..."
              value={searchKeyword}
              onChange={(val) => setSearchKeyword(val)}
              onClear={() => setSearchKeyword('')}
              prefix={<FeishuSearchIcon className="text-[#8F959E]" />}
              suffix={
                <FeishuTooltip title="查找设置" side="top" sideOffset={6}>
                  <button
                    type="button"
                    title="查找设置"
                    aria-label="查找设置"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsSearchSettingsOpen((prev) => !prev);
                    }}
                    className={cn(
                      "w-6 h-6 rounded-[4px] flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-0.5",
                      isSearchSettingsOpen || !isAllLevelsSelected
                        ? "bg-[#E8F3FF] text-[#3370FF]"
                        : "hover:bg-[#EFF0F1] text-[#646A75] hover:text-[#1F2329]"
                    )}
                  >
                    <FeishuAdvancedActivedIcon className="w-4 h-4" />
                  </button>
                </FeishuTooltip>
              }
              containerClassName="h-[30px] text-[14px]"
            />

            {/* 1:1 飞书官方搜索设置面板 (在以下日志等级范围内查找) */}
            {isSearchSettingsOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{ fontFamily: FEISHU_FONT_FAMILY }}
                className="absolute right-2 top-[36px] z-[1050] w-[220px] bg-white rounded-[8px] border border-[#DEE0E3] shadow-[0_4px_16px_rgba(0,0,0,0.12)] pt-3 pb-2 text-[14px] text-[#1F2329] animate-in fade-in-80 duration-100 select-none box-border"
              >
                {/* 标题 */}
                <div className="px-3 pb-2 text-[14px] font-medium text-[#1F2329]">
                  在以下日志等级范围内查找
                </div>

                {/* 日志等级复选框列表 */}
                <div className="max-h-[300px] overflow-y-auto feishu-dropdown-scrollbar py-0.5">
                  {/* ① 顶层“所有等级”总控行 (mx-1.5 圆角矩形悬浮，不顶格左右边界) */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={handleToggleAllLevels}
                    className="mx-1.5 px-2 h-[32px] rounded-[4px] flex items-center gap-2 hover:bg-[#EFF0F1] cursor-pointer transition-colors"
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded-[4px] flex items-center justify-center transition-colors shrink-0",
                        isAllLevelsSelected
                          ? "bg-[#3370FF] text-white"
                          : isPartialLevelsSelected
                          ? "bg-[#3370FF] text-white"
                          : "border border-[#8F959E] bg-white"
                      )}
                    >
                      {isAllLevelsSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                      {isPartialLevelsSelected && !isAllLevelsSelected && (
                        <div className="w-2 h-0.5 bg-white rounded-full" />
                      )}
                    </div>
                    <span className="text-[14px] text-[#1F2329] flex items-center">
                      <span>所有等级</span>
                      <span className={cn("ml-1", selectedLevels.length === 0 ? "text-[#F54A45]" : "text-[#8F959E]")}>
                        （已选 {selectedLevels.length}）
                      </span>
                    </span>
                  </div>

                  {/* ② 各个日志等级具体行 (套上飞书官方色彩胶囊 FeishuPill) */}
                  {ALL_LOG_LEVELS.map((lvl) => {
                    const isChecked = selectedLevels.includes(lvl);

                    return (
                      <div
                        key={lvl}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleToggleLevel(lvl)}
                        className="mx-1.5 px-2 h-[32px] rounded-[4px] flex items-center gap-2.5 hover:bg-[#EFF0F1] cursor-pointer transition-colors"
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded-[4px] flex items-center justify-center transition-colors shrink-0",
                            isChecked
                              ? "bg-[#3370FF] text-white"
                              : "border border-[#8F959E] bg-white"
                          )}
                        >
                          {isChecked && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        <FeishuPill
                          variant={getLevelPillVariant(lvl)}
                          showDot={false}
                          className="text-[11px] h-[20px] px-2 font-medium select-none"
                        >
                          {lvl.toUpperCase()}
                        </FeishuPill>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：视图与流控制开关组 (永不被截断，空间不足时自动换行并靠右对齐) */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={handleTogglePause}
            className={`h-7 px-2.5 text-[12px] rounded-[6px] border cursor-pointer transition-all whitespace-nowrap ${
              isPaused
                ? 'border-[#FFD591] bg-[#FFF7E8] text-[#FF7D00] hover:bg-[#FFE6C7]'
                : 'border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F5F6F7]'
            }`}
          >
            {isPaused ? <ResumeIcon className="w-3.5 h-3.5 mr-1" /> : <PauseIcon className="w-3.5 h-3.5 mr-1" />}
            {isPaused ? '已暂停' : '暂停'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const next = !autoScroll;
              setAutoScroll(next);
              if (next) {
                setIsScrolledUp(false);
              }
            }}
            className={`h-7 px-2.5 text-[12px] rounded-[6px] border cursor-pointer transition-all whitespace-nowrap ${
              autoScroll
                ? 'border-[#B3D1FF] bg-[#E8F3FF] text-[#3370FF] hover:bg-[#D4E7FE]'
                : 'border-[#DEE0E3] bg-white text-[#646A75] hover:bg-[#F5F6F7] hover:text-[#1F2329]'
            }`}
          >
            <ArrowDownCircle className="w-3.5 h-3.5 mr-1" />
            滚屏
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setWrapLogLines((current) => !current)}
            aria-pressed={wrapLogLines}
            className={`h-7 px-2.5 text-[12px] rounded-[6px] border cursor-pointer transition-all whitespace-nowrap ${
              wrapLogLines
                ? 'border-[#B3D1FF] bg-[#E8F3FF] text-[#3370FF] hover:bg-[#D4E7FE]'
                : 'border-[#DEE0E3] bg-white text-[#646A75] hover:bg-[#F5F6F7] hover:text-[#1F2329]'
            }`}
          >
            自动换行
          </Button>
        </div>
      </div>

      {/* 日志终端视图 */}
      <div
        ref={scrollContainerRef}
        data-testid="runtime-log-viewport"
        onScroll={handleScroll}
        className={`flex-1 min-h-0 overflow-y-auto ${wrapLogLines ? 'overflow-x-hidden' : 'overflow-x-auto'} bg-[#F7F8FA] p-3 text-[13px] leading-relaxed text-[#1F2329] select-text relative`}
      >
        <div className={wrapLogLines ? 'min-w-0' : 'min-w-max'}>
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[#646A75] py-16">
              <Terminal className="w-10 h-10 mb-2 stroke-[1.5] text-[#8F959E]" />
              <p className="text-[14px]">暂无符合条件的日志记录</p>
              <p className="text-[12px] text-[#8F959E] mt-1">启动 FRP 穿透方案后，此处将实时输出运行日志与连接状态</p>
            </div>
          ) : (
            <div
              data-testid="runtime-log-list"
              data-virtualization={wrapLogLines ? 'variable-height' : 'fixed-height'}
              style={{ height: `${totalContentHeight}px`, position: 'relative' }}
            >
              {visibleLogs.map((log, idx) => {
                const actualIdx = startIndex + idx;
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
                    key={log.id || actualIdx}
                    data-log-row-key={rowKeys[actualIdx]}
                    style={{ position: 'absolute', top: `${rowOffsets[actualIdx]}px`, left: 0, right: 0 }}
                    className={`group flex min-w-0 items-start gap-2.5 rounded-[4px] px-2 py-1 transition-colors hover:bg-[#EFF3FF] ${wrapLogLines ? '' : 'w-max min-w-full'}`}
                  >
                    <span className="text-[#8F959E] select-none text-[12px] w-8 text-right shrink-0">
                      {actualIdx + 1}
                    </span>
                    <span className="text-[#8F959E] shrink-0 select-none text-[12px]">
                      {log.timestamp}
                    </span>
                    <span className="shrink-0 select-none">
                      {getLevelBadge(log.level)}
                    </span>
                    {/* 仅在聚合方案视图下展示 profile 标签；已过滤单一方案时自动隐藏以降噪 */}
                    {selectedProfileId === 'all' && (
                      <span className="px-1.5 py-0.2 rounded-[4px] text-[11px] bg-[#EFF3FF] text-[#1456C8] shrink-0 select-none">
                        {log.profileName}
                      </span>
                    )}
                    <span
                      data-testid={`runtime-log-message-${log.id}`}
                      className={`min-w-0 flex-1 ${wrapLogLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'} ${levelClass}`}
                    >
                      {log.message}
                    </span>
                    {/* 悬停单行复制按钮 */}
                    <button
                      type="button"
                      onClick={() => handleCopySingleLine(log)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-[#8F959E] hover:text-[#1F2329] hover:bg-[#DEE0E3]/50 shrink-0 cursor-pointer"
                      title="复制此行日志"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              <div ref={logEndRef} style={{ position: 'absolute', top: `${Math.max(0, totalContentHeight - 1)}px`, height: '1px', width: '1px', pointerEvents: 'none' }} />
            </div>
          )}
        </div>
      </div>

      {/* 用户向上滚动查阅历史日志时，悬浮展示一键回底按钮 */}
      {isScrolledUp && filteredLogs.length > 0 && (
        <button
          type="button"
          onClick={handleScrollToBottom}
          className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur-xs border border-[#DEE0E3] shadow-md hover:bg-[#E8F3FF] hover:border-[#B3D1FF] text-[#3370FF] text-[12px] font-medium transition-all cursor-pointer select-none"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          <span>回到底部</span>
        </button>
      )}
    </div>
  );
};
