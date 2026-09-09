import { listen } from '@tauri-apps/api/event';
import {
  DiagnosticResult,
  CoreDownloadTask,
  FrpCore,
  FrpcFailureKind,
  FrpcRuntimeLogEvent,
  FrpcRuntimeStateEvent,
  FrpServerNode,
  FrpsDeploymentDraft,
  FrpsDeploymentSummary,
  LogEntry,
  LogLevel,
  ProcessCommandResult,
  ProcessStatus,
  Profile,
  ServerOperationKind,
  ServerOperationResult,
  ServerPreflightRequest,
  ServerPreflightResult,
} from '../types/frp';
import { generateId } from '../lib/utils';
import type { AppSettings } from './app-settings';

// 检测是否处于 Tauri 宿主环境
export const isTauriEnv = (): boolean => {
  if (typeof window !== 'undefined' && (window as any).__MOCK_TAURI_ENV__ !== undefined) {
    return Boolean((window as any).__MOCK_TAURI_ENV__);
  }
  return (
    typeof window !== 'undefined' &&
    Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)
  );
};

// 安全调用 Tauri 命令
async function tauriInvoke<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  const tauri = (window as any).__TAURI__;
  const internals = (window as any).__TAURI_INTERNALS__;

  if (tauri && tauri.core && typeof tauri.core.invoke === 'function') {
    return args !== undefined ? await tauri.core.invoke(cmd, args) : await tauri.core.invoke(cmd);
  }
  if (internals && typeof internals.invoke === 'function') {
    return args !== undefined ? await internals.invoke(cmd, args) : await internals.invoke(cmd);
  }
  throw new Error('当前不在 Tauri 桌面环境中运行');
}

export type LogListener = (log: LogEntry) => void;
const logListeners = new Set<LogListener>();

/**
 * 订阅实时日志流
 */
export function subscribeLogs(listener: LogListener): () => void {
  logListeners.add(listener);
  return () => {
    logListeners.delete(listener);
  };
}

function broadcastLog(log: LogEntry) {
  logListeners.forEach((fn) => {
    try {
      fn(log);
    } catch (e) {
      console.error('Log listener error:', e);
    }
  });
}

const VALID_LOG_LEVELS = new Set<LogLevel>(['trace', 'debug', 'info', 'warn', 'error']);
const VALID_PROCESS_STATUSES = new Set<ProcessStatus>(['stopped', 'starting', 'running', 'stopping', 'error']);
const MAX_SAFE_RUNTIME_TEXT_LENGTH = 4096;

function stripAnsiEscapeSequences(text: string): string {
  return text.replace(
    /\u001b(?:\][\s\S]*?(?:\u0007|\u001b\\)|[PX^_][\s\S]*?\u001b\\|\[[0-?]*[ -/]*[@-~]|[\s\S]?)/g,
    ''
  ).replace(/\u009b[0-?]*[ -/]*[@-~]/g, '');
}

/**
 * 针对运行期输出实施纵深防御脱敏与长度截断
 */
export function sanitizeRuntimeText(text: string): string {
  if (!text) return '';

  let result = stripAnsiEscapeSequences(text);

  // 1. 脱敏 PEM 密钥块（如 -----BEGIN RSA PRIVATE KEY-----、-----BEGIN OPENSSH PRIVATE KEY----- 等）
  result = result.replace(
    /-----BEGIN [A-Z0-9_\s\-]+PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9_\s\-]+PRIVATE KEY-----/gi,
    '******'
  );

  // 2. 脱敏 Authorization 标头
  result = result.replace(
    /(authorization\s*[:=]\s*)(?:bearer\s+|basic\s+)?[^\r\n,;]+/gi,
    '$1******'
  );

  // 3. 脱敏 token、password、secret_key 的键值赋值 (支持带引号与不带引号)
  result = result.replace(
    /((?:token|password|secret_key)\s*[:=]\s*)(?:(["'])(?:(?!\2)[\s\S])*?\2|[^\s,;\r\n]+)/gi,
    '$1******'
  );

  // 4. 4 KiB 长度上限防御
  if (result.length > MAX_SAFE_RUNTIME_TEXT_LENGTH) {
    result = result.slice(0, MAX_SAFE_RUNTIME_TEXT_LENGTH);
  }

  return result;
}

function parseRuntimeLogEvent(payload: any): FrpcRuntimeLogEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const { sequence, profileId, timestamp, level, message } = payload;
  if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence <= 0) return null;
  if (typeof profileId !== 'string' || !profileId.trim()) return null;
  if (typeof message !== 'string' || !message.trim()) return null;
  if (typeof level !== 'string' || !VALID_LOG_LEVELS.has(level.toLowerCase() as LogLevel)) return null;
  const normalizedTimestamp = typeof timestamp === 'string' && timestamp.trim() ? timestamp : new Date().toISOString();
  const sanitizedMessage = sanitizeRuntimeText(message);

  return {
    sequence,
    profileId: profileId.trim(),
    timestamp: normalizedTimestamp,
    level: level.toLowerCase() as LogLevel,
    message: sanitizedMessage,
  };
}

