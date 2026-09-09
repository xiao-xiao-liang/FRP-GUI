import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startProfileInstance,
  stopProfileInstance,
  getRuntimeLogs,
  subscribeLogs,
  subscribeRuntimeEvents,
  testServerConnectivity,
  isTauriEnv,
  inspectLocalFrpcCore,
  pickCoreFileNative,
  pickDirectoryNative,
  pickArchiveFileNative,
  importLocalFrpcArchive,
  scanLocalFrpcCores,
  downloadAndExtractCore,
  startCoreDownload,
  listCoreDownloadTasks,
  subscribeCoreDownloadProgress,
  loadProfileSecret,
  storeProfileSecret,
  syncAppSettings,
  exitDesktopApp,
  _resetRuntimeEventBridgeForTest,
  sanitizeRuntimeText,
  fetchGitHubReleases,
} from './ipc';
import { FrpCore, Profile } from '../types/frp';

// Mock @tauri-apps/api/event
const eventHandlers = new Map<string, (event: { event: string; id: number; payload: any }) => void>();
const mockUnlistenLog = vi.fn();
const mockUnlistenState = vi.fn();
const mockTauriListen = vi.fn((eventName: string, handler: any) => {
  eventHandlers.set(eventName, handler);
  return Promise.resolve(eventName === 'frp-runtime-log' ? mockUnlistenLog : mockUnlistenState);
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: (eventName: string, handler: any) => mockTauriListen(eventName, handler),
}));

// Mock isTauriEnv so vi.mocked(isTauriEnv) can be used directly as specified in the plan
vi.mock('./ipc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ipc')>();
  const isTauriEnvMock = vi.fn(() => {
    if (typeof window !== 'undefined' && (window as any).__MOCK_TAURI_ENV__ !== undefined) {
      return Boolean((window as any).__MOCK_TAURI_ENV__);
    }
    return Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  });
  return {
    ...actual,
    isTauriEnv: isTauriEnvMock,
  };
});

function emitRuntimeLog(payload: any) {
  const handler = eventHandlers.get('frp-runtime-log');
  if (handler) {
    handler({ event: 'frp-runtime-log', id: 1, payload });
  }
}

function emitRuntimeState(payload: any) {
  const handler = eventHandlers.get('frp-runtime-state');
  if (handler) {
    handler({ event: 'frp-runtime-state', id: 2, payload });
  }
}

const mockProfile: Profile = {
  id: 'profile_1',
  name: '测试连接',
  type: 'frpc',
  config: {
    serverAddr: '1.2.3.4',
    serverPort: 7000,
    proxies: [],
    visitors: [],
  },
  rawToml: 'serverAddr = "1.2.3.4"\nserverPort = 7000\n',
  status: 'stopped',
  stats: {
    bytesIn: 0,
    bytesOut: 0,
    curConns: 0,
    uptimeSeconds: 0,
  },
  createdAt: 1000,
  updatedAt: 1000,
};

const mockCore: FrpCore = {
  id: 'core_1',
  name: 'frpc_0.61.1',
  version: '0.61.1',
  arch: 'amd64',
  os: 'windows',
  path: 'C:\\frp\\frpc.exe',
  isDefault: true,
  isCustom: false,
};

