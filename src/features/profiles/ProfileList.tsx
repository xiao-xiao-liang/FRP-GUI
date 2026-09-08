import React, { useState, useMemo } from 'react';
import { FrpCore, Profile, ProfileSort } from '../../types/frp';
import { Button } from '../../components/ui/button';
import { sortProfiles, getBatchActionTargets } from '../../services/profile-organization';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';
import { ProfileRuleDetailsDialog } from './ProfileRuleDetailsDialog';
import { ProfileConnectionsTable } from './ProfileConnectionsTable';
import { ProfileMetricsCards } from './ProfileMetricsCards';
import { Plus } from 'lucide-react';

interface ProfileListProps {
  profiles: Profile[];
  activeCore?: FrpCore | null;
  defaultSort?: ProfileSort;
  isBatchOperating?: boolean;
  onTogglePin?: (p: Profile) => void;
  onBatchStart?: (targets: Profile[]) => void;
  onBatchStop?: (targets: Profile[]) => void;
  onBatchDelete?: (targets: Profile[]) => void;
  onToggle: (p: Profile) => void;
  onEdit: (p: Profile) => void;
  onClone: (p: Profile) => void;
  onDelete: (p: Profile) => void;
  onSync: (p: Profile) => void;
  onViewLogs: (p: Profile) => void;
  onDiagnose: (p: Profile) => void;
  onRepairCore: () => void;
  onOpenCores?: () => void;
  onCreateNew: () => void;
}

export const ProfileList: React.FC<ProfileListProps> = ({
  profiles,
  activeCore,
  defaultSort = 'pinned_updated',
  isBatchOperating = false,
  onTogglePin,
  onBatchStart,
  onBatchStop,
  onBatchDelete,
  onToggle,
  onEdit,
  onClone,
  onDelete,
  onSync,
  onViewLogs,
  onDiagnose,
  onRepairCore,
  onOpenCores,
  onCreateNew,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBatchStop, setConfirmBatchStop] = useState(false);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [viewingRuleProfile, setViewingRuleProfile] = useState<Profile | null>(null);

  // 保持采用已保存的默认排序
  const sortedProfiles = useMemo(() => {
    return sortProfiles(profiles, defaultSort);
  }, [profiles, defaultSort]);

  // 数据更新时清理不可见的选择项
  React.useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const currentIds = new Set(sortedProfiles.map((p) => p.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [sortedProfiles]);

  // 选中的目标项
  const selectedProfiles = useMemo(() => {
    return sortedProfiles.filter((p) => selectedIds.has(p.id));
  }, [sortedProfiles, selectedIds]);

  const stopTargets = useMemo(() => getBatchActionTargets(selectedProfiles, 'stop'), [selectedProfiles]);
  const deleteTargets = useMemo(() => getBatchActionTargets(selectedProfiles, 'delete'), [selectedProfiles]);

  const selectedRowKeys = useMemo(() => Array.from(selectedIds), [selectedIds]);

  return (
    <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-4 max-w-7xl mx-auto select-none">
      {/* 顶部标题与新建按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
        <div>
          <h1 className="text-[18px] font-semibold text-[#1F2329] tracking-tight">我的连接</h1>
          <p className="text-[12px] text-[#8F959E] mt-0.5">统一管理与快速访问所有内网穿透连接</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            onClick={onCreateNew}
            className="h-8 rounded-[6px] px-3.5 text-[13px] bg-[#165DFF] text-white hover:bg-[#0E4FD9] font-medium shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            新建连接
          </Button>
        </div>
      </div>

      {/* 4 个大盘指标卡片与异常横幅 */}
      <ProfileMetricsCards
        profiles={sortedProfiles}
        activeCore={activeCore}
        onOpenCores={onOpenCores || onRepairCore}
        onDiagnose={onDiagnose}
      />

      {/* 专用连接表格 */}
      <ProfileConnectionsTable
        profiles={sortedProfiles}
        selectedRowKeys={selectedRowKeys}
        onSelectionChange={(keys) => setSelectedIds(new Set(keys))}
        isBatchOperating={isBatchOperating}
        onBatchStart={onBatchStart}
        onBatchStop={() => setConfirmBatchStop(true)}
        onBatchDelete={() => setConfirmBatchDelete(true)}
        onToggle={onToggle}
        onEdit={onEdit}
        onClone={onClone}
        onDelete={onDelete}
        onSync={onSync}
        onViewLogs={onViewLogs}
        onDiagnose={onDiagnose}
        onRepairCore={onRepairCore}
        onTogglePin={onTogglePin}
        onViewRuleDetails={(record) => setViewingRuleProfile(record)}
      />

      {/* 规则详情只读弹层 */}
      <ProfileRuleDetailsDialog
        visible={Boolean(viewingRuleProfile)}
        profile={viewingRuleProfile}
        onClose={() => setViewingRuleProfile(null)}
      />

      {/* 批量停止确认对话框 */}
      <FeishuDialog
        visible={confirmBatchStop}
        type="warning"
        title="批量停止确认"
        okText="确认停止"
        cancelText="取消"
        okButtonDisabled={isBatchOperating}
        confirmLoading={isBatchOperating}
        onOk={async () => {
          if (isBatchOperating) return;
          try {
            await onBatchStop?.(selectedProfiles);
          } finally {
            setConfirmBatchStop(false);
          }
        }}
        onCancel={() => setConfirmBatchStop(false)}
      >
        <p className="text-[14px] text-[#646A75]">
          确定要停止已选中的 {stopTargets.executable.length} 个正在运行的连接吗？
        </p>
      </FeishuDialog>

      {/* 批量删除确认对话框 */}
      <FeishuDialog
        visible={confirmBatchDelete}
        type="danger"
        title="批量删除确认"
        okText="确认删除"
        cancelText="取消"
        danger
        okButtonDisabled={isBatchOperating}
        confirmLoading={isBatchOperating}
        onOk={async () => {
          if (isBatchOperating) return;
          try {
            await onBatchDelete?.(selectedProfiles);
          } finally {
            setConfirmBatchDelete(false);
          }
        }}
        onCancel={() => setConfirmBatchDelete(false)}
      >
        <p className="text-[14px] text-[#646A75]">
          确定要彻底删除已选中的 {deleteTargets.executable.length} 个连接吗？此操作无法撤销，关联的系统凭据也将被清理。
        </p>
      </FeishuDialog>
    </div>
  );
};
