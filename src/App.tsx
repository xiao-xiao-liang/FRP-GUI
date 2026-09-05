import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import { DiagnosticResult, FrpCore, FrpServerNode, Profile, FrpcRuntimeStateEvent, FrpcFailureKind, FrpcRuntimeLogEvent, LogEntry } from './types/frp';
import { DEFAULT_FRPC_CONFIG, DEFAULT_FRPS_CONFIG, serializeFrpcToml, serializeFrpsToml } from './services/toml-sync';
import { startProfileInstance, stopProfileInstance, isTauriEnv, getRuntimeStates, getRuntimeLogs, subscribeRuntimeEvents } from './services/ipc';
import { DashboardOverview } from './features/dashboard/DashboardOverview';
import { ProfileList } from './features/profiles/ProfileList';
import { LogDashboard } from './features/logs/LogDashboard';
import { CoreManagerPage } from './features/cores/CoreManagerPage';
import { ServerNodeManagerPage } from './features/servers/ServerNodeManagerPage';
import { ConfigEditorModal } from './features/editor/ConfigEditorModal';
import { SyncModal } from './features/sync/SyncModal';
import { DiagnosticModal } from './features/diagnostics/DiagnosticModal';
import { Badge } from './components/ui/badge';
import { 
  RunIcon, StopIcon, DashboardIcon, ServicesIcon, TerminalIcon, 
  PluginIcon, RemoteHostIcon, MobileIcon 
} from './components/icons';
import { ChevronRight, MonitorSmartphone } from 'lucide-react';
import { feishuToast, FeishuToastContainer } from './components/ui/FeishuToast';
import { feishuConfirm, FeishuDialogPortalContainer } from './components/ui/FeishuDialog';
import { FEISHU_FONT_FAMILY } from './components/ui/feishu-table';
import { cn } from './lib/utils';

const INITIAL_PROFILES: Profile[] = [
  {
    id: 'prof_local_real',
    name: '公网服务器穿透 (118.195.146.161)',
    type: 'frpc',
    description: '穿透本地 8001 端口到公网 80 端口 (当前电脑已配置)',
    config: {
      serverAddr: '118.195.146.161',
      serverPort: 7000,
      authToken: '12345678',
      transport: { protocol: 'tcp', tls: { enable: false } },
      proxies: [
        {
          name: 'test-tcp',
          type: 'tcp',
          localIP: '127.0.0.1',
          localPort: 8001,
          remotePort: 80,
        },
      ],
      visitors: [],
    },
    rawToml: `serverAddr = "118.195.146.161"
serverPort = 7000
auth.token = "12345678"

[[proxies]]
name = "test-tcp"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8001
remotePort = 80`,
    status: 'stopped',
    stats: {
      bytesIn: 0,
      bytesOut: 0,
      curConns: 0,
      uptimeSeconds: 0,
    },
    createdAt: Date.now() - 3600000 * 24,
    updatedAt: Date.now() - 3600000 * 2,
  },
  {
    id: 'prof_company_ssh',
    name: '公司工作站 (SSH & Web)',
    type: 'frpc',
    description: '远程开发端口穿透 (SSH: 22, React: 3000)',
    config: {
      serverAddr: 'frp.example.com',
      serverPort: 7000,
      authToken: 'company_secret_2026',
      transport: { protocol: 'kcp', tls: { enable: true } },
      proxies: [
        {
          name: 'workstation-ssh',
          type: 'tcp',
          localIP: '127.0.0.1',
          localPort: 22,
          remotePort: 6022,
        },
        {
          name: 'react-dev',
          type: 'http',
          localIP: '127.0.0.1',
          localPort: 3000,
          customDomains: ['dev.workstation.internal'],
        },
      ],
      visitors: [],
    },
    rawToml: serializeFrpcToml({
      serverAddr: 'frp.example.com',
      serverPort: 7000,
      authToken: 'company_secret_2026',
      transport: { protocol: 'kcp', tls: { enable: true } },
      proxies: [
        {
          name: 'workstation-ssh',
          type: 'tcp',
          localIP: '127.0.0.1',
          localPort: 22,
          remotePort: 6022,
        },
        {
          name: 'react-dev',
          type: 'http',
          localIP: '127.0.0.1',
          localPort: 3000,
          customDomains: ['dev.workstation.internal'],
        },
      ],
      visitors: [],
    }),
    status: 'stopped',
    stats: {
      bytesIn: 0,
      bytesOut: 0,
      curConns: 0,
      uptimeSeconds: 0,
    },
    createdAt: Date.now() - 3600000 * 48,
    updatedAt: Date.now() - 3600000 * 5,
  },
  {
    id: 'prof_cloud_server',
    name: '云服务器 FRP 控制台 (frps)',
    type: 'frps',
    description: '公网服务器核心控制端监听 7000 端口',
    config: {
      bindPort: 7000,
      vhostHTTPPort: 80,
      vhostHTTPSPort: 443,
      authToken: '12345678',
      webServer: {
        port: 7500,
        user: 'admin',
        password: 'password123',
      },
    },
    rawToml: serializeFrpsToml({
      bindPort: 7000,
      vhostHTTPPort: 80,
      vhostHTTPSPort: 443,
      authToken: '12345678',
      webServer: {
        port: 7500,
        user: 'admin',
        password: 'password123',
      },
    }),
    status: 'stopped',
    stats: {
      bytesIn: 0,
      bytesOut: 0,
      curConns: 0,
      uptimeSeconds: 0,
    },
    createdAt: Date.now() - 3600000 * 72,
    updatedAt: Date.now() - 3600000 * 12,
  },
];

