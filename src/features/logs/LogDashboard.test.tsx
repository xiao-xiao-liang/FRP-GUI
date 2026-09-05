import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogDashboard } from './LogDashboard';
import { isTauriEnv } from '../../services/ipc';
import { makeProfile } from '../../test/fixtures';

vi.mock('../../services/ipc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/ipc')>();
  return {
    ...actual,
    isTauriEnv: vi.fn(),
  };
});

describe('LogDashboard (日志监控组件)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('浏览器预览显示桌面端说明，且不渲染实时流或模拟日志', () => {
    vi.mocked(isTauriEnv).mockReturnValue(false);
    render(<LogDashboard profiles={[makeProfile()]} logs={[]} onClearLogs={vi.fn()} />);

    expect(screen.getByText('实时运行日志仅可在桌面版应用中查看')).toBeInTheDocument();
    expect(
      screen.getByText(/浏览器预览不会启动 FRPC，也不会生成模拟日志。请使用 pnpm tauri dev 打开的桌面窗口。/)
    ).toBeInTheDocument();
    expect(screen.queryByText('实时流')).not.toBeInTheDocument();
    expect(screen.queryByText(/login to server success/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('搜索日志...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /暂停/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /导出/ })).not.toBeInTheDocument();
  });

  it('桌面端正常渲染工具栏与实时流标识', () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    render(<LogDashboard profiles={[makeProfile()]} logs={[]} onClearLogs={vi.fn()} />);

    expect(screen.getByText('实时日志监控')).toBeInTheDocument();
    expect(screen.getByText('实时流')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索日志...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /暂停/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /导出/ })).toBeInTheDocument();
  });

  it('桌面端展示应用缓存的日志并将清空委托给上层', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    const onClearLogs = vi.fn();
    render(<LogDashboard
      profiles={[makeProfile({ id: 'p1' })]}
      logs={[{ id: 'l1', sequence: 1, profileId: 'p1', profileName: 'p1', timestamp: '10:00:00', level: 'warn', message: 'port already used', raw: 'port already used' }]}
      onClearLogs={onClearLogs}
    />);
    expect(screen.getByText('port already used')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByTitle('清空日志流'));
    expect(onClearLogs).toHaveBeenCalledOnce();
  });

  it('默认自动换行，关闭后只让日志容器横向滚动', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    const user = userEvent.setup();
    render(<LogDashboard
      profiles={[makeProfile({ id: 'p1' })]}
      logs={[{ id: 'l1', sequence: 1, profileId: 'p1', profileName: 'p1', timestamp: '20:18:58', level: 'info', message: 'C:/very-long-path/'.repeat(20), raw: 'long' }]}
      onClearLogs={vi.fn()}
    />);

    const toggle = screen.getByRole('button', { name: '自动换行' });
    const viewport = screen.getByTestId('runtime-log-viewport');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(viewport).toHaveClass('overflow-x-hidden');
    expect(screen.getByTestId('runtime-log-message-l1')).toHaveClass('whitespace-pre-wrap');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(viewport).toHaveClass('overflow-x-auto');
    expect(screen.getByTestId('runtime-log-message-l1')).toHaveClass('whitespace-pre');
  });

  it('点击暂停后冻结日志快照，父级传入新日志时不更新显示；恢复后显示最新日志', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    const user = userEvent.setup();
    const log1 = {
      id: 'l1',
      sequence: 1,
      profileId: 'p1',
      profileName: 'p1',
      timestamp: '10:00:00',
      level: 'info' as const,
      message: 'first log message',
      raw: 'first log message',
    };
    const log2 = {
      id: 'l2',
      sequence: 2,
      profileId: 'p1',
      profileName: 'p1',
      timestamp: '10:00:01',
      level: 'info' as const,
      message: 'second log message after pause',
      raw: 'second log message after pause',
    };

    const { rerender } = render(
      <LogDashboard
        profiles={[makeProfile({ id: 'p1' })]}
        logs={[log1]}
        onClearLogs={vi.fn()}
      />
    );
    expect(screen.getByText('first log message')).toBeInTheDocument();

    // 点击暂停按钮
    const pauseBtn = screen.getByRole('button', { name: /暂停/ });
    await user.click(pauseBtn);

    // 父级传入包含 log2 的新日志数组
    rerender(
      <LogDashboard
        profiles={[makeProfile({ id: 'p1' })]}
        logs={[log1, log2]}
        onClearLogs={vi.fn()}
      />
    );

    // 此时日志处于暂停冻结状态，log2 绝不应显示在界面中
    expect(screen.queryByText('second log message after pause')).not.toBeInTheDocument();

    // 再次点击按钮恢复实时流
    const resumeBtn = screen.getByRole('button', { name: /已暂停/ });
    await user.click(resumeBtn);

    // 恢复后 log2 立即呈现在界面中
    expect(await screen.findByText('second log message after pause')).toBeInTheDocument();
  });

  it('TRACE 筛选只显示 trace 级别日志', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    const user = userEvent.setup();
    render(<LogDashboard profiles={[makeProfile({ id: 'p1' })]} onClearLogs={vi.fn()} logs={[
      { id: 'info-1', sequence: 1, profileId: 'p1', profileName: 'p1', timestamp: '10:00:00.001', level: 'info', message: 'daily status', raw: 'daily status' },
      { id: 'trace-1', sequence: 2, profileId: 'p1', profileName: 'p1', timestamp: '10:00:00.002', level: 'trace', message: 'protocol frame', raw: 'protocol frame' },
    ]} />);

    await user.click(screen.getByRole('button', { name: 'TRACE' }));
    expect(screen.queryByText('daily status')).not.toBeInTheDocument();
    expect(screen.getByText('protocol frame')).toBeInTheDocument();
  });
});
