import React, { useState, useEffect } from 'react';
import { DiagnosticResult, Profile } from '../../types/frp';
import { testServerConnectivity } from '../../services/ipc';
import { Button } from '../../components/ui/button';
import { FeishuInput } from '../../components/ui/feishu-table/FeishuInput';
import { FeishuEmptyState } from '../../components/ui/feishu-table/FeishuEmptyState';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';
import { CheckedIcon, ErrorIcon, RefreshIcon } from '../../components/icons';
import { Activity, ArrowRight } from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';

interface DiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: Profile[];
  selectedProfile?: Profile | null;
  onDiagnosticComplete?: (result: DiagnosticResult, profileId: string | null) => void;
}

export const DiagnosticModal: React.FC<DiagnosticModalProps> = ({
  isOpen,
  onClose,
  profiles,
  selectedProfile,
  onDiagnosticComplete,
}) => {
  const [host, setHost] = useState('118.195.146.161');
  const [port, setPort] = useState<number>(7000);
  const [testing, setTesting] = useState(false);
  const [historyResults, setHistoryResults] = useState<DiagnosticResult[]>([]);

  useEffect(() => {
    if (isOpen && selectedProfile) {
      const sHost = (selectedProfile.config as any)?.serverAddr || (selectedProfile.config as any)?.bindAddr || '127.0.0.1';
      const sPort = (selectedProfile.config as any)?.serverPort || (selectedProfile.config as any)?.bindPort || 7000;
      setHost(sHost);
      setPort(sPort);
    }
  }, [isOpen, selectedProfile]);

  const handleTest = async (testHost = host, testPort = port, targetProfileId: string | null = null) => {
    if (!testHost.trim()) {
      feishuToast.warning('请输入要测试的服务器地址');
      return;
    }

    setTesting(true);
    try {
      const res = await testServerConnectivity(testHost, testPort);
      setHistoryResults((prev) => [res, ...prev.slice(0, 9)]);
      onDiagnosticComplete?.(res, targetProfileId);
      if (res.status === 'success') {
        feishuToast.success(`与 ${testHost}:${testPort} 握手成功 (延迟: ${res.latencyMs}ms)`);
      } else {
        feishuToast.error(`连接失败: ${res.error}`);
      }
    } catch (e: any) {
      feishuToast.error(`测试异常: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleQuickTestProfile = (p: Profile) => {
    const sHost = (p.config as any)?.serverAddr || (p.config as any)?.bindAddr || '127.0.0.1';
    const sPort = (p.config as any)?.serverPort || (p.config as any)?.bindPort || 7000;
    setHost(sHost);
    setPort(sPort);
    handleTest(sHost, sPort, p.id);
  };

  return (
    <FeishuDialog
      visible={isOpen}
      onCancel={onClose}
      title="网络节点连通性测试与延迟探测"
      width={640}
      showIcon={false}
      footer={
        <Button
          variant="outline"
          size="sm"
          onClick={onClose}
          className="h-8 px-4 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white hover:bg-[#F2F3F5]"
        >
          关闭
        </Button>
      }
    >
      <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* 测试表单 */}
        <div className="p-4 bg-[#F8F9FA] rounded-[8px] border border-[#DEE0E3] space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[12px] font-medium text-[#646A75] mb-1">
                目标服务器域名 / IP
              </label>
              <FeishuInput
                value={host}
                onChange={(val) => setHost(val)}
                placeholder="例如: 118.195.146.161"
                containerClassName="h-8"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[#646A75] mb-1">
                端口
              </label>
              <FeishuInput
                type="number"
                value={String(port)}
                onChange={(val) => setPort(Number(val) || 0)}
                placeholder="7000"
                containerClassName="h-8"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="default"
              size="sm"
              onClick={() => handleTest()}
              disabled={testing}
              className="gap-1.5 h-8 text-[13px] px-4 rounded-[6px] bg-[#165DFF] text-white hover:bg-[#0E4FD9]"
            >
              {testing ? <RefreshIcon className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              {testing ? '正在探测...' : '开始连通性测试'}
            </Button>
          </div>
        </div>

        {/* 方案快速测试 */}
        {profiles.length > 0 && (
          <div>
            <h4 className="text-[13px] font-semibold text-[#1F2329] mb-2">方案一键探测</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {profiles.map((p) => {
                const sHost = (p.config as any)?.serverAddr || '127.0.0.1';
                const sPort = (p.config as any)?.serverPort || 7000;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleQuickTestProfile(p)}
                    className="p-3 bg-white border border-[#DEE0E3] rounded-[8px] hover:border-[#165DFF] hover:bg-[#F0F4FF] text-left flex items-center justify-between transition-colors group cursor-pointer shadow-2xs"
                  >
                    <div>
                      <div className="font-semibold text-[13px] text-[#1F2329] group-hover:text-[#165DFF]">
                        {p.name}
                      </div>
                      <div className="text-[11px] tabular-nums text-[#8F959E] mt-0.5">
                        {sHost}:{sPort}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#8F959E] group-hover:text-[#165DFF]" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 历史记录 */}
        <div>
          <h4 className="text-[13px] font-semibold text-[#1F2329] mb-2">测试结果历史</h4>
          {historyResults.length === 0 ? (
            <FeishuEmptyState
              title="暂无探测记录"
              description="点击上方“开始连通性测试”发起探测"
              className="py-6 border border-dashed border-[#DEE0E3] rounded-[8px]"
            />
          ) : (
            <div className="space-y-2">
              {historyResults.map((r, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-[8px] border flex items-center justify-between text-[13px] shadow-2xs ${
                    r.status === 'success'
                      ? 'border-[#98E4B5] bg-[#E6F7ED]/60 text-[#1F2329]'
                      : 'border-[#FFB4B4] bg-[#FFECEC]/60 text-[#F53F3F]'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {r.status === 'success' ? (
                      <CheckedIcon className="w-4 h-4 text-[#00B42A]" />
                    ) : (
                      <ErrorIcon className="w-4 h-4 text-[#F53F3F]" />
                    )}
                    <span className="tabular-nums text-[13px] font-semibold">
                      {r.server}:{r.port}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {r.latencyMs !== null ? (
                      <FeishuPill variant="green" showDot={false} className="tabular-nums text-[11px] h-[20px] px-2">
                        延迟: {r.latencyMs} ms
                      </FeishuPill>
                    ) : (
                      <span className="text-[12px] text-[#F53F3F]">{r.error || '连接失败'}</span>
                    )}
                    <span className="text-[11px] tabular-nums text-[#8F959E]">{r.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </FeishuDialog>
  );
};