function parseRuntimeStateEvent(payload: any): FrpcRuntimeStateEvent | null {
  if (!payload || typeof payload !== 'object') return null;
  const { profileId, status, pid, timestamp, errorMessage } = payload;
  if (typeof profileId !== 'string' || !profileId.trim()) return null;
  if (typeof status !== 'string' || !VALID_PROCESS_STATUSES.has(status.toLowerCase() as ProcessStatus)) return null;
  const normalizedTimestamp = typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : Date.now();
  const sanitizedErrorMessage = errorMessage && typeof errorMessage === 'string' && errorMessage.trim()
    ? sanitizeRuntimeText(errorMessage.trim())
    : undefined;

  return {
    profileId: profileId.trim(),
    status: status.toLowerCase() as ProcessStatus,
    pid: typeof pid === 'number' && Number.isFinite(pid) ? pid : undefined,
    timestamp: normalizedTimestamp,
    errorMessage: sanitizedErrorMessage,
  };
}

export type RuntimeLogHandler = (log: FrpcRuntimeLogEvent) => void;
export type RuntimeStateHandler = (state: FrpcRuntimeStateEvent) => void;

interface RuntimeSubscriber {
  onLog?: RuntimeLogHandler;
  onState?: RuntimeStateHandler;
}

// 单例运行时事件桥接状态
const runtimeSubscribers = new Set<RuntimeSubscriber>();
let nativeListenPromise: Promise<void> | null = null;
let nativeUnlistenFns: Array<() => void> = [];

async function ensureNativeListeners(): Promise<void> {
  if (nativeUnlistenFns.length > 0) return;
  if (nativeListenPromise) return nativeListenPromise;

  nativeListenPromise = (async () => {
    try {
      const unlistenLog = await listen('frp-runtime-log', (event: { payload: any }) => {
        const parsed = parseRuntimeLogEvent(event?.payload);
        if (!parsed) return;

        for (const subscriber of runtimeSubscribers) {
          try {
            if (subscriber.onLog) {
              subscriber.onLog(parsed);
            }
          } catch (e) {
            console.error('Runtime log subscriber error:', e);
          }
        }

        broadcastLog({
          id: generateId('log'),
          sequence: parsed.sequence,
          profileId: parsed.profileId,
          profileName: parsed.profileId,
          timestamp: parsed.timestamp,
          level: parsed.level,
          message: parsed.message,
          raw: `[${parsed.timestamp}] [${parsed.level.toUpperCase()}] ${parsed.message}`,
        });
      });

      const unlistenState = await listen('frp-runtime-state', (event: { payload: any }) => {
        const parsed = parseRuntimeStateEvent(event?.payload);
        if (!parsed) return;

        for (const subscriber of runtimeSubscribers) {
          try {
            if (subscriber.onState) {
              subscriber.onState(parsed);
            }
          } catch (e) {
            console.error('Runtime state subscriber error:', e);
          }
        }
      });

      nativeUnlistenFns = [unlistenLog, unlistenState];
    } catch (err) {
      console.error('Failed to register native Tauri runtime event listeners:', err);
    } finally {
      nativeListenPromise = null;
    }
  })();

  return nativeListenPromise;
}

async function cleanupNativeListenersIfNoSubscribers(): Promise<void> {
  if (runtimeSubscribers.size === 0 && nativeUnlistenFns.length > 0) {
    const toUnlisten = nativeUnlistenFns;
    nativeUnlistenFns = [];
    for (const unlisten of toUnlisten) {
      try {
        unlisten();
      } catch (e) {
        console.error('Error during native unlisten:', e);
      }
    }
  }
}

/**
 * 仅用于单元测试隔离与重置桥接状态
 */
export function _resetRuntimeEventBridgeForTest(): void {
  runtimeSubscribers.clear();
  nativeUnlistenFns = [];
  nativeListenPromise = null;
  logListeners.clear();
}

/**
 * 订阅 Tauri 桌面端真实运行期事件（单例桥接，支持任意数量业务订阅者）
 */
export async function subscribeRuntimeEvents(
  onLog?: RuntimeLogHandler,
  onState?: RuntimeStateHandler
): Promise<() => Promise<void>> {
  if (!isTauriEnv()) {
    return async () => {};
  }

  const subscriber: RuntimeSubscriber = { onLog, onState };
  runtimeSubscribers.add(subscriber);

  await ensureNativeListeners();

  let unsubscribed = false;
  return async () => {
    if (unsubscribed) return;
    unsubscribed = true;
    runtimeSubscribers.delete(subscriber);
    await cleanupNativeListenersIfNoSubscribers();
  };
}

