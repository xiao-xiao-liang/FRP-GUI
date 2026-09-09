import React from 'react';
import { Card } from '../../components/ui/card';
import { FeishuPill } from '@/components/ui/feishu-table';
import { Button } from '../../components/ui/button';
import { Download, Calendar, Link2 } from 'lucide-react';
import { DownloadIcon } from '@/components/icons';
import { FeishuTooltip } from '../../components/ui/tooltip';
import { FeishuSkeleton } from '../../components/ui/feishu-skeleton';
import { UnifiedCoreRow } from './CoreManagerPage';

function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || bytes <= 0) return '0 B';
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function taskProgress(core: UnifiedCoreRow): number {
  const task = core.task;
  if (!task) return 0;
  if (task.phase === 'downloading' && task.totalBytes) return Math.min(85, Math.round((task.receivedBytes / task.totalBytes) * 85));
  if (task.phase === 'verifying') return 85;
  if (task.phase === 'extracting' && task.totalEntries) return 90 + Math.round((task.extractedEntries || 0) / task.totalEntries * 9);
  if (task.phase === 'inspecting') return 99;
  return task.phase === 'completed' ? 100 : 0;
}

export interface CoreCardProps {
  core: UnifiedCoreRow;
  onSelect: (id: string) => void;
  onEdit: (core: UnifiedCoreRow) => void;
  onDelete: (core: UnifiedCoreRow) => void;
  onDownload: (release: any) => void;
  onCopyLink?: (core: UnifiedCoreRow) => void;
}

