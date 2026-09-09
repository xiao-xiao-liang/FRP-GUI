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
  pickArchiveFileNative,
  importLocalFrpcArchive,
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
  pickArchiveFileNative: vi.fn(),
  importLocalFrpcArchive: vi.fn(),
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

    await userEvent.setup().click(screen.getByRole('button', { name: /导入本地 FRP/ }));
    await userEvent.setup().click(screen.getByText('选择本地已解压目录'));

    await waitFor(() => {
      expect(scanLocalFrpcCores).toHaveBeenCalledWith('D:\\frp-archives');
      expect(onAddCustomCore).toHaveBeenCalledTimes(2);
    });
    expect(onAddCustomCore).toHaveBeenNthCalledWith(1, expect.objectContaining({ version: 'v0.70.1', path: 'D:\\frp-070\\frpc.exe' }));
    expect(onAddCustomCore).toHaveBeenNthCalledWith(2, expect.objectContaining({ version: 'v0.71.0', path: 'D:\\frp-071\\frpc.exe' }));
    expect(feishuToast.success).toHaveBeenCalledWith('已识别 2 个可用 FRPC 核心，跳过 1 项');
  });

  it('支持导入官方压缩包并自动解压验真入库', async () => {
    vi.mocked(pickArchiveFileNative).mockResolvedValue('D:\\Downloads\\frp_0.61.1_windows_amd64.zip');
    vi.mocked(importLocalFrpcArchive).mockResolvedValue({
      path: 'C:\\Users\\AppData\\cores\\frp_0.61.1\\frpc.exe',
      version: 'v0.61.1',
      os: 'windows',
      arch: 'amd64',
      sizeBytes: 15400000,
    });
    const onAddCustomCore = vi.fn();

    render(<CoreManagerPage cores={[]} activeCoreId="" onAddCustomCore={onAddCustomCore} onSelectCore={vi.fn()} />);

    await userEvent.setup().click(screen.getByRole('button', { name: /导入本地 FRP/ }));
    await userEvent.setup().click(screen.getByText('导入官方压缩包 (.zip, .tar.gz)'));

    await waitFor(() => {
      expect(pickArchiveFileNative).toHaveBeenCalledTimes(1);
      expect(importLocalFrpcArchive).toHaveBeenCalledWith('D:\\Downloads\\frp_0.61.1_windows_amd64.zip');
      expect(onAddCustomCore).toHaveBeenCalledWith(expect.objectContaining({
        version: 'v0.61.1',
        path: 'C:\\Users\\AppData\\cores\\frp_0.61.1\\frpc.exe',
      }));
    });
    expect(feishuToast.success).toHaveBeenCalledWith(expect.stringContaining('已导入可用 FRPC 核心: v0.61.1'));
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

  it('选择本地 FRP 目录失败时显示错误 Toast，不登记核心', async () => {
    vi.mocked(pickDirectoryNative).mockResolvedValue('D:\\invalid-frp');
    vi.mocked(scanLocalFrpcCores).mockResolvedValue({
      recognized: [],
      skipped: [],
      error: '所选目录无法读取，请选择包含 FRP 文件的目录',
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

    await userEvent.setup().click(screen.getByRole('button', { name: /导入本地 FRP/ }));
    await userEvent.setup().click(screen.getByText('选择本地已解压目录'));

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

    await userEvent.setup().click(screen.getByRole('button', { name: /导入本地 FRP/ }));
    await userEvent.setup().click(screen.getByText('选择本地已解压目录'));

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

    await userEvent.setup().click(screen.getByRole('button', { name: /导入本地 FRP/ }));
    await userEvent.setup().click(screen.getByText('选择本地已解压目录'));

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
    const editButtons = await screen.findAllByRole('button', { name: '更改' });
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

    const editButtons = await screen.findAllByRole('button', { name: '更改' });
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

    const editButtons = await screen.findAllByRole('button', { name: '更改' });
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
      expect(await screen.findByText('已下载')).toBeInTheDocument();

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

    it('在跨公网加载 GitHub Releases 期间呈现飞书流光骨架屏，数据就绪后平滑替换为真实数据', async () => {
      let resolveReleases: (val: any) => void;
      const releasesPromise = new Promise((resolve) => {
        resolveReleases = resolve;
      });
      vi.mocked(fetchGitHubReleases).mockImplementation(() => releasesPromise as any);

      render(
        <CoreManagerPage
          cores={[]}
          activeCoreId=""
          onSelectCore={vi.fn()}
          onAddCustomCore={vi.fn()}
        />
      );

      // 1. 在网络等待期间：表格视图渲染流光骨架屏数据行 (data-testid="table-skeleton-row")
      const skeletonRows = screen.getAllByTestId('table-skeleton-row');
      expect(skeletonRows.length).toBeGreaterThanOrEqual(6);
      expect(skeletonRows[0].querySelector('.feishu-skeleton')).toBeTruthy();

      // 2. 模拟网络请求完成并返回真实 Release 数据
      resolveReleases!([
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

      // 3. 数据返回后，骨架屏消失，真实版本数据正常展示
      await waitFor(() => {
        expect(screen.queryByTestId('table-skeleton-row')).toBeNull();
        expect(screen.getByText('v0.71.0')).toBeInTheDocument();
      });
    });

    it('卡片模式下在跨公网加载 GitHub Releases 期间呈现 CoreCardSkeleton 网格骨架屏', async () => {
      localStorage.setItem('frp_gui_core_view_mode', 'card');
      let resolveReleases: (val: any) => void;
      const releasesPromise = new Promise((resolve) => {
        resolveReleases = resolve;
      });
      vi.mocked(fetchGitHubReleases).mockImplementation(() => releasesPromise as any);

      render(
        <CoreManagerPage
          cores={[]}
          activeCoreId=""
          onSelectCore={vi.fn()}
          onAddCustomCore={vi.fn()}
        />
      );

      // 卡片网格骨架屏已渲染
      expect(screen.getByTestId('core-cards-skeleton')).toBeInTheDocument();
      const cardSkeletons = screen.getAllByTestId('core-card-skeleton');
      expect(cardSkeletons).toHaveLength(6);

      // 模拟返回
      resolveReleases!([
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
              downloadUrl: 'https://example.com/frp.zip',
            },
          ],
        },
      ]);

      await waitFor(() => {
        expect(screen.queryByTestId('core-cards-skeleton')).toBeNull();
        expect(screen.getByText('v0.71.0')).toBeInTheDocument();
      });
    });

    it('本地存在已下载核心且版本库无缓存时，首次网络加载期间呈现飞书骨架屏而不是半成品数据行，数据就绪后平滑替换为完整图二', async () => {
      let resolveReleases: (val: any) => void;
      const releasesPromise = new Promise((resolve) => {
        resolveReleases = resolve;
      });
      vi.mocked(fetchGitHubReleases).mockImplementation(() => releasesPromise as any);

      render(
        <CoreManagerPage
          cores={[
            {
              id: 'c1',
              name: '本地 v0.71.0',
              version: 'v0.71.0',
              os: 'windows',
              arch: 'amd64',
              path: 'C:\\frp_0.71.0\\frpc.exe',
              isDefault: true,
              isCustom: false,
              status: 'ready',
              downloadDate: '2026/9/7',
              sizeBytes: 16500000,
            },
            {
              id: 'c2',
              name: '本地 v0.68.1',
              version: 'v0.68.1',
              os: 'windows',
              arch: 'amd64',
              path: 'C:\\frp_0.68.1\\frpc.exe',
              isDefault: false,
              isCustom: false,
              status: 'ready',
              downloadDate: '2026/9/7',
              sizeBytes: 16500000,
            },
          ]}
          activeCoreId="c1"
          onSelectCore={vi.fn()}
          onAddCustomCore={vi.fn()}
        />
      );

      // 1. 无缓存首次加载时：渲染流光骨架屏数据行，坚决不渲染缺胳膊少腿的半成品行
      const skeletonRows = screen.getAllByTestId('table-skeleton-row');
      expect(skeletonRows.length).toBeGreaterThanOrEqual(6);
      expect(screen.queryByText('2026/9/7')).toBeNull();

      // 2. 远程数据就绪
      resolveReleases!([
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          downloadCount: 89447,
          assets: [{ name: 'frp_0.71.0_windows_amd64.zip', size: 16672358, downloadUrl: 'https://example.com/frp.zip' }],
        },
        {
          tag: 'v0.68.1',
          name: 'Release v0.68.1',
          publishedAt: '2026-04-13T00:00:00Z',
          downloadCount: 235945,
          assets: [{ name: 'frp_0.68.1_windows_amd64.zip', size: 16777216, downloadUrl: 'https://example.com/frp68.zip' }],
        },
      ]);

      // 3. 骨架屏消失，渲染完整官方数据（包含真实下载量与发布时间）
      await waitFor(() => {
        expect(screen.queryByTestId('table-skeleton-row')).toBeNull();
        expect(screen.getByText('89,447')).toBeInTheDocument();
        expect(screen.getByText('235,945')).toBeInTheDocument();
      });
    });

    it('存在本地持久化版本缓存时，初次渲染瞬间直出完整版本库（命中缓存零骨架屏），并在后台异步静默完成校验', async () => {
      const cachedReleases = [
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          downloadCount: 89447,
          assets: [{ name: 'frp_0.71.0_windows_amd64.zip', size: 16672358, downloadUrl: 'https://example.com/frp.zip' }],
        },
      ];
      localStorage.setItem('frp_gui_online_releases_cache', JSON.stringify(cachedReleases));

      let resolveBackground: (val: any) => void;
      const bgPromise = new Promise((resolve) => {
        resolveBackground = resolve;
      });
      vi.mocked(fetchGitHubReleases).mockImplementation(() => bgPromise as any);

      render(
        <CoreManagerPage
          cores={[
            {
              id: 'c1',
              name: '本地 v0.71.0',
              version: 'v0.71.0',
              os: 'windows',
              arch: 'amd64',
              path: 'C:\\frp_0.71.0\\frpc.exe',
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

      // 1. 命中缓存瞬间直出，骨架屏为 0
      expect(screen.queryByTestId('table-skeleton-row')).toBeNull();
      expect(screen.getByText('v0.71.0')).toBeInTheDocument();
      expect(screen.getByText('89,447')).toBeInTheDocument();

      // 2. 后台静默完成校验更新
      resolveBackground!([
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          downloadCount: 90000,
          assets: [{ name: 'frp_0.71.0_windows_amd64.zip', size: 16672358, downloadUrl: 'https://example.com/frp.zip' }],
        },
      ]);

      await waitFor(() => {
        expect(screen.getByText('90,000')).toBeInTheDocument();
      });
    });

    it('在已有数据状态下点击刷新按钮，只在后台旋转指示，不将现有数据回退为骨架屏', async () => {
      const user = userEvent.setup();
      const cachedReleases = [
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          downloadCount: 89447,
          assets: [{ name: 'frp_0.71.0_windows_amd64.zip', size: 16672358, downloadUrl: 'https://example.com/frp.zip' }],
        },
      ];
      localStorage.setItem('frp_gui_online_releases_cache', JSON.stringify(cachedReleases));
      vi.mocked(fetchGitHubReleases).mockResolvedValue(cachedReleases);

      render(
        <CoreManagerPage
          cores={[]}
          activeCoreId=""
          onSelectCore={vi.fn()}
          onAddCustomCore={vi.fn()}
        />
      );

      // 已有数据就绪
      expect(screen.getByText('v0.71.0')).toBeInTheDocument();

      // 点击刷新按钮
      const refreshBtn = screen.getByRole('button', { name: /刷新 GitHub Releases 版本库/ });
      await user.click(refreshBtn);

      // 绝不回退为骨架屏，数据持续可见
      expect(screen.queryByTestId('table-skeleton-row')).toBeNull();
      expect(screen.getByText('v0.71.0')).toBeInTheDocument();
    });
  });

  describe('Task 5: 表格与卡片视图平滑切换与搜索状态共享', () => {
    it('支持在表格视图与卡片视图间平滑切换，工具栏保持稳定，并持久化偏好', async () => {
      const user = userEvent.setup();
      const cachedReleases = [
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          downloadCount: 89447,
          assets: [{ name: 'frp_0.71.0_windows_amd64.zip', size: 16672358, downloadUrl: 'https://example.com/frp.zip' }],
        },
        {
          tag: 'v0.70.1',
          name: 'Release v0.70.1',
          publishedAt: '2026-07-23T00:00:00Z',
          downloadCount: 99373,
          assets: [{ name: 'frp_0.70.1_windows_amd64.zip', size: 13958210, downloadUrl: 'https://example.com/frp70.zip' }],
        },
      ];
      localStorage.setItem('frp_gui_online_releases_cache', JSON.stringify(cachedReleases));
      vi.mocked(fetchGitHubReleases).mockResolvedValue(cachedReleases);

      render(
        <CoreManagerPage
          cores={[]}
          activeCoreId=""
          onSelectCore={vi.fn()}
          onAddCustomCore={vi.fn()}
        />
      );

      // 1. 默认表格视图渲染
      expect(screen.getByText('FRP 核心引擎管理列表')).toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('v0.71.0')).toBeInTheDocument();
      expect(screen.getByText('v0.70.1')).toBeInTheDocument();

      // 2. 点击卡片视图切换按钮
      const cardViewBtn = screen.getByRole('button', { name: '卡片视图' });
      await user.click(cardViewBtn);

      // 验证已切换为卡片网格，且表格已平滑卸下
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.getByText('v0.71.0')).toBeInTheDocument();
      expect(screen.getByText('v0.70.1')).toBeInTheDocument();
      expect(localStorage.getItem('frp_gui_core_view_mode')).toBe('card');

      // 3. 点击表格视图切换按钮切回
      const tableViewBtn = screen.getByRole('button', { name: '表格视图' });
      await user.click(tableViewBtn);

      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(localStorage.getItem('frp_gui_core_view_mode')).toBe('table');
    });

    it('在工具栏中搜索过滤时，卡片视图与表格视图共享过滤结果', async () => {
      const user = userEvent.setup();
      const cachedReleases = [
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          downloadCount: 89447,
          assets: [{ name: 'frp_0.71.0_windows_amd64.zip', size: 16672358, downloadUrl: 'https://example.com/frp.zip' }],
        },
        {
          tag: 'v0.70.1',
          name: 'Release v0.70.1',
          publishedAt: '2026-07-23T00:00:00Z',
          downloadCount: 99373,
          assets: [{ name: 'frp_0.70.1_windows_amd64.zip', size: 13958210, downloadUrl: 'https://example.com/frp70.zip' }],
        },
      ];
      localStorage.setItem('frp_gui_online_releases_cache', JSON.stringify(cachedReleases));
      vi.mocked(fetchGitHubReleases).mockResolvedValue(cachedReleases);

      render(
        <CoreManagerPage
          cores={[]}
          activeCoreId=""
          onSelectCore={vi.fn()}
          onAddCustomCore={vi.fn()}
        />
      );

      // 点击“搜索”按钮展开飞书原生搜索框
      await user.click(screen.getByText('搜索'));

      // 在通用搜索框输入 "0.71"
      const searchInput = screen.getByPlaceholderText('在核心列表中搜索版本、路径或名称...');
      await user.type(searchInput, '0.71');

      // 表格中仅展示 v0.71.0，v0.70.1 被过滤
      expect(screen.getByText('v0.71.0')).toBeInTheDocument();
      expect(screen.queryByText('v0.70.1')).toBeNull();

      // 切换到卡片视图
      await user.click(screen.getByRole('button', { name: '卡片视图' }));

      // 卡片视图依然保持该过滤结果
      expect(screen.getByText('v0.71.0')).toBeInTheDocument();
      expect(screen.queryByText('v0.70.1')).toBeNull();
    });
  });
});
