import React, { useState, useEffect, useMemo } from 'react';
import { CoreDownloadTask, FrpCore } from '../../types/frp';
import {
  fetchGitHubReleases,
  pickCoreFileNative,
  inspectLocalFrpcCore,
  isTauriEnv,
  detectHostSystemPlatform,
  matchReleaseAsset,
  pickDirectoryNative,
  pickArchiveFileNative,
  importLocalFrpcArchive,
  startCoreDownload,
  listCoreDownloadTasks,
  subscribeCoreDownloadProgress,
  scanLocalFrpcCores,
  HostPlatformInfo,
  MatchedAssetResult,
} from '../../services/ipc';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../components/ui/dropdown-menu';
import { FeishuInput } from '../../components/ui/feishu-table/FeishuInput';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { FeishuSelect } from '../../components/ui/feishu-select';
import {
  FeishuDataTable,
  FeishuColumn,
  FeishuPill,
  FeishuActionLink,
  FEISHU_FONT_FAMILY,
} from '../../components/ui/feishu-table';
import { FeishuEmptyState } from '../../components/ui/feishu-table/FeishuEmptyState';
import { PluginIcon, DownloadIcon } from '../../components/icons';
import { CoreCard, CoreCardSkeleton } from './CoreCard';
import { CoreAvailability, deriveCoreReleaseRows } from './core-version-library';
import { cn } from '../../lib/utils';
import {
  Folder,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Plus,
  FolderOpen,
  Download,
  AlertCircle,
  CornerDownRight,
  X,
  FileCode,
  Check,
  Laptop,
  Trash2,
  Edit3,
  Zap,
  LayoutGrid,
  Table as TableIcon,
  Link2,
  Package,
  ChevronDown,
} from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';
import { FeishuTooltip } from '../../components/ui/tooltip';

interface CoreManagerPageProps {
  cores: FrpCore[];
  activeCoreId: string;
  onSelectCore: (coreId: string) => void;
  onAddCustomCore: (core: FrpCore) => void;
  onUpdateCore?: (core: FrpCore) => void;
  onDeleteCore?: (coreId: string) => void;
}

export interface UnifiedCoreRow {
  id: string;
  name: string;
  version: string;
  sourceType: 'official_installed' | 'custom_installed' | 'online_release';
  path?: string;
  platform: string;
  os?: string;
  arch?: string;
  sizeDisplay: string;
  sizeBytes?: number;
  status: 'active' | 'installed' | 'online';
  availability?: CoreAvailability;
  task?: import('../../types/frp').CoreDownloadTask;
  downloadCount?: number;
  downloadCountDisplay: string;
  publishedAt?: string;
  isDefault: boolean;
  isCustom: boolean;
  rawRelease?: any;
}

interface EditModalState {
  isOpen: boolean;
  coreId: string;
  name: string;
  path: string;
  version: string;
  os: string;
  arch: string;
  sizeBytes: number;
  isCustom: boolean;
  downloadDate?: string;
}

interface DeleteModalState {
  isOpen: boolean;
  core: UnifiedCoreRow | null;
}

interface DownloadModalState {
  isOpen: boolean;
  release: any | null;
  targetOs: string;
  targetArch: string;
  targetDir: string;
  matchedAsset: MatchedAssetResult | null;
  isDownloading: boolean;
  taskId?: string;
}

const PLATFORM_PRESETS = [
  { value: 'windows_amd64', label: 'Windows x86_64 (amd64)', os: 'windows', arch: 'amd64' },
  { value: 'windows_arm64', label: 'Windows ARM64', os: 'windows', arch: 'arm64' },
  { value: 'darwin_arm64', label: 'macOS Apple Silicon (arm64)', os: 'darwin', arch: 'arm64' },
  { value: 'darwin_amd64', label: 'macOS Intel x86_64 (amd64)', os: 'darwin', arch: 'amd64' },
  { value: 'linux_amd64', label: 'Linux x86_64 (amd64)', os: 'linux', arch: 'amd64' },
  { value: 'linux_arm64', label: 'Linux ARM64 (aarch64)', os: 'linux', arch: 'arm64' },
];

const MIRROR_OPTIONS = [
  { value: 'ghproxy', label: '国内镜像 (ghproxy.net - 推荐)' },
  { value: 'fastgit', label: 'FastGit 镜像 (download.fastgit.org)' },
  { value: 'official', label: 'GitHub 官方源 (直连海外)' },
];

export const RELEASES_CACHE_KEY = 'frp_gui_online_releases_cache';