/**
 * 获取当前受监管的所有 FRPC 实例运行时状态
 */
export async function getRuntimeStates(): Promise<FrpcRuntimeStateEvent[]> {
  if (isTauriEnv()) {
    try {
      const res = await tauriInvoke<any[]>('get_runtime_states');
      if (!Array.isArray(res)) return [];
      const parsedList: FrpcRuntimeStateEvent[] = [];
      for (const item of res) {
        const parsed = parseRuntimeStateEvent(item);
        if (parsed) parsedList.push(parsed);
      }
      return parsedList;
    } catch (e) {
      console.error('Failed to get runtime states:', e);
      return [];
    }
  }
  return [];
}

/**
 * 获取受监管的 FRPC 实例运行时日志快照（权威来源）
 */
export async function getRuntimeLogs(profileId?: string): Promise<FrpcRuntimeLogEvent[]> {
  if (!isTauriEnv()) return [];
  try {
    const payload = await tauriInvoke<unknown[]>('get_runtime_logs', profileId ? { profileId } : undefined);
    return Array.isArray(payload)
      ? payload.map(parseRuntimeLogEvent).filter((entry): entry is FrpcRuntimeLogEvent => entry !== null)
      : [];
  } catch (error) {
    console.error('Failed to get runtime logs:', error);
    return [];
  }
}

/**
 * 启动 FRP 实例
 */
export async function startProfileInstance(
  profile: Profile,
  core?: FrpCore,
  serverCredentialRef?: string,
): Promise<ProcessCommandResult> {
  if (isTauriEnv()) {
    try {
      const res = await tauriInvoke<{
        accepted?: boolean;
        success?: boolean;
        pid?: number;
        error?: string;
        failureKind?: string;
      }>('start_profile', {
        profileId: profile.id,
        profileType: profile.type,
        tomlContent: profile.rawToml,
        corePath: core?.path || '',
        ...(serverCredentialRef ? { serverCredentialRef } : {}),
      });
      if (res?.accepted === undefined && res?.success === undefined) {
        return {
          accepted: false,
          error: '启动 FRPC 实例失败：未收到有效的启动确认',
        };
      }
      const accepted = Boolean(res.accepted ?? res.success);
      const result: ProcessCommandResult = { accepted };
      if (res.pid !== undefined) {
        result.pid = res.pid;
      }
      if (res.error) {
        result.error = res.error;
      }
      const validFailureKinds: Set<string> = new Set(['core_invalid', 'startup', 'early_exit']);
      if (res.failureKind && validFailureKinds.has(res.failureKind)) {
        result.failureKind = res.failureKind as FrpcFailureKind;
      }
      return result;
    } catch (err: any) {
      return { accepted: false, error: err?.message || String(err) };
    }
  }

  // 浏览器环境明确阻断：不启动、不产生模拟 PID、不广播模拟日志
  return {
    accepted: false,
    error: 'FRPC 运行功能仅可在桌面版应用中使用',
  };
}

/**
 * 停止 FRP 实例
 */
export async function stopProfileInstance(
  profileId: string,
  _profileName?: string
): Promise<ProcessCommandResult> {
  if (isTauriEnv()) {
    try {
      const res = await tauriInvoke<{ accepted?: boolean; success?: boolean; error?: string }>('stop_profile', {
        profileId,
      });
      if (res?.accepted === undefined && res?.success === undefined) {
        return {
          accepted: false,
          error: '停止 FRPC 实例失败：未收到有效的停止确认',
        };
      }
      const accepted = Boolean(res.accepted ?? res.success);
      const result: ProcessCommandResult = { accepted };
      if (res.error) {
        result.error = res.error;
      } else if (!accepted) {
        result.error = '停止 FRPC 实例失败';
      }
      return result;
    } catch (err: any) {
      return { accepted: false, error: err?.message || String(err) };
    }
  }

  // 浏览器环境明确阻断
  return {
    accepted: false,
    error: 'FRPC 运行功能仅可在桌面版应用中使用',
  };
}

/**
 * 测试远程服务器 TCP 连通性
 */
export async function testServerConnectivity(host: string, port: number): Promise<DiagnosticResult> {
  if (isTauriEnv()) {
    try {
      const res = await tauriInvoke<{ latencyMs: number; reachable: boolean; error?: string }>('test_tcp_connection', { host, port });
      return {
        server: host,
        port,
        latencyMs: res.reachable ? res.latencyMs : null,
        status: res.reachable ? 'success' : 'failed',
        error: res.error,
        timestamp: new Date().toLocaleTimeString(),
      };
    } catch (err: any) {
      return {
        server: host,
        port,
        latencyMs: null,
        status: 'failed',
        error: err?.message || String(err),
        timestamp: new Date().toLocaleTimeString(),
      };
    }
  }

  // 普通浏览器环境明确阻断
  return {
    server: host,
    port,
    latencyMs: null,
    status: 'failed',
    error: '网络连通性探测仅可在桌面版应用中使用',
    timestamp: new Date().toLocaleTimeString(),
  };
}

