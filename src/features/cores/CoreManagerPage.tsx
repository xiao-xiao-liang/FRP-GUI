import React, { useState, useEffect, useMemo } from 'react';
import { FrpCore } from '../../types/frp';
import {
  fetchGitHubReleases,
  pickCoreFileNative,
  inspectLocalFrpcCore,
  isTauriEnv,
  detectHostSystemPlatform,
  matchReleaseAsset,
  getAcceleratedDownloadUrl,
  pickDirectoryNative,
  downloadAndExtractCore,
  HostPlatformInfo,
  MatchedAssetResult,
} from '../../services/ipc';
import { Button } from '../../components/ui/button';
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
import { PluginIcon, DownloadIcon } from '../../components/icons';
import {
  Folder,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Plus,
  Cpu,
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
} from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';

interface CoreManagerPageProps {
  cores: FrpCore[];
  activeCoreId: string;
  onSelectCore: (coreId: string) => void;
  onAddCustomCore: (core: FrpCore) => void;
  onUpdateCore?: (core: FrpCore) => void;
  onDeleteCore?: (coreId: string) => void;
}

type CoreTabKey = 'all' | 'installed' | 'online' | 'custom';

interface UnifiedCoreRow {
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
  setAsDefault: boolean;
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
  downloadAsDefault: boolean;
  isDownloading: boolean;
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

export const CoreManagerPage: React.FC<CoreManagerPageProps> = ({
  cores,
  activeCoreId,
  onSelectCore,
  onAddCustomCore,
  onUpdateCore,
  onDeleteCore,
}) => {
  const [onlineReleases, setOnlineReleases] = useState<any[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [activeTab, setActiveTab] = useState<CoreTabKey>('all');

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
    downloadAsDefault: true,
    isDownloading: false,
  });

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
    setAsDefault: false,
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
      setOnlineReleases(list);
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
      name: `本地核心 (${fileName})`,
      version: inspected.version,
      arch: hostPlatform.arch,
      os: hostPlatform.os,
      path: selectedPath,
      isDefault: true,
      isCustom: true,
      downloadDate: new Date().toLocaleDateString(),
      status: 'ready',
    };
    onAddCustomCore(newCore);
    onSelectCore(newCore.id);
    feishuToast.success(`已导入可用 FRPC 核心: ${fileName} (${inspected.version})`);
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
      setAsDefault: record.id === activeCoreId,
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
      isDefault: editModal.setAsDefault,
      isCustom: editModal.isCustom,
      status: 'ready',
      sizeBytes: editModal.sizeBytes,
      downloadDate: editModal.downloadDate || new Date().toLocaleDateString(),
    };

    if (onUpdateCore) {
      onUpdateCore(updated);
    }
    if (editModal.setAsDefault) {
      onSelectCore(updated.id);
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
      downloadAsDefault: true,
      isDownloading: false,
    });
  };

  // 切换目标系统/架构
  const handleChangeTargetPlatform = (presetKey: string) => {
    const preset = PLATFORM_PRESETS.find((p) => p.value === presetKey);
    if (!preset || !downloadModal.release) return;

    const matched = matchReleaseAsset(downloadModal.release.assets, preset.os, preset.arch, downloadModal.release.tag);
    const isWin = preset.os === 'windows';
    const baseDir = lastDownloadDir.replace(/[\\/]+$/, '');
    const defaultDir = isWin
      ? `${baseDir}\\frp_${downloadModal.release.tag}_${preset.os}_${preset.arch}`
      : `${baseDir}/frp_${downloadModal.release.tag}`;

    setDownloadModal((prev) => ({
      ...prev,
      targetOs: preset.os,
      targetArch: preset.arch,
      targetDir: defaultDir,
      matchedAsset: matched,
    }));
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

    const rawDownloadUrl =
      downloadModal.matchedAsset?.downloadUrl ||
      `https://github.com/fatedier/frp/releases/download/${release.tag}/frp_${release.tag.replace(/^v/, '')}_${downloadModal.targetOs}_${downloadModal.targetArch}.${downloadModal.targetOs === 'windows' ? 'zip' : 'tar.gz'}`;
    const effectiveUrl = getAcceleratedDownloadUrl(rawDownloadUrl, selectedMirror);

    const assetName = downloadModal.matchedAsset?.assetName || `frp_${release.tag}_${downloadModal.targetOs}_${downloadModal.targetArch}.zip`;

    // 记住用户选择的根目录
    const parentDir = downloadModal.targetDir.replace(/[\/\\][^\/\\]+$/, '');
    if (parentDir) {
      handleUpdateDownloadDir(parentDir);
    }

    feishuToast.info(`正在连接 ${selectedMirror === 'ghproxy' ? '国内加速镜像' : '下载源'} 下载 [${assetName}]...`);

    try {
      const result = await downloadAndExtractCore({
        downloadUrl: effectiveUrl,
        targetDir: downloadModal.targetDir.trim(),
        version: release.tag,
        targetOs: downloadModal.targetOs,
        targetArch: downloadModal.targetArch,
      });

      if (!result.success) {
        feishuToast.error(`下载解压失败: ${result.error || '未知网络或文件系统错误'}`);
        setDownloadModal((prev) => ({ ...prev, isDownloading: false }));
        return;
      }

      const downloadedCore: FrpCore = {
        id: `core_${release.tag}_${downloadModal.targetOs}_${downloadModal.targetArch}_${Date.now()}`,
        name: `官方 Release ${release.tag}`,
        version: release.tag,
        arch: downloadModal.targetArch as any,
        os: downloadModal.targetOs as any,
        path: result.exePath,
        isDefault: downloadModal.downloadAsDefault,
        isCustom: false,
        downloadDate: new Date().toLocaleDateString(),
        status: 'ready',
        sizeBytes: result.sizeBytes || 16500000,
      };

      onAddCustomCore(downloadedCore);
      if (downloadModal.downloadAsDefault) {
        onSelectCore(downloadedCore.id);
      }

      setDownloadModal((prev) => ({ ...prev, isDownloading: false, isOpen: false }));
      feishuToast.success(
        `FRP ${release.tag} 核心已真实下载解压就绪: ${result.exePath} (${(result.sizeBytes / 1024 / 1024).toFixed(1)} MB)`
      );
    } catch (err: any) {
      feishuToast.error(`下载流程发生异常: ${err.message || String(err)}`);
      setDownloadModal((prev) => ({ ...prev, isDownloading: false }));
    }
  };

  // 统一构建多维表格数据源
  const unifiedData = useMemo<UnifiedCoreRow[]>(() => {
    const list: UnifiedCoreRow[] = [];

    // 1. 本地核心 (展示用户实际下载或绑定的核心)
    cores.forEach((core) => {
      const isActive = core.id === activeCoreId;
      list.push({
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
        publishedAt: core.downloadDate || '本地引入',
        isDefault: isActive,
        isCustom: !!core.isCustom,
      });
    });

    // 2. 官方在线 Releases（排除已安装的）
    onlineReleases.forEach((rel) => {
      const alreadyInstalled = cores.some((c) => c.version === rel.tag);
      if (!alreadyInstalled) {
        list.push({
          id: `online_${rel.tag}`,
          name: rel.name || `官方 Release ${rel.tag}`,
          version: rel.tag,
          sourceType: 'online_release',
          path: 'GitHub 官方云端版本库',
          platform: '跨平台全架构 (Windows/macOS/Linux)',
          sizeDisplay: rel.assets?.[0]?.size ? `${(rel.assets[0].size / 1024 / 1024).toFixed(1)} MB` : '~16.5 MB',
          status: 'online',
          publishedAt: rel.publishedAt ? rel.publishedAt.substring(0, 10) : '官方发布',
          isDefault: false,
          isCustom: false,
          rawRelease: rel,
        });
      }
    });

    return list;
  }, [cores, activeCoreId, onlineReleases]);

  // Tab 过滤数据
  const filteredData = useMemo(() => {
    return unifiedData.filter((item) => {
      if (activeTab === 'installed') return item.status === 'active' || item.status === 'installed';
      if (activeTab === 'online') return item.status === 'online';
      if (activeTab === 'custom') return item.isCustom;
      return true;
    });
  }, [unifiedData, activeTab]);

  // 统计数据
  const installedCount = useMemo(() => unifiedData.filter((i) => i.status === 'active' || i.status === 'installed').length, [unifiedData]);
  const onlineCount = useMemo(() => unifiedData.filter((i) => i.status === 'online').length, [unifiedData]);
  const customCount = useMemo(() => unifiedData.filter((i) => i.isCustom).length, [unifiedData]);

  // 1:1 飞书多维表格列定义（包含更改、删除操作）
  const columns = useMemo<FeishuColumn<UnifiedCoreRow>[]>(() => [
    {
      key: 'name',
      title: '核心引擎版本',
      dataIndex: 'name',
      dataType: 'text',
      width: 300,
      render: (_, record) => {
        const isLatest = record.version === 'v0.61.1';
        return (
          <div className="flex flex-col justify-center py-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-normal text-feishu-text-primary truncate">
                {record.name}
              </span>
              {record.status === 'active' && (
                <FeishuPill variant="green" showDot={true} className="text-[11px] h-[20px] px-2 font-normal">
                  当前默认
                </FeishuPill>
              )}
              {isLatest && record.status !== 'active' && (
                <span className="text-[11px] px-1.5 py-0.5 bg-feishu-blue-light text-feishu-blue rounded font-normal">
                  最新版
                </span>
              )}
            </div>
            <span className="text-[12px] text-feishu-text-muted truncate block mt-0.5 font-normal">
              {record.path || '未指定路径'}
            </span>
          </div>
        );
      },
    },
    {
      key: 'version',
      title: '版本号',
      dataIndex: 'version',
      dataType: 'select',
      width: 130,
      render: (version, record) => {
        let variant: 'orange' | 'blue' | 'purple' = 'blue';
        if (record.sourceType === 'custom_installed') {
          variant = 'orange';
        } else if (record.sourceType === 'online_release') {
          variant = 'purple';
        }
        return (
          <FeishuPill variant={variant} showDot={false} className="text-[12px] h-[22px] px-2.5 font-normal">
            {version}
          </FeishuPill>
        );
      },
    },
    {
      key: 'platform',
      title: '平台架构',
      dataIndex: 'platform',
      dataType: 'text',
      width: 180,
      render: (platform) => (
        <span className="text-[14px] text-feishu-text-secondary flex items-center gap-1.5 font-normal">
          <Cpu className="w-3.5 h-3.5 text-feishu-text-muted" />
          {platform}
        </span>
      ),
    },
    {
      key: 'sizeDisplay',
      title: '文件体积',
      dataIndex: 'sizeDisplay',
      dataType: 'text',
      width: 120,
      render: (size) => (
        <span className="text-[14px] text-feishu-text-secondary tabular-nums font-normal">
          {size}
        </span>
      ),
    },
    {
      key: 'publishedAt',
      title: '发布/引入时间',
      dataIndex: 'publishedAt',
      dataType: 'date',
      width: 140,
      render: (date) => (
        <span className="text-[14px] text-feishu-text-secondary tabular-nums font-normal">
          {date}
        </span>
      ),
    },
    {
      key: 'status',
      title: '引擎状态',
      dataIndex: 'status',
      dataType: 'select',
      width: 130,
      options: [
        { label: '使用中', value: 'active', pillVariant: 'green' },
        { label: '已就绪', value: 'installed', pillVariant: 'blue' },
        { label: '云端可下载', value: 'online', pillVariant: 'gray' },
      ],
      render: (_, record) => {
        if (record.status === 'active') {
          return (
            <FeishuPill variant="green" showDot={true} className="text-[12px] h-[22px] px-2.5 font-normal">
              使用中
            </FeishuPill>
          );
        }
        if (record.status === 'installed') {
          return (
            <FeishuPill variant="blue" showDot={true} className="text-[12px] h-[22px] px-2.5 font-normal">
              已就绪
            </FeishuPill>
          );
        }
        return (
          <FeishuPill variant="gray" showDot={false} className="text-[12px] h-[22px] px-2.5 font-normal">
            云端可下载
          </FeishuPill>
        );
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: 220,
      render: (_, record) => {
        // 本地已有核心（已安装 / 活跃使用中）
        if (record.status === 'active' || record.status === 'installed') {
          return (
            <div className="flex items-center gap-1.5">
              {record.status !== 'active' && (
                <FeishuActionLink
                  variant="primary"
                  onClick={() => {
                    onSelectCore(record.id);
                    feishuToast.success(`已切换默认 FRP 核心为: ${record.name}`);
                  }}
                >
                  设为默认
                </FeishuActionLink>
              )}
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

        // 云端待下载项
        return (
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => handleOpenDownloadModal(record.rawRelease)}
              title={`点击选择下载位置并安装 FRP ${record.version} 核心`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-normal rounded-[4px] bg-feishu-blue text-white hover:bg-feishu-blue-hover cursor-pointer transition-all shadow-2xs active:scale-95"
            >
              <DownloadIcon className="w-3.5 h-3.5 shrink-0 text-white" />
              <span>下载核心</span>
            </button>
          </div>
        );
      },
    },
  ], [activeCoreId, onSelectCore]);

  const tabs = [
    { key: 'all', label: '全部核心引擎', count: unifiedData.length },
    { key: 'installed', label: '本地已就绪', count: installedCount },
    { key: 'online', label: 'GitHub 官方版本库', count: onlineCount },
    { key: 'custom', label: '自定义导入', count: customCount },
  ];

  return (
    <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-4 max-w-7xl mx-auto select-none pb-12">
      {/* 1. 顶部当前默认核心状态卡片 (1:1 飞书标准白色卡片风格) */}
      <div className="rounded-xl border border-feishu-border bg-white p-4.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {activeCore ? (
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-[8px] bg-feishu-blue text-white flex items-center justify-center shadow-xs shrink-0">
                <PluginIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-[15px] font-medium text-feishu-text-primary">
                    {activeCore.name}
                  </h2>
                  <FeishuPill variant="green" showDot={true} className="text-[11px] h-[20px] px-2 font-normal">
                    当前默认
                  </FeishuPill>
                  <span className="text-[12px] text-feishu-blue font-normal bg-feishu-blue-light px-2 py-0.5 rounded-[4px] tabular-nums">
                    {activeCore.version}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[12px] text-feishu-text-secondary mt-1 flex-wrap font-normal">
                  <span className="flex items-center gap-1">
                    <Folder className="w-3.5 h-3.5 text-feishu-text-muted" />
                    {activeCore.path || '未指定路径'}
                  </span>
                  <span>•</span>
                  <span>架构: <strong>{activeCore.os || 'Windows'} {activeCore.arch || 'x86_64'}</strong></span>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-feishu-success">
                    <ShieldCheck className="w-3.5 h-3.5" /> 核心已就绪
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-[8px] bg-feishu-warning-bg text-feishu-warning flex items-center justify-center shadow-xs shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-[15px] font-medium text-feishu-text-primary">
                    尚未就绪：未配置任何 FRP 核心
                  </h2>
                  <FeishuPill variant="orange" showDot={true} className="text-[11px] h-[20px] px-2 font-normal">
                    待下载或绑定
                  </FeishuPill>
                </div>
                <p className="text-[12px] text-feishu-text-muted mt-1 font-normal">
                  系统尚未安装任何 FRP 核心。请在下方表格中点击 <strong>【下载核心】</strong> 选择安装位置，或点击右上角 <strong>【选择本地已有核心】</strong> 导入文件。
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5">
            <Button
              size="sm"
              variant="default"
              onClick={handleTriggerFilePicker}
              className="h-8 text-[13px] px-3.5 rounded-[6px] bg-feishu-blue text-white hover:bg-feishu-blue-hover cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              选择本地已有核心
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const url = activeCore?.version
                  ? `https://github.com/fatedier/frp/releases/tag/${activeCore.version}`
                  : 'https://github.com/fatedier/frp/releases';
                window.open(url, '_blank');
              }}
              className="h-8 text-[13px] px-3 rounded-[6px] border-feishu-border bg-white text-feishu-text-primary hover:bg-[#F2F3F5]"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1 text-feishu-text-muted" />
              发行日志
            </Button>
          </div>
        </div>
      </div>

      {/* 2. 飞书多维数据表格 (移除顶栏加速源，聚焦核心管理) */}
      <FeishuDataTable
        title="FRP 核心引擎管理列表"
        tabs={tabs}
        activeTabKey={activeTab}
        onTabChange={(key) => setActiveTab(key as CoreTabKey)}
        columns={columns}
        data={filteredData}
        rowKey="id"
        selectable={false}
        searchPlaceholder="在核心列表中搜索版本、路径或名称..."
        addButtonText="+ 选择本地核心"
        onAdd={handleTriggerFilePicker}
        customRightTools={
          <div className="flex items-center gap-2">
            <Button
              size="iconSm"
              variant="ghost"
              onClick={loadReleases}
              disabled={loadingReleases}
              title="刷新 GitHub Releases 版本库"
              className="w-8 h-8 rounded-[6px]"
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
              className="h-8 px-3 text-[13px] rounded-[6px] border-feishu-border bg-white hover:bg-[#F2F3F5]"
            >
              取消
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirmEditModal}
              className="h-8 px-4 text-[13px] rounded-[6px] bg-feishu-blue text-white hover:bg-feishu-blue-hover"
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
            <label className="block text-[12px] font-medium text-feishu-text-primary mb-1 flex items-center justify-between">
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

          <label className="flex items-center gap-2 text-[13px] text-feishu-text-primary cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={editModal.setAsDefault}
              onChange={(e) => setEditModal((prev) => ({ ...prev, setAsDefault: e.target.checked }))}
              className="rounded border-feishu-border text-feishu-blue focus:ring-feishu-blue w-4 h-4 cursor-pointer"
            />
            <span>设为系统默认工作 FRP 核心</span>
          </label>
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
                disabled={downloadModal.isDownloading}
                className="h-8 px-3.5 text-[13px] rounded-[6px] border-feishu-border bg-white text-feishu-text-primary hover:bg-[#F2F3F5]"
              >
                取消
              </Button>
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
                  <span className="text-[11px] text-feishu-text-muted shrink-0">默认已匹配本机</span>
                </label>
                <FeishuSelect
                  options={PLATFORM_PRESETS}
                  value={`${downloadModal.targetOs}_${downloadModal.targetArch}`}
                  onChange={(val) => handleChangeTargetPlatform(val || 'windows_amd64')}
                  size="md"
                  className="w-full"
                />
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

            {/* 设为默认选项 */}
            <label className="flex items-center gap-2 text-[13px] text-feishu-text-primary cursor-pointer select-none pt-0.5">
              <input
                type="checkbox"
                checked={downloadModal.downloadAsDefault}
                onChange={(e) => setDownloadModal((prev) => ({ ...prev, downloadAsDefault: e.target.checked }))}
                className="rounded border-feishu-border text-feishu-blue focus:ring-feishu-blue w-4 h-4 cursor-pointer"
              />
              <span>下载完成后自动设为系统默认 FRP 工作引擎</span>
            </label>
          </div>
        </FeishuDialog>
      )}
    </div>
  );
};