export const CoreCard: React.FC<CoreCardProps> = ({
  core,
  onSelect,
  onEdit,
  onDelete,
  onDownload,
  onCopyLink,
}) => {
  const isLatest = core.version === 'v0.61.1';
  const task = core.task;
  const isInProgress = core.availability === 'downloading' && Boolean(task);
  const taskLabel = task?.phase === 'downloading'
    ? '下载中'
    : task?.phase === 'verifying'
      ? '正在校验'
      : task?.phase === 'extracting'
        ? '正在解压'
        : task?.phase === 'inspecting'
          ? '正在验真'
          : undefined;

  return (
    <Card className="rounded-[10px] border border-[#DEE0E3] bg-white hover:shadow-xs transition-shadow flex flex-col justify-between p-4 select-none">
      <div>
        {/* 顶部头部：版本（紫色加粗胶囊）、徽章与状态 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <FeishuPill
              variant="purple"
              showDot={false}
              className="font-normal text-[13px] h-5.5 px-2.5 text-feishu-text-primary"
            >
              {core.version}
            </FeishuPill>

            {isLatest && (
              <span className="text-[11px] px-1.5 py-0.5 bg-feishu-blue-light text-[#165DFF] rounded font-normal">
                最新版
              </span>
            )}
          </div>

          <div>
            {isInProgress && (
              <FeishuPill variant="blue" showDot={false} className="text-[11px] h-5 px-2 font-normal">
                {taskLabel}
              </FeishuPill>
            )}
            {!isInProgress && (core.status === 'active' || core.status === 'installed') && (
              <FeishuPill variant="green" showDot={false} className="text-[11px] h-5 px-2 font-normal">
                已下载
              </FeishuPill>
            )}
            {!isInProgress && core.status === 'online' && (
              <FeishuPill variant="gray" showDot={false} className="text-[11px] h-5 px-2 font-normal">
                可下载
              </FeishuPill>
            )}
          </div>
        </div>

        {isInProgress && task && (
          <div className="mt-3 rounded-md border border-[#DEE9FE] bg-[#F5F8FF] p-2.5 text-[12px] text-feishu-text-secondary space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-feishu-text-primary">
                {task.phase === 'extracting' && task.totalEntries
                  ? `正在解压 ${task.extractedEntries || 0} / ${task.totalEntries}`
                  : task.phase === 'downloading'
                    ? '下载进度'
                    : taskLabel}
              </span>
              <span className="tabular-nums text-feishu-blue">{taskProgress(core)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#DEE9FE]">
              <div className="h-full rounded-full bg-feishu-blue transition-[width]" style={{ width: `${taskProgress(core)}%` }} />
            </div>
            {task.phase === 'downloading' && (
              <div className="flex flex-wrap gap-x-2 gap-y-1 tabular-nums">
                <span>{formatBytes(task.receivedBytes)} / {task.totalBytes ? formatBytes(task.totalBytes) : '总大小未知'}</span>
                {task.speedBytesPerSecond !== undefined && <span>{formatBytes(task.speedBytesPerSecond)}/s</span>}
                {task.etaSeconds !== undefined && <span>预计剩余下载时间 {task.etaSeconds} 秒</span>}
              </div>
            )}
            {task.phase === 'extracting' && task.currentFileName && <span>当前文件：{task.currentFileName}</span>}
            {(task.phase === 'verifying' || task.phase === 'inspecting') && <span>目标目录：{task.targetDir}</span>}
          </div>
        )}

        {/* 中间元数据区 */}
        <div className="my-3 pt-2.5 border-t border-[#F2F3F5] space-y-2 text-[12px] text-feishu-text-secondary">
          <div className="flex items-center justify-between">
            <span className="text-feishu-text-muted">文件体积</span>
            <span className="tabular-nums font-medium text-feishu-text-primary bg-[#F2F3F5] px-1.5 py-0.5 rounded text-[11px]">
              {core.sizeDisplay}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-feishu-text-muted flex items-center gap-1">
              <Download className="w-3.5 h-3.5 text-feishu-text-muted shrink-0" />
              <span>下载量</span>
            </span>
            {core.downloadCount && core.downloadCount > 0 ? (
              <FeishuTooltip title={`GitHub 累计下载：${core.downloadCount.toLocaleString()} 次`}>
                <span className="tabular-nums cursor-default">{core.downloadCount.toLocaleString()}</span>
              </FeishuTooltip>
            ) : (
              <span className="tabular-nums">{core.downloadCountDisplay || '—'}</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-feishu-text-muted flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-feishu-text-muted shrink-0" />
              <span>发布时间</span>
            </span>
            <span className="tabular-nums">{core.publishedAt || '—'}</span>
          </div>
        </div>
      </div>

      {/* 底部操作区 */}
      <div className="pt-3 border-t border-[#DEE0E3] flex items-center justify-end gap-1.5">
        {core.status === 'active' || core.status === 'installed' ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(core)}
              className="h-7 text-[12px] px-2 text-feishu-text-secondary hover:text-feishu-text-primary hover:bg-[#F2F3F5] rounded-sm cursor-pointer"
            >
              更改
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(core)}
              className="h-7 text-[12px] px-2 text-feishu-danger hover:bg-feishu-danger-bg rounded-sm cursor-pointer"
            >
              删除
            </Button>
          </>
        ) : (
          <>
            {onCopyLink && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCopyLink(core)}
                className="h-7 text-[12px] px-2.5 rounded-sm border-[#DEE0E3] bg-white text-feishu-text-secondary hover:text-feishu-text-primary hover:bg-[#F2F3F5] cursor-pointer flex items-center gap-1"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>复制链接</span>
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={() => onDownload(core.rawRelease)}
              className="h-7 text-[12px] px-2.5 rounded-sm bg-[#165DFF] hover:bg-[#0E4FD9] text-white cursor-pointer flex items-center gap-1"
            >
              <DownloadIcon className="w-3.5 h-3.5 text-white" />
              <span>下载</span>
            </Button>
          </>
        )}
      </div>
    </Card>
  );
};

export const CoreCardSkeleton: React.FC = () => (
  <Card className="rounded-[10px] border border-[#DEE0E3] bg-white p-4 flex flex-col justify-between h-[180px] select-none" data-testid="core-card-skeleton">
    <div>
      <div className="flex items-center justify-between">
        <FeishuSkeleton className="w-16 h-5.5 rounded-full" />
        <FeishuSkeleton className="w-14 h-5 rounded-full" />
      </div>
      <div className="mt-4 space-y-2.5">
        <FeishuSkeleton className="w-32 h-3.5" />
        <FeishuSkeleton className="w-20 h-3.5" />
      </div>
    </div>
    <div className="pt-3 border-t border-[#DEE0E3]/60 flex items-center justify-between">
      <FeishuSkeleton className="w-20 h-3" />
      <FeishuSkeleton className="w-16 h-7 rounded-[6px]" />
    </div>
  </Card>
);