export interface GitHubReleaseAsset {
  name: string;
  size: number;
  downloadCount?: number;
  downloadUrl: string;
}

export interface GitHubRelease {
  tag: string;
  name: string;
  publishedAt: string;
  downloadCount?: number;
  assets: GitHubReleaseAsset[];
}

/**
 * 获取 GitHub Release 版本列表
 */
export async function fetchGitHubReleases(): Promise<GitHubRelease[]> {
  try {
    const res = await fetch('https://api.github.com/repos/fatedier/frp/releases?per_page=20');
    if (!res.ok) throw new Error('GitHub API rate limited');
    const data = await res.json();
    return data.map((r: any) => {
      const assets: GitHubReleaseAsset[] = (r.assets || []).map((a: any) => ({
        name: a.name,
        size: a.size,
        downloadCount: typeof a.download_count === 'number' ? a.download_count : 0,
        downloadUrl: a.browser_download_url,
      }));
      const downloadCount = assets.reduce((sum, a) => sum + (a.downloadCount || 0), 0);
      return {
        tag: r.tag_name,
        name: r.name || r.tag_name,
        publishedAt: r.published_at,
        downloadCount,
        assets,
      };
    });
  } catch (e) {
    // 默认官方版本备用列表
    return [
      {
        tag: 'v0.61.1',
        name: 'Release v0.61.1 (最新稳定版)',
        publishedAt: '2025-01-15T08:00:00Z',
        downloadCount: 154200,
        assets: [
          { name: 'frp_0.61.1_windows_amd64.zip', size: 16500000, downloadCount: 82000, downloadUrl: 'https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_windows_amd64.zip' },
          { name: 'frp_0.61.1_windows_arm64.zip', size: 15400000, downloadCount: 14000, downloadUrl: 'https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_windows_arm64.zip' },
          { name: 'frp_0.61.1_darwin_arm64.tar.gz', size: 15800000, downloadCount: 21000, downloadUrl: 'https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_darwin_arm64.tar.gz' },
          { name: 'frp_0.61.1_darwin_amd64.tar.gz', size: 16200000, downloadCount: 11000, downloadUrl: 'https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_darwin_amd64.tar.gz' },
          { name: 'frp_0.61.1_linux_amd64.tar.gz', size: 16800000, downloadCount: 18000, downloadUrl: 'https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_linux_amd64.tar.gz' },
          { name: 'frp_0.61.1_linux_arm64.tar.gz', size: 15600000, downloadCount: 8200, downloadUrl: 'https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_linux_arm64.tar.gz' },
        ],
      },
      {
        tag: 'v0.60.0',
        name: 'Release v0.60.0',
        publishedAt: '2024-10-10T08:00:00Z',
        downloadCount: 98000,
        assets: [],
      },
      {
        tag: 'v0.58.1',
        name: 'Release v0.58.1',
        publishedAt: '2024-06-20T08:00:00Z',
        downloadCount: 76000,
        assets: [],
      },
      {
        tag: 'v0.52.3',
        name: 'Release v0.52.3 (TOML 基础支持版)',
        publishedAt: '2023-11-05T08:00:00Z',
        downloadCount: 112000,
        assets: [],
      },
    ];
  }
}

/**
 * 自动识别本地 FRP 核心版本 (通过路径)
 */
export async function detectLocalCoreVersion(filePath: string): Promise<{ version: string; isServer: boolean; error?: string }> {
  if (isTauriEnv()) {
    try {
      return await tauriInvoke<{ version: string; isServer: boolean; error?: string }>('detect_core_version', { filePath });
    } catch (err: any) {
      return { version: '未知版本', isServer: false, error: err?.message || String(err) };
    }
  }

  // 浏览器模拟检测
  const isServer = filePath.toLowerCase().includes('frps');
  const matched = filePath.match(/(\d+\.\d+\.\d+)/);
  const version = matched ? `v${matched[1]}` : 'v0.61.1';
  return { version, isServer };
}

export interface LocalFrpcCoreInspection {
  version: string;
  error?: string;
}

/**
 * 校验本地 FRPC 核心程序 (只读检查)
 */
export async function inspectLocalFrpcCore(filePath: string): Promise<LocalFrpcCoreInspection> {
  if (!isTauriEnv()) return { version: '', error: '浏览器预览不能校验本机 FRPC 核心' };
  try {
    return await tauriInvoke<LocalFrpcCoreInspection>('inspect_frpc_core', { filePath });
  } catch {
    return { version: '', error: '无法校验本地 FRPC 核心，请重新选择 frpc.exe' };
  }
}

/**
 * 唤起系统原生文件选择对话框选择 FRP 二进制文件 (Tauri 桌面与 Vite 宿主开发模式)
 */