export const loadCachedGitHubReleases = (): any[] => {
  try {
    const raw = localStorage.getItem(RELEASES_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
};

export const saveCachedGitHubReleases = (releases: any[]) => {
  try {
    if (Array.isArray(releases) && releases.length > 0) {
      localStorage.setItem(RELEASES_CACHE_KEY, JSON.stringify(releases));
    }
  } catch (err) {
    console.warn('Failed to save GitHub releases cache:', err);
  }
};

export const CoreManagerPage: React.FC<CoreManagerPageProps> = ({
  cores,
  activeCoreId,
  onSelectCore,
  onAddCustomCore,
  onUpdateCore,
  onDeleteCore,
}) => {
  const [onlineReleases, setOnlineReleases] = useState<any[]>(() => loadCachedGitHubReleases());
  const [downloadTasks, setDownloadTasks] = useState<CoreDownloadTask[]>([]);
  const [loadingReleases, setLoadingReleases] = useState<boolean>(true);

  // 视图模式：卡片视图 (card) 或 表格视图 (table)，持久化用户偏好
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    return (localStorage.getItem('frp_gui_core_view_mode') as 'card' | 'table') || 'table';
  });

  const handleSetViewMode = (mode: 'card' | 'table') => {
    setViewMode(mode);
    localStorage.setItem('frp_gui_core_view_mode', mode);
  };

  // 用户偏好的镜像源持久化
  const [selectedMirror, setSelectedMirror] = useState<string>(() => {
    return localStorage.getItem('frp_gui_selected_mirror') || 'ghproxy';
  });

  // 用户上次选择的下载根目录持久化
  const [lastDownloadDir, setLastDownloadDir] = useState<string>(() => {
    return (
      localStorage.getItem('frp_gui_last_download_dir') ||
      'D:\\Development-Kits\\IntranetPenetration'
    );
  });

  // 当前宿主系统与 CPU 架构自动探测
  const [hostPlatform, setHostPlatform] = useState<HostPlatformInfo>({
    os: 'windows',
    osDisplay: 'Windows',
    arch: 'amd64',
    archDisplay: 'x86_64 (amd64)',
    platformDisplay: 'Windows x86_64',
  });

  // 下载弹窗状态
  const [downloadModal, setDownloadModal] = useState<DownloadModalState>({
    isOpen: false,
    release: null,
    targetOs: 'windows',
    targetArch: 'amd64',
    targetDir: '',
    matchedAsset: null,
    isDownloading: false,
  });
  const activeDownloadTask = downloadModal.taskId
    ? downloadTasks.find((task) => task.taskId === downloadModal.taskId)
    : undefined;
  const activeDownloadProgress = (() => {
    if (!activeDownloadTask) return 0;
    if (activeDownloadTask.phase === 'downloading' && activeDownloadTask.totalBytes) {
      return Math.min(85, Math.round(activeDownloadTask.receivedBytes / activeDownloadTask.totalBytes * 85));
    }
    if (activeDownloadTask.phase === 'verifying') return 85;
    if (activeDownloadTask.phase === 'extracting' && activeDownloadTask.totalEntries) {
      return 90 + Math.round((activeDownloadTask.extractedEntries || 0) / activeDownloadTask.totalEntries * 9);
    }
    if (activeDownloadTask.phase === 'inspecting') return 99;
    return activeDownloadTask.phase === 'completed' ? 100 : 0;
  })();

  // 更改核心模态窗
  const [editModal, setEditModal] = useState<EditModalState>({
    isOpen: false,
    coreId: '',
    name: '',
    path: '',
    version: 'v0.61.1',
    os: 'windows',
    arch: 'amd64',
    sizeBytes: 16500000,
    isCustom: false,
  });

  // 删除核心确认模态窗
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({
    isOpen: false,
    core: null,
  });

  // 活跃核心对象（无则为 null）
  const activeCore = useMemo(() => {
    return cores.find((c) => c.id === activeCoreId) || (cores.length > 0 ? cores[0] : null);
  }, [cores, activeCoreId]);

  useEffect(() => {
    loadReleases();
    initHostPlatform();
  }, []);

  useEffect(() => {
    let active = true;
    const synchronizeCompletedTask = (task: CoreDownloadTask) => {
      if (task.phase !== 'completed' || !task.installation || !active) return;
      if (cores.some((core) => core.path.toLowerCase() === task.installation!.path.toLowerCase())) return;
      const core: FrpCore = {
        id: `core_${task.taskId}`,
        name: `官方 Release ${task.releaseTag}`,
        version: task.installation.version,
        os: task.installation.os as FrpCore['os'],
        arch: task.installation.arch as FrpCore['arch'],
        path: task.installation.path,
        isDefault: false,
        isCustom: false,
        status: 'ready',
        sizeBytes: task.installation.sizeBytes,
        downloadDate: new Date().toLocaleDateString(),
      };
      onAddCustomCore(core);
    };
    void listCoreDownloadTasks().then((tasks) => {
      if (!active) return;
      setDownloadTasks(tasks);
      tasks.forEach(synchronizeCompletedTask);
    });
    let stop: (() => void) | undefined;
    void subscribeCoreDownloadProgress((task) => {
      if (!active) return;
      setDownloadTasks((tasks) => [...tasks.filter((item) => item.taskId !== task.taskId), task]);
      setDownloadModal((modal) => modal.taskId === task.taskId
        ? { ...modal, isDownloading: ['downloading', 'verifying', 'extracting', 'inspecting'].includes(task.phase) }
        : modal);
      synchronizeCompletedTask(task);
    }).then((unlisten) => { stop = unlisten; });
    return () => { active = false; stop?.(); };
  }, [cores, onAddCustomCore]);

  useEffect(() => {
    if (!downloadModal.taskId || !downloadModal.isDownloading) return;
    let active = true;
    const synchronizeTaskSnapshot = async () => {
      const task = (await listCoreDownloadTasks()).find((item) => item.taskId === downloadModal.taskId);
      if (!active || !task) return;
      setDownloadTasks((tasks) => [...tasks.filter((item) => item.taskId !== task.taskId), task]);
      setDownloadModal((modal) => modal.taskId === task.taskId
        ? { ...modal, isDownloading: ['downloading', 'verifying', 'extracting', 'inspecting'].includes(task.phase) }
        : modal);
      if (task.phase === 'completed' && task.installation && !cores.some((core) => core.path.toLowerCase() === task.installation!.path.toLowerCase())) {
        onAddCustomCore({
          id: `core_${task.taskId}`,
          name: `FRP ${task.installation.version}`,
          version: task.installation.version,
          os: task.installation.os,
          arch: task.installation.arch,
          path: task.installation.path,
          isDefault: false,
          isCustom: false,
          status: 'ready',
          sizeBytes: task.installation.sizeBytes,
          downloadDate: new Date().toLocaleDateString(),
        });
      }
    };
    void synchronizeTaskSnapshot();
    const timer = window.setInterval(() => void synchronizeTaskSnapshot(), 500);
    return () => { active = false; window.clearInterval(timer); };
  }, [downloadModal.isDownloading, downloadModal.taskId, cores, onAddCustomCore]);

  const handleUpdateMirror = (val: string) => {
    setSelectedMirror(val);
    localStorage.setItem('frp_gui_selected_mirror', val);
  };

  const handleUpdateDownloadDir = (dir: string) => {
    setLastDownloadDir(dir);
    localStorage.setItem('frp_gui_last_download_dir', dir);
  };

  const initHostPlatform = async () => {
    try {
      const info = await detectHostSystemPlatform();
      setHostPlatform(info);
    } catch (e) {
      console.warn('Init host platform error:', e);
    }
  };

  const loadReleases = async () => {
    setLoadingReleases(true);
    try {
      const list = await fetchGitHubReleases();
      if (Array.isArray(list) && list.length > 0) {
        setOnlineReleases(list);
        saveCachedGitHubReleases(list);
      }
    } catch (e: any) {
      feishuToast.error(`获取版本列表失败: ${e.message}`);
    } finally {
      setLoadingReleases(false);
    }
  };

  // 触发现代化文件选择流程
  const handleTriggerFilePicker = async () => {
    if (!isTauriEnv()) {
      feishuToast.warning('浏览器预览不能读取本机可执行文件，请在 FRP-GUI 桌面端导入核心');
      return;
    }
    const selectedPath = await pickCoreFileNative();
    if (!selectedPath) return;

    const inspected = await inspectLocalFrpcCore(selectedPath);
    if (inspected.error) {
      feishuToast.error(inspected.error);
      return;
    }

    const fileName = selectedPath.replace(/[\\/]/g, '/').split('/').pop() || 'frpc.exe';
    const newCore: FrpCore = {
      id: `custom_${Date.now()}`,
      name: `FRP ${inspected.version}`,
      version: inspected.version,
      arch: hostPlatform.arch,
      os: hostPlatform.os,
      path: selectedPath,
      isDefault: false,
      isCustom: true,
      downloadDate: new Date().toLocaleDateString(),
      status: 'ready',
    };
    onAddCustomCore(newCore);
    feishuToast.success(`已导入可用 FRPC 核心: ${fileName} (${inspected.version})`);
  };

  const handleImportArchive = async () => {
    if (!isTauriEnv()) {
      feishuToast.warning('浏览器预览不能解压与导入本机 FRP 压缩包，请在 FRP-GUI 桌面端导入核心');
      return;
    }

    const selectedFile = await pickArchiveFileNative();
    if (!selectedFile) return;

    try {
      feishuToast.info('正在解压并校验 FRP 压缩包...');
      const recognized = await importLocalFrpcArchive(selectedFile);

      const existingPaths = new Set(cores.map((core) => core.path.toLowerCase()));
      if (existingPaths.has(recognized.path.toLowerCase())) {
        feishuToast.warning(`该核心已存在于版本库中 (${recognized.version})`);
        return;
      }

      const coreId = `custom_${Date.now()}`;
      onAddCustomCore({
        id: coreId,
        name: `FRP ${recognized.version}`,
        version: recognized.version,
        arch: recognized.arch,
        os: recognized.os,
        path: recognized.path,
        isDefault: false,
        isCustom: true,
        downloadDate: new Date().toLocaleDateString(),
        status: 'ready',
        sizeBytes: recognized.sizeBytes,
      });

      feishuToast.success(`已导入可用 FRPC 核心: ${recognized.version} (${recognized.os}/${recognized.arch})`);
    } catch (err: any) {
      feishuToast.error(err?.message || String(err) || '导入 FRP 压缩包失败');
    }
  };

  const handleImportLocalDirectory = async () => {
    if (!isTauriEnv()) {
      feishuToast.warning('浏览器预览不能扫描本机 FRP 文件夹，请在 FRP-GUI 桌面端导入核心');
      return;
    }

    const selectedDirectory = await pickDirectoryNative();
    if (!selectedDirectory) return;

    const result = await scanLocalFrpcCores(selectedDirectory);
    if (result.error) {
      feishuToast.error(result.error);
      return;
    }

    const existingPaths = new Set(cores.map((core) => core.path.toLowerCase()));
    let addedCount = 0;
    for (const recognized of result.recognized) {
      const normalizedPath = recognized.path.toLowerCase();
      if (existingPaths.has(normalizedPath)) continue;
      existingPaths.add(normalizedPath);
      const coreId = `custom_${Date.now()}_${addedCount}`;
      onAddCustomCore({
        id: coreId,
        name: `FRP ${recognized.version}`,
        version: recognized.version,
        arch: recognized.arch,
        os: recognized.os,
        path: recognized.path,
        isDefault: false,
        isCustom: true,
        downloadDate: new Date().toLocaleDateString(),
        status: 'ready',
        sizeBytes: recognized.sizeBytes,
      });
      addedCount += 1;
    }

    if (result.recognized.length === 0) {
      feishuToast.warning(result.skipped.length > 0 ? `未识别到可用 FRPC 核心，跳过 ${result.skipped.length} 项` : '所选目录中未找到 frpc 或 frpc.exe');
      return;
    }
    feishuToast.success(`已识别 ${result.recognized.length} 个可用 FRPC 核心，跳过 ${result.skipped.length} 项`);
  };

  // 打开编辑核心模态窗
  const handleOpenEditModal = (record: UnifiedCoreRow) => {
    setEditModal({
      isOpen: true,
      coreId: record.id,
      name: record.name,
      path: record.path || '',
      version: record.version,
      os: record.os || (record.platform.toLowerCase().includes('windows') ? 'windows' : record.platform.toLowerCase().includes('mac') ? 'darwin' : 'linux'),
      arch: record.arch || (record.platform.toLowerCase().includes('arm64') ? 'arm64' : 'amd64'),
      sizeBytes: record.sizeBytes || 16500000,
      isCustom: record.isCustom,
      downloadDate: record.publishedAt,
    });
  };

  // 编辑弹窗中重新选择路径
  const handleRePickEditPath = async () => {
    if (!isTauriEnv()) {
      feishuToast.warning('浏览器预览不能读取本机可执行文件，请在 FRP-GUI 桌面端重新选择');
      return;
    }
    const selectedPath = await pickCoreFileNative();
    if (!selectedPath) return;
    const inspected = await inspectLocalFrpcCore(selectedPath);
    if (inspected.error) {
      feishuToast.error(inspected.error);
      return;
    }
    setEditModal((prev) => ({
      ...prev,
      path: selectedPath,
      version: inspected.version || prev.version,
    }));
  };

  // 确认保存核心更改
  const handleConfirmEditModal = async () => {
    if (!editModal.name.trim()) {
      feishuToast.warning('核心名称不能为空');
      return;
    }
    const trimmedPath = editModal.path.trim();
    if (!trimmedPath) {
      feishuToast.warning('核心可执行文件路径不能为空');
      return;
    }

    if (!isTauriEnv()) {
      feishuToast.warning('浏览器预览不能校验本机 FRPC 核心，请在 FRP-GUI 桌面端保存');
      return;
    }

    const inspected = await inspectLocalFrpcCore(trimmedPath);
    if (inspected.error) {
      feishuToast.error(inspected.error);
      return;
    }

    const updated: FrpCore = {
      id: editModal.coreId,
      name: editModal.name.trim(),
      version: inspected.version || editModal.version.trim(),
      path: trimmedPath,
      os: editModal.os as any,
      arch: editModal.arch as any,
      isDefault: false,
      isCustom: editModal.isCustom,
      status: 'ready',
      sizeBytes: editModal.sizeBytes,
      downloadDate: editModal.downloadDate || new Date().toLocaleDateString(),
    };

    if (onUpdateCore) {
      onUpdateCore(updated);
    }

    feishuToast.success(`已保存 FRPC 核心配置: ${updated.name} (${updated.version})`);
    setEditModal((prev) => ({ ...prev, isOpen: false }));
  };

  // 打开删除核心确认窗
  const handleOpenDeleteModal = (record: UnifiedCoreRow) => {
    setDeleteModal({
      isOpen: true,
      core: record,
    });
  };

  // 确认删除核心
  const handleConfirmDeleteModal = () => {
    if (!deleteModal.core) return;
    if (onDeleteCore) {
      onDeleteCore(deleteModal.core.id);
    }
    setDeleteModal({ isOpen: false, core: null });
  };

  // 触发现代化目录选择器（保留下载目录的原生选择逻辑）
  const handleTriggerDirectoryPicker = async () => {
    const selectedDir = await pickDirectoryNative();
    if (selectedDir) {
      setDownloadModal((prev) => ({ ...prev, targetDir: selectedDir }));
      handleUpdateDownloadDir(selectedDir);
    }
  };

  // 打开下载弹窗（自动识别当前宿主系统与架构，并预填上次下载目录）
  const handleOpenDownloadModal = (release: any) => {
    const matched = matchReleaseAsset(release.assets, hostPlatform.os, hostPlatform.arch, release.tag);
    const isWin = hostPlatform.os === 'windows';

    // 智能推导目标目录：优先使用上次记住的目录路径，并在其下建立该版本的专属文件夹
    const baseDir = lastDownloadDir.replace(/[\\/]+$/, '');
    const defaultDir = isWin
      ? `${baseDir}\\frp_${release.tag}_${hostPlatform.os}_${hostPlatform.arch}`
      : `${baseDir}/frp_${release.tag}`;

    setDownloadModal({
      isOpen: true,
      release,
      targetOs: hostPlatform.os,
      targetArch: hostPlatform.arch,
      targetDir: defaultDir,
      matchedAsset: matched,
      isDownloading: false,
      taskId: undefined,
    });
  };

  // 确认真实下载并解压安装到指定磁盘目录
  const handleConfirmDownload = async () => {
    if (!downloadModal.targetDir.trim()) {
      feishuToast.warning('请选择或指定下载解压的目标目录');
      return;
    }

    const release = downloadModal.release;
    if (!release) return;

    setDownloadModal((prev) => ({ ...prev, isDownloading: true }));

    const assetName = downloadModal.matchedAsset?.assetName || `frp_${release.tag}_${downloadModal.targetOs}_${downloadModal.targetArch}.zip`;

    // 记住用户选择的根目录
    const parentDir = downloadModal.targetDir.replace(/[\/\\][^\/\\]+$/, '');
    if (parentDir) {
      handleUpdateDownloadDir(parentDir);
    }

    feishuToast.info(`正在连接 ${selectedMirror === 'ghproxy' ? '国内加速镜像' : '下载源'} 下载 [${assetName}]...`);

    const task = await startCoreDownload({
      releaseTag: release.tag,
      assetName,
      mirror: selectedMirror as 'official' | 'ghproxy' | 'fastgit',
      targetDir: downloadModal.targetDir.trim(),
      targetOs: downloadModal.targetOs,
      targetArch: downloadModal.targetArch,
    });
    if (!('taskId' in task)) {
      feishuToast.error(`下载任务启动失败: ${task.error}`);
      setDownloadModal((prev) => ({ ...prev, isDownloading: false }));
      return;
    }
    setDownloadTasks((tasks) => [...tasks.filter((item) => item.taskId !== task.taskId), task]);
    setDownloadModal((prev) => ({ ...prev, isDownloading: true, taskId: task.taskId }));
    feishuToast.success(`已创建 FRP ${release.tag} 下载任务，将依次下载、校验、解压并验真`);
  };

  // 复制下载链接
  const handleCopyDownloadLink = (record: UnifiedCoreRow) => {
    const rawAsset = record.rawRelease?.assets?.[0];
    const downloadUrl =
      rawAsset?.downloadUrl ||
      `https://github.com/fatedier/frp/releases/download/${record.version}/frp_${record.version.replace(/^v/, '')}_windows_amd64.zip`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(downloadUrl).catch(() => {});
    }
    feishuToast.success(`已复制下载链接: ${downloadUrl}`);
  };

  // 统一构建多维表格数据源
  const unifiedData = useMemo<UnifiedCoreRow[]>(() => {
    const formatDownloadCount = (count?: number) => {
      if (typeof count !== 'number' || count <= 0) return '—';
      return count.toLocaleString();
    };

    const toLocalOnlyRow = (core: FrpCore): UnifiedCoreRow => {
      const isActive = core.id === activeCoreId;
      return {
        id: core.id,
        name: core.name,
        version: core.version,
        sourceType: core.isCustom ? 'custom_installed' : 'official_installed',
        path: core.path,
        platform: `${core.os || 'Windows'} ${core.arch || 'x86_64'}`,
        os: core.os,
        arch: core.arch,
        sizeDisplay: core.sizeBytes ? `${(core.sizeBytes / 1024 / 1024).toFixed(1)} MB` : '本地就绪',
        sizeBytes: core.sizeBytes,
        status: isActive ? 'active' : 'installed',
        availability: 'downloaded',
        downloadCountDisplay: '—',
        publishedAt: core.downloadDate || '本地引入',
        isDefault: isActive,
        isCustom: !!core.isCustom,
      };
    };

    // 官方 Release 是唯一版本列表来源；仅把当前电脑 OS/架构相符的已验证 FRPC 合并为“已下载”。
    if (onlineReleases.length === 0) {
      // 首次加载且无版本库缓存时，不提前吐出缺少下载量和发布日期的半成品行，交由骨架屏呈现
      if (loadingReleases) {
        return [];
      }
      return cores.map(toLocalOnlyRow);
    }

    const releaseRows = deriveCoreReleaseRows({
      releases: onlineReleases,
      cores,
      host: { os: hostPlatform.os, arch: hostPlatform.arch },
      tasks: downloadTasks,
    });
    const releaseVersions = new Set(onlineReleases.map((release) => release.tag));
    const list: UnifiedCoreRow[] = releaseRows.map(({ release, installation, availability, task }): UnifiedCoreRow => {
      const isInstalled = Boolean(installation);
      const isActive = installation?.id === activeCoreId;
      const matchedAsset = matchReleaseAsset(release.assets, hostPlatform.os, hostPlatform.arch, release.tag);

      return {
        id: installation?.id || `online_${release.tag}`,
        name: installation?.name || release.name || `官方 Release ${release.tag}`,
        version: release.tag,
        sourceType: installation?.isCustom ? 'custom_installed' : isInstalled ? 'official_installed' : 'online_release',
        path: installation?.path || 'GitHub 官方版本库',
        platform: isInstalled
          ? `${installation?.os || hostPlatform.os} ${installation?.arch || hostPlatform.arch}`
          : hostPlatform.platformDisplay,
        os: installation?.os || hostPlatform.os,
        arch: installation?.arch || hostPlatform.arch,
        sizeDisplay: installation?.sizeBytes
          ? `${(installation.sizeBytes / 1024 / 1024).toFixed(1)} MB`
          : `${(matchedAsset.sizeBytes / 1024 / 1024).toFixed(1)} MB`,
        sizeBytes: installation?.sizeBytes || matchedAsset.sizeBytes,
        status: isActive ? 'active' : isInstalled ? 'installed' : 'online',
        availability,
        task,
        downloadCount: release.downloadCount,
        downloadCountDisplay: formatDownloadCount(release.downloadCount),
        publishedAt: release.publishedAt ? release.publishedAt.substring(0, 10) : installation?.downloadDate || '官方发布',
        isDefault: isActive,
        isCustom: Boolean(installation?.isCustom),
        rawRelease: release,
      };
    });

    // 保留尚未出现在官方列表中的历史手工导入核心，避免覆盖既有用户配置。
    cores
      .filter((core) => !releaseVersions.has(core.version))
      .forEach((core) => list.push(toLocalOnlyRow(core)));

    return list;
  }, [cores, activeCoreId, downloadTasks, hostPlatform, onlineReleases, loadingReleases]);

  // 首次进入无缓存且网络在途时，启用全量骨架屏；命中缓存时 0ms 直接渲染
  const isInitialLoading = loadingReleases && onlineReleases.length === 0;

  const filteredData = unifiedData;


  // 统计数据

  // 1:1 飞书多维表格列定义（包含更改、删除操作，列宽自适应 100% 容器，操作列固定 170px）
  const columns = useMemo<FeishuColumn<UnifiedCoreRow>[]>(() => [
    {
      key: 'name',
      title: '版本',
      dataIndex: 'version',
      dataType: 'text',
      width: 130,
      minWidth: 120,
      render: (_, record) => {
        const isLatest = record.version === 'v0.61.1';
        return (
          <div className="flex items-center gap-2 flex-wrap min-w-0 py-0.5">
            <FeishuPill
              variant="purple"
              showDot={false}
              className="font-normal text-[13px] h-[22px] px-2.5 text-[#1F2329]"
            >
              {record.version}
            </FeishuPill>
            {isLatest && (
              <span className="text-[11px] px-1.5 py-0.5 bg-feishu-blue-light text-feishu-blue rounded font-normal">
                最新版
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'sizeDisplay',
      title: '文件体积',
      dataIndex: 'sizeDisplay',
      dataType: 'text',
      minWidth: 80,
      width: 100,
      render: (size) => (
        <span className="text-[13px] text-feishu-text-secondary tabular-nums font-normal">
          {size}
        </span>
      ),
    },
    {
      key: 'downloadCountDisplay',
      title: '下载量',
      dataIndex: 'downloadCountDisplay',
      dataType: 'text',
      minWidth: 80,
      width: 100,
      render: (_, record) => {
        if (!record.downloadCount || record.downloadCount <= 0) {
          return (
            <span className="text-[13px] text-feishu-text-secondary tabular-nums font-normal">
              —
            </span>
          );
        }
        const formatted = record.downloadCount.toLocaleString();
        return (
          <FeishuTooltip title={`GitHub 累计下载：${formatted} 次`}>
            <span className="text-[13px] text-feishu-text-secondary tabular-nums font-normal cursor-default">
              {formatted}
            </span>
          </FeishuTooltip>
        );
      },
    },
    {
      key: 'publishedAt',
      title: '发布时间',
      dataIndex: 'publishedAt',
      dataType: 'date',
      minWidth: 100,
      width: 120,
      render: (date) => (
        <span className="text-[13px] text-feishu-text-secondary tabular-nums font-normal">
          {date}
        </span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      minWidth: 100,
      width: 120,
      render: (_, record) => {
        const downloaded = record.status === 'active' || record.status === 'installed';
        const task = record.task;
        const taskSummary = task?.phase === 'downloading' && task.totalBytes
          ? `下载 ${Math.round(task.receivedBytes / task.totalBytes * 85)}%`
          : task?.phase === 'verifying'
            ? '正在校验'
            : task?.phase === 'extracting'
              ? `正在解压 ${task.extractedEntries || 0} / ${task.totalEntries || 0}`
              : task?.phase === 'inspecting'
                ? '正在验真'
                : undefined;
        return (
          <div className="space-y-0.5">
            <FeishuPill
              variant={downloaded ? 'green' : taskSummary ? 'blue' : record.availability === 'failed' ? 'red' : 'gray'}
              showDot={false}
              className="text-[11px] h-[20px] px-2 font-normal"
            >
              {downloaded ? '已下载' : taskSummary ? '下载中' : record.availability === 'resumable' ? '可继续' : record.availability === 'failed' ? '失败' : '可下载'}
            </FeishuPill>
            {taskSummary && <div className="text-[11px] text-feishu-text-secondary truncate">{taskSummary}</div>}
          </div>
        );
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: 140,
      fixed: 'right',
      resizable: false,
      render: (_, record) => {
        // 已下载核心
        if (record.status === 'active' || record.status === 'installed') {
          return (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <FeishuActionLink
                variant="secondary"
                onClick={() => handleOpenEditModal(record)}
              >
                更改
              </FeishuActionLink>
              <FeishuActionLink
                variant="danger"
                onClick={() => handleOpenDeleteModal(record)}
              >
                删除
              </FeishuActionLink>
            </div>
          );
        }

        // 云端待下载项（方案 A：下载主操作为 primary 蓝字，复制链接为 secondary 灰字）
        return (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <FeishuActionLink
              variant="primary"
              onClick={() => handleOpenDownloadModal(record.rawRelease)}
              title={`点击选择下载位置并安装 FRP ${record.version} 核心`}
            >
              下载
            </FeishuActionLink>
            <FeishuActionLink
              variant="secondary"
              onClick={() => handleCopyDownloadLink(record)}
              title="复制下载链接"
            >
              复制链接
            </FeishuActionLink>
          </div>
        );
      },
    },
  ], [activeCoreId, onSelectCore]);

  const viewModeSwitcher = (
    <div className="relative flex items-center bg-[#F2F3F5] p-0.5 rounded-md border border-[#DEE0E3] select-none">
      {/* 平滑滑动的白色高亮胶囊 (Sliding Indicator) */}
      <div
        className={cn(
          "absolute top-0.5 bottom-0.5 w-7 bg-white rounded-[4px] shadow-xs transition-transform duration-200 ease-out pointer-events-none",
          viewMode === 'table' ? "translate-x-7" : "translate-x-0"
        )}
      />
      <button
        type="button"
        onClick={() => handleSetViewMode('card')}
        title="卡片视图"
        aria-label="卡片视图"
        className={cn(
          "relative z-10 w-7 h-6 rounded-sm transition-colors cursor-pointer flex items-center justify-center",
          viewMode === 'card' ? "text-[#165DFF]" : "text-feishu-text-secondary hover:text-feishu-text-primary"
        )}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => handleSetViewMode('table')}
        title="表格视图"
        aria-label="表格视图"
        className={cn(
          "relative z-10 w-7 h-6 rounded-[4px] transition-colors cursor-pointer flex items-center justify-center",
          viewMode === 'table' ? "text-[#165DFF]" : "text-[#646A75] hover:text-[#1F2329]"
        )}
      >
        <TableIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-4 max-w-7xl mx-auto select-none pb-12">
      {/* 1. 顶部操作栏：核心归属由“我的连接”逐项选择，不再维护全局默认核心。 */}
      <div className="rounded-xl border border-feishu-border bg-white p-4.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-medium text-feishu-text-primary">FRP 版本库</h2>
            <p className="text-[12px] text-feishu-text-muted mt-1">下载或导入版本后，请在“我的连接”中为每个连接选择要使用的已下载版本。</p>
          </div>

          <div className="flex items-center gap-2.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 text-[13px] px-3.5 rounded-md bg-feishu-blue text-white hover:bg-feishu-blue-hover cursor-pointer inline-flex items-center"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  导入本地 FRP
                  <ChevronDown className="w-3.5 h-3.5 ml-1 opacity-80" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[260px] p-1.5 shadow-lg border border-feishu-border bg-white rounded-lg">
                <DropdownMenuItem
                  onClick={handleImportArchive}
                  className="cursor-pointer py-2.5 px-3 rounded-md hover:bg-[#F2F3F5] flex items-start gap-2.5 outline-none"
                >
                  <Package className="w-4 h-4 text-feishu-blue mt-0.5 shrink-0" />
                  <div className="flex flex-col text-left">
                    <span className="text-[13px] font-medium text-feishu-text-primary">导入官方压缩包 (.zip, .tar.gz)</span>
                    <span className="text-[11px] text-feishu-text-muted mt-0.5">未解压的官方压缩包，自动解压与验真安装</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 bg-[#DEE0E3]" />
                <DropdownMenuItem
                  onClick={handleImportLocalDirectory}
                  className="cursor-pointer py-2.5 px-3 rounded-md hover:bg-[#F2F3F5] flex items-start gap-2.5 outline-none"
                >
                  <FolderOpen className="w-4 h-4 text-feishu-text-muted mt-0.5 shrink-0" />
                  <div className="flex flex-col text-left">
                    <span className="text-[13px] font-medium text-feishu-text-primary">选择本地已解压目录</span>
                    <span className="text-[11px] text-feishu-text-muted mt-0.5">扫描已有解压目录，支持多版本批量识别</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.open('https://github.com/fatedier/frp/releases', '_blank');
              }}
              className="h-8 text-[13px] px-3 rounded-md border-feishu-border bg-white text-feishu-text-primary hover:bg-[#F2F3F5]"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1 text-feishu-text-muted" />
              发行日志
            </Button>
          </div>
        </div>
      </div>

      {/* 2. 核心引擎展示区（统一外层容器与工具栏，支持表格视图与卡片视图平滑切换） */}
      <FeishuDataTable
        title="FRP 核心引擎管理列表"
        columns={columns}
        data={filteredData}
        rowKey="id"
        selectable={false}
        loading={isInitialLoading}
        searchPlaceholder="在核心列表中搜索版本、路径或名称..."
        viewMode={viewMode}
        renderCardView={(cardData, loading) => {
          if (loading) {
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" data-testid="core-cards-skeleton">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <CoreCardSkeleton key={`core-card-skeleton-${idx}`} />
                ))}
              </div>
            );
          }
          if (cardData.length === 0) {
            return (
              <div className="py-12 bg-white rounded-lg border border-[#DEE0E3]">
                <FeishuEmptyState
                  title="暂无匹配的核心引擎"
                  description="您可以调整筛选条件或点击上方按钮导入本地核心"
                />
              </div>
            );
          }
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {cardData.map((core) => (
                <CoreCard
                  key={core.id}
                  core={core}
                  onSelect={onSelectCore}
                  onEdit={handleOpenEditModal}
                  onDelete={handleOpenDeleteModal}
                  onDownload={handleOpenDownloadModal}
                  onCopyLink={handleCopyDownloadLink}
                />
              ))}
            </div>
          );
        }}
        customRightTools={
          <div className="flex items-center gap-2">
            {viewModeSwitcher}

            <Button
              size="iconSm"
              variant="ghost"
              onClick={loadReleases}
              disabled={loadingReleases}
              title="刷新 GitHub Releases 版本库"
              className="w-8 h-8 rounded-md"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-feishu-text-secondary ${loadingReleases ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {/* 3. 弹窗：更改/编辑已配置的 FRP 核心 */}
      <FeishuDialog
        visible={editModal.isOpen}
        onCancel={() => setEditModal((prev) => ({ ...prev, isOpen: false }))}
        title="更改 FRP 核心配置"
        width={520}
        showIcon={false}
        footer={
          <div className="flex items-center justify-end gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditModal((prev) => ({ ...prev, isOpen: false }))}
              className="h-8 px-3 text-[13px] rounded-md border-feishu-border bg-white hover:bg-[#F2F3F5]"
            >
              取消
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirmEditModal}
              className="h-8 px-4 text-[13px] rounded-md bg-feishu-blue text-white hover:bg-feishu-blue-hover"
            >
              <Check className="w-3.5 h-3.5 mr-1 text-white" />
              保存更改
            </Button>
          </div>
        }
      >
        <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="block text-[12px] font-medium text-feishu-text-primary mb-1">
              核心名称
            </label>
            <FeishuInput
              value={editModal.name}
              onChange={(val) => setEditModal((prev) => ({ ...prev, name: val }))}
              placeholder="例如: 本地核心 (frpc.exe)"
              containerClassName="h-8.5 text-[13px]"
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium text-feishu-text-primary mb-1 items-center justify-between">
              <span>二进制文件物理绝对路径</span>
              <span className="text-[11px] text-feishu-text-muted">可手动修改或重新浏览</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <FeishuInput
                  value={editModal.path}
                  onChange={(val) => setEditModal((prev) => ({ ...prev, path: val }))}
                  placeholder="例如: D:\Development-Kits\frp\frpc.exe"
                  containerClassName="h-8.5 text-[13px]"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRePickEditPath}
                className="h-8.5 px-3 text-[12px] rounded-[6px] border-feishu-border bg-white text-feishu-text-primary hover:bg-[#F2F3F5] shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5 mr-1 text-feishu-blue" />
                重新选择
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-feishu-text-primary mb-1">
                版本号
              </label>
              <FeishuInput
                value={editModal.version}
                onChange={(val) => setEditModal((prev) => ({ ...prev, version: val }))}
                placeholder="v0.61.1"
                containerClassName="h-8.5 text-[13px]"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-feishu-text-primary mb-1">
                平台架构
              </label>
              <FeishuSelect
                options={PLATFORM_PRESETS}
                value={`${editModal.os}_${editModal.arch}`}
                onChange={(val) => {
                  const found = PLATFORM_PRESETS.find((p) => p.value === val);
                  if (found) {
                    setEditModal((prev) => ({ ...prev, os: found.os, arch: found.arch }));
                  }
                }}
                size="sm"
              />
            </div>
          </div>

        </div>
      </FeishuDialog>

      {/* 5. 弹窗：删除核心二次确认模态窗 */}
      {deleteModal.isOpen && deleteModal.core && (
        <FeishuDialog
          visible={deleteModal.isOpen}
          onCancel={() => setDeleteModal({ isOpen: false, core: null })}
          type="danger"
          title="确认移除该 FRP 核心？"
          width={440}
          onOk={handleConfirmDeleteModal}
          okText="确认删除"
          cancelText="取消"
        >
          <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-3">
            <p className="text-[13px] text-feishu-text-secondary">
              {deleteModal.core.name} ({deleteModal.core.version})
            </p>

            <div className="p-3 bg-[#F8F9FA] rounded-[6px] border border-feishu-border text-[12px] text-feishu-text-secondary">
              <div className="text-feishu-text-muted mb-1 font-normal">核心物理路径：</div>
              <div className="font-mono text-[11px] text-feishu-text-primary break-all">
                {deleteModal.core.path || '未指定路径'}
              </div>
              <div className="mt-2 text-[11px] text-feishu-text-muted">
                提示：移除后仅从 FRP-GUI 核心列表中注销，不会强制删除您磁盘上的源文件。
              </div>
            </div>
          </div>
        </FeishuDialog>
      )}

      {/* 6. 弹窗：下载与安装 FRP 核心 */}
      {downloadModal.isOpen && downloadModal.release && (
        <FeishuDialog
          visible={downloadModal.isOpen}
          onCancel={() => setDownloadModal((prev) => ({ ...prev, isOpen: false }))}
          title={`下载与安装 FRP 核心 (${downloadModal.release.tag})`}
          width={600}
          showIcon={false}
          footer={
            <div className="flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDownloadModal((prev) => ({ ...prev, isOpen: false }))}
                className="h-8 px-3.5 text-[13px] rounded-[6px] border-feishu-border bg-white text-feishu-text-primary hover:bg-[#F2F3F5]"
              >
                {downloadModal.isDownloading ? '后台继续' : downloadModal.taskId ? '关闭' : '取消'}
              </Button>
              {!downloadModal.taskId && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleConfirmDownload}
                  disabled={downloadModal.isDownloading}
                  className="h-8 px-4 text-[13px] rounded-[6px] bg-feishu-blue text-white hover:bg-feishu-blue-hover"
                >
                  <DownloadIcon className="w-3.5 h-3.5 mr-1.5 text-white" />
                  {downloadModal.isDownloading ? '正在下载并解压...' : '确认下载并解压'}
                </Button>
              )}
            </div>
          }
        >
          <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-4 pt-0.5 pb-1">
            {/* 自动识别宿主系统与匹配官方资产卡片（纯白背景与精致描边） */}
            <div className="p-3.5 bg-white rounded-[8px] border border-[#DEE0E3] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-feishu-blue" />
                  <span className="font-medium text-[14px] text-feishu-text-primary">
                    当前检测系统: {hostPlatform.platformDisplay}
                  </span>
                </div>
                <FeishuPill variant="green" showDot={true} className="text-[11px] h-[20px] px-2 font-normal">
                  系统已自动匹配
                </FeishuPill>
              </div>

              <div className="pt-1 text-[12px] text-feishu-text-secondary space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-feishu-text-muted">匹配预编译资产:</span>
                  <span className="text-feishu-blue font-medium">{downloadModal.matchedAsset?.assetName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-feishu-text-muted">文件预估体积:</span>
                  <span className="text-feishu-text-primary font-normal tabular-nums">{downloadModal.matchedAsset?.sizeDisplay}</span>
                </div>
              </div>
            </div>

            {activeDownloadTask && (
              <div className="p-3.5 rounded-[8px] border border-[#DEE9FE] bg-[#F5F8FF] space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FeishuPill variant={activeDownloadTask.phase === 'failed' ? 'red' : activeDownloadTask.phase === 'completed' ? 'green' : 'blue'} showDot={false} className="text-[11px] h-[20px] px-2 font-normal">
                      {activeDownloadTask.phase === 'downloading' ? '下载中' : activeDownloadTask.phase === 'verifying' ? '正在校验' : activeDownloadTask.phase === 'extracting' ? '正在解压' : activeDownloadTask.phase === 'inspecting' ? '正在验真' : activeDownloadTask.phase === 'completed' ? '已完成' : '失败'}
                    </FeishuPill>
                    <span className="text-[13px] font-medium text-feishu-text-primary">
                      {activeDownloadTask.phase === 'extracting' && activeDownloadTask.totalEntries
                        ? `正在解压 ${activeDownloadTask.extractedEntries || 0} / ${activeDownloadTask.totalEntries}`
                        : activeDownloadTask.phase === 'failed'
                          ? activeDownloadTask.error || '下载任务失败'
                          : activeDownloadTask.phase === 'completed'
                            ? '核心已下载、校验、解压并验真完成'
                            : '下载与安装任务进行中'}
                    </span>
                  </div>
                  <span className="text-[12px] tabular-nums text-feishu-blue">{activeDownloadProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-[#DEE9FE] overflow-hidden">
                  <div className={cn('h-full rounded-full transition-[width]', activeDownloadTask.phase === 'failed' ? 'bg-feishu-danger' : 'bg-feishu-blue')} style={{ width: `${activeDownloadProgress}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-feishu-text-secondary tabular-nums">
                  {activeDownloadTask.phase === 'downloading' && <span>{(activeDownloadTask.receivedBytes / 1_000_000).toFixed(1)} MB / {activeDownloadTask.totalBytes ? `${(activeDownloadTask.totalBytes / 1_000_000).toFixed(1)} MB` : '总大小未知'}</span>}
                  {activeDownloadTask.phase === 'downloading' && activeDownloadTask.speedBytesPerSecond !== undefined && <span>{(activeDownloadTask.speedBytesPerSecond / 1_000_000).toFixed(1)} MB/s</span>}
                  {activeDownloadTask.phase === 'downloading' && activeDownloadTask.etaSeconds !== undefined && <span>预计剩余下载时间 {activeDownloadTask.etaSeconds} 秒</span>}
                  {activeDownloadTask.phase === 'extracting' && activeDownloadTask.currentFileName && <span>当前文件：{activeDownloadTask.currentFileName}</span>}
                  <span className="break-all">目标目录：{activeDownloadTask.targetDir}</span>
                </div>
              </div>
            )}

            {/* 镜像源与系统架构（并排双列布局，共占2行） */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-feishu-text-primary mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1 truncate">
                    <Zap className="w-3.5 h-3.5 text-feishu-blue shrink-0" />
                    下载加速镜像源
                  </span>
                  <span className="text-[11px] text-feishu-text-muted shrink-0">推荐 ghproxy</span>
                </label>
                <FeishuSelect
                  options={MIRROR_OPTIONS}
                  value={selectedMirror}
                  onChange={(val) => handleUpdateMirror(val || 'ghproxy')}
                  size="md"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-feishu-text-primary mb-1.5 flex items-center justify-between">
                  <span className="truncate">目标系统与架构</span>
                  <span className="text-[11px] text-feishu-text-muted shrink-0">仅允许当前电脑</span>
                </label>
                <div className="h-9 px-3 rounded-[6px] border border-feishu-border bg-[#F7F8FA] flex items-center text-[13px] text-feishu-text-secondary">
                  {hostPlatform.platformDisplay}
                </div>
              </div>
            </div>

            {/* 路径选择 */}
            <div>
              <label className="block text-[12px] font-medium text-feishu-text-primary mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <FolderOpen className="w-3.5 h-3.5 text-feishu-blue" />
                  解压与安装目标目录 (已记忆上次目录)
                </span>
                <span className="text-[11px] text-feishu-text-muted">点击右侧按钮选择或直接输入</span>
              </label>

              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <FeishuInput
                    value={downloadModal.targetDir}
                    onChange={(val) => {
                      setDownloadModal((prev) => ({ ...prev, targetDir: val }));
                      const p = val.replace(/[\/\\][^\/\\]+$/, '');
                      if (p) handleUpdateDownloadDir(p);
                    }}
                    placeholder="请输入或选择解压目录，例如: D:\Development-Kits\IntranetPenetration"
                    containerClassName="h-8.5 text-[13px]"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTriggerDirectoryPicker}
                  className="h-8.5 px-3 text-[12px] rounded-[6px] border-feishu-border bg-white text-feishu-text-primary hover:bg-[#F2F3F5] shrink-0"
                >
                  <FolderOpen className="w-3.5 h-3.5 mr-1 text-feishu-blue" />
                  选择目录
                </Button>
              </div>
            </div>

          </div>
        </FeishuDialog>
      )}
    </div>
  );
};
