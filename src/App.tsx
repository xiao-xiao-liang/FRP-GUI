import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useSearchParams, Navigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { DiagnosticResult, FrpCore, FrpServerNode, Profile, ProfileGroup, FrpcRuntimeStateEvent, FrpcFailureKind, FrpcRuntimeLogEvent, LogEntry } from './types/frp';
import { DEFAULT_FRPC_CONFIG, DEFAULT_FRPS_CONFIG, serializeFrpcToml, serializeFrpsToml } from './services/toml-sync';
import { startProfileInstance, stopProfileInstance, isTauriEnv, getRuntimeStates, getRuntimeLogs, getRuntimeTraffic, subscribeRuntimeEvents, storeProfileSecret, loadProfileSecret, deleteProfileSecret, saveProfileTomlToCore, sanitizeRuntimeText } from './services/ipc';
import { applyRuntimeTrafficState, mergeRuntimeTraffic, type RuntimeTrafficState } from './services/runtime-traffic';
import { syncAppSettings, exitDesktopApp, hideMainWindow } from './services/ipc';
import { parseProfileSecret, profileCredentialReference, sanitizeProfileForStorage, serializeProfileSecret } from './services/profile-secrets';
import { AppSettings, loadAppSettings, saveAppSettings } from './services/app-settings';
import { getProfileIssue, selectProfileFailureMessage } from './services/profile-issues';
import {
  loadProfileGroups,
  saveProfileGroups,
  createProfileGroup,
  renameProfileGroup,
  deleteProfileGroup,
  normalizeProfileOrganization,
  getBatchActionTargets,
} from './services/profile-organization';
import { ProfileList } from './features/profiles/ProfileList';
import { LogDashboard } from './features/logs/LogDashboard';
import { mergeLogEntries } from './features/logs/logMerger';
import { CoreManagerPage } from './features/cores/CoreManagerPage';
import { ServerNodeManagerPage } from './features/servers/ServerNodeManagerPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { ConfigEditorModal } from './features/editor/ConfigEditorModal';
import { SyncModal } from './features/sync/SyncModal';
import { DiagnosticModal } from './features/diagnostics/DiagnosticModal';
import { AppSidebar } from './components/layout/AppSidebar';
import { useSidebarLayout } from './components/layout/useSidebarLayout';
import {
  RunIcon, StopIcon, ServicesIcon, MobileIcon
} from './components/icons';
import { ChevronRight } from 'lucide-react';
import { feishuToast, FeishuToastContainer } from './components/ui/FeishuToast';
import { feishuConfirm, FeishuDialogPortalContainer } from './components/ui/FeishuDialog';
import { FEISHU_FONT_FAMILY } from './components/ui/feishu-table';

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
  const sidebarLayout = useSidebarLayout();

  // 根据当前 URL 路径精准推导导航激活态
  const currentNav = useMemo<'profiles' | 'logs' | 'cores' | 'servers' | 'settings'>(() => {
    if (location.pathname.startsWith('/logs')) return 'logs';
    if (location.pathname.startsWith('/cores')) return 'cores';
    if (location.pathname.startsWith('/servers')) return 'servers';
    if (location.pathname.startsWith('/settings')) return 'settings';
    return 'profiles';
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
      const normalizedOrg = normalizeProfileOrganization(p);
      const baseStats = {
        ...normalizedOrg.stats,
        lastWarning: undefined,
      };
      if (normalizedOrg.status === 'starting' || normalizedOrg.status === 'running' || normalizedOrg.status === 'stopping') {
        return {
          ...normalizedOrg,
          status: 'stopped' as const,
          stats: {
            ...baseStats,
            pid: undefined,
            lastError: '桌面端已重新启动，请重新启动连接',
          },
        };
      }
      return {
        ...normalizedOrg,
        stats: baseStats,
      };
    });
  });
  const [groups, setGroups] = useState<ProfileGroup[]>(() => loadProfileGroups());
  const profileSecretWritesRef = useRef<Map<string, string>>(new Map());
  const restoredProfileSecretsRef = useRef<Set<string>>(new Set());
  const inFlightRestorationsRef = useRef<Set<string>>(new Set());

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

  const [appSettings, setAppSettings] = useState<AppSettings>(loadAppSettings);

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
    localStorage.setItem('frp_gui_profiles', JSON.stringify(profiles.map(sanitizeProfileForStorage)));
  }, [profiles]);

  useEffect(() => {
    saveProfileGroups(groups);
  }, [groups]);

  // 完整 TOML 与认证信息仅保存在桌面端系统凭据库；启动时自动迁移旧 localStorage 数据并恢复已保存方案。
  useEffect(() => {
    if (!isTauriEnv()) return;
    let cancelled = false;

    void Promise.all(profiles.map(async (profile) => {
      const reference = profileCredentialReference(profile.id);
      if (profile.rawToml.trim()) {
        const serialized = serializeProfileSecret(profile);
        if (profileSecretWritesRef.current.get(profile.id) !== serialized) {
          try {
            await storeProfileSecret(reference, serialized);
            profileSecretWritesRef.current.set(profile.id, serialized);
          } catch (err) {
            console.error(`Failed to store secret for profile ${profile.id}:`, err);
          }
        }
        return null;
      }
      if (
        restoredProfileSecretsRef.current.has(profile.id) ||
        inFlightRestorationsRef.current.has(profile.id)
      ) {
        return null;
      }
      inFlightRestorationsRef.current.add(profile.id);
      try {
        const stored = await loadProfileSecret(reference);
        const secret = stored ? parseProfileSecret(stored) : null;
        return secret ? { id: profile.id, secret } : null;
      } catch (err) {
        console.warn(`Failed to load secret for profile ${profile.id}:`, err);
        return null;
      } finally {
        inFlightRestorationsRef.current.delete(profile.id);
      }
    })).then((restored) => {
      if (cancelled) return;

      // 仅在未取消且该轮批次执行完成时记录已检查 ID，天然兼容 React StrictMode 双挂载与重试
      profiles.forEach((p) => {
        if (!p.rawToml.trim()) {
          restoredProfileSecretsRef.current.add(p.id);
        }
      });

      const available = new Map(
        restored.filter((entry): entry is { id: string; secret: NonNullable<typeof entry>['secret'] } => entry !== null)
          .map((entry) => [entry.id, entry.secret]),
      );
      if (available.size === 0) return;

      // 预填写入记录，防止恢复触发的下一次 effect 产生重复多余写
      for (const [id, sec] of available) {
        profileSecretWritesRef.current.set(id, JSON.stringify(sec));
      }

      setProfiles((current) => current.map((profile) => {
        const secret = available.get(profile.id);
        if (!secret || profile.rawToml.trim()) return profile;
        return {
          ...profile,
          rawToml: secret.rawToml,
          config: {
            ...profile.config,
            ...secret.config,
            authToken: profile.config.authToken ?? secret.config.authToken,
            webServer: {
              ...profile.config.webServer,
              ...secret.config.webServer,
            },
          },
        };
      }));

      // 若用户在凭据恢复期间立即打开了编辑弹窗，同步补全 editingProfile 避免空值覆盖
      setEditingProfile((curr) => {
        if (!curr) return null;
        const secret = available.get(curr.id);
        if (!secret || curr.rawToml.trim()) return curr;
        return {
          ...curr,
          rawToml: secret.rawToml,
          config: {
            ...curr.config,
            ...secret.config,
            authToken: curr.config.authToken ?? secret.config.authToken,
            webServer: {
              ...curr.config.webServer,
              ...secret.config.webServer,
            },
          },
        };
      });
    }).catch((error) => {
      console.error('Failed to synchronize profile secrets with the system credential store', error);
    });

    return () => { cancelled = true; };
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

  const handleAppSettingsChange = useCallback((nextSettings: AppSettings) => {
    setAppSettings(nextSettings);
  }, []);

  useEffect(() => {
    saveAppSettings(appSettings);
    void syncAppSettings(appSettings).catch((error) => {
      console.error('Failed to synchronize desktop app settings:', error);
    });
  }, [appSettings]);

  useEffect(() => {
    if (!isTauriEnv() || appSettings.launchBehavior !== 'start_minimized') return;
    void hideMainWindow().catch((error) => {
      console.error('Failed to hide the main window on launch:', error);
    });
  }, [appSettings.launchBehavior]);

  useEffect(() => {
    if (!isTauriEnv()) return;
    let unlisten: (() => void) | undefined;
    void listen('app-close-requested', async () => {
      const hasRunningProfile = profiles.some((profile) => profile.status === 'running' || profile.status === 'starting');
      if (hasRunningProfile && appSettings.confirmExitWhenRunning) {
        const confirmed = await feishuConfirm({
          title: '退出 FRP-GUI',
          content: '退出会停止当前运行中的 FRPC 连接。确定要退出应用吗？',
          type: 'warning',
          okText: '停止连接并退出',
        });
        if (!confirmed) return;
      }
      await exitDesktopApp();
    }).then((release) => { unlisten = release; });
    return () => unlisten?.();
  }, [appSettings.confirmExitWhenRunning, profiles]);

  // 维护每个 profile 收到的最新事件时间戳（防止旧快照或旧事件乱序覆盖）
  const latestEventTimestampsRef = useRef<Map<string, number>>(new Map());
  const latestRuntimeStatesRef = useRef<Map<string, FrpcRuntimeStateEvent>>(new Map());
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const [runtimeLogs, setRuntimeLogs] = useState<LogEntry[]>([]);
  const [runtimeTraffic, setRuntimeTraffic] = useState<RuntimeTrafficState>({});
  const runtimeLogsRef = useRef<LogEntry[]>([]);
  const pendingStartsRef = useRef<Set<string>>(new Set());
  const startAttemptTimesRef = useRef<Map<string, number>>(new Map());
  const latestIssueSequencesRef = useRef<Map<string, number>>(new Map());
  const reportedIssuesRef = useRef<Map<string, string>>(new Map());
  const failureFallbacksRef = useRef<Map<string, string>>(new Map());

  const resolveFailureMessage = useCallback((profileId: string, fallback: string) => {
    const startedAt = startAttemptTimesRef.current.get(profileId) ?? 0;
    const logs = runtimeLogsRef.current.filter((entry) =>
      entry.profileId === profileId && Date.parse(entry.timestamp) >= startedAt
    );
    return selectProfileFailureMessage(sanitizeRuntimeText(fallback), logs);
  }, []);

  // 同一次启动的事件与命令响应共享通知记录，避免重复提示；快照恢复不通知。
  const notifyProfileIssue = useCallback((profileId: string, message: string, failureKind?: FrpcFailureKind) => {
    const profile = profilesRef.current.find((item) => item.id === profileId);
    if (!profile) return;
    const issue = getProfileIssue({
      ...profile,
      status: 'error',
      stats: { ...profile.stats, lastError: message, lastFailureKind: failureKind },
    });
    if (!issue || reportedIssuesRef.current.get(profileId) === issue.summary) return;
    reportedIssuesRef.current.set(profileId, issue.summary);
    feishuToast.warning(`连接“${profile.name}”：${issue.summary}，详情见“需要处理”`);
  }, []);

  // 统一收敛的运行时状态更新函数（后端事件作为唯一权威来源）
  const applyRuntimeState = useCallback((event: FrpcRuntimeStateEvent, notify = true): boolean => {
    const currentLatest = latestEventTimestampsRef.current.get(event.profileId) ?? 0;
    // 仅当 event.timestamp 不早于该 profile 已收到的最新时间戳时才允许写入状态
    if (event.timestamp < currentLatest) {
      return false;
    }
    latestEventTimestampsRef.current.set(event.profileId, event.timestamp);
    latestRuntimeStatesRef.current.set(event.profileId, event);
    setRuntimeTraffic((previous) => applyRuntimeTrafficState(previous, event));
    if (event.status === 'error') {
      failureFallbacksRef.current.set(event.profileId, sanitizeRuntimeText(event.errorMessage || '进程运行异常'));
    }
    const errorMessage = event.status === 'error'
      ? resolveFailureMessage(event.profileId, event.errorMessage || '进程运行异常')
      : undefined;
    const previousProfile = profilesRef.current.find((profile) => profile.id === event.profileId);
    if (notify && errorMessage && !pendingStartsRef.current.has(event.profileId)
      && (previousProfile?.status === 'running' || previousProfile?.status === 'starting')) {
      notifyProfileIssue(event.profileId, errorMessage, previousProfile.stats.lastFailureKind);
    }
    if (event.status === 'stopped') {
      reportedIssuesRef.current.delete(event.profileId);
      failureFallbacksRef.current.delete(event.profileId);
    }

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
          // 若此前已记录本次启动时间则保留；若没有（例如外部已在运行的状态同步），以事件时间戳或当前时间兜底
          nextStartTime = profile.stats.startTime || (typeof event.timestamp === 'number' && event.timestamp > 0 ? event.timestamp : Date.now());
          nextLastError = undefined;
          nextLastFailureKind = undefined;
        } else if (event.status === 'stopped') {
          nextPid = undefined;
          // 停止时完整保留上次启动时间（历史最后一次启动的时间戳），绝不清空为 undefined
          nextStartTime = profile.stats.startTime;
          nextLastError = undefined;
          nextLastFailureKind = undefined;
          nextLastWarning = undefined;
        } else if (event.status === 'error') {
          nextPid = event.pid;
          // 异常时完整保留上次启动时间，绝不清空为 undefined
          nextStartTime = profile.stats.startTime;
          nextLastError = errorMessage;
          nextLastWarning = undefined;
          if (profile.status === 'running' || profile.status === 'starting') {
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
  }, [resolveFailureMessage, notifyProfileIssue]);

  const mergeRuntimeLogs = useCallback((events: FrpcRuntimeLogEvent[]) => {
    if (!events || events.length === 0) return;
    const safeEvents = events.map((event) => ({ ...event, message: sanitizeRuntimeText(event.message) }));
    runtimeLogsRef.current = mergeLogEntries(runtimeLogsRef.current, safeEvents);
    setRuntimeLogs(runtimeLogsRef.current);

    for (const event of safeEvents) {
      if (event.level === 'warn' || event.level === 'error') {
        const startedAt = startAttemptTimesRef.current.get(event.profileId) ?? 0;
        const status = latestRuntimeStatesRef.current.get(event.profileId)?.status
          ?? (pendingStartsRef.current.has(event.profileId) ? 'starting' : profilesRef.current.find((profile) => profile.id === event.profileId)?.status);
        if (status !== 'starting' && status !== 'running' && status !== 'error') continue;
        if (!event.message.trim() || Date.parse(event.timestamp) < startedAt
          || event.sequence <= (latestIssueSequencesRef.current.get(event.profileId) ?? 0)) continue;
        latestIssueSequencesRef.current.set(event.profileId, event.sequence);
        setProfiles((previous) =>
          previous.map((profile) => {
            if (profile.id !== event.profileId) return profile;
            if (profile.status === 'error') {
              const lastError = resolveFailureMessage(profile.id,
                failureFallbacksRef.current.get(profile.id) || profile.stats.lastError || '进程运行异常');
              return lastError === profile.stats.lastError ? profile : { ...profile, stats: { ...profile.stats, lastError } };
            }
            if (profile.status !== 'running' && profile.status !== 'starting') return profile;
            return { ...profile, stats: { ...profile.stats, lastWarning: event.message } };
          })
        );
      }
    }
  }, [resolveFailureMessage]);

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
        },
        (event) => {
          if (!isMounted || isCleanedUp || !profilesRef.current.some((profile) => profile.id === event.profileId)) return;
          setRuntimeTraffic((previous) => mergeRuntimeTraffic(previous, [event]));
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
              applyRuntimeState(state, false);
            }
          }
          const traffic = await getRuntimeTraffic();
          if (isCleanedUp || !isMounted) return;
          setRuntimeTraffic((previous) => mergeRuntimeTraffic(previous,
            traffic.filter((sample) => profilesRef.current.some((profile) => profile.id === sample.profileId))));
          await hydrateRuntimeLogs();
        } catch (e) {
          console.error('Failed to get runtime states/logs:', e);
        }
      }).catch((error) => {
        console.error('订阅桌面运行期事件失败：', error);
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

    const willRun = p.status !== 'running' && p.status !== 'starting'
      && !(p.status === 'error' && p.stats.pid);

    if (willRun) {
      const profileCore = cores.find((core) => core.id === p.coreId && core.path && core.status !== 'not_downloaded');
      if (!profileCore) {
        feishuToast.warning('请先在“我的连接”中为该连接选择已下载的 FRP 版本');
        navigate('/profiles');
        return;
      }

      const linkedServerNode = p.serverNodeId
        ? serverNodes.find((node) => node.id === p.serverNodeId)
        : undefined;
      if (p.serverNodeId && (
        !linkedServerNode
        || linkedServerNode.status !== 'running'
        || linkedServerNode.serviceStatus !== 'running'
        || !linkedServerNode.deployment
        || !linkedServerNode.credentialRef
      )) {
        feishuToast.warning('关联的 FRPS 节点未部署、未运行或缺少安全凭据，请先在“服务器节点”中修复');
        return;
      }

      // 启动前检查并在必要时补全 profile 的 rawToml 配置
      let effectiveProfile = p;
      if (!effectiveProfile.rawToml?.trim()) {
        try {
          const reference = profileCredentialReference(p.id);
          const stored = await loadProfileSecret(reference);
          const secret = stored ? parseProfileSecret(stored) : null;
          if (secret?.rawToml?.trim()) {
            effectiveProfile = {
              ...effectiveProfile,
              rawToml: secret.rawToml,
              config: {
                ...effectiveProfile.config,
                ...secret.config,
                authToken: effectiveProfile.config.authToken ?? secret.config.authToken,
              },
            };
          } else if (effectiveProfile.config) {
            const serialized = (
              effectiveProfile.type === 'frps'
                ? serializeFrpsToml(effectiveProfile.config as any)
                : serializeFrpcToml(effectiveProfile.config as any)
            ).trim();
            if (serialized) {
              effectiveProfile = { ...effectiveProfile, rawToml: serialized };
            }
          }
        } catch (err) {
          console.warn(`[handleToggleProfile] 恢复方案 ${p.id} 配置失败:`, err);
        }

        if (effectiveProfile.rawToml?.trim()) {
          setProfiles((prev) => prev.map((item) => (item.id === p.id ? effectiveProfile : item)));
        }
      }

      // 启动前清除该方案既有的运行期日志，防止重启后新运行期日志条数较少时残留旧日志尾部
      runtimeLogsRef.current = runtimeLogsRef.current.filter((entry) => entry.profileId !== p.id);
      setRuntimeLogs(runtimeLogsRef.current);

      const startTimestamp = Date.now();
      setRuntimeTraffic((previous) => applyRuntimeTrafficState(previous, { profileId: p.id, status: 'starting', timestamp: startTimestamp }));
      pendingStartsRef.current.add(p.id);
      startAttemptTimesRef.current.set(p.id, startTimestamp);
      latestEventTimestampsRef.current.set(p.id, startTimestamp);
      latestRuntimeStatesRef.current.delete(p.id);
      latestIssueSequencesRef.current.delete(p.id);
      reportedIssuesRef.current.delete(p.id);
      failureFallbacksRef.current.delete(p.id);

      // 请求被接受前设为 starting，清除之前的 lastFailureKind 与 lastError，并预置本次启动时间
      setProfiles((prev) =>
        prev.map((item) =>
          item.id === p.id
            ? {
                ...item,
                status: 'starting',
                stats: {
                  ...item.stats,
                  startTime: startTimestamp,
                  lastError: undefined,
                  lastFailureKind: undefined,
                  lastWarning: undefined,
                },
              }
            : item
        )
      );

      try {
        const res = await startProfileInstance(effectiveProfile, profileCore, linkedServerNode?.credentialRef);
        if (res.accepted) {
          // 仅表示后端已接受启动请求并进入确认期；绝不在此将状态设为 running
          const states = await getRuntimeStates();
          const authoritativeState = states.find((state) => state.profileId === p.id);
          if (authoritativeState) {
            applyRuntimeState(authoritativeState, false);
          }
          await hydrateRuntimeLogs(p.id);
          const latestState = latestRuntimeStatesRef.current.get(p.id);
          const warning = runtimeLogsRef.current.filter((entry) => entry.profileId === p.id
            && Date.parse(entry.timestamp) >= startTimestamp
            && (entry.level === 'warn' || entry.level === 'error')).at(-1);
          if (latestState?.status === 'error') {
            notifyProfileIssue(p.id, resolveFailureMessage(p.id, latestState.errorMessage || '进程运行异常'));
          } else if (warning) {
            notifyProfileIssue(p.id, warning.message);
          }
        } else {
          setRuntimeTraffic((previous) => applyRuntimeTrafficState(previous, { profileId: p.id, status: 'error', timestamp: Date.now() }));
          await hydrateRuntimeLogs(p.id);
          const fallback = sanitizeRuntimeText(res.error || 'FRP 进程启动失败，请检查核心、服务器地址和认证信息');
          failureFallbacksRef.current.set(p.id, fallback);
          const errorMessage = resolveFailureMessage(p.id, fallback);
          setProfiles((prev) =>
            prev.map((item) =>
              item.id === p.id
                ? {
                    ...item,
                    status: 'error',
                    stats: {
                      ...item.stats,
                      startTime: p.stats.startTime,
                      lastError: errorMessage,
                      lastFailureKind: res.failureKind,
                      pid: undefined,
                    },
                  }
                : item
            )
          );
          notifyProfileIssue(p.id, errorMessage, res.failureKind);
        }
      } catch (e: any) {
        setRuntimeTraffic((previous) => applyRuntimeTrafficState(previous, { profileId: p.id, status: 'error', timestamp: Date.now() }));
        await hydrateRuntimeLogs(p.id);
        const fallback = sanitizeRuntimeText(e?.message || '操作异常');
        failureFallbacksRef.current.set(p.id, fallback);
        const errorMessage = resolveFailureMessage(p.id, fallback);
        setProfiles((prev) =>
          prev.map((item) =>
            item.id === p.id
              ? {
                  ...item,
                  status: 'error',
                  stats: {
                    ...item.stats,
                    startTime: p.stats.startTime,
                    lastError: errorMessage,
                    lastFailureKind: undefined,
                    pid: undefined,
                  },
                }
              : item
          )
        );
        notifyProfileIssue(p.id, errorMessage);
      } finally {
        pendingStartsRef.current.delete(p.id);
      }
    } else {
      // 停止：先设为 stopping，清除 lastFailureKind
      setRuntimeTraffic((previous) => applyRuntimeTrafficState(previous, { profileId: p.id, status: 'stopping', timestamp: Date.now() }));
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


  // 保存方案 (新建 / 编辑)
  const handleSaveProfile = async (savedProfile: Profile) => {
    setProfiles((prev) => {
      const exists = prev.some((item) => item.id === savedProfile.id);
      if (exists) {
        return prev.map((item) => (item.id === savedProfile.id ? savedProfile : item));
      } else {
        return [savedProfile, ...prev];
      }
    });

    // 立即同步写入系统安全凭据库，避免仅依赖 useEffect 的异步时序竞争
    if (isTauriEnv() && savedProfile.rawToml?.trim()) {
      try {
        const reference = profileCredentialReference(savedProfile.id);
        const serialized = serializeProfileSecret(savedProfile);
        await storeProfileSecret(reference, serialized);
        profileSecretWritesRef.current.set(savedProfile.id, serialized);
      } catch (err) {
        console.error(`Failed to store secret on save for profile ${savedProfile.id}:`, err);
      }
    }

    // 若该连接配置了已下载的核心，则同步写入核心安装目录下的 TOML 文件
    const profileCore = cores.find((c) => c.id === savedProfile.coreId && c.path);
    if (profileCore?.path && savedProfile.rawToml?.trim()) {
      await saveProfileTomlToCore(profileCore.path, savedProfile.name, savedProfile.rawToml);
    }

    feishuToast.success('保存成功');
  };

  const handleCreateGroup = (name: string) => {
    const { group, groups: newGroups } = createProfileGroup(name, groups);
    setGroups(newGroups);
    feishuToast.success(`已创建分组“${group.name}”`);
  };

  const handleRenameGroup = (groupId: string, newName: string) => {
    const newGroups = renameProfileGroup(groupId, newName, groups);
    setGroups(newGroups);
    feishuToast.success('已重命名分组');
  };

  const handleDeleteGroup = (groupId: string) => {
    const { groups: newGroups, updatedProfiles } = deleteProfileGroup(groupId, groups, profiles);
    setGroups(newGroups);
    setProfiles(updatedProfiles);
    feishuToast.success('已删除分组');
  };

  // 克隆方案
  const handleCloneProfile = (p: Profile) => {
    const newProf: Profile = {
      ...p,
      id: `prof_${Date.now()}`,
      name: `${p.name} (副本)`,
      status: 'stopped',
      stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
      groupId: p.groupId,
      tags: p.tags ? [...p.tags] : [],
      isPinned: false,
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
      await deleteProfileSecret(profileCredentialReference(p.id));
      setProfiles((prev) => prev.filter((item) => item.id !== p.id));
      feishuToast.success(`已删除方案: ${p.name}`);
    }
  };

  const [isBatchOperating, setIsBatchOperating] = useState<boolean>(false);
  const isBatchOperatingRef = useRef<boolean>(false);

  // 切换单个方案置顶状态
  const handleTogglePin = (p: Profile) => {
    setProfiles((prev) =>
      prev.map((item) =>
        item.id === p.id
          ? {
              ...item,
              isPinned: !item.isPinned,
              updatedAt: Date.now(),
            }
          : item
      )
    );
  };

  // 批量启动方案
  const handleBatchStart = async (targets: Profile[]) => {
    if (isBatchOperatingRef.current) {
      feishuToast.warning('当前已有正在执行的批量操作，请稍候');
      return;
    }
    if (!isTauriEnv()) {
      feishuToast.warning('FRPC 运行功能仅可在桌面版应用中使用');
      return;
    }
    const targetResult = getBatchActionTargets(targets, 'start');
    if (!targetResult.canExecute) {
      feishuToast.warning(targetResult.reason || '仅当所有选中连接均未运行且进程已退出时可批量启动');
      return;
    }

    isBatchOperatingRef.current = true;
    setIsBatchOperating(true);
    try {
      feishuToast.info(`正在批量启动 ${targetResult.executable.length} 个穿透方案...`);
      for (const p of targetResult.executable) {
        await handleToggleProfile(p);
      }
      feishuToast.success(`批量启动完成（共启动 ${targetResult.executable.length} 个连接）`);
    } finally {
      isBatchOperatingRef.current = false;
      setIsBatchOperating(false);
    }
  };

  // 批量停止方案
  const handleBatchStop = async (targets: Profile[]) => {
    if (isBatchOperatingRef.current) {
      feishuToast.warning('当前已有正在执行的批量操作，请稍候');
      return;
    }
    if (!isTauriEnv()) {
      feishuToast.warning('FRPC 运行功能仅可在桌面版应用中使用');
      return;
    }
    const targetResult = getBatchActionTargets(targets, 'stop');
    if (!targetResult.canExecute) {
      feishuToast.warning(targetResult.reason || '仅当所有选中连接均在运行时可批量停止');
      return;
    }

    isBatchOperatingRef.current = true;
    setIsBatchOperating(true);
    try {
      feishuToast.info(`正在批量停止 ${targetResult.executable.length} 个穿透方案...`);
      for (const p of targetResult.executable) {
        await handleToggleProfile(p);
      }
      feishuToast.success(`批量停止完成（共停止 ${targetResult.executable.length} 个连接）`);
    } finally {
      isBatchOperatingRef.current = false;
      setIsBatchOperating(false);
    }
  };

  // 批量删除方案（需清理凭据）
  const handleBatchDelete = async (targets: Profile[]) => {
    if (isBatchOperatingRef.current) {
      feishuToast.warning('当前已有正在执行的批量操作，请稍候');
      return;
    }
    const targetResult = getBatchActionTargets(targets, 'delete');
    if (!targetResult.canExecute) {
      feishuToast.warning(targetResult.reason || '仅当所有选中连接均未运行且进程已退出时可批量删除');
      return;
    }

    isBatchOperatingRef.current = true;
    setIsBatchOperating(true);
    try {
      const deleteIds = new Set(targetResult.executable.map((p) => p.id));
      for (const p of targetResult.executable) {
        await deleteProfileSecret(profileCredentialReference(p.id));
      }
      setProfiles((prev) => prev.filter((item) => !deleteIds.has(item.id)));
      feishuToast.success(`已批量删除 ${targetResult.executable.length} 个连接并清理相关凭据`);
    } finally {
      isBatchOperatingRef.current = false;
      setIsBatchOperating(false);
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

      <AppSidebar
        {...sidebarLayout}
        currentNav={currentNav}
        profileCount={profiles.length}
        serverNodeCount={serverNodes.length}
        isDesktop={isTauriEnv()}
        onNavigate={(nav) => {
          if (nav === 'profiles') setLogTargetProfileId(null);
          navigate(`/${nav}`);
        }}
      />

      {/* 右侧主体区域 (纯白背景 #FFFFFF) */}
      <main className="min-w-0 flex-1 flex flex-col overflow-hidden bg-white">
        {/* 视图内容区 (路由与 URL 动态绑定) */}
        <div className="flex-1 overflow-y-auto p-6 bg-white">
          <Routes>
            <Route path="/" element={<Navigate to="/profiles" replace />} />
            <Route path="/dashboard" element={<Navigate to="/profiles" replace />} />
            <Route
              path="/profiles"
              element={
                <ProfileList
                  profiles={profiles}
                  traffic={runtimeTraffic}
                  defaultSort={appSettings.profileSort}
                  isBatchOperating={isBatchOperating}
                  onTogglePin={handleTogglePin}
                  onBatchStart={handleBatchStart}
                  onBatchStop={handleBatchStop}
                  onBatchDelete={handleBatchDelete}
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
            <Route
              path="/settings"
              element={<SettingsPage settings={appSettings} onChange={handleAppSettingsChange} />}
            />
            <Route path="*" element={<Navigate to="/profiles" replace />} />
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
        cores={cores}
        serverNodes={serverNodes}
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
