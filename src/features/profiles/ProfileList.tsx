import React, { useState, useMemo } from 'react';
import { Profile } from '../../types/frp';
import { Button } from '../../components/ui/button';
import { RunIcon, StopIcon, RefreshIcon } from '../../components/icons';
import { ProfileCard } from './ProfileCard';
import {
  FeishuDataTable,
  FeishuColumn,
  FeishuPill,
  FeishuEmptyState,
  FeishuPagination,
  FEISHU_FONT_FAMILY,
} from '../../components/ui/feishu-table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import { FeishuSelect, FeishuSelectOption } from '../../components/ui/feishu-select';
import {
  LayoutGrid,
  Table as TableIcon,
  Search as SearchIcon,
  Plus,
  AlertCircle,
  MoreHorizontal,
  Terminal,
  Edit3,
  QrCode,
  Copy,
  Trash2,
  Wifi,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ProfileListProps {
  profiles: Profile[];
  onToggle: (profile: Profile) => void;
  onEdit: (profile: Profile) => void;
  onClone: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
  onSync: (profile: Profile) => void;
  onViewLogs: (profile: Profile) => void;
  onDiagnose: (profile: Profile) => void;
  onRepairCore: () => void;
  onCreateNew: () => void;
  onStartAll: () => void;
  onStopAll: () => void;
}

export type TabKey = 'all' | 'running' | 'stopped' | 'error';
export type ViewMode = 'cards' | 'table';

const TYPE_FILTER_OPTIONS: FeishuSelectOption[] = [
  { value: 'all', label: '全部类型' },
  { value: 'frpc', label: '客户端 (FRPC)', pillVariant: 'blue' },
  { value: 'frps', label: '服务端 (FRPS)', pillVariant: 'purple' },
];

export const ProfileList: React.FC<ProfileListProps> = ({
  profiles,
  onToggle,
  onEdit,
  onClone,
  onDelete,
  onSync,
  onViewLogs,
  onDiagnose,
  onRepairCore,
  onCreateNew,
  onStartAll,
  onStopAll,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);

  // 统计数据
  const runningCount = useMemo(() => profiles.filter((p) => p.status === 'running').length, [profiles]);
  const stoppedCount = useMemo(() => profiles.filter((p) => p.status === 'stopped').length, [profiles]);
  const errorCount = useMemo(() => profiles.filter((p) => p.status === 'error').length, [profiles]);

  // 根据当前 Tab 与筛选条件正交联动过滤
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      // 1. Tab 状态过滤
      if (activeTab === 'running' && p.status !== 'running') return false;
      if (activeTab === 'stopped' && p.status !== 'stopped') return false;
      if (activeTab === 'error' && p.status !== 'error') return false;

      // 2. 顶部类型筛选
      if (typeFilter === 'frpc' && p.type !== 'frpc') return false;
      if (typeFilter === 'frps' && p.type !== 'frps') return false;

      // 3. 搜索关键字
      if (searchKeyword.trim()) {
        const kw = searchKeyword.toLowerCase();
        const nameMatch = p.name.toLowerCase().includes(kw);
        const descMatch = (p.description || '').toLowerCase().includes(kw);
        const hostMatch = ((p.config as any)?.serverAddr || (p.config as any)?.bindAddr || '').toLowerCase().includes(kw);
        if (!nameMatch && !descMatch && !hostMatch) return false;
      }

      return true;
    });
  }, [profiles, activeTab, typeFilter, searchKeyword]);

  // 卡片视图当前页切片
  const paginatedProfiles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProfiles.slice(start, start + pageSize);
  }, [filteredProfiles, currentPage, pageSize]);

  // 1:1 飞书多维表格 Columns 定义
  const columns = useMemo<FeishuColumn<Profile>[]>(() => [
    {
      key: 'name',
      title: '连接名称',
      dataIndex: 'name',
      dataType: 'text',
      width: 280,
      render: (_, record) => {
        const serverAddr = (record.config as any)?.serverAddr || (record.config as any)?.bindAddr || '127.0.0.1';
        const serverPort = (record.config as any)?.serverPort || (record.config as any)?.bindPort || 7000;
        return (
          <div className="min-w-0">
            <span
              onClick={() => onEdit(record)}
              className="font-medium text-[#1F2329] hover:text-[#165DFF] transition-colors cursor-pointer truncate block text-[14px]"
            >
              {record.name}
            </span>
            <span className="text-[12px] text-[#8F959E] truncate block mt-0.5">
              {record.description || `节点: ${serverAddr}:${serverPort}`}
            </span>
          </div>
        );
      },
    },
    {
      key: 'type',
      title: '类型',
      dataIndex: 'type',
      dataType: 'select',
      width: 120,
      render: (_, record) => (
        <FeishuPill variant={record.type === 'frps' ? 'purple' : 'blue'} showDot={false}>
          {record.type === 'frps' ? 'FRPS 服务端' : 'FRPC 客户端'}
        </FeishuPill>
      ),
    },
    {
      key: 'proxies',
      title: '穿透规则',
      width: 260,
      render: (_, record) => {
        const proxies = (record.config as any)?.proxies || [];
        if (proxies.length === 0) {
          return <span className="text-[13px] text-[#8F959E]">未配置规则</span>;
        }
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            {proxies.slice(0, 2).map((p: any, idx: number) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] bg-[#F2F3F5] text-[11px] text-[#646A75] tabular-nums font-mono"
              >
                <span className="font-semibold text-[#165DFF] uppercase">{p.type}</span>
                <span>:{p.localPort}➔:{p.remotePort || p.customDomains?.[0] || 'auto'}</span>
              </span>
            ))}
            {proxies.length > 2 && (
              <span className="text-[11px] text-[#8F959E]">+{proxies.length - 2}</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      title: '运行状态',
      dataIndex: 'status',
      dataType: 'select',
      width: 140,
      render: (_, record) => {
        if (record.status === 'running') {
          return (
            <FeishuPill variant="green" showDot={true} className="text-[12px] h-[22px] px-2.5 font-medium">
              运行中
            </FeishuPill>
          );
        }
        if (record.status === 'error') {
          return (
            <FeishuPill variant="red" showDot={true} className="text-[12px] h-[22px] px-2.5">
              异常中断
            </FeishuPill>
          );
        }
        if (record.status === 'starting') {
          return (
            <FeishuPill variant="orange" showDot={true} className="text-[12px] h-[22px] px-2.5">
              正在启动...
            </FeishuPill>
          );
        }
        return (
          <FeishuPill variant="gray" showDot={true} className="text-[12px] h-[22px] px-2.5">
            已停止
          </FeishuPill>
        );
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: 180,
      render: (_, record) => {
        const isRunning = record.status === 'running';
        const isStarting = record.status === 'starting';
        const isError = record.status === 'error';

        return (
          <div className="flex items-center justify-start gap-1.5" onClick={(e) => e.stopPropagation()}>
            {isError ? (
              (record as any).stats?.lastFailureKind === 'core_invalid' ? (
                <Button
                  size="sm"
                  onClick={() => onRepairCore()}
                  className="h-7 px-2.5 text-[12px] rounded-[6px] bg-[#F53F3F] text-white hover:bg-[#D82727] cursor-pointer"
                >
                  <AlertCircle className="w-3 h-3 mr-1 shrink-0" />
                  修复 FRPC 核心
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => onViewLogs(record)}
                  className="h-7 px-2.5 text-[12px] rounded-[6px] bg-[#F53F3F] text-white hover:bg-[#D82727] cursor-pointer"
                >
                  <Terminal className="w-3 h-3 mr-1 shrink-0" />
                  查看启动日志
                </Button>
              )
            ) : isRunning ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggle(record)}
                className="h-7 px-2.5 text-[12px] rounded-[6px] border-[#DEE0E3] text-[#F53F3F] hover:bg-[#FFECEC] hover:border-[#F53F3F] cursor-pointer"
              >
                <StopIcon className="w-3 h-3 mr-1 shrink-0" />
                停止连接
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => onToggle(record)}
                disabled={isStarting}
                className="h-7 px-2.5 text-[12px] rounded-[6px] bg-[#165DFF] text-white hover:bg-[#0E4FD9] cursor-pointer"
              >
                {isStarting ? (
                  <>
                    <RefreshIcon className="w-3 h-3 mr-1 shrink-0 animate-spin" />
                    启动中...
                  </>
                ) : (
                  <>
                    <RunIcon className="w-3 h-3 mr-1 shrink-0" />
                    启动连接
                  </>
                )}
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="更多操作"
                  className="h-7 px-1.5 text-[12px] rounded-[6px] border-[#DEE0E3] bg-white text-[#646A75] hover:bg-[#F2F3F5] cursor-pointer"
                >
                  <MoreHorizontal className="w-3.5 h-3.5 text-[#646A75]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[130px] p-1 shadow-lg border border-[#DEE0E3] bg-white rounded-[8px]">
                <DropdownMenuItem onClick={() => onEdit(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                  <Edit3 className="w-3 h-3 text-[#646A75]" />
                  <span>编辑配置</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewLogs(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                  <Terminal className="w-3 h-3 text-[#646A75]" />
                  <span>查看日志</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDiagnose(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                  <Wifi className="w-3 h-3 text-[#646A75]" />
                  <span>网络连通性检测</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSync(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                  <QrCode className="w-3.5 h-3.5 text-[#646A75]" />
                  <span>扫码分享</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onClone(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#1F2329] hover:bg-[#F2F3F5] rounded-[4px] cursor-pointer">
                  <Copy className="w-3 h-3 text-[#646A75]" />
                  <span>克隆副本</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 bg-[#EFF0F1]" />
                <DropdownMenuItem onClick={() => onDelete(record)} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-[#F53F3F] hover:bg-[#FFECEC] rounded-[4px] cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5 text-[#F53F3F]" />
                  <span>删除连接</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ], [onEdit, onToggle, onViewLogs, onSync, onClone, onDelete, onDiagnose, onRepairCore]);

  return (
    <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-4 max-w-7xl mx-auto select-none">
      {/* 顶部标题与新建按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
        <div>
          <h1 className="text-[18px] font-semibold text-[#1F2329] tracking-tight">我的连接</h1>
          <p className="text-[12px] text-[#8F959E] mt-0.5">统一管理与快速访问所有内网穿透连接</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            onClick={onCreateNew}
            className="h-8 rounded-[6px] px-3.5 text-[13px] bg-[#165DFF] text-white hover:bg-[#0E4FD9] font-medium shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            新建连接
          </Button>
        </div>
      </div>

      {/* 筛选与搜索工具栏 */}
      <div className="rounded-xl border border-[#DEE0E3] bg-white p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-3 flex-wrap flex-1">
          {/* 类型筛选 */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#646A75] font-medium shrink-0">连接类型</span>
            <FeishuSelect
              options={TYPE_FILTER_OPTIONS}
              value={typeFilter}
              onChange={(val) => {
                setTypeFilter(val || 'all');
                setCurrentPage(1);
              }}
              size="sm"
              className="w-36"
            />
          </div>

          {/* 搜索框 */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8F959E]" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => {
                setSearchKeyword(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="搜索连接名称、服务器地址或描述..."
              className="w-full h-8 pl-8 pr-3 text-[13px] rounded-[6px] border border-[#DEE0E3] bg-white text-[#1F2329] placeholder:text-[#8F959E] focus:outline-none focus:border-[#165DFF] transition-colors"
            />
          </div>
        </div>

        {/* 视图模式切换与批量操作 */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center rounded-[6px] bg-[#F2F3F5] p-0.5 text-[12px]">
            <button
              type="button"
              aria-label="切换到卡片视图"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] font-medium transition-all cursor-pointer ${
                viewMode === 'cards' ? 'bg-white text-[#165DFF] shadow-2xs font-semibold' : 'text-[#646A75] hover:text-[#1F2329]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>卡片视图</span>
            </button>
            <button
              type="button"
              aria-label="切换到表格视图"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] font-medium transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-[#165DFF] shadow-2xs font-semibold' : 'text-[#646A75] hover:text-[#1F2329]'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>表格视图</span>
            </button>
          </div>

          <div className="h-4 w-[1px] bg-[#DEE0E3]" />

          <Button variant="outline" size="sm" onClick={onStartAll} className="h-8 rounded-[6px] px-2.5 text-[12px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer">
            <RunIcon className="w-3.5 h-3.5 mr-1 shrink-0" />
            全部启动
          </Button>
          <Button variant="outline" size="sm" onClick={onStopAll} className="h-8 rounded-[6px] px-2.5 text-[12px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] cursor-pointer">
            <StopIcon className="w-3.5 h-3.5 mr-1 shrink-0" />
            全部停止
          </Button>
        </div>
      </div>

      {/* 状态 Tab 栏 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
        {[
          { key: 'all' as TabKey, label: '全部连接', count: profiles.length },
          { key: 'running' as TabKey, label: '运行中', count: runningCount },
          { key: 'stopped' as TabKey, label: '已停止', count: stoppedCount },
          { key: 'error' as TabKey, label: '异常待处理', count: errorCount, isAlert: errorCount > 0 },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setActiveTab(tab.key);
              setCurrentPage(1);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[13px] font-medium transition-all duration-150 cursor-pointer select-none",
              activeTab === tab.key
                ? "bg-[#165DFF] text-white shadow-2xs"
                : "bg-white border border-[#DEE0E3] text-[#646A75] hover:bg-[#F2F3F5] hover:text-[#1F2329]"
            )}
          >
            <span>{tab.label}</span>
            <span className={cn(
              "text-[11px] px-1.5 py-0.2 rounded-full tabular-nums",
              activeTab === tab.key ? "bg-white/20 text-white" : tab.isAlert ? "bg-[#FFECEC] text-[#F53F3F]" : "bg-[#F2F3F5] text-[#8F959E]"
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      {viewMode === 'cards' ? (
        <div>
          {paginatedProfiles.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#DEE0E3] shadow-2xs py-4">
              <FeishuEmptyState
                title="暂无匹配的连接"
                description="您可以调整筛选条件或点击下方按钮新建连接"
              />
              <div className="text-center pb-6">
                <Button
                  size="sm"
                  onClick={onCreateNew}
                  className="h-8 px-4 text-[13px] rounded-[6px] bg-[#165DFF] text-white hover:bg-[#0E4FD9] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  立即新建连接
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paginatedProfiles.map((profile) => (
                <ProfileCard
                  key={profile.id}
                  profile={profile}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onClone={onClone}
                  onDelete={onDelete}
                  onSync={onSync}
                  onViewLogs={onViewLogs}
                  onDiagnose={onDiagnose}
                  onRepairCore={onRepairCore}
                />
              ))}
            </div>
          )}

          {filteredProfiles.length > 0 && (
            <FeishuPagination
              current={currentPage}
              total={filteredProfiles.length}
              pageSize={pageSize}
              pageSizeOptions={[6, 12, 24, 48]}
              onChange={(p, s) => {
                setCurrentPage(p);
                if (s && s !== pageSize) {
                  setPageSize(s);
                  setCurrentPage(1);
                }
              }}
              className="px-2 pt-2"
            />
          )}
        </div>
      ) : (
        /* 纯净表格视图：不传 tabs、activeTabKey、onTabChange、searchPlaceholder，禁用内部搜索，统一由外层状态过滤 */
        <FeishuDataTable
          searchable={false}
          columns={columns}
          data={filteredProfiles}
          rowKey="id"
          selectable={false}
          pagination={{
            current: currentPage,
            total: filteredProfiles.length,
            pageSize: pageSize,
            onChange: (p, s) => {
              setCurrentPage(p);
              if (s && s !== pageSize) {
                setPageSize(s);
                setCurrentPage(1);
              }
            },
          }}
        />
      )}
    </div>
  );
};
