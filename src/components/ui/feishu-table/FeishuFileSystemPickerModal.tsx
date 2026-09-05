import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  fetchFileSystemList,
  createFileSystemDirectory,
  pickCoreFileNative,
  pickDirectoryNative,
  FileSystemItem,
  FileSystemDrive,
  FileSystemShortcut,
} from '../../../services/ipc';
import { FeishuDialog } from '../FeishuDialog';
import { FeishuInput } from './FeishuInput';
import { FeishuPill } from './FeishuPill';
import { FeishuEmptyState } from './FeishuEmptyState';
import { Button } from '../button';
import { FEISHU_FONT_FAMILY } from './FeishuDataTable';
import {
  Folder,
  FolderPlus,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RefreshCw,
  HardDrive,
  User,
  Monitor,
  Download,
  FileText,
  FileCode,
  File,
  Check,
  ChevronRight,
  Laptop,
} from 'lucide-react';
import { feishuToast } from '../FeishuToast';

export interface FeishuFileSystemPickerModalProps {
  visible: boolean;
  mode?: 'file' | 'directory';
  title?: string;
  initialPath?: string;
  acceptExtensions?: string[];
  onSelect: (selectedPath: string, item?: FileSystemItem) => void;
  onCancel: () => void;
  allowNativePicker?: boolean;
}

