import React, { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrpcRuntimeLogEvent, FrpcRuntimeStateEvent, Profile, RuntimeTrafficSample } from './types/frp';
import { makeCore, makeProfile } from './test/fixtures';
import { AppLayout } from './App';
import { feishuToast } from './components/ui/FeishuToast';
import { getRuntimeLogs, getRuntimeStates, getRuntimeTraffic, startProfileInstance, storeProfileSecret, subscribeRuntimeEvents } from './services/ipc';
import { summarizeRuntimeTraffic, type RuntimeTrafficState } from './services/runtime-traffic';

const runtime = vi.hoisted(() => ({
  log: undefined as ((event: FrpcRuntimeLogEvent) => void) | undefined,
  state: undefined as ((event: FrpcRuntimeStateEvent) => void) | undefined,
  traffic: undefined as ((event: RuntimeTrafficSample) => void) | undefined,
}));

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => vi.fn()) }));
vi.mock('./services/ipc', async (importOriginal) => ({
  ...await importOriginal<typeof import('./services/ipc')>(),
  isTauriEnv: () => true,
  subscribeRuntimeEvents: vi.fn(async (log, state, traffic) => {
    runtime.log = log;
    runtime.state = state;
    runtime.traffic = traffic;
    return vi.fn();
  }),
  getRuntimeStates: vi.fn(async () => []),
  getRuntimeLogs: vi.fn(async () => []),
  getRuntimeTraffic: vi.fn(async () => []),
  startProfileInstance: vi.fn(),
  stopProfileInstance: vi.fn(async () => ({ accepted: true })),
  storeProfileSecret: vi.fn(async () => undefined),
  loadProfileSecret: vi.fn(async () => null),
  syncAppSettings: vi.fn(async () => undefined),
}));
vi.mock('./components/ui/FeishuToast', () => ({
  feishuToast: { warning: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn() },
  FeishuToastContainer: () => null,
}));
vi.mock('./features/profiles/ProfileList', () => ({
  ProfileList: ({ profiles, onToggle, traffic = {} }: { profiles: Profile[]; onToggle: (profile: Profile) => void; traffic?: RuntimeTrafficState }) => (
    <div>
      <output data-testid="runtime-traffic">{JSON.stringify(summarizeRuntimeTraffic(profiles, traffic, Date.now()))}</output>
      {profiles.map((profile) => (
        <div key={profile.id}>
          <button onClick={() => onToggle(profile)}>启动 {profile.name}</button>
          <output data-testid={profile.id}>{JSON.stringify({ status: profile.status, ...profile.stats })}</output>
        </div>
      ))}
    </div>
  ),
}));
vi.mock('./features/logs/LogDashboard', () => ({ LogDashboard: () => null }));
vi.mock('./features/cores/CoreManagerPage', () => ({ CoreManagerPage: () => null }));
vi.mock('./features/servers/ServerNodeManagerPage', () => ({ ServerNodeManagerPage: () => null }));
vi.mock('./features/settings/SettingsPage', () => ({ SettingsPage: () => null }));
vi.mock('./features/editor/ConfigEditorModal', () => ({ ConfigEditorModal: () => null }));
vi.mock('./features/sync/SyncModal', () => ({ SyncModal: () => null }));
vi.mock('./features/diagnostics/DiagnosticModal', () => ({ DiagnosticModal: () => null }));

const profile = makeProfile({ id: 'feedback-profile', name: '办公 SSH', coreId: 'core-0611' });

function log(message: string, level: FrpcRuntimeLogEvent['level'] = 'error', sequence = 1): FrpcRuntimeLogEvent {
  return { profileId: profile.id, sequence, timestamp: new Date().toISOString(), level, message };
}

async function openApp() {
  render(<StrictMode><MemoryRouter initialEntries={['/profiles']}><AppLayout /></MemoryRouter></StrictMode>);
  await waitFor(() => expect(subscribeRuntimeEvents).toHaveBeenCalled());
  await act(async () => undefined);
}

function currentProfileState() {
  return JSON.parse(screen.getByTestId(profile.id).textContent || '{}');
}

function currentTraffic() {
  return JSON.parse(screen.getByTestId('runtime-traffic').textContent || '{}');
}

