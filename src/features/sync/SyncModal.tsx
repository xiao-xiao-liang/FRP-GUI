import React, { useState, useEffect } from 'react';
import { Profile } from '../../types/frp';
import { Button } from '../../components/ui/button';
import { FeishuSelect } from '../../components/ui/feishu-select';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';
import { MobileIcon, CopyIcon, DownloadIcon } from '../../components/icons';
import { Upload, CheckCircle2 } from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';

interface SyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: Profile[];
  selectedProfile: Profile | null;
  onImportProfiles: (profiles: Profile[]) => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  isOpen,
  onClose,
  profiles,
  selectedProfile,
  onImportProfiles,
}) => {
  const [activeProfileId, setActiveProfileId] = useState<string>(selectedProfile?.id || profiles[0]?.id || '');
  const [importJsonText, setImportJsonText] = useState('');
  const [isImportMode, setIsImportMode] = useState(false);
  const [qrSvg, setQrSvg] = useState<string>('');

  const currentProfile = profiles.find((p) => p.id === activeProfileId) || selectedProfile || profiles[0];

  useEffect(() => {
    if (isOpen && currentProfile) {
      const payload = {
        app: 'frp-gui',
        version: '1.0',
        type: currentProfile.type,
        name: currentProfile.name,
        toml: currentProfile.rawToml,
      };
      const jsonStr = encodeURIComponent(JSON.stringify(payload));
      setQrSvg(`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${jsonStr}&color=1F2329&bgcolor=FFFFFF`);
    }
  }, [isOpen, activeProfileId, currentProfile]);

  const handleCopyConfigJson = () => {
    if (!currentProfile) return;
    const payload = {
      app: 'frp-gui',
      version: '1.0',
      type: currentProfile.type,
      name: currentProfile.name,
      toml: currentProfile.rawToml,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    feishuToast.success('配置代码已复制到剪贴板');
  };

  const handleExportBackup = () => {
    const dataStr = JSON.stringify(profiles, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frp-gui-profiles-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    feishuToast.success('全部配置方案已成功备份导出');
  };

  const handleExecuteImport = () => {
    if (!importJsonText.trim()) {
      feishuToast.warning('请粘贴导入数据内容');
      return;
    }
    try {
      const parsed = JSON.parse(importJsonText);
      if (Array.isArray(parsed)) {
        onImportProfiles(parsed);
        feishuToast.success(`成功导入 ${parsed.length} 个方案`);
      } else if (parsed.app === 'frp-gui' && parsed.toml) {
        const newProf: Profile = {
          id: `imported_${Date.now()}`,
          name: parsed.name || '导入方案',
          type: parsed.type || 'frpc',
          config: parsed.config || {},
          rawToml: parsed.toml,
          status: 'stopped',
          stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        onImportProfiles([newProf]);
        feishuToast.success('成功导入方案: ' + newProf.name);
      } else {
        throw new Error('无法识别的数据格式');
      }
      setIsImportMode(false);
      setImportJsonText('');
    } catch (e: any) {
      feishuToast.error(`导入解析失败: ${e.message}`);
    }
  };

  const profileOptions = profiles.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.type})`,
  }));

  return (
    <FeishuDialog
      visible={isOpen}
      onCancel={onClose}
      title={isImportMode ? '导入配置方案' : '跨端同步与二维码分享'}
      width={520}
      showIcon={false}
      footer={
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="h-8 px-4 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]"
        >
          完成
        </Button>
      }
    >
      <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {!isImportMode ? (
          <>
            {/* 方案选择 */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-[13px] text-[#646A75] shrink-0">选择方案:</span>
                <div className="flex-1">
                  <FeishuSelect
                    options={profileOptions}
                    value={activeProfileId}
                    onChange={(val) => setActiveProfileId(val)}
                    size="sm"
                  />
                </div>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsImportMode(true)}
                className="h-8 text-[13px] px-3.5 rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                导入配置
              </Button>
            </div>

            {/* 二维码展示 */}
            <div className="flex flex-col items-center justify-center p-5 bg-[#F8F9FA] rounded-[8px] border border-[#DEE0E3]">
              {qrSvg ? (
                <div className="bg-white p-3.5 rounded-[8px] border border-[#DEE0E3] shadow-xs">
                  <img src={qrSvg} alt="QR Code" className="w-48 h-48 block object-contain" />
                </div>
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-white rounded-[8px] border text-xs text-[#8F959E]">
                  正在生成二维码...
                </div>
              )}

              <div className="mt-3 text-center">
                <div className="font-semibold text-[14px] text-[#1F2329] flex items-center justify-center gap-1.5">
                  <MobileIcon className="w-4 h-4 text-[#165DFF]" />
                  Android 移动端扫码即用
                </div>
                <p className="text-[12px] text-[#8F959E] mt-0.5 max-w-xs">
                  手机端 FRP-GUI 扫码即可同步导入此穿透配置
                </p>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="flex items-center justify-between pt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportBackup}
                className="h-8 text-[13px] px-3.5 rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]"
              >
                <DownloadIcon className="w-3.5 h-3.5 mr-1" />
                备份所有方案 (.json)
              </Button>

              <Button
                size="sm"
                variant="default"
                onClick={handleCopyConfigJson}
                className="h-8 text-[13px] px-3.5 rounded-[6px] bg-[#165DFF] text-white hover:bg-[#0E4FD9]"
              >
                <CopyIcon className="w-3.5 h-3.5 mr-1" />
                复制配置代码
              </Button>
            </div>
          </>
        ) : (
          /* 导入模式 */
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-[#1F2329]">粘贴配置 JSON 数据</span>
              <Button size="sm" variant="ghost" onClick={() => setIsImportMode(false)} className="h-7 text-[13px] px-2.5">
                返回二维码
              </Button>
            </div>

            <textarea
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='在此粘贴通过“复制配置代码”或“备份文件”导出的 JSON 字符串...'
              className="w-full h-44 p-3 text-[13px] bg-[#F8F9FA] border border-[#DEE0E3] rounded-[8px] focus:outline-none focus:border-[#3370FF] resize-none leading-relaxed"
            />

            <div className="flex justify-end gap-2.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsImportMode(false)}
                className="h-8 px-4 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]"
              >
                取消
              </Button>
              <Button
                size="sm"
                variant="default"
                onClick={handleExecuteImport}
                className="h-8 px-4 text-[13px] rounded-[6px] bg-[#3370FF] text-white hover:bg-[#2860E1]"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                确认导入
              </Button>
            </div>
          </div>
        )}
      </div>
    </FeishuDialog>
  );
};