export const FeishuFileSystemPickerModal: React.FC<FeishuFileSystemPickerModalProps> = ({
  visible,
  mode = 'file',
  title,
  initialPath = '',
  onSelect,
  onCancel,
  allowNativePicker = true,
}) => {
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const [drives, setDrives] = useState<FileSystemDrive[]>([]);
  const [shortcuts, setShortcuts] = useState<FileSystemShortcut[]>([]);
  const [items, setItems] = useState<FileSystemItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // 选中的条目
  const [selectedItem, setSelectedItem] = useState<FileSystemItem | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>('');

  // 面包屑 / 地址栏编辑状态
  const [isEditingAddress, setIsEditingAddress] = useState<boolean>(false);
  const [addressInput, setAddressInput] = useState<string>('');

  // 搜索关键字
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 新建文件夹行内输入状态
  const [isCreatingDir, setIsCreatingDir] = useState<boolean>(false);
  const [newDirName, setNewDirName] = useState<string>('');
  const newDirInputRef = useRef<HTMLInputElement>(null);

  // 拖拽高亮状态
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // 加载目录
  const loadDirectory = async (targetPath?: string, recordHistory = true) => {
    setLoading(true);
    setSelectedItem(null);
    try {
      const res = await fetchFileSystemList(targetPath);
      if (res.success) {
        setCurrentPath(res.currentPath);
        setParentPath(res.parentPath);
        setAddressInput(res.currentPath);
        setDrives(res.drives || []);
        setShortcuts(res.shortcuts || []);
        setItems(res.items || []);

        if (mode === 'directory') {
          setSelectedPath(res.currentPath);
        } else {
          setSelectedPath('');
        }

        if (recordHistory) {
          setHistory((prev) => {
            const next = prev.slice(0, historyIndex + 1);
            return [...next, res.currentPath];
          });
          setHistoryIndex((prev) => prev + 1);
        }
      } else {
        feishuToast.error(res.error || '无法访问该目录');
      }
    } catch (e: any) {
      feishuToast.error(`读取目录失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setHistory([]);
      setHistoryIndex(-1);
      setIsEditingAddress(false);
      setSearchKeyword('');
      setIsCreatingDir(false);
      loadDirectory(initialPath || undefined, true);
    }
  }, [visible, initialPath]);

  // 后退
  const handleGoBack = () => {
    if (historyIndex > 0) {
      const prevPath = history[historyIndex - 1];
      setHistoryIndex((idx) => idx - 1);
      loadDirectory(prevPath, false);
    }
  };

  // 前进
  const handleGoForward = () => {
    if (historyIndex < history.length - 1) {
      const nextPath = history[historyIndex + 1];
      setHistoryIndex((idx) => idx + 1);
      loadDirectory(nextPath, false);
    }
  };

  // 向上返回父级
  const handleGoUp = () => {
    if (parentPath) {
      loadDirectory(parentPath, true);
    }
  };

  // 地址栏回车直达
  const handleAddressSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (addressInput.trim()) {
      setIsEditingAddress(false);
      loadDirectory(addressInput.trim(), true);
    }
  };

  // 面包屑节点点击
  const handleBreadcrumbClick = (index: number, segments: string[]) => {
    let target = '';
    if (segments[0].includes(':')) {
      // Windows 盘符
      target = segments.slice(0, index + 1).join('\\');
      if (index === 0) target += '\\';
    } else {
      // Unix 根目录
      target = '/' + segments.slice(1, index + 1).join('/');
    }
    loadDirectory(target, true);
  };

  // 拆分面包屑路径
  const breadcrumbSegments = useMemo(() => {
    if (!currentPath) return [];
    if (currentPath.includes('\\')) {
      return currentPath.split('\\').filter(Boolean);
    }
    return currentPath.split('/').filter(Boolean);
  }, [currentPath]);

  // 过滤后的条目列表
  const filteredItems = useMemo(() => {
    let list = items;

    if (mode === 'directory') {
      list = list.filter((i) => i.isDirectory);
    }

    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(kw));
    }

    return list;
  }, [items, mode, searchKeyword]);

  // 单击条目
  const handleItemClick = (item: FileSystemItem) => {
    setSelectedItem(item);
    setSelectedPath(item.path);
  };

  // 双击条目：如果是目录则进入，如果是文件则直接确认选择
  const handleItemDoubleClick = (item: FileSystemItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path, true);
    } else {
      if (mode === 'file') {
        onSelect(item.path, item);
      }
    }
  };

  // 确认新建文件夹
  const handleConfirmCreateDir = async () => {
    if (!newDirName.trim()) {
      setIsCreatingDir(false);
      return;
    }

    const separator = currentPath.includes('\\') ? '\\' : '/';
    const targetDir = `${currentPath.replace(/[\/\\]+$/, '')}${separator}${newDirName.trim()}`;
    const res = await createFileSystemDirectory(targetDir);
    if (res.success) {
      feishuToast.success(`成功创建文件夹: ${newDirName}`);
      setIsCreatingDir(false);
      setNewDirName('');
      loadDirectory(targetDir, true);
    } else {
      feishuToast.error(`创建文件夹失败: ${res.error}`);
    }
  };

  // 最终确认选择
  const handleConfirmSelect = () => {
    const finalPath = selectedPath || (mode === 'directory' ? currentPath : '');
    if (!finalPath) {
      feishuToast.warning(mode === 'directory' ? '请选择一个目标文件夹' : '请选择一个文件');
      return;
    }
    onSelect(finalPath, selectedItem || undefined);
  };

  // 唤起系统原生选择器备用入口
  const handleOpenNativePicker = async () => {
    if (mode === 'directory') {
      const res = await pickDirectoryNative();
      if (res) {
        onSelect(res);
      }
    } else {
      const res = await pickCoreFileNative();
      if (res) {
        onSelect(res);
      }
    }
  };

  // 拖拽文件到选择器窗口中
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped = e.dataTransfer.files[0];
      const filePath = (dropped as any).path || dropped.name;
      if (filePath) {
        onSelect(filePath);
        feishuToast.success(`已获取文件: ${dropped.name}`);
      }
    }
  };

  const renderIconByShortcut = (iconName: string) => {
    switch (iconName) {
      case 'desktop':
        return <Monitor className="w-3.5 h-3.5 text-[#3370FF]" />;
      case 'download':
        return <Download className="w-3.5 h-3.5 text-[#00B42A]" />;
      case 'document':
        return <FileText className="w-3.5 h-3.5 text-[#FF7D00]" />;
      case 'user':
        return <User className="w-3.5 h-3.5 text-[#722ED1]" />;
      default:
        return <Folder className="w-3.5 h-3.5 text-[#3370FF]" />;
    }
  };

  const defaultTitle = mode === 'directory' ? '选择安装与解压目标目录' : '选择本地 FRP 核心程序';

  return (
    <FeishuDialog
      visible={visible}
      onCancel={onCancel}
      title={
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[6px] bg-[#E8F3FF] text-[#165DFF] flex items-center justify-center">
            {mode === 'directory' ? <Folder className="w-4 h-4" /> : <FileCode className="w-4 h-4" />}
          </div>
          <span className="text-[15px] font-semibold text-[#1F2329]">
            {title || defaultTitle}
          </span>
          <FeishuPill variant="blue" showDot={false} className="text-[11px] h-[20px] px-2 font-normal">
            {mode === 'directory' ? '目录选择' : '文件选择'}
          </FeishuPill>
        </div>
      }
      width={780}
      showIcon={false}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2 flex-1 min-w-0 mr-4">
            {allowNativePicker && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenNativePicker}
                className="h-8 px-2.5 text-[12px] rounded-[6px] border-[#DEE0E3] bg-white text-[#646A75] hover:text-[#165DFF] hover:border-[#165DFF] shrink-0 gap-1"
                title="呼出系统原生资源管理器窗口"
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>系统原生窗口</span>
              </Button>
            )}

            <div className="text-[12px] text-[#646A75] truncate flex items-center gap-1 font-mono">
              <span className="text-[#8F959E] shrink-0">已选:</span>
              <span className="text-[#1F2329] font-medium truncate" title={selectedPath || currentPath}>
                {selectedPath || (mode === 'directory' ? currentPath : '尚未选择')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="h-8 px-3.5 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5]"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleConfirmSelect}
              className="h-8 px-4 text-[13px] rounded-[6px] bg-[#165DFF] text-white hover:bg-[#0E4FD9]"
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              {mode === 'directory' ? '选择此文件夹' : '确认选择'}
            </Button>
          </div>
        </div>
      }
    >
      <div
        style={{ fontFamily: FEISHU_FONT_FAMILY }}
        className="flex flex-col h-[480px] bg-white rounded-[8px] border border-[#DEE0E3] overflow-hidden select-none relative"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
      >
        {/* 顶部工具与面包屑导航栏 */}
        <div className="h-11 px-3 border-b border-[#DEE0E3] bg-[#F8F9FA] flex items-center justify-between gap-2 shrink-0">
          {/* 导航前进后退与向上 */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={historyIndex <= 0}
              onClick={handleGoBack}
              title="后退"
              className="w-7 h-7 rounded-[4px] flex items-center justify-center text-[#646A75] hover:bg-[#EAEBED] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={historyIndex >= history.length - 1}
              onClick={handleGoForward}
              title="前进"
              className="w-7 h-7 rounded-[4px] flex items-center justify-center text-[#646A75] hover:bg-[#EAEBED] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={!parentPath}
              onClick={handleGoUp}
              title="返回上级目录"
              className="w-7 h-7 rounded-[4px] flex items-center justify-center text-[#646A75] hover:bg-[#EAEBED] disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => loadDirectory(currentPath, false)}
              title="刷新"
              className="w-7 h-7 rounded-[4px] flex items-center justify-center text-[#646A75] hover:bg-[#EAEBED] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#165DFF]' : ''}`} />
            </button>
          </div>

          {/* 面包屑 / 地址栏 */}
          <div className="flex-1 min-w-0 px-1">
            {!isEditingAddress ? (
              <div
                onClick={() => setIsEditingAddress(true)}
                className="h-7 px-2.5 bg-white border border-[#DEE0E3] rounded-[6px] flex items-center gap-1 text-[12px] text-[#1F2329] overflow-x-auto overflow-y-hidden whitespace-nowrap scrollbar-none cursor-text hover:border-[#165DFF]/60 transition-colors shadow-2xs"
                title="点击直接输入或复制路径"
              >
                {breadcrumbSegments.map((seg, idx) => (
                  <React.Fragment key={idx}>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBreadcrumbClick(idx, breadcrumbSegments);
                      }}
                      className="px-1 py-0.5 rounded hover:bg-[#E8F3FF] hover:text-[#165DFF] cursor-pointer transition-colors"
                    >
                      {seg}
                    </span>
                    {idx < breadcrumbSegments.length - 1 && (
                      <ChevronRight className="w-3 h-3 text-[#8F959E] shrink-0" />
                    )}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <form onSubmit={handleAddressSubmit} className="h-7 flex items-center">
                <input
                  type="text"
                  autoFocus
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  onBlur={() => handleAddressSubmit()}
                  placeholder="输入目标绝对路径并回车..."
                  className="w-full h-7 px-2 text-[12px] bg-white border border-[#165DFF] ring-2 ring-[#165DFF]/20 rounded-[6px] focus:outline-none text-[#1F2329]"
                />
              </form>
            )}
          </div>

          {/* 右侧工具：新建文件夹与搜索 */}
          <div className="flex items-center gap-1.5 shrink-0">
            {mode === 'directory' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsCreatingDir(true);
                  setTimeout(() => newDirInputRef.current?.focus(), 50);
                }}
                className="h-7 px-2 text-[12px] rounded-[6px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#EAEBED] gap-1"
                title="在当前目录新建文件夹"
              >
                <FolderPlus className="w-3.5 h-3.5 text-[#165DFF]" />
                <span>新建</span>
              </Button>
            )}

            <div className="w-36">
              <FeishuInput
                value={searchKeyword}
                onChange={(val) => setSearchKeyword(val)}
                placeholder="搜索名称..."
                containerClassName="h-7 text-[12px]"
              />
            </div>
          </div>
        </div>

        {/* 拖拽指示蒙层 */}
        {isDraggingOver && (
          <div className="absolute inset-x-0 bottom-0 top-11 bg-[#165DFF]/10 backdrop-blur-[1px] border-2 border-dashed border-[#165DFF] z-20 flex flex-col items-center justify-center text-[#165DFF] pointer-events-none animate-in fade-in">
            <Download className="w-8 h-8 mb-2 animate-bounce" />
            <span className="font-semibold text-[14px]">释放文件即可直接选定绑定</span>
          </div>
        )}

        {/* 主体两栏布局：左侧驱动器/快捷栏 + 右侧文件目录列表 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧快捷导航栏 */}
          <div className="w-44 bg-[#F8F9FA] border-r border-[#DEE0E3] p-2 overflow-y-auto space-y-3 shrink-0">
            {/* 磁盘驱动器 */}
            <div>
              <div className="px-2 py-1 text-[11px] font-semibold text-[#8F959E] uppercase tracking-wider">
                磁盘驱动器
              </div>
              <div className="space-y-0.5">
                {drives.map((d, i) => {
                  const isActive = currentPath.toLowerCase().startsWith(d.path.toLowerCase());
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => loadDirectory(d.path, true)}
                      className={`w-full px-2.5 py-1.5 rounded-[6px] text-left text-[12px] flex items-center gap-2 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#E8F3FF] text-[#165DFF] font-medium'
                          : 'text-[#1F2329] hover:bg-[#EAEBED]'
                      }`}
                    >
                      <HardDrive className={`w-3.5 h-3.5 ${isActive ? 'text-[#165DFF]' : 'text-[#646A75]'}`} />
                      <span className="truncate">{d.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 常用快捷位置 */}
            {shortcuts.length > 0 && (
              <div>
                <div className="px-2 py-1 text-[11px] font-semibold text-[#8F959E] uppercase tracking-wider">
                  快速访问
                </div>
                <div className="space-y-0.5">
                  {shortcuts.map((s, i) => {
                    const isActive = currentPath.toLowerCase() === s.path.toLowerCase();
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => loadDirectory(s.path, true)}
                        className={`w-full px-2.5 py-1.5 rounded-[6px] text-left text-[12px] flex items-center gap-2 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#E8F3FF] text-[#165DFF] font-medium'
                            : 'text-[#1F2329] hover:bg-[#EAEBED]'
                        }`}
                      >
                        {renderIconByShortcut(s.icon)}
                        <span className="truncate">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 右侧文件/目录列表 */}
          <div className="flex-1 bg-white flex flex-col overflow-hidden">
            {/* 新建文件夹行内输入 */}
            {isCreatingDir && (
              <div className="p-2 border-b border-[#DEE0E3] bg-[#F0F4FF] flex items-center gap-2">
                <Folder className="w-4 h-4 text-[#165DFF] shrink-0" />
                <input
                  ref={newDirInputRef}
                  type="text"
                  value={newDirName}
                  onChange={(e) => setNewDirName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreateDir();
                    if (e.key === 'Escape') setIsCreatingDir(false);
                  }}
                  placeholder="输入文件夹名称后回车..."
                  className="flex-1 h-7 px-2 text-[12px] bg-white border border-[#165DFF] rounded-[4px] focus:outline-none text-[#1F2329]"
                />
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleConfirmCreateDir}
                  className="h-7 px-2.5 text-[12px] rounded-[4px] bg-[#165DFF] text-white"
                >
                  创建
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsCreatingDir(false)}
                  className="h-7 px-2 text-[12px]"
                >
                  取消
                </Button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center text-[#8F959E]">
                  <FeishuEmptyState
                    title="当前目录为空"
                    description={
                      mode === 'directory'
                        ? '此目录下无子文件夹，可点击“选择此文件夹”直接使用'
                        : '未检测到可执行文件，请切换目录或从外部拖拽文件'
                    }
                    className="py-8"
                  />
                </div>
              ) : (
                <table className="w-full text-left text-[12px] border-collapse">
                  <thead>
                    <tr className="bg-[#F8F9FA] text-[#646A75] border-b border-[#EFF0F1] sticky top-0 z-10">
                      <th className="py-2 px-3 font-medium">名称</th>
                      <th className="py-2 px-3 font-medium w-28">大小</th>
                      <th className="py-2 px-3 font-medium w-40">修改日期</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2F3F5]">
                    {filteredItems.map((item, idx) => {
                      const isSelected = selectedPath.toLowerCase() === item.path.toLowerCase();
                      return (
                        <tr
                          key={idx}
                          onClick={() => handleItemClick(item)}
                          onDoubleClick={() => handleItemDoubleClick(item)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#E8F3FF] text-[#165DFF]'
                              : 'hover:bg-[#F9FAFB] text-[#1F2329]'
                          }`}
                        >
                          <td className="py-2 px-3 flex items-center gap-2.5 min-w-0">
                            {item.isDirectory ? (
                              <Folder className="w-4 h-4 text-[#3370FF] shrink-0" />
                            ) : item.isFrpBinary ? (
                              <div className="w-4 h-4 rounded bg-[#E8F7EC] text-[#00B42A] flex items-center justify-center shrink-0">
                                <FileCode className="w-3 h-3" />
                              </div>
                            ) : (
                              <File className="w-4 h-4 text-[#8F959E] shrink-0" />
                            )}

                            <span className="truncate font-medium" title={item.name}>
                              {item.name}
                            </span>

                            {item.isFrpBinary && (
                              <FeishuPill variant="green" showDot={false} className="text-[10px] h-[18px] px-1.5 font-normal">
                                FRP 引擎
                              </FeishuPill>
                            )}
                          </td>
                          <td className="py-2 px-3 text-[#646A75] tabular-nums">
                            {item.isDirectory ? '-' : `${(item.size / 1024).toFixed(1)} KB`}
                          </td>
                          <td className="py-2 px-3 text-[#8F959E] tabular-nums truncate">
                            {item.mtime}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </FeishuDialog>
  );
};
