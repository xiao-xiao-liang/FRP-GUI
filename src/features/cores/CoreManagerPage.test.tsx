import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoreManagerPage } from './CoreManagerPage';
import {
  isTauriEnv,
  pickCoreFileNative,
  inspectLocalFrpcCore,
  pickDirectoryNative,
  scanLocalFrpcCores,
  fetchGitHubReleases,
  startCoreDownload,
  detectHostSystemPlatform,
} from '../../services/ipc';
import { feishuToast } from '../../components/ui/FeishuToast';

vi.mock('../../services/ipc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/ipc')>()),
  isTauriEnv: vi.fn(() => true),
  pickCoreFileNative: vi.fn(),
  inspectLocalFrpcCore: vi.fn(),
  pickDirectoryNative: vi.fn(),
  scanLocalFrpcCores: vi.fn(),
  detectHostSystemPlatform: vi.fn(),
  fetchGitHubReleases: vi.fn().mockResolvedValue([]),
  startCoreDownload: vi.fn(),
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
    localStorage.clear();
    vi.mocked(isTauriEnv).mockReturnValue(true);
    vi.mocked(fetchGitHubReleases).mockResolvedValue([]);
    vi.mocked(detectHostSystemPlatform).mockResolvedValue({
      os: 'windows',
      osDisplay: 'Windows',
      arch: 'amd64',
      archDisplay: 'x86_64 (amd64)',
      platformDisplay: 'Windows x86_64 (amd64)',
    });
    globalThis.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('选择本地 FRP 文件夹时批量登记所有验真的版本，并汇总跳过项', async () => {
    vi.mocked(pickDirectoryNative).mockResolvedValue('D:\\frp-archives');
    vi.mocked(scanLocalFrpcCores).mockResolvedValue({
      recognized: [
        { path: 'D:\\frp-070\\frpc.exe', version: 'v0.70.1', os: 'windows', arch: 'amd64', sizeBytes: 100 },
        { path: 'D:\\frp-071\\frpc.exe', version: 'v0.71.0', os: 'windows', arch: 'amd64', sizeBytes: 200 },
      ],
      skipped: [{ fileName: 'frps.exe', reason: '已跳过 FRPS 服务端程序' }],
    });
    const onAddCustomCore = vi.fn();

    render(<CoreManagerPage cores={[]} activeCoreId="" onAddCustomCore={onAddCustomCore} onSelectCore={vi.fn()} />);

    // 列表工具栏不再提供重复的“+ 选择本地 FRP 文件夹”按钮
    expect(screen.queryByRole('button', { name: /\+ 选择本地 FRP 文件夹/ })).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: '导入本地 FRP' }));

    await waitFor(() => {
      expect(scanLocalFrpcCores).toHaveBeenCalledWith('D:\\frp-archives');
      expect(onAddCustomCore).toHaveBeenCalledTimes(2);
    });
    expect(onAddCustomCore).toHaveBeenNthCalledWith(1, expect.objectContaining({ version: 'v0.70.1', path: 'D:\\frp-070\\frpc.exe' }));
    expect(onAddCustomCore).toHaveBeenNthCalledWith(2, expect.objectContaining({ version: 'v0.71.0', path: 'D:\\frp-071\\frpc.exe' }));
    expect(feishuToast.success).toHaveBeenCalledWith('已识别 2 个可用 FRPC 核心，跳过 1 项');
  });

  it('默认国内镜像下载时传递官方资产地址与镜像标识，不传递改写后的镜像 URL', async () => {
    vi.mocked(fetchGitHubReleases).mockResolvedValue([
      {
        tag: 'v0.61.1',
        name: 'Release v0.61.1',
        publishedAt: '2026-09-05T00:00:00Z',
        assets: [
          {
            name: 'frp_0.61.1_windows_amd64.zip',
            size: 1024,
            downloadUrl: 'https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_windows_amd64.zip',
          },
        ],
      },
    ]);
    vi.mocked(startCoreDownload).mockResolvedValue({
      taskId: 'download-1', releaseTag: 'v0.61.1', assetName: 'frp_0.61.1_windows_amd64.zip',
      phase: 'downloading', targetOs: 'windows', targetArch: 'amd64', targetDir: 'D:/frp', mirror: 'ghproxy', receivedBytes: 0,
    });

    render(
      <CoreManagerPage
        cores={[]}
        activeCoreId=""
        onAddCustomCore={vi.fn()}
        onSelectCore={vi.fn()}
      />
    );

    await userEvent.setup().click(await screen.findByRole('button', { name: /下载/ }));
    await userEvent.setup().click(screen.getByRole('button', { name: '确认下载并解压' }));

    await waitFor(() => {
      expect(startCoreDownload).toHaveBeenCalledWith(expect.objectContaining({
        releaseTag: 'v0.61.1',
        assetName: 'frp_0.61.1_windows_amd64.zip',
        mirror: 'ghproxy',
      }));
    });
  });

  it('目录扫描失败时不新增、不设默认，并显示扫描错误', async () => {
    vi.mocked(pickDirectoryNative).mockResolvedValue('D:\\frp');
    vi.mocked(scanLocalFrpcCores).mockResolvedValue({
      recognized: [], skipped: [], error: '所选目录无法读取，请选择包含 FRP 文件的目录',
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

    await userEvent.setup().click(screen.getByRole('button', { name: '导入本地 FRP' }));

    await waitFor(() => {
      expect(feishuToast.error).toHaveBeenCalledWith('所选目录无法读取，请选择包含 FRP 文件的目录');
    });

    expect(onAddCustomCore).not.toHaveBeenCalled();
    expect(onSelectCore).not.toHaveBeenCalled();
  });

  it('桌面端用户取消目录选择时不新增核心、不设默认，也不报错', async () => {
    vi.mocked(pickDirectoryNative).mockResolvedValue(null);
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

    await userEvent.setup().click(screen.getByRole('button', { name: '导入本地 FRP' }));

    await waitFor(() => {
      expect(pickDirectoryNative).toHaveBeenCalledTimes(1);
    });

    expect(scanLocalFrpcCores).not.toHaveBeenCalled();
    expect(onAddCustomCore).not.toHaveBeenCalled();
    expect(onSelectCore).not.toHaveBeenCalled();
    expect(feishuToast.error).not.toHaveBeenCalled();
    expect(feishuToast.warning).not.toHaveBeenCalled();
    expect(feishuToast.success).not.toHaveBeenCalled();
  });

  it('浏览器预览环境下点击选择本地 FRP 文件夹显示阻断提示，不调用原生选择与扫描', async () => {
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

    await userEvent.setup().click(screen.getByRole('button', { name: '导入本地 FRP' }));

    await waitFor(() => {
      expect(feishuToast.warning).toHaveBeenCalledWith(
        '浏览器预览不能扫描本机 FRP 文件夹，请在 FRP-GUI 桌面端导入核心'
      );
    });

    expect(pickDirectoryNative).not.toHaveBeenCalled();
    expect(scanLocalFrpcCores).not.toHaveBeenCalled();
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

  describe('CoreManagerPage - Task 2 & 3: 双视图切换、自适应表格与字段规范', () => {
    it('表格视图展示自适应列，使用紫色加粗胶囊展示版本号，合并冗余版本号列并展示下载量', async () => {
      vi.mocked(fetchGitHubReleases).mockResolvedValue([
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          downloadCount: 52300,
          assets: [
            {
              name: 'frp_0.71.0_windows_amd64.zip',
              size: 13107200,
              downloadCount: 52300,
              downloadUrl: 'https://example.com/v0.71.0.zip',
            },
          ],
        },
      ]);

      render(
        <CoreManagerPage
          cores={[
            {
              id: 'c1',
              name: '本地生产核心',
              version: 'v0.61.1',
              arch: 'amd64',
              os: 'windows',
              path: 'C:\\frpc.exe',
              isDefault: true,
              isCustom: false,
              status: 'ready',
              sizeBytes: 16500000,
            },
          ]}
          activeCoreId="c1"
          onSelectCore={vi.fn()}
          onAddCustomCore={vi.fn()}
        />
      );

      // 表头断言：包含版本（更名后）、文件体积、下载量、发布时间、操作
      expect(screen.getByText('版本')).toBeInTheDocument();
      expect(screen.queryByText('核心版本')).not.toBeInTheDocument();
      expect(screen.getByText('文件体积')).toBeInTheDocument();
      expect(screen.getByText('下载量')).toBeInTheDocument();
      expect(screen.getByText('发布时间')).toBeInTheDocument();
      expect(screen.getByText('状态')).toBeInTheDocument();
      expect(screen.getByText('已下载')).toBeInTheDocument();

      // 不存在孤立重复的“版本号”或“核心版本”表头列
      const tableHeaders = screen.getAllByRole('columnheader').map((th) => th.textContent);
      expect(tableHeaders).not.toContain('版本号');
      expect(tableHeaders).not.toContain('核心版本');

      // 验证紫色版本胶囊：保留紫色胶囊样式，但字体不加粗 (font-normal, 无 font-bold)
      const pills = await screen.findAllByText('v0.61.1');
      const purplePill = pills.find((el) => el.closest('.bg-\\[\\#F2E9FE\\]'));
      expect(purplePill).toBeDefined();
      expect(purplePill?.closest('.font-bold')).toBeNull();
      expect(purplePill?.closest('.font-normal')).toBeInTheDocument();

      // 云端 Release 呈现真实下载量 52,300，且鼠标悬浮触发飞书 Tooltip
      const downloadEl = await screen.findByText('52,300');
      expect(downloadEl).toBeInTheDocument();
      await userEvent.setup().hover(downloadEl);
      expect(await screen.findByText('GitHub 累计下载：52,300 次')).toBeInTheDocument();
    });

    it('同一版本的本地当前架构核心与官方 Release 只合并展示为一行', async () => {
      vi.mocked(fetchGitHubReleases).mockResolvedValue([
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          assets: [{ name: 'frp_0.71.0_windows_amd64.zip', size: 1024, downloadUrl: 'https://example.com/v0.71.0.zip' }],
        },
      ]);

      render(
        <CoreManagerPage
          cores={[{
            id: 'c1', name: '本地 v0.71.0', version: 'v0.71.0', os: 'windows', arch: 'amd64',
            path: 'C:\\frp_0.71.0\\frpc.exe', isDefault: true, isCustom: false, status: 'ready', sizeBytes: 1024,
          }]}
          activeCoreId="c1"
          onSelectCore={vi.fn()}
          onAddCustomCore={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(within(screen.getByRole('table')).getAllByText('v0.71.0')).toHaveLength(1);
      });
    });

    it('支持在卡片视图与表格视图间自由切换，并在卡片模式下渲染 CoreCard，记住用户偏好', async () => {
      const user = userEvent.setup();
      vi.mocked(fetchGitHubReleases).mockResolvedValue([
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          downloadCount: 52300,
          assets: [
            {
              name: 'frp_0.71.0_windows_amd64.zip',
              size: 13107200,
              downloadCount: 52300,
              downloadUrl: 'https://example.com/v0.71.0.zip',
            },
          ],
        },
      ]);

      render(
        <CoreManagerPage
          cores={[
            {
              id: 'c1',
              name: '本地核心',
              version: 'v0.61.1',
              arch: 'amd64',
              os: 'windows',
              path: 'C:\\frpc.exe',
              isDefault: true,
              isCustom: false,
              status: 'ready',
              sizeBytes: 16500000,
            },
          ]}
          activeCoreId="c1"
          onSelectCore={vi.fn()}
          onAddCustomCore={vi.fn()}
        />
      );

      // 点击切换为卡片视图
      const cardViewBtn = screen.getByRole('button', { name: /卡片视图/ });
      await user.click(cardViewBtn);

      // 验证 localStorage 持久化偏好
      expect(localStorage.getItem('frp_gui_core_view_mode')).toBe('card');

      // 在卡片视图下，仍展示核心与云端 release 信息（真实下载量 52,300）
      expect(await screen.findByText('52,300')).toBeInTheDocument();

      // 点击切换回表格视图
      const tableViewBtn = screen.getByRole('button', { name: /表格视图/ });
      await user.click(tableViewBtn);
      expect(localStorage.getItem('frp_gui_core_view_mode')).toBe('table');
    });

    it('云端 Release 支持复制下载链接并弹出 Toast 提示', async () => {
      const user = userEvent.setup();
      vi.mocked(fetchGitHubReleases).mockResolvedValue([
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          downloadCount: 52300,
          assets: [
            {
              name: 'frp_0.71.0_windows_amd64.zip',
              size: 13107200,
              downloadCount: 52300,
              downloadUrl: 'https://github.com/fatedier/frp/releases/download/v0.71.0/frp_0.71.0_windows_amd64.zip',
            },
          ],
        },
      ]);

      render(
        <CoreManagerPage
          cores={[]}
          activeCoreId=""
          onSelectCore={vi.fn()}
          onAddCustomCore={vi.fn()}
        />
      );

      const copyBtn = await screen.findByRole('button', { name: /复制链接/ });
      await user.click(copyBtn);

      expect(feishuToast.success).toHaveBeenCalledWith(
        expect.stringContaining('已复制下载链接')
      );
    });
  });
});
