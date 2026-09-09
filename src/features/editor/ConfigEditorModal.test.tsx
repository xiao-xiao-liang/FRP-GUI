import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ConfigEditorModal } from './ConfigEditorModal';
import { makeCore, makeProfile } from '../../test/fixtures';
import * as ipc from '../../services/ipc';

vi.mock('../../services/ipc', () => ({
  testServerConnectivity: vi.fn(),
  loadProfileSecret: vi.fn(),
}));

describe('ConfigEditorModal', () => {
  const activeCore = makeCore();
  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ipc.loadProfileSecret).mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it('密码框默认以密文展示，并渲染 VisibleLockOutlined 图标；点击切换后为明文并渲染 VisibleOutlined 图标', async () => {
    const profile = makeProfile({
      id: 'prof-secret',
      name: '测试穿透',
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        authToken: 'secret-token-888',
        proxies: [],
        visitors: [],
      },
      rawToml: 'serverAddr = "1.2.3.4"\nserverPort = 7000\n[auth]\ntoken = "secret-token-888"',
    });

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={profile}
        activeCore={activeCore}
        cores={[activeCore]}
      />
    );

    const input = screen.getByPlaceholderText('认证密钥') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.value).toBe('secret-token-888');

    // 默认密文状态：应展示 VisibleLockOutlined 图标
    const lockIcon = document.querySelector('svg[data-icon="VisibleLockOutlined"]');
    expect(lockIcon).toBeTruthy();
    expect(document.querySelector('svg[data-icon="VisibleOutlined"]')).toBeNull();

    // 点击切换为明文
    const toggleBtn = screen.getByTitle('显示密码');
    fireEvent.click(toggleBtn);

    expect(input.type).toBe('text');
    expect(document.querySelector('svg[data-icon="VisibleOutlined"]')).toBeTruthy();
    expect(document.querySelector('svg[data-icon="VisibleLockOutlined"]')).toBeNull();

    // 再次点击切换回密文
    const hideBtn = screen.getByTitle('隐藏密码');
    fireEvent.click(hideBtn);

    expect(input.type).toBe('password');
    expect(document.querySelector('svg[data-icon="VisibleLockOutlined"]')).toBeTruthy();
  });

  it('当 profile.config.authToken 缺失但 rawToml 含有 auth.token 时，自动兜底解析并恢复 Token', () => {
    const profile = makeProfile({
      id: 'prof-fallback',
      name: 'Fallback方案',
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        authToken: undefined,
        proxies: [],
        visitors: [],
      },
      rawToml: 'serverAddr = "1.2.3.4"\nserverPort = 7000\n\n[auth]\ntoken = "rescued_token_from_toml"',
    });

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={profile}
        activeCore={activeCore}
        cores={[activeCore]}
      />
    );

    const input = screen.getByPlaceholderText('认证密钥') as HTMLInputElement;
    expect(input.value).toBe('rescued_token_from_toml');
  });

  it('当打开未恢复机密（rawToml 为空）的方案时，弹窗就地发起凭据读取并回显 Token', async () => {
    const profile = makeProfile({
      id: 'prof-empty-raw',
      name: '未恢复机密方案',
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        authToken: undefined,
        proxies: [],
        visitors: [],
      },
      rawToml: '',
    });

    vi.mocked(ipc.loadProfileSecret).mockResolvedValueOnce(
      JSON.stringify({
        rawToml: 'serverAddr = "1.2.3.4"\nserverPort = 7000\n[auth]\ntoken = "async_loaded_token"',
        config: {
          serverAddr: '1.2.3.4',
          serverPort: 7000,
          authToken: 'async_loaded_token',
        },
      })
    );

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={profile}
        activeCore={activeCore}
        cores={[activeCore]}
      />
    );

    await waitFor(() => {
      const input = screen.getByPlaceholderText('认证密钥') as HTMLInputElement;
      expect(input.value).toBe('async_loaded_token');
    });

    expect(ipc.loadProfileSecret).toHaveBeenCalledWith('frp-gui/profile/prof-empty-raw');
  });

  it('Token 输入框容器不含 pr-7，且清空按钮仅在 hover 时展示而不常驻挤占宽度', () => {
    const profile = makeProfile({
      id: 'prof-ui-check',
      name: 'UI布局验证',
      config: {
        serverAddr: '127.0.0.1',
        serverPort: 7000,
        authToken: 'jinitaimei-token',
        proxies: [],
        visitors: [],
      },
      rawToml: 'serverAddr = "127.0.0.1"\nserverPort = 7000\n[auth]\ntoken = "jinitaimei-token"',
    });

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={profile}
        activeCore={activeCore}
        cores={[activeCore]}
      />
    );

    const input = screen.getByPlaceholderText('认证密钥') as HTMLInputElement;
    const container = input.closest('.ud__inputWrapper') as HTMLElement;
    expect(container).toBeTruthy();

    // 容器不应包含 pr-7，确保小眼睛靠在最右侧 (标准 px-2 内边距)
    expect(container.className).not.toContain('pr-7');
    expect(container.className).toContain('group/input');

    // 清空按钮不常驻（具有 hidden group-hover/input:inline-flex 类）
    const clearBtn = container.querySelector('button[title="清空"]');
    expect(clearBtn).toBeTruthy();
    expect(clearBtn?.className).toContain('hidden');
    expect(clearBtn?.className).toContain('group-hover/input:inline-flex');
  });

  it('穿透规则表支持添加规则与一键删除移除行，且不影响其他已修改的配置', () => {
    const profile = makeProfile({
      id: 'prof-rules-test',
      name: '规则测试方案',
      config: {
        serverAddr: '1.1.1.1',
        serverPort: 7000,
        authToken: 'token-test',
        proxies: [
          { name: 'rule-1', type: 'tcp', localIP: '127.0.0.1', localPort: 8080, remotePort: 8080 },
        ],
        visitors: [],
      },
      rawToml: 'serverAddr = "1.1.1.1"\nserverPort = 7000\n[auth]\ntoken = "token-test"\n[[proxies]]\nname = "rule-1"\ntype = "tcp"\nlocalIP = "127.0.0.1"\nlocalPort = 8080\nremotePort = 8080',
    });

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={profile}
        activeCore={activeCore}
        cores={[activeCore]}
      />
    );

    // 初始状态下有 1 条规则
    expect(screen.getByDisplayValue('rule-1')).toBeInTheDocument();

    // 点击添加规则
    const addRuleBtn = screen.getByRole('button', { name: '添加规则' });
    fireEvent.click(addRuleBtn);

    // 添加后应有 2 条规则 (新增了 tcp-2)
    expect(screen.getByDisplayValue('tcp-2')).toBeInTheDocument();

    // 点击第二条规则的操作列删除按钮 (垃圾桶)
    const deleteBtns = screen.getAllByRole('button', { name: '删除该规则' });
    expect(deleteBtns).toHaveLength(2);
    fireEvent.click(deleteBtns[1]);

    // 第二条规则被移除，初始的 rule-1 依然完好无损
    expect(screen.queryByDisplayValue('tcp-2')).toBeNull();
    expect(screen.getByDisplayValue('rule-1')).toBeInTheDocument();

    // 方案名称依然完好无损
    const nameInput = screen.getByDisplayValue('规则测试方案');
    expect(nameInput).toBeInTheDocument();
  });

  it('高级传输与运行日志折叠面板默认折叠并展示摘要，点击后可展开显示通信协议与 TLS', () => {
    const profile = makeProfile({
      id: 'prof-advanced-collapse',
      name: '高级设置折叠测试',
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        authToken: 'token-abc',
        proxies: [],
        visitors: [],
      },
      rawToml: '',
    });

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={profile}
        activeCore={activeCore}
        cores={[activeCore]}
      />
    );

    // 默认折叠：展示折叠面板按钮及其状态摘要
    const collapseTrigger = screen.getByRole('button', { name: /高级传输与运行日志/ });
    expect(collapseTrigger).toBeInTheDocument();
    expect(collapseTrigger).toHaveTextContent(/协议: TCP/);
    expect(collapseTrigger).toHaveTextContent(/TLS: 关闭/);

    // 默认折叠态下未挂载内部展开内容
    expect(screen.queryByText('启用 TLS 全链路加密传输')).toBeNull();

    // 点击展开
    fireEvent.click(collapseTrigger);

    // 展开后可查看 TLS 与高级设置
    expect(screen.getByText('启用 TLS 全链路加密传输')).toBeInTheDocument();
  });

  it('穿透规则表格采用 table-fixed 且无 overflow-x-auto 强制横向滚动，高级设置单行收纳通信协议与日志级别', () => {
    const profile = makeProfile({
      id: 'prof-compact-table',
      name: '紧凑表格测试',
      config: {
        serverAddr: '1.2.3.4',
        serverPort: 7000,
        authToken: 'token-compact',
        proxies: [
          { name: 'web-80', type: 'tcp', localIP: '127.0.0.1', localPort: 8080, remotePort: 80 },
        ],
        visitors: [],
      },
      rawToml: '',
    });

    render(
      <ConfigEditorModal
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        editingProfile={profile}
        activeCore={activeCore}
        cores={[activeCore]}
      />
    );

    // 1. 表格与容器检查
    const table = document.querySelector('table');
    expect(table).toBeTruthy();
    expect(table?.className).toContain('table-fixed');
    expect(table?.parentElement?.className).toContain('overflow-hidden');
    expect(table?.parentElement?.className).not.toContain('overflow-x-auto');

    // 2. 协议与本地端口表头宽度优化为 96px，公网端口/域名设为 185px
    const portHeader = screen.getByText('本地端口');
    expect(portHeader.className).toContain('w-[96px]');
    expect(screen.getByText('协议').className).toContain('w-[96px]');
    expect(screen.getByText('公网端口 / 域名').className).toContain('w-[185px]');

    // 3. 展开高级选项验证单行 flex 结构
    const collapseTrigger = screen.getByRole('button', { name: /高级传输与运行日志/ });
    fireEvent.click(collapseTrigger);

    const advancedRow = document.querySelector('[data-testid="runtime-log-level-setting"]')?.parentElement;
    expect(advancedRow).toBeTruthy();
    expect(advancedRow?.className).toContain('flex');
    expect(advancedRow?.className).toContain('justify-between');
    expect(screen.getByText('通信协议')).toBeInTheDocument();
    expect(screen.getByText('日志级别')).toBeInTheDocument();
    expect(screen.getByText('启用 TLS 全链路加密传输')).toBeInTheDocument();
  });
});
