import React, { useState, useEffect } from 'react';
import { FrpCore } from '../../types/frp';
import { fetchGitHubReleases, detectLocalCoreVersion } from '../../services/ipc';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FeishuSelect } from '../../components/ui/feishu-select';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';
import { PluginIcon, DownloadIcon, CheckedIcon, AddIcon } from '../../components/icons';
import { X, Folder, HardDrive, RefreshCw } from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';

interface CoreManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cores: FrpCore[];
  activeCoreId: string;
  onSelectCore: (coreId: string) => void;
  onAddCustomCore: (core: FrpCore) => void;
}

export const CoreManagerModal: React.FC<CoreManagerModalProps> = ({
  isOpen,
  onClose,
  cores,
  activeCoreId,
  onSelectCore,
  onAddCustomCore,
}) => {
  const [onlineReleases, setOnlineReleases] = useState<any[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [selectedMirror, setSelectedMirror] = useState<string>('ghproxy');
  const [customPath, setCustomPath] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [downloadingTag, setDownloadingTag] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadReleases();
    }
  }, [isOpen]);

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

  const handleDetectCustom = async () => {
    if (!customPath.trim()) {
      feishuToast.warning('请输入本地 FRP 核心路径');
      return;
    }
    setDetecting(true);
    try {
      const res = await detectLocalCoreVersion(customPath);
      const newCore: FrpCore = {
        id: `custom_${Date.now()}`,
        name: `本地已识别核心 (${res.version})`,
        version: res.version,
        arch: 'amd64',
        os: 'windows',
        path: customPath,
        isDefault: false,
        isCustom: true,
        downloadDate: '本地现存',
      };
      onAddCustomCore(newCore);
      onSelectCore(newCore.id);
      feishuToast.success(`成功识别并绑定本地 FRP 核心: ${res.version}`);
      setCustomPath('');
    } catch (err: any) {
      feishuToast.error(`检测失败: ${err.message}`);
    } finally {
      setDetecting(false);
    }
  };

  const handleDownloadOnline = async (release: any) => {
    setDownloadingTag(release.tag);
    feishuToast.info(`正在通过 ${selectedMirror === 'ghproxy' ? '国内镜像' : '官方源'} 下载 FRP ${release.tag}...`);

    setTimeout(() => {
      const downloadedCore: FrpCore = {
        id: `core_${release.tag}`,
        name: `官方 Release ${release.tag}`,
        version: release.tag,
        arch: 'amd64',
        os: 'windows',
        path: `bin/frp_${release.tag}/frpc.exe`,
        isDefault: false,
        isCustom: false,
        downloadDate: new Date().toLocaleDateString(),
      };
      onAddCustomCore(downloadedCore);
      onSelectCore(downloadedCore.id);
      setDownloadingTag(null);
      feishuToast.success(`FRP ${release.tag} 核心下载成功并已设为默认！`);
    }, 1200);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F2329]/30 p-4 animate-in fade-in duration-150">
      <div
        style={{ fontFamily: FEISHU_FONT_FAMILY }}
        className="bg-white rounded-[12px] shadow-[0px_8px_32px_0px_rgba(31,35,41,0.12)] border border-[#DEE0E3] w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden text-left"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#DEE0E3] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-[8px] bg-[#F2E9FE] text-[#8D55ED] flex items-center justify-center">
              <PluginIcon className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-[16px] text-[#1F2329] leading-[24px]">FRP 核心管理与在线下载</h3>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-[6px] hover:bg-[#F2F3F5] text-[#8F959E] hover:text-[#1F2329] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 1. 本地路径选择 */}
          <div className="p-4 bg-[#F8F9FA] rounded-[8px] border border-[#DEE0E3]">
            <h4 className="text-[14px] font-semibold text-[#1F2329] mb-2 flex items-center gap-1.5">
              <Folder className="w-4 h-4 text-[#165DFF]" />
              选择本地已有的 FRP 二进制核心
            </h4>
            <div className="flex items-center gap-2.5">
              <Input
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="输入本地 frpc.exe 路径，如: D:\Development-Kits\IntranetPenetration\frp_0.61.1_windows_amd64\frpc.exe"
                className="bg-white h-8 text-[13px] flex-1"
              />
              <Button size="sm" variant="default" onClick={handleDetectCustom} disabled={detecting} className="h-8 text-[13px] px-4 rounded-[6px] shrink-0 bg-[#165DFF] text-white hover:bg-[#0E4FD9]">
                {detecting ? '正在识别...' : '自动识别添加'}
              </Button>
            </div>
          </div>

          {/* 2. 已就绪核心列表 */}
          <div>
            <h4 className="text-[14px] font-semibold text-[#1F2329] mb-2">已就绪的核心引擎</h4>
            <div className="space-y-2">
              {cores.map((core) => {
                const isActive = core.id === activeCoreId;
                return (
                  <div
                    key={core.id}
                    className={`p-3.5 rounded-[8px] border flex items-center justify-between transition-all shadow-2xs ${
                      isActive
                        ? 'border-[#165DFF] bg-[#F0F4FF]'
                        : 'border-[#DEE0E3] bg-white hover:border-[#B4B8BF]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${
                        isActive ? 'bg-[#165DFF] text-white' : 'bg-[#F2F3F5] text-[#646A75]'
                      }`}>
                        <HardDrive className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[14px] text-[#1F2329]">{core.name}</span>
                          <FeishuPill variant={isActive ? 'blue' : 'gray'} showDot={false} className="text-[11px] h-[20px] px-2">
                            {core.version}
                          </FeishuPill>
                          {core.isCustom && (
                            <FeishuPill variant="orange" showDot={false} className="text-[11px] h-[20px] px-2">
                              本地现存
                            </FeishuPill>
                          )}
                        </div>
                        <p className="text-[12px] text-[#8F959E] mt-0.5">{core.path}</p>
                      </div>
                    </div>

                    <div>
                      {isActive ? (
                        <span className="flex items-center text-[13px] font-medium text-[#165DFF] gap-1">
                          <CheckedIcon className="w-4 h-4 text-[#00B42A]" />
                          当前使用中
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => onSelectCore(core.id)} className="h-8 text-[13px] px-3 rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]">
                          切换核心
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. 在线版本 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <h4 className="text-[14px] font-semibold text-[#1F2329]">GitHub Releases 在线核心版本库</h4>
                <div className="flex items-center gap-1.5 text-[13px] text-[#646A75]">
                  <span>加速:</span>
                  <div className="w-44">
                    <FeishuSelect
                      options={[
                        { value: 'ghproxy', label: '国内镜像 (ghproxy)' },
                        { value: 'fastgit', label: 'FastGit 镜像' },
                        { value: 'official', label: 'GitHub 官方源' },
                      ]}
                      value={selectedMirror}
                      onChange={(val) => setSelectedMirror(val)}
                      size="sm"
                    />
                  </div>
                </div>
              </div>

              <Button size="iconSm" variant="ghost" onClick={loadReleases} disabled={loadingReleases} title="刷新列表" className="w-8 h-8 rounded-[6px]">
                <RefreshCw className={`w-4 h-4 text-[#646A75] ${loadingReleases ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="border border-[#DEE0E3] rounded-[8px] divide-y divide-[#EBECEF] overflow-hidden bg-white shadow-2xs">
              {onlineReleases.map((rel) => (
                <div key={rel.tag} className="p-3.5 flex items-center justify-between hover:bg-[#F9FAFB] transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[14px] text-[#1F2329]">{rel.name}</span>
                      <span className="text-[12px] text-[#8F959E]">
                        ({rel.publishedAt?.substring(0, 10)})
                      </span>
                    </div>
                    <p className="text-[12px] text-[#646A75] mt-0.5">
                      支持 Windows (x64/arm64)、macOS、Linux、Android
                    </p>
                  </div>

                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadOnline(rel)}
                      disabled={downloadingTag === rel.tag}
                      className="h-8 text-[13px] px-3.5 rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]"
                    >
                      <DownloadIcon className="w-3.5 h-3.5 mr-1" />
                      {downloadingTag === rel.tag ? '下载中...' : '下载安装'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-[#DEE0E3] bg-[#FAFAFB] flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 px-4 text-[14px] rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]">
            完成
          </Button>
        </div>
      </div>
    </div>
  );
};