export async function pickCoreFileNative(): Promise<string | null> {
  if (isTauriEnv()) {
    try {
      const selected = await tauriInvoke<string | null>('pick_core_file');
      return selected || null;
    } catch (err) {
      console.error('Failed to pick file natively:', err);
      return null;
    }
  }

  // Vite 开发服务器环境下原生文件选择器
  try {
    const res = await fetch('/api/dev/pick-file');
    if (res.ok) {
      const data = await res.json();
      if (data && data.path) {
        return data.path;
      }
      if (data && data.path === null) {
        return null; // 用户取消了选择
      }
    }
  } catch {
    // 忽略异常
  }

  return null;
}

/**
 * 唤起系统原生目录选择对话框 (Tauri 桌面与 Vite 宿主开发模式)
 */
export async function pickDirectoryNative(): Promise<string | null> {
  if (isTauriEnv()) {
    try {
      const selected = await tauriInvoke<string | null>('pick_directory');
      return selected || null;
    } catch (err) {
      console.error('Failed to pick directory natively:', err);
      return null;
    }
  }

  // Vite 开发服务器环境下原生目录选择器
  try {
    const res = await fetch('/api/dev/pick-dir');
    if (res.ok) {
      const data = await res.json();
      if (data && data.path) {
        return data.path;
      }
      if (data && data.path === null) {
        return null;
      }
    }
  } catch {
    // 忽略异常
  }

  return null;
}

/**
 * 唤起系统原生压缩包选择对话框选择官方 FRP 归档 (.zip, .tar.gz, .tgz)
 */
export async function pickArchiveFileNative(): Promise<string | null> {
  if (isTauriEnv()) {
    try {
      const selected = await tauriInvoke<string | null>('pick_archive_file');
      return selected || null;
    } catch (err) {
      console.error('Failed to pick archive file natively:', err);
      return null;
    }
  }

  // Vite 开发服务器环境下原生压缩包选择器
  try {
    const res = await fetch('/api/dev/pick-archive');
    if (res.ok) {
      const data = await res.json();
      if (data && data.path) {
        return data.path;
      }
      if (data && data.path === null) {
        return null;
      }
    }
  } catch {
    // 忽略异常
  }

  return null;
}

/**
 * 导入官方 FRP 压缩包：在后台自动解压、校验架构与版本、原子安装至受管核心库
 */
export async function importLocalFrpcArchive(archivePath: string): Promise<RecognizedLocalFrpcCore> {
  if (!isTauriEnv()) {
    throw new Error('浏览器预览不能解压与导入本机 FRP 压缩包，请在 FRP-GUI 桌面端执行');
  }

  return await tauriInvoke<RecognizedLocalFrpcCore>('import_local_frpc_archive', { archivePath });
}

export interface RecognizedLocalFrpcCore {
  path: string;
  version: string;
  os: string;
  arch: string;
  sizeBytes: number;
}

export interface SkippedLocalFrpcCore {
  fileName: string;
  reason: string;
}

export interface LocalFrpcCoreScanResult {
  recognized: RecognizedLocalFrpcCore[];
  skipped: SkippedLocalFrpcCore[];
  error?: string;
}

/**
 * 扫描用户选择目录中的 FRPC 候选；仅桌面端调用受控 Rust 命令。
 */
export async function scanLocalFrpcCores(directoryPath: string): Promise<LocalFrpcCoreScanResult> {
  if (!isTauriEnv()) {
    return {
      recognized: [],
      skipped: [],
      error: '浏览器预览不能扫描本机 FRP 文件夹，请在 FRP-GUI 桌面端操作',
    };
  }

  try {
    return await tauriInvoke<LocalFrpcCoreScanResult>('scan_local_frpc_cores', {
      directoryPath,
    });
  } catch (err: any) {
    return {
      recognized: [],
      skipped: [],
      error: err?.message || '扫描本地 FRP 文件夹失败，请重新选择目录',
    };
  }
}

export interface FileSystemItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime: string;
  isExecutable: boolean;
  isFrpBinary: boolean;
  extension: string;
}

export interface FileSystemDrive {
  label: string;
  path: string;
  type: 'system' | 'data' | 'home';
}

export interface FileSystemShortcut {
  label: string;
  path: string;
  icon: string;
}

export interface FileSystemListResult {
  success: boolean;
  currentPath: string;
  parentPath: string | null;
  drives: FileSystemDrive[];
  shortcuts: FileSystemShortcut[];
  items: FileSystemItem[];
  error?: string;
}

/**
 * 罗列本地指定路径的文件与文件夹 (供飞书内置文件/目录选择器使用)
 */
