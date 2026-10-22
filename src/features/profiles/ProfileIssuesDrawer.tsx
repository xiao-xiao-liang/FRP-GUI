import React, { useMemo, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckCircle2, Copy, X } from 'lucide-react';
import type { Profile } from '../../types/frp';
import { Button } from '../../components/ui/button';
import { FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { feishuToast } from '../../components/ui/FeishuToast';
import { getProfileIssue } from '../../services/profile-issues';
import './ProfileIssuesDrawer.css';

interface ProfileIssuesDrawerProps {
  visible: boolean;
  profiles: Profile[];
  selectedProfileId: string | null;
  onSelectProfile: (profileId: string) => void;
  onClose: () => void;
  onEdit: (profile: Profile) => void;
  onViewLogs: (profile: Profile) => void;
  onDiagnose: (profile: Profile) => void;
  onRepairCore: () => void;
}

export const ProfileIssuesDrawer: React.FC<ProfileIssuesDrawerProps> = ({
  visible,
  profiles,
  selectedProfileId,
  onSelectProfile,
  onClose,
  onEdit,
  onViewLogs,
  onDiagnose,
  onRepairCore,
}) => {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);
  const issues = useMemo(() => profiles.flatMap((profile) => {
    const issue = getProfileIssue(profile);
    return issue ? [{ profile, issue }] : [];
  }), [profiles]);
  const selected = selectedProfileId === null
    ? issues[0]
    : issues.find(({ profile }) => profile.id === selectedProfileId);
  const emptyMessage = selectedProfileId === null
    ? '当前没有待处理连接'
    : profiles.some((profile) => profile.id === selectedProfileId)
      ? '该连接当前已无待处理问题'
      : '该连接已被移除';

  const handleAction = (action: () => void) => {
    // 编辑或诊断会打开其他弹层，关闭动画结束后不再抢回焦点。
    restoreFocusRef.current = false;
    onClose();
    action();
  };

  const copyError = async (detail: string) => {
    try {
      await navigator.clipboard.writeText(detail);
      feishuToast.success('已复制报错内容');
    } catch {
      feishuToast.warning('复制失败，请选中报错内容手动复制');
    }
  };

  return (
    <Dialog.Root open={visible} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="profile-issues-overlay fixed inset-0 z-[1000] bg-[#1F2329]/20" />
        <Dialog.Content
          style={{ fontFamily: FEISHU_FONT_FAMILY }}
          className="profile-issues-drawer fixed inset-y-0 right-0 z-[1001] flex w-full max-w-[460px] flex-col border-l border-[#DEE0E3] bg-white shadow-xl outline-none select-text"
          onOpenAutoFocus={() => {
            previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            restoreFocusRef.current = true;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!restoreFocusRef.current) return;
            const previous = previousFocusRef.current;
            if (previous?.isConnected) previous.focus();
            else document.querySelector<HTMLElement>('[data-profile-issues-trigger], #profile-list-title')?.focus();
          }}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-[#EFF0F1] px-5 py-4">
            <Dialog.Title className="text-[16px] font-semibold text-[#1F2329]">
              待处理连接 <span className="ml-1 text-[13px] font-normal text-[#8F959E]">· {issues.length} 项</span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="关闭异常详情" className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-[6px] text-[#646A73] hover:bg-[#F2F3F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3370FF]">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description className="sr-only">查看连接的具体原因、处理建议与原始报错。</Dialog.Description>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {(issues.length > 1 || (!selected && issues.length > 0)) && (
              <nav aria-label="待处理连接列表" className="mb-5 max-h-[240px] space-y-2 overflow-y-auto">
                {issues.map(({ profile, issue }) => (
                  <button
                    key={profile.id}
                    type="button"
                    aria-pressed={selected?.profile.id === profile.id}
                    onClick={() => onSelectProfile(profile.id)}
                    className={`w-full cursor-pointer rounded-[8px] border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3370FF] ${selected?.profile.id === profile.id ? 'border-[#B4CAFF] bg-[#F0F4FF]' : 'border-[#DEE0E3] bg-white hover:bg-[#F8F9FA]'}`}
                  >
                    <span className="block truncate text-[13px] font-medium text-[#1F2329]">{profile.name}</span>
                    <span className="mt-1 block truncate text-[12px] text-[#646A73]">{issue.summary}</span>
                  </button>
                ))}
              </nav>
            )}

            {selected ? (
              <section key={selected.profile.id} aria-label={`${selected.profile.name} 的异常详情`}>
                <h3 className="break-words text-[16px] font-semibold leading-6 text-[#1F2329]">{selected.profile.name}</h3>
                <FeishuPill variant={selected.profile.status === 'error' ? 'red' : 'orange'} className="mt-2 h-[22px] px-2 text-[11px]">
                  {selected.profile.status === 'error' ? '连接异常' : '运行警告'}
                </FeishuPill>

                <div className="mt-4 rounded-[8px] border border-[#F3D8D6] bg-[#FFF8F7] px-4 py-3">
                  <p className="text-[11px] text-[#8F959E]">具体原因</p>
                  <p className="mt-1 break-words text-[14px] font-medium leading-6 text-[#B4232D]">{selected.issue.summary}</p>
                </div>
                <div className="mt-3 rounded-[8px] border border-[#DEE0E3] px-4 py-3">
                  <h4 className="text-[12px] font-medium text-[#1F2329]">处理建议</h4>
                  <p className="mt-1 break-words text-[12px] leading-5 text-[#646A73]">{selected.issue.suggestion}</p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      const actions = {
                        repair_core: onRepairCore,
                        edit: () => onEdit(selected.profile),
                        diagnose: () => onDiagnose(selected.profile),
                        logs: () => onViewLogs(selected.profile),
                      };
                      handleAction(actions[selected.issue.action]);
                    }}
                    className="h-8 cursor-pointer rounded-[6px] bg-[#3370FF] px-3 text-[12px] text-white shadow-none hover:bg-[#2860E1]"
                  >
                    {selected.issue.actionLabel}
                  </Button>
                  {selected.issue.action !== 'logs' && (
                    <Button type="button" variant="outline" onClick={() => handleAction(() => onViewLogs(selected.profile))} className="h-8 cursor-pointer rounded-[6px] border-[#DEE0E3] px-3 text-[12px] text-[#3370FF] shadow-none hover:bg-[#F0F4FF] hover:text-[#3370FF]">
                      查看日志
                    </Button>
                  )}
                </div>

                <details className="mt-5 border-t border-[#EFF0F1] pt-4">
                  <summary aria-label={`${selected.profile.name} 的原始报错`} className="w-fit cursor-pointer rounded-[4px] text-[12px] leading-5 text-[#646A73] hover:text-[#3370FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3370FF]">
                    原始报错
                  </summary>
                  <pre className="mt-3 max-w-full rounded-[8px] border border-[#EFF0F1] bg-[#F9FAFB] p-3 text-[12px] leading-5 text-[#646A73] select-text whitespace-pre-wrap [overflow-wrap:anywhere]">{selected.issue.detail}</pre>
                  <button type="button" onClick={() => void copyError(selected.issue.detail)} className="mt-2 inline-flex cursor-pointer items-center gap-1 rounded-[4px] text-[12px] text-[#3370FF] hover:text-[#245BDB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3370FF]">
                    <Copy className="h-3 w-3" />复制报错内容
                  </button>
                </details>
              </section>
            ) : (
              <div className="flex flex-col items-center gap-3 py-12 text-[13px] text-[#646A73]">
                <CheckCircle2 className="h-7 w-7 text-[#00B42A]" />
                {emptyMessage}
              </div>
            )}
          </div>
          <footer className="shrink-0 border-t border-[#EFF0F1] px-5 py-3 text-[11px] leading-5 text-[#8F959E]">连接恢复后，对应问题会自动移除。</footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
