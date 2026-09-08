import React, { useState } from 'react';
import type { ProfileGroup } from '../../types/frp';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { validateGroupName } from '../../services/profile-organization';

export interface ProfileGroupManagerDialogProps {
  visible: boolean;
  groups: ProfileGroup[];
  onClose: () => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  onDeleteGroup: (groupId: string) => void;
}

export const ProfileGroupManagerDialog: React.FC<ProfileGroupManagerDialogProps> = ({
  visible,
  groups,
  onClose,
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
}) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupError, setNewGroupError] = useState<string | null>(null);

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingError, setEditingError] = useState<string | null>(null);

  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<ProfileGroup | null>(null);

  const handleAddGroup = () => {
    const res = validateGroupName(newGroupName, groups);
    if (!res.valid) {
      setNewGroupError(res.error || '名称不合法');
      return;
    }
    onCreateGroup(newGroupName.trim());
    setNewGroupName('');
    setNewGroupError(null);
  };

  const handleStartEdit = (group: ProfileGroup) => {
    setEditingGroupId(group.id);
    setEditingName(group.name);
    setEditingError(null);
  };

  const handleSaveEdit = (groupId: string) => {
    const res = validateGroupName(editingName, groups, groupId);
    if (!res.valid) {
      setEditingError(res.error || '名称不合法');
      return;
    }
    onRenameGroup(groupId, editingName.trim());
    setEditingGroupId(null);
    setEditingName('');
    setEditingError(null);
  };

  const handleCancelEdit = () => {
    setEditingGroupId(null);
    setEditingName('');
    setEditingError(null);
  };

  const handleConfirmDelete = () => {
    if (confirmDeleteGroup) {
      onDeleteGroup(confirmDeleteGroup.id);
      setConfirmDeleteGroup(null);
    }
  };

  return (
    <>
      <FeishuDialog
        visible={visible}
        title="分组管理"
        width={480}
        showCancel={false}
        okText="完成"
        onOk={onClose}
        onCancel={onClose}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex gap-2">
              <Input
                placeholder="输入新分组名称"
                value={newGroupName}
                onChange={e => {
                  setNewGroupName(e.target.value);
                  if (newGroupError) setNewGroupError(null);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddGroup();
                  }
                }}
              />
              <Button type="button" onClick={handleAddGroup} className="shrink-0">
                添加分组
              </Button>
            </div>
            {newGroupError && (
              <p className="text-[12px] text-[#F53F3F]">{newGroupError}</p>
            )}
          </div>

          <div className="max-h-[300px] overflow-y-auto divide-y divide-[#DEE0E3] rounded-[6px] border border-[#DEE0E3]">
            {groups.length === 0 ? (
              <div className="py-6 text-center text-[13px] text-[#8F959E]">
                暂无分组，可输入名称创建
              </div>
            ) : (
              <ul className="divide-y divide-[#DEE0E3]">
                {groups.map(group => {
                  const isEditing = editingGroupId === group.id;

                  return (
                    <li
                      key={group.id}
                      className="flex items-center justify-between gap-3 p-2.5 bg-white hover:bg-[#F7F8FA]"
                    >
                      {isEditing ? (
                        <div className="flex flex-1 flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingName}
                              onChange={e => {
                                setEditingName(e.target.value);
                                if (editingError) setEditingError(null);
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveEdit(group.id);
                                } else if (e.key === 'Escape') {
                                  handleCancelEdit();
                                }
                              }}
                              autoFocus
                              className="h-7 text-[13px]"
                            />
                            <Button
                              size="sm"
                              type="button"
                              onClick={() => handleSaveEdit(group.id)}
                            >
                              保存
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              type="button"
                              onClick={handleCancelEdit}
                            >
                              取消
                            </Button>
                          </div>
                          {editingError && (
                            <p className="text-[12px] text-[#F53F3F]">{editingError}</p>
                          )}
                        </div>
                      ) : (
                        <>
                          <span className="text-[14px] font-medium text-[#1F2329] truncate">
                            {group.name}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              type="button"
                              onClick={() => handleStartEdit(group)}
                            >
                              重命名
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-[#F53F3F] hover:text-[#D93030]"
                              type="button"
                              onClick={() => setConfirmDeleteGroup(group)}
                            >
                              删除
                            </Button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </FeishuDialog>

      <FeishuDialog
        visible={!!confirmDeleteGroup}
        type="danger"
        title="删除分组确认"
        okText="确认删除"
        cancelText="取消"
        danger
        onOk={handleConfirmDelete}
        onCancel={() => setConfirmDeleteGroup(null)}
      >
        <p className="text-[14px] text-[#646A75]">
          确定要删除分组“{confirmDeleteGroup?.name}”吗？属于该分组的连接不会被删除，将变更为未分组。
        </p>
      </FeishuDialog>
    </>
  );
};