function trafficSample(overrides: Partial<RuntimeTrafficSample> = {}): RuntimeTrafficSample {
  return {
    profileId: profile.id, runId: 'run-current', startedAt: Date.now() - 1_000, sequence: 2,
    timestamp: Date.now(), availability: 'available', uploadBytesPerSecond: 1_500, downloadBytesPerSecond: 2_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runtime.log = undefined;
  runtime.state = undefined;
  runtime.traffic = undefined;
  localStorage.clear();
  localStorage.setItem('frp_gui_profiles', JSON.stringify([profile]));
  localStorage.setItem('frp_gui_cores', JSON.stringify([makeCore()]));
  vi.mocked(getRuntimeStates).mockResolvedValue([]);
  vi.mocked(getRuntimeLogs).mockResolvedValue([]);
  vi.mocked(getRuntimeTraffic).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('连接问题反馈', () => {
  it('先订阅流量事件再读取快照，迟到的旧运行快照不覆盖新运行事件', async () => {
    const timestamp = Date.now();
    vi.mocked(getRuntimeStates).mockResolvedValue([{ profileId: profile.id, status: 'running', pid: 123, timestamp }]);
    let resolveSnapshot: (samples: RuntimeTrafficSample[]) => void = () => undefined;
    vi.mocked(getRuntimeTraffic).mockImplementation(() => {
      expect(runtime.traffic).toBeTypeOf('function');
      return new Promise((resolve) => { resolveSnapshot = resolve; });
    });
    await openApp();
    expect(getRuntimeTraffic).toHaveBeenCalledTimes(1);
    await act(async () => {
      runtime.traffic?.(trafficSample({ startedAt: timestamp, sequence: 4 }));
      resolveSnapshot([trafficSample({ runId: 'old-run', startedAt: timestamp - 5_000, sequence: 99, uploadBytesPerSecond: 99 })]);
    });
    expect(currentTraffic().uploadBytesPerSecond).toBe(1_500);
  });

  it('每秒流量更新不修改方案统计、不写 localStorage 或凭据库', async () => {
    await openApp();
    await act(async () => { runtime.state?.({ profileId: profile.id, status: 'running', pid: 123, timestamp: Date.now() }); });
    const before = currentProfileState();
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    vi.mocked(storeProfileSecret).mockClear();
    try {
      const first = trafficSample();
      await act(async () => { runtime.traffic?.(first); });
      await act(async () => { runtime.traffic?.({ ...first, sequence: 3, uploadBytesPerSecond: 42 }); });
      expect(currentTraffic().uploadBytesPerSecond).toBe(42);
      expect(currentProfileState()).toEqual(before);
      expect(storageWrite).not.toHaveBeenCalled();
      expect(storeProfileSecret).not.toHaveBeenCalled();
    } finally {
      storageWrite.mockRestore();
    }
  });

  it('停止和重新启动时清空旧速率，迟到的旧 runId 不会复活', async () => {
    await openApp();
    const startedAt = Date.now() - 1_000;
    await act(async () => {
      runtime.state?.({ profileId: profile.id, status: 'running', pid: 123, timestamp: startedAt });
      runtime.traffic?.(trafficSample({ startedAt }));
    });
    expect(currentTraffic().uploadBytesPerSecond).toBe(1_500);
    const restartAt = Date.now();
    await act(async () => {
      runtime.state?.({ profileId: profile.id, status: 'stopped', timestamp: restartAt });
      runtime.state?.({ profileId: profile.id, status: 'starting', timestamp: restartAt });
      runtime.state?.({ profileId: profile.id, status: 'running', pid: 456, timestamp: restartAt });
      runtime.traffic?.(trafficSample({ startedAt, sequence: 99 }));
    });
    expect(currentTraffic().uploadBytesPerSecond).toBeNull();
    await act(async () => { runtime.traffic?.(trafficSample({ runId: 'run-new', startedAt: restartAt, sequence: 1, uploadBytesPerSecond: 42 })); });
    expect(currentTraffic().uploadBytesPerSecond).toBe(42);
  });

  it('启动早退的事件与命令只通知一次 WARN，并保留具体失败日志', async () => {
    const reason = 'start error: proxy ssh: port already used';
    vi.mocked(startProfileInstance).mockImplementation(async () => {
      runtime.log?.(log(reason));
      runtime.state?.({ profileId: profile.id, status: 'error', timestamp: Date.now(), errorMessage: 'FRPC 在启动确认阶段退出，请查看桌面端真实日志' });
      return { accepted: false, error: 'FRPC 在启动确认阶段退出，请查看桌面端真实日志', failureKind: 'early_exit' };
    });
    await openApp();
    await userEvent.click(screen.getByRole('button', { name: '启动 办公 SSH' }));
    await waitFor(() => expect(feishuToast.warning).toHaveBeenCalledTimes(1));
    expect(feishuToast.error).not.toHaveBeenCalled();
    expect(currentProfileState().lastError).toBe(reason);
    expect(String(vi.mocked(feishuToast.warning).mock.calls[0][0])).toMatch(/端口/);
  });

  it('失败快照补足实时事件遗漏的原因，提示和持久化均脱敏', async () => {
    vi.mocked(startProfileInstance).mockImplementation(async () => {
      vi.mocked(getRuntimeLogs).mockResolvedValue([log('login failed: token = "private-token" does not match')]);
      return { accepted: false, error: 'FRPC 在启动确认阶段退出，请查看桌面端真实日志', failureKind: 'early_exit' };
    });
    await openApp();
    await userEvent.click(screen.getByRole('button', { name: '启动 办公 SSH' }));
    await waitFor(() => expect(feishuToast.warning).toHaveBeenCalledTimes(1));
    expect(currentProfileState().lastError).toContain('login failed');
    expect(currentProfileState().lastError).not.toContain('private-token');
    expect(localStorage.getItem('frp_gui_profiles')).not.toContain('private-token');
    expect(JSON.stringify(vi.mocked(feishuToast.warning).mock.calls)).not.toContain('private-token');
  });

  it('启动进程成功但规则报错时保留运行状态，并通知一次具体警告', async () => {
    vi.mocked(startProfileInstance).mockImplementation(async () => {
      runtime.log?.(log('start error: proxy ssh: port already used'));
      runtime.state?.({ profileId: profile.id, status: 'running', pid: 123, timestamp: Date.now() });
      return { accepted: true, pid: 123 };
    });
    await openApp();
    await userEvent.click(screen.getByRole('button', { name: '启动 办公 SSH' }));
    await waitFor(() => expect(currentProfileState().status).toBe('running'));
    expect(currentProfileState().lastWarning).toContain('port already used');
    expect(feishuToast.warning).toHaveBeenCalledTimes(1);
  });

  it('停止后清除警告，补拉旧日志不会复活待处理问题或重复通知', async () => {
    await openApp();
    await act(async () => {
      runtime.state?.({ profileId: profile.id, status: 'running', pid: 123, timestamp: Date.now() });
    });
    await act(async () => { runtime.log?.(log('login to server failed', 'warn')); });
    expect(currentProfileState().lastWarning).toContain('login');
    await act(async () => {
      runtime.state?.({ profileId: profile.id, status: 'stopped', timestamp: Date.now() });
      runtime.log?.(log('login to server failed', 'warn'));
    });
    expect(currentProfileState().status).toBe('stopped');
    expect(currentProfileState().lastWarning).toBeUndefined();
  });

  it('启动后异常退出使用最新具体日志，相同状态事件不重复通知', async () => {
    await openApp();
    await act(async () => {
      runtime.state?.({ profileId: profile.id, status: 'running', pid: 123, timestamp: Date.now() });
    });
    await act(async () => { runtime.log?.(log('dial tcp 127.0.0.1:7000: connect: connection refused')); });
    const state: FrpcRuntimeStateEvent = { profileId: profile.id, status: 'error', timestamp: Date.now(), errorMessage: 'FRPC 进程已意外退出' };
    await act(async () => { runtime.state?.(state); runtime.state?.(state); });
    expect(feishuToast.warning).toHaveBeenCalledTimes(1);
    expect(feishuToast.error).not.toHaveBeenCalled();
    expect(currentProfileState().lastError).toContain('connection refused');
  });

  it('明确的命令错误优先保留且不会把凭据写入提示或存储', async () => {
    vi.mocked(startProfileInstance).mockResolvedValue({ accepted: false, error: 'authentication failed: token="private-command-token"' });
    await openApp();
    await userEvent.click(screen.getByRole('button', { name: '启动 办公 SSH' }));
    await waitFor(() => expect(feishuToast.warning).toHaveBeenCalledTimes(1));
    expect(currentProfileState().lastError).toContain('authentication failed');
    expect(localStorage.getItem('frp_gui_profiles')).not.toContain('private-command-token');
    expect(JSON.stringify(vi.mocked(feishuToast.warning).mock.calls)).not.toContain('private-command-token');
  });

  it('新一轮启动失败不会引用上次运行的旧日志', async () => {
    const fallback = 'FRPC 在启动确认阶段退出，请查看桌面端真实日志';
    vi.mocked(startProfileInstance).mockImplementation(async () => {
      vi.mocked(getRuntimeLogs).mockResolvedValue([{ ...log('old port already used'), timestamp: new Date(Date.now() - 60000).toISOString() }]);
      return { accepted: false, error: fallback, failureKind: 'early_exit' };
    });
    await openApp();
    await userEvent.click(screen.getByRole('button', { name: '启动 办公 SSH' }));
    await waitFor(() => expect(feishuToast.warning).toHaveBeenCalledTimes(1));
    expect(currentProfileState().lastError).toBe(fallback);
    expect(currentProfileState().lastWarning).toBeUndefined();
  });

  it('命令已接受但随后的状态快照显示退出时仍给出一次警告', async () => {
    vi.mocked(startProfileInstance).mockImplementation(async () => {
      vi.mocked(getRuntimeStates).mockResolvedValue([{ profileId: profile.id, status: 'error', timestamp: Date.now(), errorMessage: 'FRPC 进程已意外退出' }]);
      return { accepted: true, pid: 123 };
    });
    await openApp();
    await userEvent.click(screen.getByRole('button', { name: '启动 办公 SSH' }));
    await waitFor(() => expect(feishuToast.warning).toHaveBeenCalledTimes(1));
    expect(currentProfileState().status).toBe('error');
    expect(currentProfileState().lastError).toContain('意外退出');
  });

  it('补拉日志期间才收到退出事件时仍通知一次警告', async () => {
    vi.mocked(startProfileInstance).mockImplementation(async () => {
      vi.mocked(getRuntimeStates).mockResolvedValue([{ profileId: profile.id, status: 'running', pid: 123, timestamp: Date.now() }]);
      vi.mocked(getRuntimeLogs).mockImplementation(async () => {
        runtime.state?.({ profileId: profile.id, status: 'error', timestamp: Date.now(), errorMessage: 'FRPC 进程已意外退出' });
        return [];
      });
      return { accepted: true, pid: 123 };
    });
    await openApp();
    await userEvent.click(screen.getByRole('button', { name: '启动 办公 SSH' }));
    await waitFor(() => expect(currentProfileState().status).toBe('error'));
    expect(feishuToast.warning).toHaveBeenCalledTimes(1);
    expect(currentProfileState().lastError).toContain('意外退出');
  });

  it('初始状态同步前收到的警告可由日志快照恢复', async () => {
    const warning = log('login to server failed', 'warn');
    vi.mocked(getRuntimeStates).mockImplementation(async () => {
      runtime.log?.(warning);
      return [{ profileId: profile.id, status: 'running', pid: 123, timestamp: Date.now() }];
    });
    vi.mocked(getRuntimeLogs).mockResolvedValue([warning]);
    await openApp();
    await waitFor(() => expect(currentProfileState().status).toBe('running'));
    expect(currentProfileState().lastWarning).toBe(warning.message);
    expect(feishuToast.warning).not.toHaveBeenCalled();
  });

  it('通用失败补拉多条日志时优先展示真正错误而非较早警告', async () => {
    vi.mocked(getRuntimeStates).mockResolvedValue([{ profileId: profile.id, status: 'error', timestamp: Date.now(), errorMessage: 'FRPC 进程已意外退出' }]);
    vi.mocked(getRuntimeLogs).mockResolvedValue([
      log('连接即将重试', 'warn'),
      log('authentication failed: token does not match', 'error', 2),
    ]);
    await openApp();
    await waitFor(() => expect(currentProfileState().status).toBe('error'));
    expect(currentProfileState().lastError).toContain('authentication failed');
    expect(feishuToast.warning).not.toHaveBeenCalled();
  });
});
