import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
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

    // 打开查找设置浮层并筛选 TRACE 级别
    await user.click(screen.getByTitle('查找设置'));
    const popoverTitle = screen.getByText('在以下日志等级范围内查找');
    const popover = popoverTitle.parentElement!;
    await user.click(within(popover).getByText('所有等级'));
    await user.click(within(popover).getByText('TRACE'));
    expect(screen.queryByText('daily status')).not.toBeInTheDocument();
    expect(screen.getByText('protocol frame')).toBeInTheDocument();
  });

  it('大容量日志列表使用虚拟滚动，将渲染的 DOM 数量控制在视口安全范围内且支持检索', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    const user = userEvent.setup();
    const mockLogs = Array.from({ length: 2000 }, (_, i) => ({
      id: `log-${i}`,
      sequence: i + 1,
      profileId: 'p1',
      profileName: 'p1',
      timestamp: `10:00:${String(i % 60).padStart(2, '0')}`,
      level: i === 1999 ? ('error' as const) : ('info' as const),
      message: i === 1999 ? 'critical error at line 1999' : `normal log message #${i}`,
      raw: i === 1999 ? 'critical error at line 1999' : `normal log message #${i}`,
    }));

    render(
      <LogDashboard
        profiles={[makeProfile({ id: 'p1' })]}
        logs={mockLogs}
        onClearLogs={vi.fn()}
      />
    );

    // 验证虚拟滚动：渲染出来的实际日志条目 DOM 节点数远小于总数（< 60），避免长列表卡死
    const renderedElements = screen.getAllByTestId(/runtime-log-message-/);
    expect(renderedElements.length).toBeLessThan(60);

    // 验证通过关键词检索可以精确定位到目标日志
    const searchInput = screen.getByPlaceholderText('搜索日志...');
    await user.type(searchInput, 'critical error');
    expect(await screen.findByText('critical error at line 1999')).toBeInTheDocument();
  });

  it('自动换行时按实际测得的可变行高定位，并保持虚拟渲染', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    const originalResizeObserver = globalThis.ResizeObserver;
    class MockResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(target: Element) {
        this.callback(
          [{ target, contentRect: { height: 84 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }

      disconnect() {}
      unobserve() {}
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

    try {
      const logs = Array.from({ length: 2000 }, (_, index) => ({
        id: `wrapped-${index}`,
        sequence: index + 1,
        profileId: 'p1',
        profileName: 'p1',
        timestamp: '10:00:00',
        level: 'info' as const,
        message: `这是一条会换行的长日志 ${'content '.repeat(30)}`,
        raw: 'wrapped log',
      }));
      render(<LogDashboard profiles={[makeProfile({ id: 'p1' })]} logs={logs} onClearLogs={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByTestId('runtime-log-list')).toHaveAttribute(
          'data-virtualization',
          'variable-height',
        );
        expect(Number.parseFloat(screen.getByTestId('runtime-log-list').style.height)).toBeGreaterThan(56000);
      });
      expect(screen.getAllByTestId(/runtime-log-message-/).length).toBeLessThan(60);
    } finally {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('点击错误/警告等统计指标徽标直接联动级别筛选', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    const user = userEvent.setup();
    render(
      <LogDashboard
        profiles={[makeProfile({ id: 'p1' })]}
        logs={[
          { id: 'l1', sequence: 1, profileId: 'p1', profileName: 'p1', timestamp: '10:00:00', level: 'info', message: 'normal info log', raw: 'normal info log' },
          { id: 'l2', sequence: 2, profileId: 'p1', profileName: 'p1', timestamp: '10:00:01', level: 'error', message: 'fatal connection failure', raw: 'fatal connection failure' },
        ]}
        onClearLogs={vi.fn()}
      />
    );

    // 默认展示全部日志
    expect(screen.getByText('normal info log')).toBeInTheDocument();
    expect(screen.getByText('fatal connection failure')).toBeInTheDocument();

    // 点击错误指标徽标
    const errorMetricBtn = screen.getByTitle('快速筛选 ERROR 级别');
    await user.click(errorMetricBtn);

    // 联动后仅显示错误日志
    expect(screen.queryByText('normal info log')).not.toBeInTheDocument();
    expect(screen.getByText('fatal connection failure')).toBeInTheDocument();
  });

  it('单选具体方案时隐藏行内方案标签以消除冗余视觉噪声', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    const user = userEvent.setup();
    const { rerender } = render(
      <LogDashboard
        profiles={[makeProfile({ id: 'p1', name: '我的服务' })]}
        logs={[
          { id: 'l1', sequence: 1, profileId: 'p1', profileName: '我的服务', timestamp: '10:00:00', level: 'info', message: 'log content 1', raw: 'raw 1' },
        ]}
        onClearLogs={vi.fn()}
      />
    );

    // 默认“全部方案”视图下显示方案标签
    expect(screen.getByText('我的服务')).toBeInTheDocument();

    // 传入指定 activeProfileId 或过滤单一方案
    rerender(
      <LogDashboard
        profiles={[makeProfile({ id: 'p1', name: '我的服务' })]}
        logs={[
          { id: 'l1', sequence: 1, profileId: 'p1', profileName: '我的服务', timestamp: '10:00:00', level: 'info', message: 'log content 1', raw: 'raw 1' },
        ]}
        onClearLogs={vi.fn()}
        activeProfileId="p1"
      />
    );

    // 单选方案后，行内不出现重复标签
    // 注意：方案下拉中仍有标签文字，但行内不应有独立的方案药丸
    const tagElements = screen.queryAllByText('我的服务');
    // 下拉框内包含 1 处，行内如果隐藏则总共只有 1 处
    expect(tagElements.length).toBe(1);
  });

  it('在飞书搜索框查找设置中以色彩胶囊形式展示并可多选过滤日志等级', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(true);
    const user = userEvent.setup();
    render(
      <LogDashboard
        profiles={[makeProfile({ id: 'p1' })]}
        logs={[
          { id: 'l1', sequence: 1, profileId: 'p1', profileName: 'p1', timestamp: '10:00:00', level: 'info', message: 'info log line', raw: 'info log line' },
          { id: 'l2', sequence: 2, profileId: 'p1', profileName: 'p1', timestamp: '10:00:01', level: 'warn', message: 'warn log line', raw: 'warn log line' },
          { id: 'l3', sequence: 3, profileId: 'p1', profileName: 'p1', timestamp: '10:00:02', level: 'error', message: 'error log line', raw: 'error log line' },
        ]}
        onClearLogs={vi.fn()}
      />
    );

    // 默认展示全部日志
    expect(screen.getByText('info log line')).toBeInTheDocument();
    expect(screen.getByText('warn log line')).toBeInTheDocument();
    expect(screen.getByText('error log line')).toBeInTheDocument();

    // 点击查找设置图标
    await user.click(screen.getByTitle('查找设置'));
    const popoverTitle = screen.getByText('在以下日志等级范围内查找');
    expect(popoverTitle).toBeInTheDocument();
    const popover = popoverTitle.parentElement!;
    expect(popover).toHaveClass('right-2');

    // 确认已移除冗余的内部查找输入框
    expect(within(popover).queryByPlaceholderText('查找')).not.toBeInTheDocument();

    // 确认弹框内各个等级文字均以胶囊形态展示
    expect(within(popover).getByText('INFO')).toBeInTheDocument();
    expect(within(popover).getByText('WARN')).toBeInTheDocument();
    expect(within(popover).getByText('ERROR')).toBeInTheDocument();

    // 取消全选后单独选择 WARN
    await user.click(within(popover).getByText('所有等级'));
    await user.click(within(popover).getByText('WARN'));

    // 只展示 WARN 日志
    expect(screen.queryByText('info log line')).not.toBeInTheDocument();
    expect(screen.getByText('warn log line')).toBeInTheDocument();
    expect(screen.queryByText('error log line')).not.toBeInTheDocument();
  });
});