describe('IPC Runtime Contract and Event Bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers.clear();
    _resetRuntimeEventBridgeForTest();
    mockTauriListen.mockImplementation((eventName: string, handler: any) => {
      eventHandlers.set(eventName, handler);
      return Promise.resolve(eventName === 'frp-runtime-log' ? mockUnlistenLog : mockUnlistenState);
    });
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__MOCK_TAURI_ENV__;
  });

  afterEach(() => {
    _resetRuntimeEventBridgeForTest();
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).__MOCK_TAURI_ENV__;
  });

  it('普通浏览器阻断运行期操作，且不会产生模拟 PID 或日志', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(false);
    (window as any).__MOCK_TAURI_ENV__ = false;
    const listener = vi.fn();
    const unsubscribe = subscribeLogs(listener);

    await expect(startProfileInstance(mockProfile, mockCore)).resolves.toEqual({
      accepted: false,
      error: 'FRPC 运行功能仅可在桌面版应用中使用',
    });
    await expect(stopProfileInstance(mockProfile.id)).resolves.toEqual({
      accepted: false,
      error: 'FRPC 运行功能仅可在桌面版应用中使用',
    });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('普通浏览器中 TCP 诊断返回桌面专属提示且不生成模拟延迟', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(false);
    (window as any).__MOCK_TAURI_ENV__ = false;

    const res = await testServerConnectivity('example.com', 7000);
    expect(res.status).toBe('failed');
    expect(res.latencyMs).toBeNull();
    expect(res.error).toBe('网络连通性探测仅可在桌面版应用中使用');
  });

  it('桌面事件只转换受控字段，并在取消订阅后不再分发', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    (window as any).__TAURI__ = { core: { invoke: vi.fn() } };

    const logListener = vi.fn();
    const stateListener = vi.fn();
    const unlisten = vi.fn();
    mockTauriListen.mockImplementation((eventName: string, handler: any) => {
      eventHandlers.set(eventName, handler);
      return Promise.resolve(unlisten);
    });

    const unsubscribe = await subscribeRuntimeEvents(logListener, stateListener);

    emitRuntimeLog({
      sequence: 1,
      profileId: 'profile_1',
      level: 'info',
      message: 'login succeeded',
      timestamp: '2026-09-03 12:00:00',
      token: 'super-secret-token',
      rawToml: 'secret = 123',
    });

    expect(logListener).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 1, profileId: 'profile_1', message: 'login succeeded', level: 'info' })
    );
    expect(JSON.stringify(logListener.mock.calls)).not.toContain('token');
    expect(JSON.stringify(logListener.mock.calls)).not.toContain('super-secret-token');

    await unsubscribe();
    expect(unlisten).toHaveBeenCalled();
  });

  it('桌面事件桥接会将合规日志事件分发至现有 subscribeLogs 监听器', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    (window as any).__TAURI__ = { core: { invoke: vi.fn() } };

    const legacyListener = vi.fn();
    const unsubLegacy = subscribeLogs(legacyListener);

    const unsubBridge = await subscribeRuntimeEvents();

    emitRuntimeLog({
      sequence: 1,
      profileId: 'profile_1',
      level: 'warn',
      message: 'reconnecting in 5s',
      timestamp: '2026-09-03 12:00:01',
    });

    expect(legacyListener).toHaveBeenCalledWith(
      expect.objectContaining({
        sequence: 1,
        profileId: 'profile_1',
        level: 'warn',
        message: 'reconnecting in 5s',
      })
    );

    await unsubBridge();
    unsubLegacy();
  });

  it('拒绝格式非法的运行时日志或状态事件，不向监听器广播', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    (window as any).__TAURI__ = { core: { invoke: vi.fn() } };

    const logListener = vi.fn();
    const stateListener = vi.fn();
    const unsub = await subscribeRuntimeEvents(logListener, stateListener);

    // 缺少 sequence
    emitRuntimeLog({ profileId: 'p1', level: 'info', message: 'test', timestamp: '12:00:00' });
    // 非正整数 sequence
    emitRuntimeLog({ sequence: 0, profileId: 'p1', level: 'info', message: 'test', timestamp: '12:00:00' });
    // 缺少 profileId
    emitRuntimeLog({ sequence: 1, level: 'info', message: 'test', timestamp: '12:00:00' });
    // 空 message
    emitRuntimeLog({ sequence: 1, profileId: 'p1', level: 'info', message: '', timestamp: '12:00:00' });
    // 非法 level
    emitRuntimeLog({ sequence: 1, profileId: 'p1', level: 'fatal_catastrophe', message: 'test', timestamp: '12:00:00' });

    // 缺少 profileId 的 state
    emitRuntimeState({ status: 'running', timestamp: 123 });
    // 非法 status
    emitRuntimeState({ profileId: 'p1', status: 'flying_in_sky', timestamp: 123 });

    expect(logListener).not.toHaveBeenCalled();
    expect(stateListener).not.toHaveBeenCalled();

    await unsub();
  });

  it('getRuntimeLogs 仅接受带正整数 sequence 的脱敏快照条目', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    const invoke = vi.fn().mockResolvedValue([
      { sequence: 1, profileId: 'profile_1', timestamp: '2026-09-04 16:18:19', level: 'info', message: 'login success' },
      { sequence: 0, profileId: 'profile_1', timestamp: 't', level: 'info', message: 'must be ignored' },
    ]);
    (window as any).__TAURI__ = { core: { invoke } };

    const logs = await getRuntimeLogs('profile_1');
    expect(invoke).toHaveBeenCalledWith('get_runtime_logs', { profileId: 'profile_1' });
    expect(logs).toEqual([{ sequence: 1, profileId: 'profile_1', timestamp: '2026-09-04 16:18:19', level: 'info', message: 'login success' }]);
  });

  it('运行期事件与日志快照均剥离 ANSI 颜色控制符', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    const invoke = vi.fn().mockResolvedValue([
      { sequence: 1, profileId: 'p1', timestamp: '2026-09-04 20:18:58', level: 'info', message: '\u001b[1;34mproxy success\u001b[0m' },
    ]);
    (window as any).__TAURI__ = { core: { invoke } };

    const received = vi.fn();
    const unsub = await subscribeRuntimeEvents(received, vi.fn());
    emitRuntimeLog({ sequence: 2, profileId: 'p1', timestamp: '2026-09-04 20:18:59', level: 'info', message: '\u001b[31mconnected\u001b[0m' });

    expect(received).toHaveBeenCalledWith(expect.objectContaining({ message: 'connected' }));
    expect(await getRuntimeLogs('p1')).toEqual([
      { sequence: 1, profileId: 'p1', timestamp: '2026-09-04 20:18:58', level: 'info', message: 'proxy success' },
    ]);
    await unsub();
  });

  it('stripAnsiEscapeSequences 兜底移除单字符 ESC 序列（如 ESC 7/8）与孤立 ESC', () => {
    expect(sanitizeRuntimeText('\u001b7saved\u001b8')).toBe('saved');
    expect(sanitizeRuntimeText('\u001b')).toBe('');
    expect(sanitizeRuntimeText('prefix\u001b')).toBe('prefix');
  });

  it('桌面端启动与停止向 Tauri IPC 发送严格受控参数', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === 'start_profile') {
        return Promise.resolve({ accepted: true, pid: 4321 });
      }
      if (cmd === 'stop_profile') {
        return Promise.resolve({ accepted: true });
      }
      return Promise.resolve({});
    });

    (window as any).__TAURI__ = {
      core: {
        invoke: mockInvoke,
      },
    };

    const startRes = await startProfileInstance(mockProfile, mockCore);
    expect(startRes).toEqual({ accepted: true, pid: 4321 });
    expect(mockInvoke).toHaveBeenCalledWith('start_profile', {
      profileId: 'profile_1',
      profileType: 'frpc',
      tomlContent: mockProfile.rawToml,
      corePath: mockCore.path,
    });

    const stopRes = await stopProfileInstance('profile_1');
    expect(stopRes).toEqual({ accepted: true });
    expect(mockInvoke).toHaveBeenCalledWith('stop_profile', {
      profileId: 'profile_1',
    });
  });

  it('桌面端核心下载保留官方资产身份，并将镜像选择独立传给 Tauri', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    const mockInvoke = vi.fn().mockResolvedValue({
      success: false,
      exePath: '',
      targetDir: 'D:/frp',
      sizeBytes: 0,
      version: 'v0.61.1',
      os: 'windows',
      arch: 'amd64',
    });
    (window as any).__TAURI__ = { core: { invoke: mockInvoke } };

    await downloadAndExtractCore({
      releaseTag: 'v0.61.1',
      assetName: 'frp_0.61.1_windows_amd64.zip',
      mirror: 'ghproxy',
      targetDir: 'D:/frp',
      version: 'v0.61.1',
      targetOs: 'windows',
      targetArch: 'amd64',
    });

    expect(mockInvoke).toHaveBeenCalledWith('download_and_extract_core', {
      releaseTag: 'v0.61.1',
      assetName: 'frp_0.61.1_windows_amd64.zip',
      mirror: 'ghproxy',
      targetDir: 'D:/frp',
      version: 'v0.61.1',
      targetOs: 'windows',
      targetArch: 'amd64',
    });
  });

  it('桌面端下载任务使用严格请求契约，并可订阅进度事件', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    const mockInvoke = vi.fn()
      .mockResolvedValueOnce({ taskId: 'core-1', phase: 'downloading' })
      .mockResolvedValueOnce([]);
    (window as any).__TAURI__ = { core: { invoke: mockInvoke } };
    const listener = vi.fn();

    await startCoreDownload({
      releaseTag: 'v0.71.0', assetName: 'frp_0.71.0_windows_amd64.zip', mirror: 'official',
      targetDir: 'D:/frp', targetOs: 'windows', targetArch: 'amd64',
    });
    await listCoreDownloadTasks();
    const stop = await subscribeCoreDownloadProgress(listener);
    eventHandlers.get('core-download-progress')?.({
      event: 'core-download-progress', id: 3,
      payload: { taskId: 'core-1', phase: 'extracting', extractedEntries: 4, totalEntries: 7 },
    });

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'start_core_download', {
      request: expect.objectContaining({ releaseTag: 'v0.71.0', targetArch: 'amd64' }),
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'list_core_download_tasks');
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ phase: 'extracting', extractedEntries: 4 }));
    await stop();
  });

  it('方案机密只经桌面 IPC 写入和读取系统凭据库', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    const mockInvoke = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('{"rawToml":"[auth]\\ntoken = \\"secret\\""}');
    (window as any).__TAURI__ = { core: { invoke: mockInvoke } };

    await storeProfileSecret('frp-gui/profile/p1', '{"rawToml":"secret"}');
    await expect(loadProfileSecret('frp-gui/profile/p1')).resolves.toContain('rawToml');

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'store_profile_secret', {
      reference: 'frp-gui/profile/p1', secret: '{"rawToml":"secret"}',
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'load_profile_secret', {
      reference: 'frp-gui/profile/p1',
    });
  });

  it('桌面端仅将受支持的设置和显式退出请求发送给原生层', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    const mockInvoke = vi.fn().mockResolvedValue(undefined);
    (window as any).__TAURI__ = { core: { invoke: mockInvoke } };

    await syncAppSettings({
      closeBehavior: 'hide_to_tray',
      launchBehavior: 'show_window',
      confirmExitWhenRunning: true,
      profileSort: 'pinned_updated',
    });
    await exitDesktopApp();

    expect(mockInvoke).toHaveBeenNthCalledWith(1, 'update_app_settings', {
      settings: {
        closeBehavior: 'hide_to_tray',
        launchBehavior: 'show_window',
        confirmExitWhenRunning: true,
        profileSort: 'pinned_updated',
      },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, 'exit_desktop_app');
  });

  it('浏览器预览阻断核心下载，且绝不调用 Vite 下载中间件', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(false);
    (window as any).__MOCK_TAURI_ENV__ = false;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    await expect(downloadAndExtractCore({
      releaseTag: 'v0.61.1',
      assetName: 'frp_0.61.1_windows_amd64.zip',
      mirror: 'ghproxy',
      targetDir: 'D:/frp',
      version: 'v0.61.1',
      targetOs: 'windows',
      targetArch: 'amd64',
    })).resolves.toEqual(expect.objectContaining({
      success: false,
      error: '浏览器预览不能下载本机 FRP 核心，请在 FRP-GUI 桌面端操作',
    }));

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('单例桥接：多次调用 subscribeRuntimeEvents 仅注册一次原生监听，各订阅者独立取消，最后全部取消时恰好调用一次原生 unlisten', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    (window as any).__TAURI__ = { core: { invoke: vi.fn() } };

    const unlistenLog = vi.fn();
    const unlistenState = vi.fn();
    mockTauriListen.mockImplementation((eventName: string, handler: any) => {
      eventHandlers.set(eventName, handler);
      return Promise.resolve(eventName === 'frp-runtime-log' ? unlistenLog : unlistenState);
    });

    const logListenerA = vi.fn();
    const stateListenerA = vi.fn();
    const logListenerB = vi.fn();
    const stateListenerB = vi.fn();

    const unsubA = await subscribeRuntimeEvents(logListenerA, stateListenerA);
    const unsubB = await subscribeRuntimeEvents(logListenerB, stateListenerB);

    // 两次订阅后，mockTauriListen 总调用次数严格为 2（log 和 state 各 1 次）
    expect(mockTauriListen).toHaveBeenCalledTimes(2);

    // 两位订阅者均收到事件
    emitRuntimeLog({ sequence: 1, profileId: 'p1', level: 'info', message: 'hello', timestamp: '12:00:00' });
    emitRuntimeState({ profileId: 'p1', status: 'running', timestamp: 1234 });

    expect(logListenerA).toHaveBeenCalledTimes(1);
    expect(logListenerB).toHaveBeenCalledTimes(1);
    expect(stateListenerA).toHaveBeenCalledTimes(1);
    expect(stateListenerB).toHaveBeenCalledTimes(1);

    // 先取消 A，原生 unlisten 绝不应该被调用
    await unsubA();
    expect(unlistenLog).not.toHaveBeenCalled();
    expect(unlistenState).not.toHaveBeenCalled();

    // B 仍能收到后续事件，而 A 不再收到
    emitRuntimeLog({ sequence: 2, profileId: 'p1', level: 'info', message: 'second event', timestamp: '12:00:01' });
    expect(logListenerA).toHaveBeenCalledTimes(1);
    expect(logListenerB).toHaveBeenCalledTimes(2);

    // 最后取消 B，此时每个原生 unlisten 恰好被调用一次
    await unsubB();
    expect(unlistenLog).toHaveBeenCalledTimes(1);
    expect(unlistenState).toHaveBeenCalledTimes(1);
  });

  it('纵深防御：对日志 message 和状态 errorMessage 进行安全脱敏与 4 KiB 截断，LogEntry.raw 仅基于已脱敏内容', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    (window as any).__TAURI__ = { core: { invoke: vi.fn() } };

    const capturedLogs: any[] = [];
    const unsubLegacy = subscribeLogs((log) => capturedLogs.push(log));

    const logListener = vi.fn();
    const stateListener = vi.fn();
    const unsub = await subscribeRuntimeEvents(logListener, stateListener);

    const sensitiveMessage = [
      'connecting with token = super_secret_token_123',
      'db password: "ultra_secret_password_456"',
      'auth secret_key=\'top_secret_key_789\'',
      'header Authorization: Bearer secret_bearer_token_abc',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA0Y3J...',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');

    emitRuntimeLog({
      sequence: 1,
      profileId: 'profile_sec',
      level: 'info',
      message: sensitiveMessage,
      timestamp: '2026-09-03 12:00:00',
    });

    const sensitiveErrorMessage = 'login failed: token = leaked_error_token and -----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNza...\n-----END OPENSSH PRIVATE KEY-----';
    emitRuntimeState({
      profileId: 'profile_sec',
      status: 'error',
      errorMessage: sensitiveErrorMessage,
      timestamp: 12345,
    });

    // 验证 secrets 没有泄露
    const secrets = [
      'super_secret_token_123',
      'ultra_secret_password_456',
      'top_secret_key_789',
      'secret_bearer_token_abc',
      'MIIEowIBAAKCAQEA0Y3J',
      'leaked_error_token',
      'b3BlbnNza',
    ];

    for (const secret of secrets) {
      expect(JSON.stringify(logListener.mock.calls)).not.toContain(secret);
      expect(JSON.stringify(stateListener.mock.calls)).not.toContain(secret);
      expect(JSON.stringify(capturedLogs)).not.toContain(secret);
    }

    // 验证 LogEntry.raw 是基于脱敏后的 message 生成
    expect(capturedLogs.length).toBe(1);
    expect(capturedLogs[0].raw).toContain('******');
    expect(capturedLogs[0].raw).not.toContain('super_secret_token_123');

    // 验证 4 KiB 截断限制
    const hugeMessage = 'A'.repeat(5000);
    emitRuntimeLog({
      sequence: 2,
      profileId: 'profile_huge',
      level: 'debug',
      message: hugeMessage,
      timestamp: '2026-09-03 12:00:02',
    });

    const lastLogCall = logListener.mock.calls[logListener.mock.calls.length - 1][0];
    expect(lastLogCall.message.length).toBeLessThanOrEqual(4096);

    await unsub();
    unsubLegacy();
  });

  it('stopProfileInstance 拒绝既无 accepted 也无 success 的畸形响应，返回明确的固定错误', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    (window as any).__MOCK_TAURI_ENV__ = true;
    (window as any).__TAURI__ = {
      core: {
        invoke: vi.fn().mockResolvedValue({}), // 畸形响应：既没有 accepted 也没有 success
      },
    };

    const res = await stopProfileInstance('profile_1');
    expect(res.accepted).toBe(false);
    expect(res.error).toBe('停止 FRPC 实例失败：未收到有效的停止确认');
  });

  describe('Task 1: inspectLocalFrpcCore and pickCoreFileNative', () => {
    it('inspectLocalFrpcCore 在普通浏览器环境下直接阻断并返回说明', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(false);
      (window as any).__MOCK_TAURI_ENV__ = false;

      const res = await inspectLocalFrpcCore('C:\\frp\\frpc.exe');
      expect(res).toEqual({
        version: '',
        error: '浏览器预览不能校验本机 FRPC 核心',
      });
    });

    it('inspectLocalFrpcCore 在桌面环境下调用 inspect_frpc_core 成功返回版本', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(true);
      (window as any).__MOCK_TAURI_ENV__ = true;
      const mockInvoke = vi.fn().mockResolvedValue({ version: 'v0.71.0' });
      (window as any).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      const res = await inspectLocalFrpcCore('D:\\frp\\frpc.exe');
      expect(res).toEqual({ version: 'v0.71.0' });
      expect(mockInvoke).toHaveBeenCalledWith('inspect_frpc_core', {
        filePath: 'D:\\frp\\frpc.exe',
      });
    });

    it('inspectLocalFrpcCore 在 Tauri IPC 异常时返回稳定友好的错误提示', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(true);
      (window as any).__MOCK_TAURI_ENV__ = true;
      const mockInvoke = vi.fn().mockRejectedValue(new Error('core not found'));
      (window as any).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      const res = await inspectLocalFrpcCore('D:\\frp\\frpc.exe');
      expect(res).toEqual({
        version: '',
        error: '无法校验本地 FRPC 核心，请重新选择 frpc.exe',
      });
    });

    it('pickCoreFileNative 在桌面环境下 Tauri 命令异常时直接返回 null，绝不向 /api/dev/pick-file 发起网络请求', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(true);
      (window as any).__MOCK_TAURI_ENV__ = true;
      const mockInvoke = vi.fn().mockRejectedValue(new Error('Tauri dialog error'));
      (window as any).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      const selected = await pickCoreFileNative();
      expect(selected).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('pick_core_file');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('核心目录扫描', () => {
    it('桌面端将选择的目录以白名单参数传给 scan_local_frpc_cores', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(true);
      (window as any).__MOCK_TAURI_ENV__ = true;
      const mockInvoke = vi.fn().mockResolvedValue({ recognized: [], skipped: [] });
      (window as any).__TAURI__ = { core: { invoke: mockInvoke } };

      await expect(scanLocalFrpcCores('D:\\frp-archives')).resolves.toEqual({ recognized: [], skipped: [] });
      expect(mockInvoke).toHaveBeenCalledWith('scan_local_frpc_cores', { directoryPath: 'D:\\frp-archives' });
    });

    it('浏览器预览阻断目录扫描，不调用目录选择或 IPC', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(false);
      (window as any).__MOCK_TAURI_ENV__ = false;
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await expect(scanLocalFrpcCores('D:\\frp-archives')).resolves.toMatchObject({
        recognized: [],
        error: '浏览器预览不能扫描本机 FRP 文件夹，请在 FRP-GUI 桌面端操作',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(pickDirectoryNative).toBeDefined();
    });
  });

  describe('官方压缩包选择与导入', () => {
    it('桌面端正常唤起 pick_archive_file 并返回文件路径', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(true);
      (window as any).__MOCK_TAURI_ENV__ = true;
      const mockInvoke = vi.fn().mockResolvedValue('D:\\Downloads\\frp_0.61.1_windows_amd64.zip');
      (window as any).__TAURI__ = { core: { invoke: mockInvoke } };

      const result = await pickArchiveFileNative();
      expect(result).toBe('D:\\Downloads\\frp_0.61.1_windows_amd64.zip');
      expect(mockInvoke).toHaveBeenCalledWith('pick_archive_file');
    });

    it('桌面端调用 importLocalFrpcArchive 发起安全解压与验真导入', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(true);
      (window as any).__MOCK_TAURI_ENV__ = true;
      const mockCore = {
        path: 'C:\\Users\\AppData\\cores\\frp_0.61.1\\frpc.exe',
        version: 'v0.61.1',
        os: 'windows',
        arch: 'amd64',
        sizeBytes: 15400000,
      };
      const mockInvoke = vi.fn().mockResolvedValue(mockCore);
      (window as any).__TAURI__ = { core: { invoke: mockInvoke } };

      const res = await importLocalFrpcArchive('D:\\Downloads\\frp_0.61.1_windows_amd64.zip');
      expect(res).toEqual(mockCore);
      expect(mockInvoke).toHaveBeenCalledWith('import_local_frpc_archive', {
        archivePath: 'D:\\Downloads\\frp_0.61.1_windows_amd64.zip',
      });
    });

    it('浏览器非 Tauri 环境调用 importLocalFrpcArchive 抛出明确阻断异常', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(false);
      (window as any).__MOCK_TAURI_ENV__ = false;

      await expect(importLocalFrpcArchive('D:\\test.zip')).rejects.toThrow(
        '浏览器预览不能解压与导入本机 FRP 压缩包'
      );
    });
  });

  describe('Task 2: startProfileInstance structured failureKind handling', () => {
    it('正确白名单映射 core_invalid, startup, early_exit 失败类别', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(true);
      (window as any).__MOCK_TAURI_ENV__ = true;

      const kinds = ['core_invalid', 'startup', 'early_exit'] as const;
      for (const kind of kinds) {
        const mockInvoke = vi.fn().mockResolvedValue({
          accepted: false,
          error: `fail on ${kind}`,
          failureKind: kind,
        });
        (window as any).__TAURI__ = {
          core: {
            invoke: mockInvoke,
          },
        };

        const result = await startProfileInstance(mockProfile, mockCore);
        expect(result.accepted).toBe(false);
        expect(result.error).toBe(`fail on ${kind}`);
        expect(result.failureKind).toBe(kind);
      }
    });

    it('对未知 failureKind 或额外后端字段进行严格过滤，仅保留白名单契约字段', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(true);
      (window as any).__MOCK_TAURI_ENV__ = true;

      const mockInvoke = vi.fn().mockResolvedValue({
        accepted: false,
        error: 'something went wrong',
        failureKind: 'unregistered_hazard',
        extraInternalPath: 'C:\\Users\\admin\\secret.exe',
        anotherSecret: 12345,
      });
      (window as any).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      const result = await startProfileInstance(mockProfile, mockCore);
      expect(result.accepted).toBe(false);
      expect(result.error).toBe('something went wrong');
      // 未知 failureKind 不应被透传
      expect(result.failureKind).toBeUndefined();
      // 任意非白名单字段绝不透传
      expect((result as any).extraInternalPath).toBeUndefined();
      expect((result as any).anotherSecret).toBeUndefined();
    });

    it('启动成功时 failureKind 为 undefined 且仅透传 accepted 与 pid', async () => {
      vi.mocked(isTauriEnv).mockReturnValue(true);
      (window as any).__MOCK_TAURI_ENV__ = true;

      const mockInvoke = vi.fn().mockResolvedValue({
        accepted: true,
        pid: 1234,
        failureKind: null,
      });
      (window as any).__TAURI__ = {
        core: {
          invoke: mockInvoke,
        },
      };

      const result = await startProfileInstance(mockProfile, mockCore);
      expect(result.accepted).toBe(true);
      expect(result.pid).toBe(1234);
      expect(result.error).toBeUndefined();
      expect(result.failureKind).toBeUndefined();
    });
  });

  describe('fetchGitHubReleases downloadCount 汇总与解析', () => {
    it('成功调用 GitHub API 时能够正确计算每个 Release 资产的 downloadCount 总和', async () => {
      const mockReleases = [
        {
          tag_name: 'v0.71.0',
          name: 'Release v0.71.0',
          published_at: '2026-08-14T00:00:00Z',
          assets: [
            { name: 'frp_0.71.0_windows_amd64.zip', size: 1000, download_count: 3200, browser_download_url: 'https://example.com/win' },
            { name: 'frp_0.71.0_linux_amd64.tar.gz', size: 1000, download_count: 1800, browser_download_url: 'https://example.com/linux' },
          ],
        },
      ];

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockReleases),
      } as any);

      try {
        const res = await fetchGitHubReleases();
        expect(res).toHaveLength(1);
        expect(res[0].tag).toBe('v0.71.0');
        expect(res[0].downloadCount).toBe(5000);
        expect(res[0].assets[0].downloadCount).toBe(3200);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('API 请求受限或失败时，使用备用静态列表并附带默认 downloadCount', async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Rate limited'));

      try {
        const res = await fetchGitHubReleases();
        expect(res.length).toBeGreaterThan(0);
        expect(res[0].downloadCount).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
