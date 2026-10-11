import type React from 'react';
import { MonitorSmartphone, Settings as SettingsIcon } from 'lucide-react';
import { DashboardIcon, PluginIcon, RemoteHostIcon, TerminalIcon } from '../icons';
import { Badge } from '../ui/badge';
import { FeishuTooltip } from '../ui/tooltip';
import { cn } from '../../lib/utils';

export type SidebarNav = 'profiles' | 'logs' | 'cores' | 'servers' | 'settings';

interface AppSidebarProps {
  currentNav: SidebarNav;
  profileCount: number;
  serverNodeCount: number;
  isDesktop: boolean;
  collapsed: boolean;
  width: number;
  maxWidth: number;
  isResizing: boolean;
  onNavigate: (nav: SidebarNav) => void;
  onToggleCollapse: () => void;
  onResizeStart: React.PointerEventHandler<HTMLDivElement>;
  onResizeKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  onResetWidth: () => void;
}

function SideExpandOutlinedIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-icon="SideExpandOutlined"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', collapsed && 'scale-x-[-1]')}
    >
      <path
        d="M22 4a1 1 0 0 0-1-1H3a1 1 0 0 0 0 2h18a1 1 0 0 0 1-1Zm-11.111 7c.614 0 1.111.448 1.111 1s-.498 1-1.111 1H3.11C2.497 13 2 12.552 2 12s.497-1 1.111-1h7.778ZM12 20c0-.552-.498-1-1.111-1H3.11C2.497 19 2 19.448 2 20s.497 1 1.111 1h7.778c.614 0 1.111-.448 1.111-1Zm3.41-3.136a1.117 1.117 0 0 1 0-1.729l4.951-3.917c.675-.534 1.639-.026 1.639.865v7.834c0 .89-.964 1.4-1.639.865l-4.951-3.918Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function AppSidebar({
  currentNav,
  profileCount,
  serverNodeCount,
  isDesktop,
  collapsed,
  width,
  maxWidth,
  isResizing,
  onNavigate,
  onToggleCollapse,
  onResizeStart,
  onResizeKeyDown,
  onResetWidth,
}: AppSidebarProps) {
  const toggleLabel = collapsed ? '展开侧边栏' : '收起侧边栏';
  const environmentLabel = isDesktop ? 'Tauri 桌面端' : '桌面开发模式';
  const statusLabel = `${environmentLabel} · 就绪`;
  const navigationItems: {
    nav: SidebarNav;
    label: string;
    icon: React.ReactNode;
    count?: number;
    showBadge?: boolean;
  }[] = [
    {
      nav: 'profiles',
      label: '我的连接',
      icon: <DashboardIcon className="h-4 w-4 shrink-0" aria-hidden="true" />,
      count: profileCount,
      showBadge: true,
    },
    {
      nav: 'logs',
      label: '实时日志',
      icon: <TerminalIcon className="h-4 w-4 shrink-0" aria-hidden="true" />,
    },
    {
      nav: 'cores',
      label: 'FRP 核心管理',
      icon: <PluginIcon className="h-4 w-4 shrink-0" aria-hidden="true" />,
    },
    {
      nav: 'servers',
      label: '服务器节点',
      icon: <RemoteHostIcon className="h-4 w-4 shrink-0" aria-hidden="true" />,
      count: serverNodeCount,
      showBadge: serverNodeCount > 0,
    },
    {
      nav: 'settings',
      label: '设置',
      icon: <SettingsIcon className="h-4 w-4 shrink-0" aria-hidden="true" />,
    },
  ];

  return (
    <aside
      aria-label="应用侧边栏"
      style={{ width }}
      className={cn(
        'relative min-h-0 shrink-0 select-none border-r border-[#DEE0E3] bg-[#F8F9FA] motion-reduce:transition-none',
        isResizing ? 'transition-none' : 'transition-[width] duration-[180ms] ease-out',
      )}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[#DEE0E3] px-3">
          {!collapsed && (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-[#165DFF] text-white shadow-xs">
                <DashboardIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[14px] font-semibold leading-tight tracking-tight text-[#1F2329]">FRP GUI Pro</h1>
                <p className="truncate text-[11px] text-[#8F959E]">飞书设计体系穿透管理</p>
              </div>
            </div>
          )}
          <FeishuTooltip title={toggleLabel} side="bottom">
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar-nav"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[#1F2329] transition-colors hover:bg-[rgba(31,35,41,0.08)] active:bg-[rgba(31,35,41,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#165DFF] motion-reduce:transition-none"
            >
              <SideExpandOutlinedIcon collapsed={collapsed} />
            </button>
          </FeishuTooltip>
        </div>

        <nav id="app-sidebar-nav" aria-label="主导航" className="min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto p-2">
          {navigationItems.map(({ nav, label, icon, count, showBadge }) => (
            <FeishuTooltip
              key={nav}
              title={collapsed ? `${label}${count === undefined ? '' : `（${count}）`}` : undefined}
              side="right"
            >
              <button
                type="button"
                onClick={() => onNavigate(nav)}
                aria-label={label}
                aria-current={currentNav === nav ? 'page' : undefined}
                className={cn(
                  'relative flex h-9 cursor-pointer items-center rounded-[6px] text-[14px] leading-[22px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#165DFF] motion-reduce:transition-none',
                  collapsed ? 'w-10 justify-center' : 'w-full justify-between gap-2 px-2.5',
                  currentNav === nav
                    ? 'bg-[#EBEDF0] font-medium text-[#1F2329]'
                    : 'text-[#1F2329] hover:bg-[rgba(31,35,41,0.05)]',
                )}
              >
                <span className={cn('flex min-w-0 items-center', !collapsed && 'gap-2.5')}>
                  {icon}
                  {!collapsed && <span className="truncate">{label}</span>}
                </span>
                {!collapsed && showBadge && (
                  <Badge variant="secondary" className="h-5 shrink-0 rounded-[4px] px-1.5 py-0 text-[11px] tabular-nums">
                    {count}
                  </Badge>
                )}
              </button>
            </FeishuTooltip>
          ))}
        </nav>

        <div className="shrink-0 border-t border-[#DEE0E3] bg-[#F8F9FA] p-3">
          {collapsed ? (
            <FeishuTooltip title={statusLabel} side="right">
              <div
                role="img"
                tabIndex={0}
                aria-label={statusLabel}
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#165DFF]"
              >
                <MonitorSmartphone className="h-4 w-4 text-[#165DFF]" aria-hidden="true" />
                <span aria-hidden="true" className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-[#00B42A] ring-2 ring-[#F8F9FA]" />
              </div>
            </FeishuTooltip>
          ) : (
            <div className="flex items-center justify-between gap-2 text-[12px] text-[#646A75]">
              <span className="flex min-w-0 items-center gap-1.5 font-medium">
                <MonitorSmartphone className="h-4 w-4 shrink-0 text-[#165DFF]" aria-hidden="true" />
                <span className="truncate">{environmentLabel}</span>
              </span>
              <Badge variant="success" className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[11px]">就绪</Badge>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧边栏宽度"
          aria-valuemin={200}
          aria-valuemax={maxWidth}
          aria-valuenow={width}
          tabIndex={0}
          title="拖动调整宽度，双击恢复默认宽度"
          onPointerDown={onResizeStart}
          onKeyDown={onResizeKeyDown}
          onDoubleClick={onResetWidth}
          className="group absolute -right-1 bottom-0 top-0 z-20 w-2 touch-none cursor-col-resize outline-none"
        >
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute bottom-0 left-1/2 top-0 w-0.5 -translate-x-1/2 bg-[#165DFF] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
              isResizing && 'opacity-100',
            )}
          />
        </div>
      )}
    </aside>
  );
}
