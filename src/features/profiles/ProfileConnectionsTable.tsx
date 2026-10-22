import React, { useState, useMemo, useRef } from 'react';
import { Profile } from '../../types/frp';
import { Button } from '../../components/ui/button';
import { RunIcon, StopIcon, DeleteIcon, RefreshIcon } from '../../components/icons';
import { FeishuTooltip } from '../../components/ui/tooltip';
import { FeishuPagination } from '../../components/ui/feishu-table/FeishuPagination';
import { FeishuEmptyState } from '../../components/ui/feishu-table/FeishuEmptyState';
import { FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';
import { FeishuHeaderCell } from '../../components/ui/feishu-table/FeishuHeaderCell';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu';
import { getBatchActionTargets } from '../../services/profile-organization';
import { getProfileIssue } from '../../services/profile-issues';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { ProxyTypePill } from './proxy-type-presentation';
import {
  MoreHorizontal,
  Terminal,
  Edit3,
  QrCode,
  Copy,
  Wifi,
  Trash2,
  Pin,
  PinOff,
} from 'lucide-react';

const PROFILE_TABLE_COLUMNS = [
  { key: 'name', title: '连接名称', width: 220, minWidth: 160, maxWidth: 420 },
  { key: 'proxies', title: '穿透规则', width: 340, minWidth: 200, maxWidth: 540 },
  { key: 'startTime', title: '上次启动', width: 130, minWidth: 90, maxWidth: 200 },
  { key: 'status', title: '状态', width: 160, minWidth: 150, maxWidth: 260 },
  { key: 'actions', title: '操作', width: 140, minWidth: 140, maxWidth: 140, resizable: false, fixed: 'right' },
] as const;

type ProfileTableColumnKey = (typeof PROFILE_TABLE_COLUMNS)[number]['key'];

export interface ProfileConnectionsTableProps {
  profiles: Profile[];
  selectedRowKeys: string[];
  onSelectionChange: (selectedRowKeys: string[]) => void;
  isBatchOperating?: boolean;
  onBatchStart?: (profiles: Profile[]) => void;
  onBatchStop?: (profiles: Profile[]) => void;
  onBatchDelete?: (profiles: Profile[]) => void;
  onToggle: (p: Profile) => void;
  onEdit: (p: Profile) => void;
  onClone: (p: Profile) => void;
  onDelete: (p: Profile) => void;
  onSync: (p: Profile) => void;
  onViewLogs: (p: Profile) => void;
  onDiagnose: (p: Profile) => void;
  onRepairCore: () => void;
  onTogglePin?: (p: Profile) => void;
  onViewRuleDetails?: (p: Profile) => void;
  onViewIssue?: (p: Profile) => void;
}

export const ProfileConnectionsTable: React.FC<ProfileConnectionsTableProps> = ({
  profiles,
  selectedRowKeys,
  onSelectionChange,
  isBatchOperating = false,
  onBatchStart,
  onBatchStop,
  onBatchDelete,
  onToggle,
  onEdit,
  onClone,
  onDelete,
  onSync,
  onViewLogs,
  onDiagnose,
  onRepairCore,
  onTogglePin,
  onViewRuleDetails,
  onViewIssue,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 选中的目标 Profile 对象列表
  const selectedProfiles = useMemo(
    () => profiles.filter((p) => selectedRowKeys.includes(p.id)),
    [profiles, selectedRowKeys]
  );

  // 严格批量资格计算
  const startTargets = useMemo(
    () => getBatchActionTargets(selectedProfiles, 'start'),
    [selectedProfiles]
  );
  const stopTargets = useMemo(
    () => getBatchActionTargets(selectedProfiles, 'stop'),
    [selectedProfiles]
  );
  const deleteTargets = useMemo(
    () => getBatchActionTargets(selectedProfiles, 'delete'),
    [selectedProfiles]
  );

  // 专用表格复用飞书列宽拖拽交互，列宽仅保留在当前页面会话中。
  const [columnWidths, setColumnWidths] = useState<Partial<Record<ProfileTableColumnKey, number>>>({});
  const [resizingKey, setResizingKey] = useState<ProfileTableColumnKey | null>(null);
  const headerRefs = useRef<Partial<Record<ProfileTableColumnKey, HTMLTableCellElement | null>>>({});
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const hasResized = Object.keys(columnWidths).length > 0;
  const totalTableWidth = PROFILE_TABLE_COLUMNS.reduce(
    (total, column) => total + (columnWidths[column.key] ?? column.width),
    48
  );

  const handleResizeStart = (columnKey: ProfileTableColumnKey, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const nextWidths: Partial<Record<ProfileTableColumnKey, number>> = {};
    PROFILE_TABLE_COLUMNS.forEach((column) => {
      const header = headerRefs.current[column.key];
      const headerWidth = header ? Math.round(header.getBoundingClientRect().width) : 0;
      nextWidths[column.key] = headerWidth > 0
        ? headerWidth
        : (columnWidths[column.key] ?? column.width);
    });

    const startWidth = nextWidths[columnKey] ?? 160;
    setColumnWidths(nextWidths);
    setResizingKey(columnKey);
    startXRef.current = event.clientX;
    startWidthRef.current = startWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const column = PROFILE_TABLE_COLUMNS.find((item) => item.key === columnKey);
      if (!column) return;
      const width = Math.max(
        column.minWidth,
        Math.min(column.maxWidth, startWidthRef.current + moveEvent.clientX - startXRef.current)
      );
      setColumnWidths((previous) => ({ ...previous, [columnKey]: width }));
    };

    const handleMouseUp = () => {
      setResizingKey(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // 分页数据
  const totalPages = Math.max(1, Math.ceil(profiles.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedProfiles = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return profiles.slice(start, start + pageSize);
  }, [profiles, safePage, pageSize]);

  return (
    <div
      style={{ fontFamily: FEISHU_FONT_FAMILY }}
      className="rounded-xl border border-[#DEE0E3] bg-white shadow-2xs flex flex-col relative w-full overflow-hidden select-none"
    >
      {/* 1. 固定批量操作区：零选中时保留空白，避免表格内容发生纵向位移 */}
      <div
        data-testid="profile-batch-action-slot"
        className="min-h-[52px] flex items-center justify-end gap-2 px-4 py-2 border-b border-[#DEE0E3] bg-white"
      >
        {selectedProfiles.length > 0 && (
          <>
          <FeishuTooltip title={!deleteTargets.canExecute ? deleteTargets.reason : undefined}>
            <span className="inline-block">
              <Button
                size="sm"
                variant="destructive"
                disabled={!deleteTargets.canExecute || isBatchOperating}
                onClick={() => onBatchDelete?.(selectedProfiles)}
                className="h-7 text-[11px] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <DeleteIcon className="w-3 h-3 mr-1 shrink-0 [&_path]:fill-current" />
                批量删除
              </Button>
            </span>
          </FeishuTooltip>

          <FeishuTooltip title={!startTargets.canExecute ? startTargets.reason : undefined}>
            <span className="inline-block">
              <Button
                size="sm"
                variant="outline"
                disabled={!startTargets.canExecute || isBatchOperating}
                onClick={() => onBatchStart?.(selectedProfiles)}
                className="h-7 text-[11px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <RunIcon className="w-3 h-3 mr-1 shrink-0" />
                批量启动
              </Button>
            </span>
          </FeishuTooltip>

          <FeishuTooltip title={!stopTargets.canExecute ? stopTargets.reason : undefined}>
            <span className="inline-block">
              <Button
                size="sm"
                variant="outline"
                disabled={!stopTargets.canExecute || isBatchOperating}
                onClick={() => onBatchStop?.(selectedProfiles)}
                className="h-7 text-[11px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <StopIcon className="w-3 h-3 mr-1 shrink-0" />
                批量停止
              </Button>
            </span>
          </FeishuTooltip>
          </>
        )}
      </div>

      {/* 2. 表格滚动容器 */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar">
        <table
          className="text-left border-collapse text-[13px] w-full"
          style={{
            tableLayout: 'fixed',
            minWidth: totalTableWidth,
            width: hasResized ? `${totalTableWidth}px` : '100%',
          }}
        >
          <colgroup>
            <col style={{ width: '48px' }} />
            {PROFILE_TABLE_COLUMNS.map((column) => {
              const explicitWidth = columnWidths[column.key];
              const defaultWidth = column.key === 'name' ? undefined : `${column.width}px`;
              return (
                <col
                  key={column.key}
                  style={explicitWidth ? { width: `${explicitWidth}px` } : (defaultWidth ? { width: defaultWidth } : undefined)}
                />
              );
            })}
          </colgroup>
          <thead className="bg-white border-b border-[#DEE0E3] select-none text-feishu-text-secondary group/thead feishu-table-head">
            <tr>
              {/* 选择列 */}
              <th className="w-12 pl-5 pr-3 py-2.5 text-center font-normal relative">
                <input
                  type="checkbox"
                  aria-label="选择全部连接"
                  disabled={isBatchOperating}
                  checked={profiles.length > 0 && profiles.every((p) => selectedRowKeys.includes(p.id))}
                  onChange={(e) => {
                    if (isBatchOperating) return;
                    if (e.target.checked) {
                      onSelectionChange(profiles.map((p) => p.id));
                    } else {
                      onSelectionChange([]);
                    }
                  }}
                  className="w-4 h-4 rounded border-[#DEE0E3] text-[#165DFF] focus:ring-0 cursor-pointer accent-[#165DFF] disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="feishu-col-divider absolute right-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-[#DEE0E3] opacity-0 group-hover/thead:opacity-100 transition-opacity duration-150 pointer-events-none z-10" />
              </th>
              {PROFILE_TABLE_COLUMNS.map((column, index) => {
                const isActions = column.key === 'actions';
                return (
                  <th
                    key={column.key}
                    ref={(element) => {
                      headerRefs.current[column.key] = element;
                    }}
                    className={`p-0 font-normal border-none transition-shadow duration-200 ${
                      isActions ? 'sticky right-0 bg-white z-30' : ''
                    }`}
                  >
                    <FeishuHeaderCell
                      title={column.title}
                      enableMenu={!isActions}
                      sortable={!isActions}
                      resizable={column.key !== 'actions'}
                      isResizing={resizingKey === column.key}
                      isLast={index === PROFILE_TABLE_COLUMNS.length - 1}
                      onResizeStart={(event) => handleResizeStart(column.key, event)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-[#DEE0E3]/60 bg-white">
            {paginatedProfiles.length === 0 ? (
              <tr>
                <td colSpan={PROFILE_TABLE_COLUMNS.length + 1} className="p-0 text-center bg-white py-12">
                  <FeishuEmptyState
                    title="暂无连接方案"
                    description="点击右上角“新建连接”即可创建内网穿透方案"
                  />
                </td>
              </tr>
            ) : (
              paginatedProfiles.map((record) => {
                const isSelected = selectedRowKeys.includes(record.id);
                const isStarting = record.status === 'starting';
                const isStopping = record.status === 'stopping';
                const isRunning = record.status === 'running'
                  || (record.status === 'error' && Boolean(record.stats.pid));
                const issue = getProfileIssue(record);
                const statusLabel = record.status === 'error'
                  ? (record.stats.lastFailureKind === 'startup' || record.stats.lastFailureKind === 'core_invalid' ? '启动失败' : '异常中断')
                  : isStarting ? '启动中' : isStopping ? '停止中' : isRunning ? '运行中' : '未运行';
                const statusVariant = record.status === 'error'
                  ? 'red' : issue || isStarting || isStopping ? 'orange' : isRunning ? 'green' : 'gray';

                // 穿透规则提取
                const proxies = (record.config as any)?.proxies || [];
                const isOverThree = proxies.length > 3;
                const visibleProxies = isOverThree ? proxies.slice(0, 2) : proxies.slice(0, 3);

                return (
                  <tr
                    key={record.id}
                    className={`hover:bg-[#F8F9FA] transition-colors group ${
                      isSelected ? 'bg-[#F0F4FF] hover:bg-[#E8F0FF]' : ''
                    }`}
                  >
                    {/* 选择框 */}
                    <td className="w-12 pl-5 pr-3 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`选择 ${record.name}`}
                        disabled={isBatchOperating}
                        checked={isSelected}
                        onChange={(e) => {
                          if (isBatchOperating) return;
                          if (e.target.checked) {
                            onSelectionChange([...selectedRowKeys, record.id]);
                          } else {
                            onSelectionChange(selectedRowKeys.filter((id) => id !== record.id));
                          }
                        }}
                        className="w-4 h-4 rounded border-[#DEE0E3] text-[#165DFF] focus:ring-0 cursor-pointer accent-[#165DFF] disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </td>

                    {/* 连接名称及下方描述 */}
                    <td className="px-3 py-2 min-w-0 overflow-hidden">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {record.isPinned && (
                            <span className="inline-flex items-center text-[10px] font-medium text-[#165DFF] bg-[#E8F3FF] px-1.5 py-0.5 rounded shrink-0">
                              置顶
                            </span>
                          )}
                          <span
                            onClick={() => onEdit(record)}
                            className="font-medium text-[#1F2329] hover:text-[#165DFF] transition-colors cursor-pointer truncate text-[13px]"
                          >
                            {record.name}
                          </span>
                        </div>
                        {record.description?.trim() ? (
                          <FeishuTooltip title={record.description}>
                            <span
                              tabIndex={0}
                              className="text-[12px] text-[#646A75] truncate block max-w-full cursor-default focus:outline-none"
                            >
                              {record.description}
                            </span>
                          </FeishuTooltip>
                        ) : null}
                      </div>
                    </td>

                    {/* 穿透规则 */}
                    <td className="px-3 py-2">
                      {proxies.length === 0 ? (
                        <span className="text-[12px] text-[#8F959E]">—</span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`查看 ${record.name} 的穿透规则详情`}
                          onClick={() => onViewRuleDetails?.(record)}
                          className="w-full text-left cursor-pointer flex flex-col gap-1 py-1 focus:outline-none group rounded-[4px] p-1 -m-1 hover:bg-[#F2F3F5] transition-colors"
                        >
                          {visibleProxies.map((p: any, idx: number) => {
                            const localIp = p.localIP || '127.0.0.1';
                            const lPort = p.localPort !== undefined && p.localPort !== null ? p.localPort : '—';
                            const localDisplay = `${localIp}:${lPort}`;

                            const remoteIp = (record.config as any)?.serverAddr || (record.config as any)?.bindAddr || (p as any).remoteIP || '—';
                            const rPort = p.remotePort !== undefined && p.remotePort !== null ? p.remotePort : '—';
                            const remoteDisplay = rPort !== '—'
                              ? `${remoteIp}:${rPort}`
                              : (p.customDomains?.[0] || (p.subdomain && remoteIp !== '—' ? `${p.subdomain}.${remoteIp}` : `${remoteIp}:—`));

                            const ruleText = `${localDisplay} → ${remoteDisplay}`;

                            return (
                              <div key={idx} className="flex items-center gap-1.5 leading-tight min-w-0">
                                <ProxyTypePill type={p.type} />
                                <span
                                  title={ruleText}
                                  className="font-mono text-[#646A75] tabular-nums text-[11px] whitespace-nowrap truncate"
                                >
                                  {ruleText}
                                </span>
                              </div>
                            );
                          })}
                          {isOverThree && (
                            <span className="text-[10px] text-[#165DFF] font-medium leading-tight mt-0.5">
                              查看更多（+{proxies.length - 2} 条）
                            </span>
                          )}
                        </button>
                      )}
                    </td>

                    {/* 上次启动 */}
                    <td className="px-2 py-2 truncate">
                      {typeof record.stats?.startTime === 'number' && Number.isFinite(record.stats.startTime) && record.stats.startTime > 0 ? (
                        <span
                          title={new Date(record.stats.startTime).toLocaleString('zh-CN', { hour12: false })}
                          className="text-[12px] text-[#646A75] tabular-nums whitespace-nowrap"
                        >
                          {new Date(record.stats.startTime).toLocaleString('zh-CN', { hour12: false })}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[#8F959E]">—</span>
                      )}
                    </td>

                    {/* 状态与简短原因保留固定高度，异常变化不挤压其他连接。 */}
                    <td className="min-w-0 px-3 py-2">
                      <div className="flex h-[44px] min-w-0 flex-col justify-center gap-1">
                        <div className="flex items-center gap-2">
                          <FeishuPill variant={statusVariant} className="h-[22px] px-2 text-[11px]">
                            {statusLabel}
                          </FeishuPill>
                          {issue && onViewIssue && (
                            <button
                              type="button"
                              onClick={() => onViewIssue(record)}
                              aria-label={`查看 ${record.name} 的异常详情`}
                              aria-haspopup="dialog"
                              className="shrink-0 cursor-pointer rounded-[4px] text-[11px] text-[#3370FF] hover:text-[#245BDB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3370FF]"
                            >
                              查看详情
                            </button>
                          )}
                        </div>
                        {issue && (
                          <span title={issue.summary} className="truncate text-[11px] leading-4 text-[#646A73]">
                            {issue.summary}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 操作列 (sticky right-0) */}
                    <td className={`sticky right-0 ${
                      isSelected
                        ? 'bg-[#F0F4FF] group-hover:bg-[#E8F0FF]'
                        : 'bg-white group-hover:bg-[#F8F9FA]'
                    } z-20 pl-3 pr-5 py-2 whitespace-nowrap`}>
                      <div className="flex items-center gap-1.5">
                        {record.status === 'error' && record.stats?.lastFailureKind === 'core_invalid' ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={onRepairCore}
                            className="h-7 px-2.5 text-[11px] bg-[#FFF0F0] text-[#F53F3F] hover:bg-[#FFE4E4] cursor-pointer"
                          >
                            修复 FRPC 核心
                          </Button>
                        ) : isRunning ? (
                          <FeishuTooltip title="停止连接">
                            <span>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="停止连接"
                                disabled={isBatchOperating}
                                onClick={() => onToggle(record)}
                                className="h-7 w-7 p-0 rounded-[4px] bg-transparent text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <StopIcon className="w-3.5 h-3.5 shrink-0" />
                              </Button>
                            </span>
                          </FeishuTooltip>
                        ) : isStopping ? (
                          <FeishuTooltip title="停止中...">
                            <span>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="停止中..."
                                disabled
                                className="h-7 w-7 p-0 rounded-[4px] text-[#8F959E] bg-[#F2F3F5] cursor-not-allowed opacity-50"
                              >
                                <StopIcon className="w-3.5 h-3.5 shrink-0" />
                              </Button>
                            </span>
                          </FeishuTooltip>
                        ) : isStarting ? (
                          <FeishuTooltip title="启动中...">
                            <span>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="启动中..."
                                disabled
                                className="h-7 w-7 p-0 rounded-[4px] text-[#00B42A] bg-[#F2FCF3] cursor-not-allowed opacity-50"
                              >
                                <RunIcon className="w-3.5 h-3.5 shrink-0" />
                              </Button>
                            </span>
                          </FeishuTooltip>
                        ) : record.status === 'error' ? (
                          <FeishuTooltip title="重新启动连接">
                            <span>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="重新启动连接"
                                disabled={isBatchOperating}
                                onClick={() => onToggle(record)}
                                className="h-7 w-7 p-0 rounded-[4px] bg-transparent text-[#00B42A] hover:bg-[#F2FCF3] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <RunIcon className="w-3.5 h-3.5 shrink-0" />
                              </Button>
                            </span>
                          </FeishuTooltip>
                        ) : (
                          <FeishuTooltip title="启动连接">
                            <span>
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label="启动连接"
                                disabled={isBatchOperating}
                                onClick={() => onToggle(record)}
                                className="h-7 w-7 p-0 rounded-[4px] bg-transparent text-[#00B42A] hover:bg-[#F2FCF3] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <RunIcon className="w-3.5 h-3.5 shrink-0" />
                              </Button>
                            </span>
                          </FeishuTooltip>
                        )}

                        {/* 单项删除图标按钮 */}
                        <FeishuTooltip title="删除连接">
                          <span>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="删除连接"
                              disabled={isBatchOperating}
                              onClick={() => onDelete(record)}
                              className="h-7 w-7 p-0 rounded-[4px] bg-transparent text-[#F53F3F] hover:bg-[#FFECEC] hover:text-[#D93030] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                            </Button>
                          </span>
                        </FeishuTooltip>

                        {/* 更多操作菜单 */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label="更多操作"
                              disabled={isBatchOperating}
                              className="h-7 w-7 p-0 rounded-[4px] bg-transparent text-[#646A75] hover:bg-[#F2F3F5] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[140px] p-1 shadow-lg border border-[#DEE0E3] bg-white rounded-[8px]">
                            <DropdownMenuItem onClick={() => onEdit(record)} className="flex items-center justify-start gap-2.5 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                              <Edit3 className="w-3.5 h-3.5 text-[#646A75] shrink-0" />
                              <span>编辑配置</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onViewLogs(record)} className="flex items-center justify-start gap-2.5 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                              <Terminal className="w-3.5 h-3.5 text-[#646A75] shrink-0" />
                              <span>查看日志</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDiagnose(record)} className="flex items-center justify-start gap-2.5 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                              <Wifi className="w-3.5 h-3.5 text-[#646A75] shrink-0" />
                              <span>网络连通性检测</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onSync(record)} className="flex items-center justify-start gap-2.5 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                              <QrCode className="w-3.5 h-3.5 text-[#646A75] shrink-0" />
                              <span>扫码分享</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onClone(record)} className="flex items-center justify-start gap-2.5 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                              <Copy className="w-3.5 h-3.5 text-[#646A75] shrink-0" />
                              <span>克隆副本</span>
                            </DropdownMenuItem>
                            {onTogglePin && (
                              <DropdownMenuItem onClick={() => onTogglePin(record)} className="flex items-center justify-start gap-2.5 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                                {record.isPinned ? (
                                  <PinOff className="w-3.5 h-3.5 text-[#646A75] shrink-0" />
                                ) : (
                                  <Pin className="w-3.5 h-3.5 text-[#646A75] shrink-0" />
                                )}
                                <span>{record.isPinned ? '取消置顶' : '置顶连接'}</span>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 3. 分页栏 */}
      {profiles.length > 0 && (
        <div className="border-t border-[#DEE0E3] bg-white p-2.5 flex justify-end">
          <FeishuPagination
            current={safePage}
            total={profiles.length}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 50]}
            onChange={(p, s) => {
              setCurrentPage(p);
              if (s !== pageSize) {
                setPageSize(s);
                setCurrentPage(1);
              }
            }}
          />
        </div>
      )}
    </div>
  );
};