export async function fetchFileSystemList(dirPath?: string): Promise<FileSystemListResult> {
  const query = dirPath ? `?dir=${encodeURIComponent(dirPath)}` : '';
  try {
    const res = await fetch(`/api/dev/fs/list${query}`);
    if (res.ok) {
      return await res.json();
    }
    return {
      success: false,
      currentPath: dirPath || '',
      parentPath: null,
      drives: [],
      shortcuts: [],
      items: [],
      error: `请求失败: HTTP ${res.status}`,
    };
  } catch (err: any) {
    return {
      success: false,
      currentPath: dirPath || '',
      parentPath: null,
      drives: [],
      shortcuts: [],
      items: [],
      error: err?.message || String(err),
    };
  }
}

/**
 * 在本地新建文件夹
 */
export async function createFileSystemDirectory(dirPath: string): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const res = await fetch('/api/dev/fs/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath }),
    });
    if (res.ok) {
      return await res.json();
    }
    return { success: false, error: `新建目录失败: HTTP ${res.status}` };
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) };
  }
}

export interface DownloadCoreParams {
  releaseTag: string;
  assetName: string;
  mirror: 'official' | 'ghproxy' | 'fastgit';
  targetDir: string;
  version: string;
  targetOs: string;
  targetArch: string;
}

export interface DownloadCoreResult {
  success: boolean;
  exePath: string;
  targetDir: string;
  sizeBytes: number;
  version: string;
  os: string;
  arch: string;
  error?: string;
}

export interface CoreDownloadRequest {
  releaseTag: string;
  assetName: string;
  mirror: 'official' | 'ghproxy' | 'fastgit';
  targetDir: string;
  targetOs: string;
  targetArch: string;
}

export type CoreDownloadProgressListener = (task: CoreDownloadTask) => void;

const desktopDownloadError = '浏览器预览不能下载本机 FRP 核心，请在 FRP-GUI 桌面端操作';

export async function startCoreDownload(request: CoreDownloadRequest): Promise<CoreDownloadTask | { error: string }> {
  if (!isTauriEnv()) return { error: desktopDownloadError };
  try {
    const task = await tauriInvoke<CoreDownloadTask | null>('start_core_download', {
      request: {
        releaseTag: request.releaseTag,
        assetName: request.assetName,
        mirror: request.mirror,
        targetDir: request.targetDir,
        targetOs: request.targetOs,
        targetArch: request.targetArch,
      },
    });
    if (!task || !task.taskId) {
      return { error: '桌面端下载服务未就绪，请完全退出并重新打开 FRP-GUI 后重试' };
    }
    return task;
  } catch (err: any) {
    return { error: typeof err === 'string' && err.trim() ? err : err?.message || '启动 FRP 核心下载任务失败，请完全退出并重新打开 FRP-GUI 后重试' };
  }
}

export async function listCoreDownloadTasks(): Promise<CoreDownloadTask[]> {
  if (!isTauriEnv()) return [];
  try {
    return await tauriInvoke<CoreDownloadTask[]>('list_core_download_tasks');
  } catch {
    return [];
  }
}

export async function resumeCoreDownload(taskId: string): Promise<CoreDownloadTask | { error: string }> {
  if (!isTauriEnv()) return { error: desktopDownloadError };
  try {
    return await tauriInvoke<CoreDownloadTask>('resume_core_download', { taskId });
  } catch (err: any) {
    return { error: err?.message || '继续 FRP 核心下载任务失败' };
  }
}

export async function cancelCoreDownload(taskId: string): Promise<{ accepted: boolean; error?: string }> {
  if (!isTauriEnv()) return { accepted: false, error: desktopDownloadError };
  try {
    await tauriInvoke<void>('cancel_core_download', { taskId });
    return { accepted: true };
  } catch (err: any) {
    return { accepted: false, error: err?.message || '取消 FRP 核心下载任务失败' };
  }
}

export async function clearCoreDownloadTask(taskId: string): Promise<{ accepted: boolean; error?: string }> {
  if (!isTauriEnv()) return { accepted: false, error: desktopDownloadError };
  try {
    await tauriInvoke<void>('clear_core_download_task', { taskId });
    return { accepted: true };
  } catch (err: any) {
    return { accepted: false, error: err?.message || '清理 FRP 核心下载任务失败' };
  }
}

export async function subscribeCoreDownloadProgress(listener: CoreDownloadProgressListener): Promise<() => void> {
  if (!isTauriEnv()) return () => {};
  const unlisten = await listen<CoreDownloadTask>('core-download-progress', (event) => listener(event.payload));
  return () => unlisten();
}

export type ServerCredentialKind =
  | 'password'
  | 'private_key'
  | 'private_key_passphrase'
  | 'sudo_password'
  | 'frp_token'
  | 'dashboard_password';

/**
 * 将 SSH 凭据写入桌面端操作系统安全凭据库。该接口只接受秘密写入，不提供读取能力。
 */
export async function storeServerCredential(
  reference: string,
  kind: ServerCredentialKind,
  secret: string,
): Promise<void> {
  if (!isTauriEnv()) {
    throw new Error('仅桌面版可记住凭据到系统安全凭据库');
  }
  await tauriInvoke<void>('store_server_credential', { reference, kind, secret });
}

