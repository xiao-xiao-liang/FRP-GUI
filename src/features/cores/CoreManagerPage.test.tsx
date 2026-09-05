import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoreManagerPage } from './CoreManagerPage';
import {
  isTauriEnv,
  pickCoreFileNative,
  inspectLocalFrpcCore,
  fetchGitHubReleases,
} from '../../services/ipc';
import { feishuToast } from '../../components/ui/FeishuToast';

vi.mock('../../services/ipc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ipc')>()),
  isTauriEnv: vi.fn(() => true),
  pickCoreFileNative: vi.fn(),
  inspectLocalFrpcCore: vi.fn(),
  fetchGitHubReleases: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../components/ui/FeishuToast', () => ({
  feishuToast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('CoreManagerPage - Task 1: 本地核心原生选择与校验边界', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isTauriEnv).mockReturnValue(true);
    vi.mocked(fetchGitHubReleases).mockResolvedValue([]);
    globalThis.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('桌面端选择本地 frpc 时只调用原生选择和检查，不请求 Vite 文件系统接口', async () => {
    vi.mocked(pickCoreFileNative).mockResolvedValue('D:\\frp_0.71.0_windows_amd64\\frpc.exe');
    vi.mocked(inspectLocalFrpcCore).mockResolvedValue({ version: 'v0.71.0' });
    const onAddCustomCore = vi.fn();
    const onSelectCore = vi.fn();

    render(
      <CoreManagerPage
        cores={[]}
        activeCoreId=""
        onAddCustomCore={onAddCustomCore}
        onSelectCore={onSelectCore}
      />
    );

    const selectButtons = screen.getAllByRole('button', { name: /选择本地已有核心/ });
    await userEvent.setup().click(selectButtons[0]);

    await waitFor(() => {
      expect(pickCoreFileNative).toHaveBeenCalledTimes(1);
      expect(inspectLocalFrpcCore).toHaveBeenCalledWith('D:\\frp_0.71.0_windows_amd64\\frpc.exe');
      expect(onAddCustomCore).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'D:\\frp_0.71.0_windows_amd64\\frpc.exe',
          version: 'v0.71.0',
          status: 'ready',
          isDefault: true,
          isCustom: true,
        })
      );
    });

    expect(onSelectCore).toHaveBeenCalledTimes(1);
    expect(feishuToast.success).toHaveBeenCalledWith(expect.stringContaining('v0.71.0'));

    // 确认绝不访问 /api/dev/fs/* 伪接口
    const fetchUrls = mockFetch.mock.calls.map((call) => String(call[0]));
    const calledDevFs = fetchUrls.some((url) => url.includes('/api/dev/fs'));
    expect(calledDevFs).toBe(false);
  });

  it('核心检查失败时不新增、不设默认，并显示检查错误', async () => {
    vi.mocked(pickCoreFileNative).mockResolvedValue('D:\\frp\\frps.exe');
    vi.mocked(inspectLocalFrpcCore).mockResolvedValue({
      version: '',
      error: '请选择有效的 frpc 客户端程序',
    });
    const onAddCustomCore = vi.fn();
    const onSelectCore = vi.fn();

    render(
      <CoreManagerPage
        cores={[]}
        activeCoreId=""
        onAddCustomCore={onAddCustomCore}
        onSelectCore={onSelectCore}
      />
    );

    const selectButtons = screen.getAllByRole('button', { name: /选择本地已有核心/ });
    await userEvent.setup().click(selectButtons[0]);

    await waitFor(() => {
      expect(feishuToast.error).toHaveBeenCalledWith('请选择有效的 frpc 客户端程序');
    });

    expect(onAddCustomCore).not.toHaveBeenCalled();
    expect(onSelectCore).not.toHaveBeenCalled();
  });

  it('桌面端用户取消原生选择窗口时不新增核心、不设默认，也不报错', async () => {
    vi.mocked(pickCoreFileNative).mockResolvedValue(null);
    const onAddCustomCore = vi.fn();
    const onSelectCore = vi.fn();

    render(
      <CoreManagerPage
        cores={[]}
        activeCoreId=""
        onAddCustomCore={onAddCustomCore}
        onSelectCore={onSelectCore}
      />
    );

    const selectButtons = screen.getAllByRole('button', { name: /选择本地已有核心/ });
    await userEvent.setup().click(selectButtons[0]);

    await waitFor(() => {
      expect(pickCoreFileNative).toHaveBeenCalledTimes(1);
    });

    expect(inspectLocalFrpcCore).not.toHaveBeenCalled();
    expect(onAddCustomCore).not.toHaveBeenCalled();
    expect(onSelectCore).not.toHaveBeenCalled();
    expect(feishuToast.error).not.toHaveBeenCalled();
    expect(feishuToast.warning).not.toHaveBeenCalled();
    expect(feishuToast.success).not.toHaveBeenCalled();
  });

  it('浏览器预览环境下点击选择本地已有核心显示阻断提示，不调用原生选择与检查', async () => {
    vi.mocked(isTauriEnv).mockReturnValue(false);
    const onAddCustomCore = vi.fn();
    const onSelectCore = vi.fn();

    render(
      <CoreManagerPage
        cores={[]}
        activeCoreId=""
        onAddCustomCore={onAddCustomCore}
        onSelectCore={onSelectCore}
      />
    );

    const selectButtons = screen.getAllByRole('button', { name: /选择本地已有核心/ });
    await userEvent.setup().click(selectButtons[0]);

    await waitFor(() => {
      expect(feishuToast.warning).toHaveBeenCalledWith(
        '浏览器预览不能读取本机可执行文件，请在 FRP-GUI 桌面端导入核心'
      );
    });

    expect(pickCoreFileNative).not.toHaveBeenCalled();
    expect(inspectLocalFrpcCore).not.toHaveBeenCalled();
    expect(onAddCustomCore).not.toHaveBeenCalled();
    expect(onSelectCore).not.toHaveBeenCalled();
  });

  it('编辑核心时，原生重新选择返回 inspectLocalFrpcCore(...).error，必须保留原路径和原版本、显示错误、不得更新核心', async () => {
    const existingCore = {
      id: 'core_custom_1',
      name: '本地核心 (frpc.exe)',
      version: 'v0.70.0',
      arch: 'amd64' as const,
      os: 'windows' as const,
      path: 'D:\\frp\\frpc.exe',
      isDefault: true,
      isCustom: true,
      status: 'ready' as const,
      downloadDate: '2026/09/01',
    };
    const onUpdateCore = vi.fn();

    render(
      <CoreManagerPage
        cores={[existingCore]}
        activeCoreId="core_custom_1"
        onSelectCore={vi.fn()}
        onAddCustomCore={vi.fn()}
        onUpdateCore={onUpdateCore}
      />
    );

    // 打开编辑弹窗
    const editButtons = screen.getAllByRole('button', { name: '更改' });
    await userEvent.setup().click(editButtons[0]);
    expect(screen.getByText('更改 FRP 核心配置')).toBeInTheDocument();

    // 重新选择返回了无效核心
    vi.mocked(pickCoreFileNative).mockResolvedValue('D:\\frp\\invalid_file.exe');
    vi.mocked(inspectLocalFrpcCore).mockResolvedValue({
      version: '',
      error: '请选择有效的 frpc 客户端程序',
    });

    await userEvent.setup().click(screen.getByRole('button', { name: /重新选择/ }));

    await waitFor(() => {
      expect(feishuToast.error).toHaveBeenCalledWith('请选择有效的 frpc 客户端程序');
    });

    // 路径输入框必须保留原路径，未被污染
    const pathInput = screen.getByPlaceholderText('例如: D:\\Development-Kits\\frp\\frpc.exe') as HTMLInputElement;
    expect(pathInput.value).toBe('D:\\frp\\frpc.exe');
    expect(onUpdateCore).not.toHaveBeenCalled();
  });

  it('用户在编辑弹窗手工填写路径后点击保存，必须再次调用 inspectLocalFrpcCore；校验失败时弹窗保持打开、不得调用 onUpdateCore 或 onSelectCore，不得标记为 ready', async () => {
    const existingCore = {
      id: 'core_custom_1',
      name: '本地核心 (frpc.exe)',
      version: 'v0.70.0',
      arch: 'amd64' as const,
      os: 'windows' as const,
      path: 'D:\\frp\\frpc.exe',
      isDefault: true,
      isCustom: true,
      status: 'ready' as const,
      downloadDate: '2026/09/01',
    };
    const onUpdateCore = vi.fn();
    const onSelectCore = vi.fn();

    render(
      <CoreManagerPage
        cores={[existingCore]}
        activeCoreId="core_custom_1"
        onSelectCore={onSelectCore}
        onAddCustomCore={vi.fn()}
        onUpdateCore={onUpdateCore}
      />
    );

    const editButtons = screen.getAllByRole('button', { name: '更改' });
    await userEvent.setup().click(editButtons[0]);
    const pathInput = screen.getByPlaceholderText('例如: D:\\Development-Kits\\frp\\frpc.exe');

    // 手工修改为 frps.exe
    fireEvent.change(pathInput, { target: { value: 'D:\\frp\\frps.exe' } });

    vi.mocked(inspectLocalFrpcCore).mockResolvedValue({
      version: '',
      error: '不能将 frps 作为客户端运行',
    });

    await userEvent.setup().click(screen.getByRole('button', { name: '保存更改' }));

    await waitFor(() => {
      expect(inspectLocalFrpcCore).toHaveBeenCalledWith('D:\\frp\\frps.exe');
      expect(feishuToast.error).toHaveBeenCalledWith('不能将 frps 作为客户端运行');
    });

    // 弹窗依然保持打开
    expect(screen.getByText('更改 FRP 核心配置')).toBeInTheDocument();
    expect(onUpdateCore).not.toHaveBeenCalled();
    expect(onSelectCore).not.toHaveBeenCalled();
  });

  it('校验成功时，只使用检查返回的版本保存核心', async () => {
    const existingCore = {
      id: 'core_custom_1',
      name: '本地核心 (frpc.exe)',
      version: 'v0.70.0',
      arch: 'amd64' as const,
      os: 'windows' as const,
      path: 'D:\\frp\\frpc.exe',
      isDefault: true,
      isCustom: true,
      status: 'ready' as const,
      downloadDate: '2026/09/01',
    };
    const onUpdateCore = vi.fn();
    const onSelectCore = vi.fn();

    render(
      <CoreManagerPage
        cores={[existingCore]}
        activeCoreId="core_custom_1"
        onSelectCore={onSelectCore}
        onAddCustomCore={vi.fn()}
        onUpdateCore={onUpdateCore}
      />
    );

    const editButtons = screen.getAllByRole('button', { name: '更改' });
    await userEvent.setup().click(editButtons[0]);
    const pathInput = screen.getByPlaceholderText('例如: D:\\Development-Kits\\frp\\frpc.exe');

    fireEvent.change(pathInput, { target: { value: 'D:\\frp_0.71.0\\frpc.exe' } });

    // 用户在版本输入框乱填了一个伪造版本
    const versionInput = screen.getByPlaceholderText('v0.61.1');
    fireEvent.change(versionInput, { target: { value: 'v9.9.9-fake' } });

    // 后端检查返回真实版本 v0.71.0
    vi.mocked(inspectLocalFrpcCore).mockResolvedValue({
      version: 'v0.71.0',
    });

    fireEvent.click(screen.getByRole('button', { name: '保存更改' }));

    await waitFor(() => {
      expect(inspectLocalFrpcCore).toHaveBeenCalledWith('D:\\frp_0.71.0\\frpc.exe');
      expect(onUpdateCore).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'D:\\frp_0.71.0\\frpc.exe',
          version: 'v0.71.0', // 必须使用 inspectLocalFrpcCore 返回的权威版本，而非 v9.9.9-fake
          status: 'ready',
        })
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('更改 FRP 核心配置')).not.toBeInTheDocument();
    });
    expect(feishuToast.success).toHaveBeenCalledWith(expect.stringContaining('v0.71.0'));
  });
});