const INITIAL_CORES: FrpCore[] = [];

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 根据当前 URL 路径精准推导导航激活态
  const currentNav = useMemo<'dashboard' | 'profiles' | 'logs' | 'cores' | 'servers'>(() => {
    if (location.pathname.startsWith('/profiles')) return 'profiles';
    if (location.pathname.startsWith('/logs')) return 'logs';
    if (location.pathname.startsWith('/cores')) return 'cores';
    if (location.pathname.startsWith('/servers')) return 'servers';
    return 'dashboard';
  }, [location.pathname]);

  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const cached = localStorage.getItem('frp_gui_profiles');
    let initial = INITIAL_PROFILES;
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) initial = parsed;
      } catch (e) {
        console.error('Failed to parse cached profiles', e);
      }
    }
    // 安全归一化：将 localStorage 中残留的 transient 状态 (starting, running, stopping)
    // 安全归一为 stopped，并附带明确提示；同时清空非持久化的运行期 lastWarning
    return initial.map((p) => {
      const baseStats = {
        ...p.stats,
        lastWarning: undefined,
      };
      if (p.status === 'starting' || p.status === 'running' || p.status === 'stopping') {
        return {
          ...p,
          status: 'stopped' as const,
          stats: {
            ...baseStats,
            pid: undefined,
            lastError: '桌面端已重新启动，请重新启动连接',
          },
        };
      }
      return {
        ...p,
        stats: baseStats,
      };
    });
  });

  const [cores, setCores] = useState<FrpCore[]>(() => {
    const cached = localStorage.getItem('frp_gui_cores');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          // 过滤所有旧的内置/示例 Mock 核心数据
          return parsed.filter((c: any) =>
            c &&
            !c.name?.includes('内置') &&
            !c.name?.includes('官方核心') &&
            !c.path?.startsWith('bin/') &&
            c.id !== 'core_builtin_v0611' &&
            c.id !== 'core_v0600' &&
            c.id !== 'core_v0.58.1' &&
            c.id !== 'core_v0581'
          );
        }
      } catch (e) {
        console.error('Failed to parse cached cores', e);
      }
    }
    return INITIAL_CORES;
  });

  const [activeCoreId, setActiveCoreId] = useState<string>(() => {
    return localStorage.getItem('frp_gui_active_core_id') || '';
  });

  const [serverNodes, setServerNodes] = useState<FrpServerNode[]>(() => {
    const cached = localStorage.getItem('frp_gui_server_nodes');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      } catch (error) {
        console.error('Failed to parse cached server nodes', error);
      }
    }
    return [];
  });

  // 弹窗状态
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isSyncOpen, setIsSyncOpen] = useState<boolean>(false);
  const [syncTargetProfile, setSyncTargetProfile] = useState<Profile | null>(null);
  const [logTargetProfileId, setLogTargetProfileId] = useState<string | null>(null);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState<boolean>(false);
  const [diagnosticTargetProfile, setDiagnosticTargetProfile] = useState<Profile | null>(null);

  const handleOpenDiagnostics = (profile: Profile | null = null) => {
    setDiagnosticTargetProfile(profile);
    setIsDiagnosticOpen(true);
  };

  const handleDiagnosticComplete = (result: DiagnosticResult, profileId: string | null) => {
    if (!profileId) return;
    setProfiles((previous) =>
      previous.map((profile) =>
        profile.id === profileId
          ? {
              ...profile,
              status: result.status === 'failed' ? 'error' : profile.status,
              stats: {
                ...profile.stats,
                lastPingMs: result.latencyMs ?? undefined,
                lastCheckedAt: Date.now(),
                lastError: result.status === 'failed' ? result.error : undefined,
              },
              updatedAt: Date.now(),
            }
          : profile
      )
    );
  };

  useEffect(() => {
    localStorage.setItem('frp_gui_profiles', JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem('frp_gui_cores', JSON.stringify(cores));
  }, [cores]);

  useEffect(() => {
    localStorage.setItem('frp_gui_active_core_id', activeCoreId);
  }, [activeCoreId]);

  useEffect(() => {
    localStorage.setItem('frp_gui_server_nodes', JSON.stringify(serverNodes));
  }, [serverNodes]);

  // 维护每个 profile 收到的最新事件时间戳（防止旧快照或旧事件乱序覆盖）
  const latestEventTimestampsRef = useRef<Map<string, number>>(new Map());

  // 统一收敛的运行时状态更新函数（后端事件作为唯一权威来源）
  const applyRuntimeState = useCallback((event: FrpcRuntimeStateEvent): boolean => {
    const currentLatest = latestEventTimestampsRef.current.get(event.profileId) ?? 0;
    // 仅当 event.timestamp 不早于该 profile 已收到的最新时间戳时才允许写入状态
    if (event.timestamp < currentLatest) {
      return false;
    }
    latestEventTimestampsRef.current.set(event.profileId, event.timestamp);

    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== event.profileId) return profile;

        let nextPid: number | undefined = profile.stats.pid;
        let nextStartTime: number | undefined = profile.stats.startTime;
        let nextLastError: string | undefined = profile.stats.lastError;
        let nextLastFailureKind: FrpcFailureKind | undefined = profile.stats.lastFailureKind;
        let nextLastWarning: string | undefined = profile.stats.lastWarning;

        if (event.status === 'running') {
          nextPid = event.pid;
          nextStartTime = profile.stats.startTime || Date.now();
          nextLastError = undefined;
          nextLastFailureKind = undefined;
        } else if (event.status === 'stopped') {
          nextPid = undefined;
          nextStartTime = undefined;
          nextLastError = undefined;
          nextLastFailureKind = undefined;
          nextLastWarning = undefined;
        } else if (event.status === 'error') {
          nextPid = undefined;
          nextStartTime = undefined;
          nextLastError = event.errorMessage || '进程运行异常';
          nextLastWarning = undefined;
          if (profile.status === 'running') {
            nextLastFailureKind = undefined;
          }
        }

        return {
          ...profile,
          status: event.status,
          stats: {
            ...profile.stats,
            pid: nextPid,
            startTime: nextStartTime,
            lastError: nextLastError,
            lastFailureKind: nextLastFailureKind,
            lastWarning: nextLastWarning,
          },
        };
      })
    );
    return true;
  }, []);

  const [runtimeLogs, setRuntimeLogs] = useState<LogEntry[]>([]);

  const mergeRuntimeLogs = useCallback((events: FrpcRuntimeLogEvent[]) => {
    if (!events || events.length === 0) return;
    setRuntimeLogs((previous) => {
      // 检查是否有 profile 重启后序号被重置（例如收到 sequence === 1），如有则剔除该 profile 既有旧日志
      const resetProfileIds = new Set<string>();
      for (const event of events) {
        if (event.sequence === 1) {
          resetProfileIds.add(event.profileId);
        }
      }

      const filteredPrevious = resetProfileIds.size > 0
        ? previous.filter((entry) => !resetProfileIds.has(entry.profileId))
        : previous;

      const byId = new Map(filteredPrevious.map((entry) => [entry.id, entry]));
      for (const event of events) {
        const id = `runtime-${event.profileId}-${event.sequence}`;
        byId.set(id, {
          id,
          sequence: event.sequence,
          profileId: event.profileId,
          profileName: event.profileId,
          timestamp: event.timestamp,
          level: event.level,
          message: event.message,
          raw: `[${event.timestamp}] [${event.level.toUpperCase()}] ${event.message}`,
        });
      }
      return [...byId.values()]
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp)
          || left.profileId.localeCompare(right.profileId)
          || left.sequence - right.sequence)
        .slice(-2000);
    });

    for (const event of events) {
      if (event.level === 'warn') {
        setProfiles((previous) =>
          previous.map((profile) =>
            profile.id === event.profileId
              ? {
                  ...profile,
                  stats: { ...profile.stats, lastWarning: event.message },
                  updatedAt: Date.now(),
                }
              : profile
          )
        );
      }
    }
  }, []);

  const hydrateRuntimeLogs = useCallback(async (profileId?: string) => {
    if (!isTauriEnv()) return;
    try {
      const logs = await getRuntimeLogs(profileId);
      mergeRuntimeLogs(logs);
    } catch (e) {
      console.error('Failed to hydrate runtime logs:', e);
    }
  }, [mergeRuntimeLogs]);

  const reconcileStoppedState = useCallback(async (profileId: string) => {
    for (const delayMs of [0, 200, 500, 1000]) {
      if (delayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      const state = (await getRuntimeStates()).find((item) => item.profileId === profileId);
      if (!state) continue;
      applyRuntimeState(state);
      if (state.status === 'stopped' || state.status === 'error') return;
    }
    setProfiles((previous) => previous.map((item) => item.id === profileId && item.status === 'stopping'
      ? { ...item, status: 'error', stats: { ...item.stats, lastError: '停止 FRPC 实例超时，请查看运行日志' } }
      : item));
  }, [applyRuntimeState]);

  // 当路由切换进入 /logs 时拉取快照
  useEffect(() => {
    if (location.pathname.startsWith('/logs')) {
      hydrateRuntimeLogs();
    }
  }, [location.pathname, hydrateRuntimeLogs]);

  // 桌面端运行期真实状态事件监听与启动同步
  useEffect(() => {
    let isMounted = true;
    let isCleanedUp = false;
    let unlistenFn: (() => Promise<void>) | null = null;

    if (isTauriEnv()) {
      // 1. 先完成 subscribeRuntimeEvents 原生订阅，避免订阅建立期间丢失事件
      subscribeRuntimeEvents(
        (event) => {
          if (!isMounted || isCleanedUp) return;
          mergeRuntimeLogs([event]);
        },
        (event) => {
          if (!isMounted || isCleanedUp) return;
          applyRuntimeState(event);
        }
      ).then(async (unlisten) => {
        // 若在订阅完成前组件已卸载，必须立即解绑，防止监听器泄漏
        if (isCleanedUp || !isMounted) {
          if (typeof unlisten === 'function') {
            await unlisten();
          }
          return;
        }

        unlistenFn = unlisten;

        // 2. 原生订阅就绪后，再调用 getRuntimeStates 获取初始状态快照，并同步日志快照
        try {
          const states = await getRuntimeStates();
          if (isCleanedUp || !isMounted) return;
          if (states && states.length > 0) {
            for (const state of states) {
              applyRuntimeState(state);
            }
          }
          await hydrateRuntimeLogs();
        } catch (e) {
          console.error('Failed to get runtime states/logs:', e);
        }
      });
    }

    return () => {
      isMounted = false;
      isCleanedUp = true;
      if (unlistenFn && typeof unlistenFn === 'function') {
        unlistenFn();
      }
    };
  }, [applyRuntimeState, mergeRuntimeLogs, hydrateRuntimeLogs]);

  const activeCore = useMemo(
    () => cores.find((core) => core.id === activeCoreId) ?? null,
    [cores, activeCoreId]
  );

  // 启动 / 停止单个方案
  const handleToggleProfile = async (p: Profile) => {
    // 浏览器模式明确阻断：不改变状态、不显示成功 Toast、展示明确提示
    if (!isTauriEnv()) {
      feishuToast.warning('FRPC 运行功能仅可在桌面版应用中使用');
      return;
    }

    const willRun = p.status !== 'running' && p.status !== 'starting';

    if (willRun) {
      if (!activeCore?.path || activeCore.status === 'not_downloaded') {
        feishuToast.warning('请先在“FRP 核心管理”中配置可用核心后再启动连接');
        navigate('/cores');
        return;
      }

      // 启动前清除该方案既有的运行期日志，防止重启后新运行期日志条数较少时残留旧日志尾部
      setRuntimeLogs((prev) => prev.filter((entry) => entry.profileId !== p.id));

      // 请求被接受前设为 starting，清除之前的 lastFailureKind 与 lastError
      setProfiles((prev) =>
        prev.map((item) =>
          item.id === p.id
            ? {
                ...item,
                status: 'starting',
                stats: {
                  ...item.stats,
                  lastError: undefined,
                  lastFailureKind: undefined,
                  lastWarning: undefined,
                },
              }
            : item
        )
      );

      try {
        const res = await startProfileInstance(p, activeCore ?? undefined);
        if (res.accepted) {
          // 仅表示后端已接受启动请求并进入确认期；绝不在此将状态设为 running
          const states = await getRuntimeStates();
          const authoritativeState = states.find((state) => state.profileId === p.id);
          if (authoritativeState?.status === 'running') {
            applyRuntimeState(authoritativeState);
          }
          await hydrateRuntimeLogs(p.id);
        } else {
          const errorMessage = res.error || 'FRP 进程启动失败，请检查核心、服务器地址和认证信息';
          setProfiles((prev) =>
            prev.map((item) =>
              item.id === p.id
                ? {
                    ...item,
                    status: 'error',
                    stats: {
                      ...item.stats,
                      lastError: errorMessage,
                      lastFailureKind: res.failureKind,
                      pid: undefined,
                    },
                  }
                : item
            )
          );
          feishuToast.error(`启动失败: ${errorMessage}`);
        }
      } catch (e: any) {
        const errorMessage = e?.message || '操作异常';
        setProfiles((prev) =>
          prev.map((item) =>
            item.id === p.id
              ? {
                  ...item,
                  status: 'error',
                  stats: {
                    ...item.stats,
                    lastError: errorMessage,
                    lastFailureKind: undefined,
                    pid: undefined,
                  },
                }
              : item
          )
        );
        feishuToast.error(`操作异常: ${errorMessage}`);
      }
    } else {
      // 停止：先设为 stopping，清除 lastFailureKind
      setProfiles((prev) =>
        prev.map((item) =>
          item.id === p.id
            ? {
                ...item,
                status: 'stopping',
                stats: {
                  ...item.stats,
                  lastFailureKind: undefined,
                  lastWarning: undefined,
                },
              }
            : item
        )
      );

      try {
        const res = await stopProfileInstance(p.id, p.name);
        if (res.accepted) {
          // 仅表示后端已接受停止请求并正在退出；绝不在此设为 stopped
          await reconcileStoppedState(p.id);
          await hydrateRuntimeLogs(p.id);
        } else {
          const errorMessage = res.error || '停止 FRPC 实例失败';
          setProfiles((prev) =>
            prev.map((item) =>
              item.id === p.id
                ? { ...item, status: 'error', stats: { ...item.stats, lastError: errorMessage } }
                : item
            )
          );
          feishuToast.error(`停止失败: ${errorMessage}`);
        }
      } catch (e: any) {
        const errorMessage = e?.message || '操作异常';
        setProfiles((prev) =>
          prev.map((item) =>
            item.id === p.id
              ? { ...item, status: 'error', stats: { ...item.stats, lastError: errorMessage } }
              : item
          )
        );
        feishuToast.error(`操作异常: ${errorMessage}`);
      }
    }
  };

  // 一键全部启动（仅处理 stopped 与可安全重试的 error，排除 starting、running、stopping）
  const handleStartAll = async () => {
    const toStart = profiles.filter((p) => p.status === 'stopped' || p.status === 'error');
    if (toStart.length === 0) {
      if (profiles.every((p) => p.status === 'running')) {
        feishuToast.info('所有方案均已在运行中');
      } else {
        feishuToast.info('没有需要启动的连接');
      }
      return;
    }
    feishuToast.info(`正在批量启动 ${toStart.length} 个穿透方案...`);
    for (const p of toStart) {
      await handleToggleProfile(p);
    }
  };

  // 一键全部停止
  const handleStopAll = async () => {
    const toStop = profiles.filter((p) => p.status === 'running');
    if (toStop.length === 0) {
      feishuToast.info('当前没有正在运行的方案');
      return;
    }
    const confirmed = await feishuConfirm({
      title: '一键停止所有服务',
      content: `确定要立即停止正在运行的 ${toStop.length} 个穿透方案吗？已建立的网络连接将会中断。`,
      type: 'warning',
      okText: '全部停止',
    });
    if (confirmed) {
      for (const p of toStop) {
        await handleToggleProfile(p);
      }
    }
  };

  // 保存方案 (新建 / 编辑)
  const handleSaveProfile = (savedProfile: Profile) => {
    setProfiles((prev) => {
      const exists = prev.some((item) => item.id === savedProfile.id);
      if (exists) {
        return prev.map((item) => (item.id === savedProfile.id ? savedProfile : item));
      } else {
        return [savedProfile, ...prev];
      }
    });
    feishuToast.success(`方案 [${savedProfile.name}] 配置已保存并同步`);
  };

  // 克隆方案
  const handleCloneProfile = (p: Profile) => {
    const newProf: Profile = {
      ...p,
      id: `prof_${Date.now()}`,
      name: `${p.name} (副本)`,
      status: 'stopped',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setProfiles((prev) => [newProf, ...prev]);
    feishuToast.success(`已创建方案克隆副本: ${newProf.name}`);
  };

  // 删除方案
  const handleDeleteProfile = async (p: Profile) => {
    const confirmed = await feishuConfirm({
      title: '删除方案确认',
      content: `确定要彻底删除穿透方案 [${p.name}] 吗？此操作无法撤销。`,
      type: 'danger',
      okText: '确认删除',
    });
    if (confirmed) {
      if (p.status === 'running') {
        await stopProfileInstance(p.id, p.name);
      }
      setProfiles((prev) => prev.filter((item) => item.id !== p.id));
      feishuToast.success(`已删除方案: ${p.name}`);
    }
  };

  // 查看方案日志
  const handleViewLogs = (p: Profile) => {
    setLogTargetProfileId(p.id);
    navigate(`/logs?profileId=${p.id}`);
  };

  // 修复核心
  const handleRepairCore = () => {
    navigate('/cores');
    feishuToast.info('请重新选择并验证本地 frpc.exe，然后再启动连接');
  };

  // 扫码分享
  const handleOpenSync = (p?: Profile) => {
    setSyncTargetProfile(p || null);
    setIsSyncOpen(true);
  };

  return (
    <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="flex h-screen w-screen overflow-hidden bg-white text-[#1F2329]">
      {/* 飞书 Toast 全局容器 */}
      <FeishuToastContainer />
      {/* 飞书 Dialog 全局容器 */}
      <FeishuDialogPortalContainer />

      {/* 左侧飞书风格导航栏 (1:1 飞书 AppShell 侧边栏规范) */}
      <aside className="w-56 bg-[#F8F9FA] border-r border-[#DEE0E3] flex flex-col justify-between shrink-0 select-none">
        <div>
          {/* Logo 区域 */}
          <div className="h-12 flex items-center gap-2.5 px-4 border-b border-[#DEE0E3]">
            <div className="w-6 h-6 rounded-[6px] bg-[#165DFF] flex items-center justify-center text-white shadow-xs shrink-0">
              <ServicesIcon className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold text-[14px] text-[#1F2329] tracking-tight truncate leading-tight">FRP GUI Pro</h1>
              <p className="text-[11px] text-[#8F959E] truncate">飞书设计体系穿透管理</p>
            </div>
          </div>

          {/* 导航菜单 (点击即时触发 URL 路由跳转) */}
          <nav className="p-2 space-y-1">
            <button
              type="button"
              onClick={() => {
                setLogTargetProfileId(null);
                navigate('/profiles');
              }}
              className={cn(
                "relative flex h-9 w-full items-center justify-between rounded-[6px] px-2.5 text-[14px] leading-[22px] transition-colors duration-150 select-none cursor-pointer",
                currentNav === 'profiles'
                  ? "bg-[#EBEDF0] font-medium text-[#1F2329]"
                  : "text-[#1F2329] hover:bg-[rgba(31,35,41,0.05)]"
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <ServicesIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">我的连接</span>
              </div>
              <Badge variant="secondary" className="text-[11px] py-0 px-1.5 h-5 rounded-[4px] tabular-nums">
                {profiles.length}
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => {
                setLogTargetProfileId(null);
                navigate('/dashboard');
              }}
              className={cn(
                "relative flex h-9 w-full items-center justify-between rounded-[6px] px-2.5 text-[14px] leading-[22px] transition-colors duration-150 select-none cursor-pointer",
                currentNav === 'dashboard'
                  ? "bg-[#EBEDF0] font-medium text-[#1F2329]"
                  : "text-[#1F2329] hover:bg-[rgba(31,35,41,0.05)]"
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <DashboardIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">运行状态</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => navigate('/logs')}
              className={cn(
                "relative flex h-9 w-full items-center justify-between rounded-[6px] px-2.5 text-[14px] leading-[22px] transition-colors duration-150 select-none cursor-pointer",
                currentNav === 'logs'
                  ? "bg-[#EBEDF0] font-medium text-[#1F2329]"
                  : "text-[#1F2329] hover:bg-[rgba(31,35,41,0.05)]"
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <TerminalIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">实时日志</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-[#00B42A] animate-pulse shrink-0" title="实时流已就绪"></span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/cores')}
              className={cn(
                "relative flex h-9 w-full items-center justify-between rounded-[6px] px-2.5 text-[14px] leading-[22px] transition-colors duration-150 select-none cursor-pointer",
                currentNav === 'cores'
                  ? "bg-[#EBEDF0] font-medium text-[#1F2329]"
                  : "text-[#1F2329] hover:bg-[rgba(31,35,41,0.05)]"
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <PluginIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">FRP 核心管理</span>
              </div>
              <span className={`text-[11px] font-medium tabular-nums ${cores.find((c) => c.id === activeCoreId) ? 'text-[#165DFF]' : 'text-[#8F959E]'}`}>
                {cores.find((c) => c.id === activeCoreId)?.version || '待配置'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/servers')}
              className={cn(
                "relative flex h-9 w-full items-center justify-between rounded-[6px] px-2.5 text-[14px] leading-[22px] transition-colors duration-150 select-none cursor-pointer",
                currentNav === 'servers'
                  ? "bg-[#EBEDF0] font-medium text-[#1F2329]"
                  : "text-[#1F2329] hover:bg-[rgba(31,35,41,0.05)]"
              )}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <RemoteHostIcon className="w-4 h-4 shrink-0" />
                <span className="truncate">服务器节点</span>
              </div>
              {serverNodes.length > 0 && (
                <Badge variant="secondary" className="text-[11px] py-0 px-1.5 h-5 rounded-[4px] tabular-nums">
                  {serverNodes.length}
                </Badge>
              )}
            </button>
          </nav>
        </div>

        {/* 底部环境状态 */}
        <div className="p-3 border-t border-[#DEE0E3] bg-[#F8F9FA]">
          <div className="flex items-center justify-between text-[12px] text-[#646A75]">
            <span className="flex items-center gap-1.5 font-medium truncate">
              <MonitorSmartphone className="w-4 h-4 text-[#165DFF] shrink-0" />
              {isTauriEnv() ? 'Tauri 桌面端' : '桌面开发模式'}
            </span>
            <Badge variant="success" className="text-[11px] py-0.5 px-1.5 rounded-[4px]">就绪</Badge>
          </div>
        </div>
      </aside>

      {/* 右侧主体区域 (纯白背景 #FFFFFF) */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* 飞书 TopNav 标准顶栏 */}
        <header className="h-12 bg-white border-b border-[#DEE0E3] px-6 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-medium text-[#1F2329]">
              {currentNav === 'profiles' && '我的连接'}
              {currentNav === 'dashboard' && '运行状态'}
              {currentNav === 'logs' && '实时日志监控看板'}
              {currentNav === 'cores' && 'FRP 核心引擎管理'}
              {currentNav === 'servers' && '服务器节点'}
            </span>
            <span className="text-[#DEE0E3]">|</span>
            <span className="text-[13px] text-[#8F959E]">
              {currentNav === 'profiles' && '统一管理与快速访问所有内网穿透连接'}
              {currentNav === 'dashboard' && '实时监控在线穿透隧道、运行实例与连接访问入口'}
              {currentNav === 'logs' && '实时捕获过滤 FRP 运行日志与连接事件'}
              {currentNav === 'cores' && '管理与无缝切换本地 FRP 引擎与 GitHub 官方版本库'}
              {currentNav === 'servers' && '安全保存远程 FRPS 节点信息与 SSH 凭据引用'}
            </span>
          </div>
        </header>

        {/* 视图内容区 (路由与 URL 动态绑定) */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          <Routes>
            <Route path="/" element={<Navigate to="/profiles" replace />} />
            <Route
              path="/dashboard"
              element={
                <DashboardOverview
                  profiles={profiles}
                  activeCore={activeCore}
                  onStartAll={handleStartAll}
                  onStopAll={handleStopAll}
                  onCreateNew={() => {
                    setEditingProfile(null);
                    setIsEditorOpen(true);
                  }}
                  onOpenLogs={() => navigate('/logs')}
                  onOpenDiagnostics={handleOpenDiagnostics}
                  onOpenProfiles={() => navigate('/profiles')}
                  onOpenCores={() => navigate('/cores')}
                />
              }
            />
            <Route
              path="/profiles"
              element={
                <ProfileList
                  profiles={profiles}
                  onToggle={handleToggleProfile}
                  onEdit={(p) => {
                    setEditingProfile(p);
                    setIsEditorOpen(true);
                  }}
                  onClone={handleCloneProfile}
                  onDelete={handleDeleteProfile}
                  onSync={(p) => handleOpenSync(p)}
                  onViewLogs={handleViewLogs}
                  onDiagnose={(profile) => handleOpenDiagnostics(profile)}
                  onRepairCore={handleRepairCore}
                  onCreateNew={() => {
                    setEditingProfile(null);
                    setIsEditorOpen(true);
                  }}
                  onStartAll={handleStartAll}
                  onStopAll={handleStopAll}
                />
              }
            />
            <Route
              path="/logs"
              element={
                <div className="h-[calc(100vh-140px)]">
                  <LogDashboard
                    profiles={profiles}
                    logs={runtimeLogs}
                    onClearLogs={() => setRuntimeLogs([])}
                    activeProfileId={searchParams.get('profileId') || logTargetProfileId}
                  />
                </div>
              }
            />
            <Route
              path="/cores"
              element={
                <CoreManagerPage
                  cores={cores}
                  activeCoreId={activeCoreId}
                  onSelectCore={(id) => {
                    setActiveCoreId(id);
                  }}
                  onAddCustomCore={(newCore) => {
                    setCores((prev) => [newCore, ...prev.filter((c) => c.id !== newCore.id)]);
                  }}
                  onUpdateCore={(updatedCore) => {
                    setCores((prev) => prev.map((c) => (c.id === updatedCore.id ? updatedCore : c)));
                    feishuToast.success(`核心 [${updatedCore.name}] 已成功更新`);
                  }}
                  onDeleteCore={(coreId) => {
                    setCores((prev) => {
                      const remaining = prev.filter((c) => c.id !== coreId);
                      if (activeCoreId === coreId) {
                        const nextActive = remaining.length > 0 ? remaining[0].id : '';
                        setActiveCoreId(nextActive);
                      }
                      return remaining;
                    });
                    feishuToast.success('FRP 核心已从列表中移除');
                  }}
                />
              }
            />
            <Route
              path="/servers"
              element={
                <ServerNodeManagerPage
                  nodes={serverNodes}
                  onSaveNode={(node) => {
                    setServerNodes((items) => [node, ...items.filter((item) => item.id !== node.id)]);
                    feishuToast.success(`服务器节点 [${node.name}] 已保存`);
                  }}
                  onDeleteNode={(id) => setServerNodes((items) => items.filter((item) => item.id !== id))}
                  onSetDefault={(id) => setServerNodes((items) => items.map((item) => ({
                    ...item,
                    isDefault: item.id === id,
                    updatedAt: item.id === id ? Date.now() : item.updatedAt,
                  })))}
                />
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
      </main>

      {/* 弹窗中心 */}
      <ConfigEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSaveProfile}
        editingProfile={editingProfile}
        activeCore={activeCore}
      />

      <SyncModal
        isOpen={isSyncOpen}
        onClose={() => setIsSyncOpen(false)}
        profiles={profiles}
        selectedProfile={syncTargetProfile}
        onImportProfiles={(imported) => {
          setProfiles((prev) => [...imported, ...prev]);
        }}
      />

      <DiagnosticModal
        isOpen={isDiagnosticOpen}
        onClose={() => setIsDiagnosticOpen(false)}
        profiles={profiles}
        selectedProfile={diagnosticTargetProfile}
        onDiagnosticComplete={handleDiagnosticComplete}
      />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