export interface StoreFrpsSecretsParams {
  authToken: string;
  dashboardPassword?: string;
  sudoPassword?: string;
  rememberSudoPassword?: boolean;
}

/**
 * 将 FRPS 部署相关机密写入操作系统安全凭据库（Token、Dashboard 密码、可选 Sudo 密码）
 */
export async function storeFrpsSecrets(
  reference: string,
  secrets: StoreFrpsSecretsParams
): Promise<void> {
  if (!isTauriEnv()) {
    throw new Error('仅桌面版可记住凭据到系统安全凭据库');
  }
  if (secrets.authToken) {
    await storeServerCredential(reference, 'frp_token', secrets.authToken);
  }
  if (secrets.dashboardPassword) {
    await storeServerCredential(reference, 'dashboard_password', secrets.dashboardPassword);
  }
  if (secrets.rememberSudoPassword && secrets.sudoPassword) {
    await storeServerCredential(reference, 'sudo_password', secrets.sudoPassword);
  }
}

/**
 * 删除某个服务器节点关联的所有操作系统安全凭据。
 */
export async function deleteServerCredentials(reference: string): Promise<void> {
  if (!isTauriEnv()) return;
  await tauriInvoke<void>('delete_server_credentials', { reference });
}

/** 将完整方案配置保存到桌面端系统凭据库，localStorage 只保存脱敏元数据。 */
export async function storeProfileSecret(reference: string, secret: string): Promise<void> {
  if (!isTauriEnv()) {
    throw new Error('仅桌面版可将方案凭据保存到系统安全凭据库');
  }
  await tauriInvoke<void>('store_profile_secret', { reference, secret });
}

/** 恢复桌面端系统凭据库中的完整方案配置。 */
export async function loadProfileSecret(reference: string): Promise<string | null> {
  if (!isTauriEnv()) return null;
  return tauriInvoke<string | null>('load_profile_secret', { reference });
}

export async function deleteProfileSecret(reference: string): Promise<void> {
  if (!isTauriEnv()) return;
  await tauriInvoke<void>('delete_profile_secret', { reference });
}

/** 将窗口生命周期设置同步给桌面端；浏览器预览不执行任何原生操作。 */
export async function syncAppSettings(settings: AppSettings): Promise<void> {
  if (!isTauriEnv()) return;
  await tauriInvoke<void>('update_app_settings', { settings });
}

/** 请求桌面端先停止受管 FRPC，再退出应用。 */
export async function exitDesktopApp(): Promise<void> {
  if (!isTauriEnv()) return;
  await tauriInvoke<void>('exit_desktop_app');
}

/** 启动时按用户设置隐藏主窗口到系统托盘。 */
export async function hideMainWindow(): Promise<void> {
  if (!isTauriEnv()) return;
  await tauriInvoke<void>('hide_main_window');
}

/**
 * 真实下载并解压 FRP 官方核心压缩包至指定本地绝对目录
 */
export async function downloadAndExtractCore(params: DownloadCoreParams): Promise<DownloadCoreResult> {
  // 1. Tauri 桌面模式：调用 Rust 原生高并发下载与解压流水线
  if (isTauriEnv()) {
    try {
      return await tauriInvoke<DownloadCoreResult>('download_and_extract_core', {
        releaseTag: params.releaseTag,
        assetName: params.assetName,
        mirror: params.mirror,
        targetDir: params.targetDir,
        version: params.version,
        targetOs: params.targetOs,
        targetArch: params.targetArch,
      });
    } catch (err: any) {
      return {
        success: false,
        exePath: '',
        targetDir: params.targetDir,
        sizeBytes: 0,
        version: params.version,
        os: params.targetOs,
        arch: params.targetArch,
        error: err?.message || String(err),
      };
    }
  }

  return {
    success: false,
    exePath: '',
    targetDir: params.targetDir,
    sizeBytes: 0,
    version: params.version,
    os: params.targetOs,
    arch: params.targetArch,
    error: '浏览器预览不能下载本机 FRP 核心，请在 FRP-GUI 桌面端操作',
  };
}

/**
 * 执行 SSH 预检
 */
export async function runServerPreflight(request: ServerPreflightRequest): Promise<ServerPreflightResult> {
  if (!isTauriEnv()) {
    throw new Error('仅桌面版支持 SSH 预检，请在已安装的 FRP-GUI 中继续');
  }

  // 严格白名单重建安全请求对象，阻断任何透传的未知/注入字段（如 command、shell 等）
  const safeRequest: ServerPreflightRequest = {
    node: {
      id: request.node.id,
      host: request.node.host,
      sshPort: request.node.sshPort,
      username: request.node.username,
      authMethod: request.node.authMethod,
      credentialRef: request.node.credentialRef,
      credentialsRemembered: Boolean(request.node.credentialsRemembered),
      trustedHostKeyFingerprint: request.node.trustedHostKeyFingerprint,
    },
    acceptedHostKeyFingerprint: request.acceptedHostKeyFingerprint,
    ephemeralCredentials: request.ephemeralCredentials
      ? {
          password: request.ephemeralCredentials.password,
          privateKey: request.ephemeralCredentials.privateKey,
          privateKeyPassphrase: request.ephemeralCredentials.privateKeyPassphrase,
        }
      : undefined,
  };

  return tauriInvoke<ServerPreflightResult>('run_server_preflight', { request: safeRequest });
}

export interface RunFrpsOperationParams {
  node: FrpServerNode;
  operation: ServerOperationKind;
  deployment?: FrpsDeploymentDraft | FrpsDeploymentSummary;
  confirmation?: { accepted: boolean };
  ephemeralSshCredentials?: {
    password?: string;
    privateKey?: string;
    privateKeyPassphrase?: string;
  };
  ephemeralSudoPassword?: string;
}

/**
 * 执行受控 FRPS 部署与服务管理操作（纯白名单重建，阻断任何注入/透传字段）
 */
export async function runFrpsOperation(params: RunFrpsOperationParams): Promise<ServerOperationResult> {
  if (!isTauriEnv()) {
    throw new Error('仅桌面版支持 FRPS 部署与服务管理');
  }

  // 仅当 privilege === 'sudo_password_required'、未记住 sudo 密码、且操作不是 refresh_status 时才允许透传 ephemeralSudoPassword
  const allowEphemeralSudo =
    params.node.privilege === 'sudo_password_required' &&
    !params.node.sudoCredentialsRemembered &&
    params.operation !== 'refresh_status';

  const safeEphemeralSudoPassword =
    allowEphemeralSudo && params.ephemeralSudoPassword
      ? params.ephemeralSudoPassword
      : undefined;

  // SSH 凭据收紧：仅未记住凭据时按 authMethod 严格分流，不得混入无关秘密
  let safeEphemeralSsh: Record<string, any> | undefined = undefined;
  if (!params.node.credentialsRemembered && params.ephemeralSshCredentials) {
    if (params.node.authMethod === 'password') {
      if (params.ephemeralSshCredentials.password) {
        safeEphemeralSsh = {
          password: params.ephemeralSshCredentials.password,
        };
      }
    } else if (params.node.authMethod === 'private_key') {
      if (params.ephemeralSshCredentials.privateKey) {
        safeEphemeralSsh = {
          privateKey: params.ephemeralSshCredentials.privateKey,
          privateKeyPassphrase: params.ephemeralSshCredentials.privateKeyPassphrase || undefined,
        };
      }
    }
  }

  const safeRequest: {
    node: Record<string, any>;
    operation: ServerOperationKind;
    deployment?: Record<string, any>;
    confirmation?: { accepted: boolean };
    ephemeralSshCredentials?: Record<string, any>;
    ephemeralSudoPassword?: string;
  } = {
    node: {
      id: params.node.id,
      host: params.node.host,
      sshPort: params.node.sshPort,
      username: params.node.username,
      authMethod: params.node.authMethod,
      credentialRef: params.node.credentialRef,
      credentialsRemembered: Boolean(params.node.credentialsRemembered),
      trustedHostKeyFingerprint: params.node.trustedHostKeyFingerprint,
      remoteOs: params.node.remoteOs,
      remoteArchitecture: params.node.remoteArchitecture,
      privilege: params.node.privilege,
      systemd: params.node.systemd,
      requiresSudoPassword: params.node.requiresSudoPassword,
      sudoCredentialsRemembered: params.node.sudoCredentialsRemembered,
      installDir: params.node.installDir || '/opt/frp',
      status: params.node.status,
      serviceStatus: params.node.serviceStatus,
    },
    operation: params.operation,
    deployment: params.deployment
      ? {
          version: params.deployment.version,
          bindPort: Number(params.deployment.bindPort),
          transportProtocol: params.deployment.transportProtocol,
          tlsForce: Boolean(params.deployment.tlsForce),
          dashboardEnabled: Boolean(params.deployment.dashboardEnabled),
          dashboardPort: params.deployment.dashboardPort ? Number(params.deployment.dashboardPort) : undefined,
          dashboardUser: params.deployment.dashboardUser || undefined,
        }
      : undefined,
    confirmation: params.confirmation
      ? {
          accepted: Boolean(params.confirmation.accepted),
        }
      : undefined,
    ephemeralSshCredentials: safeEphemeralSsh,
    ephemeralSudoPassword: safeEphemeralSudoPassword,
  };

  return tauriInvoke<ServerOperationResult>('run_frps_operation', { request: safeRequest });
}

export * from './frp-binary-detector';
export * from './frp-platform-detector';
