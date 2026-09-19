import React, { useState, useEffect, useRef } from 'react';
import { FrpcConfig, FrpsConfig, FrpCore, FrpServerNode, Profile, ProxyRule, VisitorRule } from '../../types/frp';
import { Button } from '../../components/ui/button';
import { FeishuSelect } from '../../components/ui/feishu-select';
import { FeishuDialog } from '../../components/ui/FeishuDialog';
import { FeishuInput } from '../../components/ui/feishu-table/FeishuInput';
import { FeishuPill } from '../../components/ui/feishu-table/FeishuPill';
import { FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';
import { PRESET_SCENARIOS } from '../../services/presets';
import { serializeFrpcToml, parseFrpcToml, serializeFrpsToml, parseFrpsToml } from '../../services/toml-sync';
import { testServerConnectivity, loadProfileSecret, computeCoreTomlPath } from '../../services/ipc';
import { profileCredentialReference, parseProfileSecret } from '../../services/profile-secrets';
import { ScenarioWizard } from './ScenarioWizard';
import { ScenarioFormValues } from '../../services/profile-validator';
import { 
  AddIcon, DeleteIcon, RefreshIcon, ShowIcon, HideIcon, CheckedIcon, ErrorIcon, ShieldIcon,
  VisibleLockIcon, VisibleIcon
} from '../../components/icons';
import { ChevronDown, Zap, Trash2 } from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';
import { ProfileTagEditor } from '../profiles/ProfileTagEditor';
import { normalizeTags } from '../../services/profile-organization';

type FrpLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
type FrpLogConfig = {
  to?: string;
  level?: FrpLogLevel;
  maxDays?: number;
};

const LOG_LEVEL_OPTIONS: { value: FrpLogLevel; label: string }[] = [
  { value: 'info', label: 'INFO（默认）' },
  { value: 'warn', label: 'WARN' },
  { value: 'error', label: 'ERROR' },
  { value: 'debug', label: 'DEBUG' },
  { value: 'trace', label: 'TRACE' },
];

const LOG_LEVEL_HELPERS: Record<FrpLogLevel, string> = {
  info: '适合日常运行，记录启动、登录、代理状态及警告、错误。',
  warn: '适合稳定运行期，仅关注警告和错误。',
  error: '适合低噪声监控，仅记录导致功能异常的错误。',
  debug: '适合连接、重连和心跳异常排查，日志量会增加。',
  trace: '适合协议级排障与完整调用链追踪。',
};

export interface ConfigEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: Profile) => void;
  editingProfile: Profile | null;
  activeCore: FrpCore | null;
  cores?: FrpCore[];
  serverNodes?: FrpServerNode[];
}

export const ConfigEditorModal: React.FC<ConfigEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingProfile,
  activeCore,
  cores = [],
  serverNodes = [],
}) => {
  const [viewMode, setViewMode] = useState<'wizard' | 'advanced'>('wizard');
  const [activeTab, setActiveTab] = useState<'form' | 'toml'>('form');
  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileType, setProfileType] = useState<'frpc' | 'frps'>('frpc');
  const [tags, setTags] = useState<string[]>([]);
  const [coreId, setCoreId] = useState('');
  const downloadedCoreOptions = cores
    .filter((core) => Boolean(core.path) && core.status !== 'not_downloaded')
    .map((core) => ({ value: core.id, label: `${core.version} · ${core.os}/${core.arch}` }));

  const selectedCore = cores.find((core) => core.id === coreId) || activeCore;
  const targetTomlPath = selectedCore?.path ? computeCoreTomlPath(selectedCore.path, profileName || 'profile') : '';
  
  // FRPC 配置状态
  const [serverAddr, setServerAddr] = useState('118.195.146.161');
  const [serverPort, setServerPort] = useState<number>(7000);
  const [authToken, setAuthToken] = useState('12345678');
  const [showAuthToken, setShowAuthToken] = useState(false);
  const [protocol, setProtocol] = useState<'tcp' | 'kcp' | 'quic' | 'websocket' | 'wss'>('tcp');
  const [tlsEnable, setTlsEnable] = useState<boolean>(false);
  const [proxies, setProxies] = useState<ProxyRule[]>([]);
  const [visitors, setVisitors] = useState<VisitorRule[]>([]);

  // 内联连通性探测状态
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{ status: 'idle' | 'success' | 'failed'; latencyMs?: number | null; error?: string } | null>(null);

  // 预设下拉菜单状态
  const [isPresetDropdownOpen, setIsPresetDropdownOpen] = useState(false);
  const presetDropdownRef = useRef<HTMLDivElement>(null);

  // FRPS 配置状态
  const [frpsBindPort, setFrpsBindPort] = useState<number>(7000);
  const [frpsVhostHttp, setFrpsVhostHttp] = useState<number>(80);
  const [frpsVhostHttps, setFrpsVhostHttps] = useState<number>(443);
  const [frpsDashboardPort, setFrpsDashboardPort] = useState<number>(7500);
  const [frpsDashboardUser, setFrpsDashboardUser] = useState('admin');
  const [frpsDashboardPwd, setFrpsDashboardPwd] = useState('admin123');

  // 日志配置状态 (FRPC & FRPS 统一保留 to, level, maxDays)
  const [logConfig, setLogConfig] = useState<FrpLogConfig>({ level: 'info' });

  // 高级传输与运行日志折叠面板展开状态
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);

  // TOML 源码状态
  const [rawToml, setRawToml] = useState('');
  const [tomlError, setTomlError] = useState<string | null>(null);

  // 点击外部关闭预设下拉
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setIsPresetDropdownOpen(false);
      }
    };
    if (isPresetDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPresetDropdownOpen]);

  // 初始化填充数据
  useEffect(() => {
    if (editingProfile) {
      setViewMode('advanced');
      setProfileName(editingProfile.name);
      setProfileDescription(editingProfile.description || '');
      setProfileType(editingProfile.type);
      setRawToml(editingProfile.rawToml);
      setTags(editingProfile.tags ? [...editingProfile.tags] : []);
      setCoreId(editingProfile.coreId || '');

      if (editingProfile.type === 'frpc') {
        const conf = editingProfile.config as FrpcConfig;
        setServerAddr(conf.serverAddr || '118.195.146.161');
        setServerPort(conf.serverPort || 7000);
        let token = conf.authToken || '';
        if (!token && editingProfile.rawToml) {
          try {
            token = parseFrpcToml(editingProfile.rawToml).authToken || '';
          } catch {
            // ignore
          }
        }
        setAuthToken(token);
        setProtocol(conf.transport?.protocol || 'tcp');
        setTlsEnable(conf.transport?.tls?.enable ?? false);
        setLogConfig(conf.log ? { ...conf.log, level: conf.log.level || 'info' } : { level: 'info' });
        setProxies(conf.proxies || []);
        setVisitors(conf.visitors || []);
      } else {
        const conf = editingProfile.config as FrpsConfig;
        setFrpsBindPort(conf.bindPort || 7000);
        setFrpsVhostHttp(conf.vhostHTTPPort || 80);
        setFrpsVhostHttps(conf.vhostHTTPSPort || 443);
        let token = conf.authToken || '';
        if (!token && editingProfile.rawToml) {
          try {
            token = parseFrpsToml(editingProfile.rawToml).authToken || '';
          } catch {
            // ignore
          }
        }
        setAuthToken(token);
        setFrpsDashboardPort(conf.webServer?.port || 7500);
        setFrpsDashboardUser(conf.webServer?.user || 'admin');
        setFrpsDashboardPwd(conf.webServer?.password || 'admin123');
        setLogConfig(conf.log ? { ...conf.log, level: conf.log.level || 'info' } : { level: 'info' });
      }
    } else {
      setViewMode('wizard');
      setProfileName('');
      setProfileDescription('');
      setProfileType('frpc');
      setServerAddr('118.195.146.161');
      setServerPort(7000);
      setAuthToken('12345678');
      setProtocol('tcp');
      setTlsEnable(false);
      setLogConfig({ level: 'info' });
      setProxies([
        {
          name: 'ssh-service',
          type: 'tcp',
          localIP: '127.0.0.1',
          localPort: 22,
          remotePort: 6001,
        }
      ]);
      setVisitors([]);
      setTags([]);
      setCoreId('');
    }
    setTomlError(null);
    setActiveTab('form');
  }, [editingProfile, isOpen]);

  // 弹窗打开且方案机密尚未恢复（rawToml 为空）时，就地从系统凭据库按需补全机密，避免并发竞态
  useEffect(() => {
    if (!isOpen || !editingProfile || editingProfile.rawToml.trim()) return;
    let active = true;
    const reference = profileCredentialReference(editingProfile.id);
    void Promise.resolve(loadProfileSecret(reference)).then((stored) => {
      if (!active || !stored) return;
      const secret = parseProfileSecret(stored);
      if (secret) {
        setRawToml((prev) => (prev.trim() ? prev : secret.rawToml));
        const restoredToken = secret.config.authToken || '';
        if (restoredToken) {
          setAuthToken((prev) => (prev ? prev : restoredToken));
        }
        if (editingProfile.type === 'frps') {
          const webPwd = secret.config.webServer?.password;
          if (webPwd) {
            setFrpsDashboardPwd((prev) => (prev && prev !== 'admin123' ? prev : webPwd));
          }
        }
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [isOpen, editingProfile]);

  // 从草稿切换到高级编辑模式
  const handleSwitchToAdvanced = (draft: ScenarioFormValues, selectedCoreId?: string) => {
    setViewMode('advanced');
    setProfileName(draft.name);
    setProfileDescription('');
    setProfileType('frpc');
    setServerAddr(draft.serverAddr || '');
    setServerPort(draft.serverPort || 7000);
    setAuthToken(draft.authToken || '');
    setProtocol(draft.transportProtocol ?? 'tcp');
    setTlsEnable(draft.tlsEnable ?? false);
    setCoreId(selectedCoreId || '');
    setLogConfig({ level: 'info' });
    setTags(draft.tags ? [...draft.tags] : []);

    const proxy: ProxyRule = {
      name: draft.proxyName || 'service-1',
      type: draft.proxyType as any,
      localIP: draft.localIP || '127.0.0.1',
      localPort: Number(draft.localPort) || 0,
      remotePort: draft.remotePort !== undefined ? Number(draft.remotePort) : undefined,
      customDomains: draft.customDomains && draft.customDomains.length > 0 ? draft.customDomains : undefined,
      useEncryption: draft.useEncryption ?? true,
      useCompression: draft.useCompression ?? true,
    };

    const newProxies = [proxy];
    setProxies(newProxies);
    setVisitors([]);

    const conf: FrpcConfig = {
      serverAddr: draft.serverAddr || '',
      serverPort: Number(draft.serverPort) || 7000,
      authToken: draft.authToken || undefined,
      transport: {
        protocol: draft.transportProtocol ?? 'tcp',
        tls: { enable: draft.tlsEnable ?? false },
      },
      log: { level: 'info' },
      proxies: newProxies,
      visitors: [],
    };

    try {
      const tomlStr = serializeFrpcToml(conf);
      setRawToml(tomlStr);
      setTomlError(null);
    } catch (e: any) {
      setTomlError(`生成 TOML 失败: ${e.message}`);
    }

    setActiveTab('form');
  };

  // 从当前表单生成 TOML
  const syncFormToToml = () => {
    try {
      if (profileType === 'frpc') {
        const conf: FrpcConfig = {
          serverAddr,
          serverPort: Number(serverPort),
          authToken,
          transport: {
            protocol,
            tls: { enable: tlsEnable },
          },
          log: logConfig,
          proxies,
          visitors,
        };
        const tomlStr = serializeFrpcToml(conf);
        setRawToml(tomlStr);
        setTomlError(null);
      } else {
        const conf: FrpsConfig = {
          bindPort: Number(frpsBindPort),
          vhostHTTPPort: Number(frpsVhostHttp),
          vhostHTTPSPort: Number(frpsVhostHttps),
          authToken,
          log: logConfig,
          webServer: {
            port: Number(frpsDashboardPort),
            user: frpsDashboardUser,
            password: frpsDashboardPwd,
          },
        };
        const tomlStr = serializeFrpsToml(conf);
        setRawToml(tomlStr);
        setTomlError(null);
      }
    } catch (e: any) {
      setTomlError(`生成 TOML 失败: ${e.message}`);
    }
  };

  // 从当前 TOML 解析回表单
  const syncTomlToForm = () => {
    try {
      if (profileType === 'frpc') {
        const conf = parseFrpcToml(rawToml);
        setServerAddr(conf.serverAddr);
        setServerPort(conf.serverPort);
        setAuthToken(conf.authToken || '');
        setProtocol(conf.transport?.protocol || 'tcp');
        setTlsEnable(conf.transport?.tls?.enable ?? false);
        setLogConfig(conf.log ? { ...conf.log, level: conf.log.level || 'info' } : { level: 'info' });
        setProxies(conf.proxies || []);
        setVisitors(conf.visitors || []);
        setTomlError(null);
        setActiveTab('form');
        feishuToast.success('已成功从 TOML 解析并同步到表单');
      } else {
        const conf = parseFrpsToml(rawToml);
        setFrpsBindPort(conf.bindPort);
        setFrpsVhostHttp(conf.vhostHTTPPort || 80);
        setFrpsVhostHttps(conf.vhostHTTPSPort || 443);
        setAuthToken(conf.authToken || '');
        setLogConfig(conf.log ? { ...conf.log, level: conf.log.level || 'info' } : { level: 'info' });
        setFrpsDashboardPort(conf.webServer?.port || 7500);
        setFrpsDashboardUser(conf.webServer?.user || 'admin');
        setFrpsDashboardPwd(conf.webServer?.password || '');
        setTomlError(null);
        setActiveTab('form');
        feishuToast.success('已成功从 TOML 解析并同步到表单');
      }
    } catch (e: any) {
      setTomlError(`TOML 语法错误: ${e.message}`);
      feishuToast.error(`TOML 解析失败: ${e.message}`);
    }
  };

  const handleTabChange = (tab: 'form' | 'toml') => {
    if (tab === 'toml') {
      syncFormToToml();
    }
    setActiveTab(tab);
  };

  const handleAddPreset = (preset: typeof PRESET_SCENARIOS[0]) => {
    const newProxy: ProxyRule = {
      name: `${preset.defaultRule.name || 'service'}-${proxies.length + 1}`,
      type: preset.defaultRule.type || 'tcp',
      localIP: preset.defaultRule.localIP || '127.0.0.1',
      localPort: preset.defaultRule.localPort || 80,
      remotePort: preset.defaultRule.remotePort,
      customDomains: preset.defaultRule.customDomains,
      subdomain: preset.defaultRule.subdomain,
      secretKey: preset.defaultRule.secretKey,
      useEncryption: preset.defaultRule.useEncryption,
      useCompression: preset.defaultRule.useCompression,
    };
    setProxies([...proxies, newProxy]);
    setIsPresetDropdownOpen(false);
    feishuToast.success(`已添加预设场景: ${preset.name}`);
  };

  const handleAddEmptyProxy = () => {
    const newProxy: ProxyRule = {
      name: `tcp-${proxies.length + 1}`,
      type: 'tcp',
      localIP: '127.0.0.1',
      localPort: 8080,
      remotePort: 8080,
    };
    setProxies([...proxies, newProxy]);
  };

  const handleUpdateProxy = (index: number, key: keyof ProxyRule, value: any) => {
    const updated = [...proxies];
    updated[index] = { ...updated[index], [key]: value };
    setProxies(updated);
  };

  const handleDeleteProxy = (index: number) => {
    setProxies(proxies.filter((_, i) => i !== index));
  };

  const handleTestConnectivity = async () => {
    if (!serverAddr.trim()) {
      feishuToast.warning('请输入服务器 IP 或域名');
      return;
    }
    setIsTestingConn(true);
    try {
      const res = await testServerConnectivity(serverAddr, Number(serverPort) || 7000);
      if (res.status === 'success') {
        setTestResult({ status: 'success', latencyMs: res.latencyMs });
        feishuToast.success(`与 ${serverAddr}:${serverPort} 握手成功 (${res.latencyMs}ms)`);
      } else {
        setTestResult({ status: 'failed', error: res.error || '无法建立握手' });
        feishuToast.error(`连接探测失败: ${res.error || '连接超时'}`);
      }
    } catch (err: any) {
      setTestResult({ status: 'failed', error: err?.message || '测试异常' });
      feishuToast.error(`测试异常: ${err.message}`);
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleSave = () => {
    if (!profileName.trim()) {
      feishuToast.warning('请输入配置方案名称');
      return;
    }
    if (profileType === 'frpc' && !coreId) {
      feishuToast.warning('请选择已下载的 FRP 核心版本');
      return;
    }

    let finalConfig: FrpcConfig | FrpsConfig;
    let finalToml = rawToml;

    if (activeTab === 'form') {
      if (profileType === 'frpc') {
        finalConfig = {
          serverAddr,
          serverPort: Number(serverPort),
          authToken,
          transport: { protocol, tls: { enable: tlsEnable } },
          log: logConfig,
          proxies,
          visitors,
        };
        finalToml = serializeFrpcToml(finalConfig as FrpcConfig);
      } else {
        finalConfig = {
          bindPort: Number(frpsBindPort),
          vhostHTTPPort: Number(frpsVhostHttp),
          vhostHTTPSPort: Number(frpsVhostHttps),
          authToken,
          log: logConfig,
          webServer: {
            port: Number(frpsDashboardPort),
            user: frpsDashboardUser,
            password: frpsDashboardPwd,
          },
        };
        finalToml = serializeFrpsToml(finalConfig as FrpsConfig);
      }
    } else {
      try {
        finalConfig = profileType === 'frpc' ? parseFrpcToml(rawToml) : parseFrpsToml(rawToml);
      } catch (e: any) {
        feishuToast.error(`TOML 格式不正确: ${e.message}`);
        return;
      }
    }

    const updatedProfile: Profile = {
      id: editingProfile?.id || `prof_${Date.now()}`,
      name: profileName,
      type: profileType,
      coreId: profileType === 'frpc' ? coreId : undefined,
      description: profileDescription,
      config: finalConfig,
      rawToml: finalToml,
      status: editingProfile?.status || 'stopped',
      stats: editingProfile?.stats || {
        bytesIn: 0,
        bytesOut: 0,
        curConns: 0,
        uptimeSeconds: 0,
      },
      groupId: editingProfile?.groupId,
      tags: normalizeTags(tags),
      isPinned: editingProfile?.isPinned ?? false,
      createdAt: editingProfile?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    onSave(updatedProfile);
    onClose();
  };

  const protocolOptions = [
    { value: 'tcp', label: 'TCP 协议 (标准稳定)' },
    { value: 'kcp', label: 'KCP 协议 (抗丢包优化)' },
    { value: 'quic', label: 'QUIC 协议 (现代化传输)' },
    { value: 'websocket', label: 'WebSocket' },
    { value: 'wss', label: 'WSS (TLS 加密)' },
  ];

  const proxyTypeOptions = [
    { value: 'tcp', label: 'TCP' },
    { value: 'udp', label: 'UDP' },
    { value: 'http', label: 'HTTP' },
    { value: 'https', label: 'HTTPS' },
    { value: 'stcp', label: 'STCP' },
  ];

  if (viewMode === 'wizard' && !editingProfile) {
    return (
      <FeishuDialog
        visible={isOpen}
        onCancel={onClose}
        title="新建连接"
        width={720}
        showIcon={false}
        footer={null}
      >
        <ScenarioWizard
          activeCore={activeCore}
          cores={cores}
          serverNodes={serverNodes}
          onSave={(profile) => {
            onSave(profile);
            onClose();
          }}
          onCancel={onClose}
          onSwitchToAdvanced={handleSwitchToAdvanced}
        />
      </FeishuDialog>
    );
  }

  return (
    <FeishuDialog
      visible={isOpen}
      onCancel={onClose}
      title={
        <div className="flex items-center justify-between w-full pr-6">
          <span className="text-[16px] font-medium text-[#1F2329]">
            {editingProfile ? `编辑连接: ${editingProfile.name}` : '新建连接 (高级模式)'}
          </span>
          <div className="flex items-center bg-[#F2F3F5] p-0.5 rounded-[6px]">
            <button
              type="button"
              onClick={() => handleTabChange('form')}
              className={`h-6 px-2.5 text-[12px] rounded-[4px] transition-all cursor-pointer ${
                activeTab === 'form'
                  ? 'bg-white text-[#165DFF] font-medium shadow-2xs'
                  : 'text-[#646A75] hover:text-[#1F2329]'
              }`}
            >
              可视化表单
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('toml')}
              className={`h-6 px-2.5 text-[12px] rounded-[4px] transition-all cursor-pointer ${
                activeTab === 'toml'
                  ? 'bg-white text-[#165DFF] font-medium shadow-2xs'
                  : 'text-[#646A75] hover:text-[#1F2329]'
              }`}
            >
              TOML 源码
            </button>
          </div>
        </div>
      }
      width={760}
      showIcon={false}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-[12px] text-[#8F959E] flex items-center gap-1.5">
            <CheckedIcon className="w-3.5 h-3.5 text-[#00B42A]" />
            <span>配置参数已自动校验</span>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-8 px-3.5 text-[13px] rounded-[6px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5]"
            >
              取消
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSave}
              className="h-8 px-4 text-[13px] rounded-[6px] bg-[#165DFF] text-white hover:bg-[#0E4FD9]"
            >
              {editingProfile ? '保存修改' : '创建穿透方案'}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
        {/* 错误提示条 */}
        {tomlError && (
          <div className="p-2.5 bg-[#FFF2F0] border border-[#FFCCC7] rounded-[6px] text-[13px] text-[#F53F3F] leading-relaxed flex items-center gap-2">
            <ErrorIcon className="w-4 h-4 shrink-0" />
            <span>{tomlError}</span>
          </div>
        )}

        {activeTab === 'form' ? (
          <>
            {/* 模块 1: 方案标识与引擎 (第 1 行紧凑栅格) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                  方案名称 <span className="text-[#F53F3F]">*</span>
                </label>
                <FeishuInput
                  value={profileName}
                  onChange={(val) => setProfileName(val)}
                  placeholder="例如: 生产 Linux SSH 穿透"
                  containerClassName="h-8"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                  方案类型 <span className="text-[#F53F3F]">*</span>
                </label>
                <FeishuSelect
                  options={[
                    { value: 'frpc', label: '客户端 (FRPC)' },
                    { value: 'frps', label: '服务端 (FRPS)' },
                  ]}
                  value={profileType}
                  onChange={(val) => setProfileType(val as any)}
                  size="sm"
                  className="w-full"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                  FRP 核心版本 <span className="text-[#F53F3F]">*</span>
                </label>
                <FeishuSelect
                  options={downloadedCoreOptions}
                  value={coreId}
                  onChange={setCoreId}
                  placeholder={downloadedCoreOptions.length ? '请选择已下载版本' : '暂无已下载版本'}
                  disabled={downloadedCoreOptions.length === 0}
                  size="sm"
                  className="w-full"
                />
              </div>
            </div>

            {/* 模块 2: 服务器连接与凭据 (FRPC) */}
            {profileType === 'frpc' ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-semibold text-[#1F2329]">
                    FRP 服务器连接
                  </div>
                  <div className="flex items-center gap-2">
                    {testResult && (
                      <FeishuPill
                        variant={testResult.status === 'success' ? 'green' : 'red'}
                        showDot={true}
                        className="text-[11px] h-[22px] px-2"
                      >
                        {testResult.status === 'success'
                          ? `握手成功 (${testResult.latencyMs}ms)`
                          : `连接失败: ${testResult.error?.substring(0, 16)}`}
                      </FeishuPill>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleTestConnectivity}
                      disabled={isTestingConn}
                      className="h-6 px-2 text-[11px] rounded-[4px] border-[#DEE0E3] bg-white text-[#165DFF] hover:bg-[#F0F4FF] hover:border-[#165DFF] cursor-pointer"
                    >
                      <Zap className={`w-3 h-3 mr-1 ${isTestingConn ? 'animate-spin' : ''}`} />
                      {isTestingConn ? '正在测试...' : '⚡ 测试连通性'}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                      服务器 IP / 域名 <span className="text-[#F53F3F]">*</span>
                    </label>
                    <FeishuInput
                      value={serverAddr}
                      onChange={(val) => setServerAddr(val)}
                      placeholder="118.195.146.161"
                      containerClassName="h-8"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                      端口 <span className="text-[#F53F3F]">*</span>
                    </label>
                    <FeishuInput
                      type="number"
                      value={String(serverPort)}
                      onChange={(val) => setServerPort(Number(val) || 0)}
                      placeholder="7000"
                      containerClassName="h-8"
                    />
                  </div>

                  <div className="sm:col-span-5">
                    <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                      认证令牌 (Token)
                    </label>
                    <FeishuInput
                      type={showAuthToken ? 'text' : 'password'}
                      value={authToken}
                      onChange={(val) => setAuthToken(val)}
                      placeholder="认证密钥"
                      containerClassName="h-8"
                      suffix={
                        <button
                          type="button"
                          onClick={() => setShowAuthToken(!showAuthToken)}
                          className="text-[#8F959E] hover:text-[#1F2329] cursor-pointer flex items-center justify-center"
                          title={showAuthToken ? '隐藏密码' : '显示密码'}
                          aria-label={showAuthToken ? '隐藏密码' : '显示密码'}
                        >
                          {showAuthToken ? <VisibleIcon className="w-4 h-4" /> : <VisibleLockIcon className="w-4 h-4" />}
                        </button>
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* 服务端 FRPS 设置 */
              <div className="space-y-2.5">
                <div className="text-[13px] font-semibold text-[#1F2329]">
                  FRPS 服务端监听与管理配置
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                      监听端口 (BindPort) <span className="text-[#F53F3F]">*</span>
                    </label>
                    <FeishuInput
                      type="number"
                      value={String(frpsBindPort)}
                      onChange={(val) => setFrpsBindPort(Number(val) || 0)}
                      containerClassName="h-8"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                      HTTP 主机端口
                    </label>
                    <FeishuInput
                      type="number"
                      value={String(frpsVhostHttp)}
                      onChange={(val) => setFrpsVhostHttp(Number(val) || 0)}
                      containerClassName="h-8"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                      HTTPS 主机端口
                    </label>
                    <FeishuInput
                      type="number"
                      value={String(frpsVhostHttps)}
                      onChange={(val) => setFrpsVhostHttps(Number(val) || 0)}
                      containerClassName="h-8"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                      认证令牌 (Token)
                    </label>
                    <FeishuInput
                      type={showAuthToken ? 'text' : 'password'}
                      value={authToken}
                      onChange={(val) => setAuthToken(val)}
                      placeholder="留空即无需认证"
                      containerClassName="h-8"
                      suffix={
                        <button
                          type="button"
                          onClick={() => setShowAuthToken(!showAuthToken)}
                          className="text-[#8F959E] hover:text-[#1F2329] cursor-pointer flex items-center justify-center"
                          title={showAuthToken ? '隐藏密码' : '显示密码'}
                          aria-label={showAuthToken ? '隐藏密码' : '显示密码'}
                        >
                          {showAuthToken ? <VisibleIcon className="w-4 h-4" /> : <VisibleLockIcon className="w-4 h-4" />}
                        </button>
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                      Dashboard 端口
                    </label>
                    <FeishuInput
                      type="number"
                      value={String(frpsDashboardPort)}
                      onChange={(val) => setFrpsDashboardPort(Number(val) || 0)}
                      containerClassName="h-8"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                      Dashboard 账号 / 密码
                    </label>
                    <div className="flex gap-1.5">
                      <FeishuInput
                        value={frpsDashboardUser}
                        onChange={(val) => setFrpsDashboardUser(val)}
                        placeholder="admin"
                        containerClassName="h-8 flex-1"
                      />
                      <FeishuInput
                        type="password"
                        value={frpsDashboardPwd}
                        onChange={(val) => setFrpsDashboardPwd(val)}
                        placeholder="密码"
                        containerClassName="h-8 flex-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 模块 3: 辅助说明与标签 (第 3 行紧凑栅格) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7">
                <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                  方案描述说明 (选填)
                </label>
                <FeishuInput
                  value={profileDescription}
                  onChange={(val) => setProfileDescription(val)}
                  placeholder="描述该方案的用途、穿透目标或网络环境..."
                  containerClassName="h-8"
                />
              </div>

              <div className="sm:col-span-5">
                <label className="block text-[12px] font-medium text-[#1F2329] mb-1">
                  方案标签
                </label>
                <ProfileTagEditor tags={tags} onChange={setTags} />
              </div>
            </div>

            {/* 分割线 */}
            <div className="border-t border-[#EFF0F1]" />

            {/* 模块 4: 穿透规则列表 (FRPC 核心黄金区) */}
            {profileType === 'frpc' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[#1F2329]">
                      穿透规则列表
                    </span>
                    <span className="text-[12px] text-[#8F959E] tabular-nums">
                      ({proxies.length} 条)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* 快捷预设下拉菜单 */}
                    <div className="relative" ref={presetDropdownRef}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsPresetDropdownOpen(!isPresetDropdownOpen)}
                        className="h-7 px-2.5 text-[12px] rounded-[6px] border-[#DEE0E3] bg-white text-[#1F2329] hover:bg-[#F2F3F5] gap-1 cursor-pointer"
                      >
                        <span>快速预设</span>
                        <ChevronDown className="w-3 h-3 text-[#8F959E]" />
                      </Button>

                      {isPresetDropdownOpen && (
                        <div className="absolute right-0 top-8 z-20 w-48 bg-white rounded-[6px] border border-[#DEE0E3] shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100">
                          {PRESET_SCENARIOS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handleAddPreset(preset)}
                              className="w-full px-3 py-1.5 text-left text-[12px] text-[#1F2329] hover:bg-[#F0F4FF] hover:text-[#165DFF] flex items-center justify-between transition-colors cursor-pointer"
                            >
                              <span>{preset.name}</span>
                              <span className="text-[11px] text-[#8F959E]">{preset.tag}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAddEmptyProxy}
                      className="h-7 px-2.5 text-[12px] rounded-[6px] border-[#DEE0E3] bg-white text-[#165DFF] hover:bg-[#F0F4FF] hover:border-[#165DFF] cursor-pointer"
                    >
                      <AddIcon className="w-3 h-3 mr-1" />
                      添加规则
                    </Button>
                  </div>
                </div>

                {proxies.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-[#DEE0E3] rounded-[8px] bg-white text-[#8F959E]">
                    <p className="text-[12px]">暂无穿透规则，请点击“快速预设”或“添加规则”</p>
                  </div>
                ) : (
                  <div className="border border-[#DEE0E3] rounded-[8px] overflow-hidden bg-white shadow-2xs">
                    <table className="table-fixed w-full text-left text-[12px] border-collapse">
                      <thead>
                        <tr className="bg-[#F8F9FA] border-b border-[#DEE0E3] text-[#646A75] font-medium h-8">
                          <th className="px-2.5 py-1 font-medium w-[135px]">规则名称</th>
                          <th className="px-1.5 py-1 font-medium w-[96px]">协议</th>
                          <th className="px-1.5 py-1 font-medium w-[96px]">本地端口</th>
                          <th className="px-2 py-1 font-medium w-[185px]">公网端口 / 域名</th>
                          <th className="px-2 py-1 font-medium w-[118px]">加密 / 压缩</th>
                          <th className="px-1 py-1 font-medium w-[44px] text-center text-[#646A75]">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFF0F1]">
                        {proxies.map((proxy, idx) => (
                          <tr key={idx} className="hover:bg-[#F9FAFB] transition-colors">
                            <td className="px-2 py-1">
                              <FeishuInput
                                value={proxy.name}
                                onChange={(val) => handleUpdateProxy(idx, 'name', val)}
                                placeholder="web-80"
                                containerClassName="h-7 text-[12px]"
                              />
                            </td>
                            <td className="px-1.5 py-1">
                              <FeishuSelect
                                options={proxyTypeOptions}
                                value={proxy.type}
                                onChange={(val) => handleUpdateProxy(idx, 'type', val)}
                                size="sm"
                                className="w-full"
                              />
                            </td>
                            <td className="px-1.5 py-1">
                              <FeishuInput
                                type="number"
                                value={proxy.localPort ? String(proxy.localPort) : ''}
                                onChange={(val) => handleUpdateProxy(idx, 'localPort', Number(val) || 0)}
                                placeholder="8001"
                                containerClassName="h-7 text-[12px]"
                              />
                            </td>
                            <td className="px-2 py-1">
                              {['http', 'https'].includes(proxy.type) ? (
                                <FeishuInput
                                  value={proxy.customDomains?.[0] || proxy.subdomain || ''}
                                  onChange={(val) => handleUpdateProxy(idx, 'customDomains', [val])}
                                  placeholder="app.mydomain.com"
                                  containerClassName="h-7 text-[12px]"
                                />
                              ) : (
                                <FeishuInput
                                  type="number"
                                  value={proxy.remotePort ? String(proxy.remotePort) : ''}
                                  onChange={(val) => handleUpdateProxy(idx, 'remotePort', Number(val) || 0)}
                                  placeholder="80"
                                  containerClassName="h-7 text-[12px]"
                                />
                              )}
                            </td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] text-[#646A75]" title="开启传输加密">
                                  <input
                                    type="checkbox"
                                    checked={proxy.useEncryption ?? false}
                                    onChange={(e) => handleUpdateProxy(idx, 'useEncryption', e.target.checked)}
                                    className="w-3.5 h-3.5 rounded text-[#165DFF] focus:ring-0 cursor-pointer"
                                  />
                                  <span>加密</span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer select-none text-[11px] text-[#646A75]" title="开启数据压缩">
                                  <input
                                    type="checkbox"
                                    checked={proxy.useCompression ?? false}
                                    onChange={(e) => handleUpdateProxy(idx, 'useCompression', e.target.checked)}
                                    className="w-3.5 h-3.5 rounded text-[#165DFF] focus:ring-0 cursor-pointer"
                                  />
                                  <span>压缩</span>
                                </label>
                              </div>
                            </td>
                            <td className="px-1 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteProxy(idx)}
                                title="删除该规则"
                                aria-label="删除该规则"
                                className="w-7 h-7 rounded-[4px] hover:bg-[#FFF2F0] text-[#8F959E] hover:text-[#F53F3F] inline-flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 模块 5: 高级传输与运行日志折叠面板 (单行紧凑收纳区) */}
            <div className="border border-[#EFF0F1] rounded-[8px] bg-[#FAFAFA] overflow-hidden">
              <button
                type="button"
                onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
                className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[#F2F3F5] transition-colors cursor-pointer select-none"
              >
                <span className="text-[12px] font-medium text-[#1F2329] flex items-center gap-1.5">
                  <ChevronDown className={`w-3.5 h-3.5 text-[#8F959E] transition-transform duration-200 ${isAdvancedExpanded ? 'rotate-180' : ''}`} />
                  高级传输与运行日志
                </span>
                <span className="text-[11px] text-[#8F959E]">
                  {profileType === 'frpc' ? `协议: ${protocol.toUpperCase()} · TLS: ${tlsEnable ? '开启' : '关闭'} · ` : ''}日志: {(logConfig.level || 'info').toUpperCase()}
                </span>
              </button>

              {isAdvancedExpanded && (
                <div className="px-3.5 py-2.5 bg-white border-t border-[#EFF0F1]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {profileType === 'frpc' && (
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-[#1F2329] shrink-0">通信协议</span>
                        <FeishuSelect
                          options={protocolOptions}
                          value={protocol}
                          onChange={(val) => setProtocol(val as any)}
                          size="sm"
                          className="w-[170px]"
                        />
                      </div>
                    )}

                    <div data-testid="runtime-log-level-setting" className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-[#1F2329] shrink-0">日志级别</span>
                      <FeishuSelect
                        options={LOG_LEVEL_OPTIONS}
                        value={logConfig.level || 'info'}
                        onChange={(value) => {
                          setLogConfig((prev) => ({ ...prev, level: value as FrpLogLevel }));
                        }}
                        size="sm"
                        className="w-[130px]"
                      />
                    </div>

                    {profileType === 'frpc' && (
                      <label className="flex items-center gap-1.5 cursor-pointer select-none text-[12px] font-medium text-[#1F2329] hover:text-[#165DFF] transition-colors">
                        <input
                          type="checkbox"
                          checked={tlsEnable}
                          onChange={(e) => setTlsEnable(e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-[#165DFF] focus:ring-0 cursor-pointer"
                        />
                        <span className="flex items-center gap-1">
                          <ShieldIcon className="w-3.5 h-3.5 text-[#00B42A]" />
                          启用 TLS 全链路加密传输
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          /* TOML 源码编辑模式 */
          <div className="h-[420px] flex flex-col space-y-2.5">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-semibold text-[#1F2329] shrink-0">
                  FRP 标准 TOML 配置文件
                </span>
                {profileType === 'frpc' && targetTomlPath && (
                  <span
                    className="text-[11px] text-[#646A75] font-mono truncate max-w-[380px] bg-[#F2F3F5] px-2 py-0.5 rounded border border-[#DEE0E3]"
                    title={`保存或启动时将写入所选核心目录：${targetTomlPath} (并同步 frpc.toml)`}
                  >
                    写入路径: {targetTomlPath}
                  </span>
                )}
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={syncTomlToForm}
                className="h-7 text-[12px] px-2.5 rounded-[6px] border-[#DEE0E3] bg-white text-[#165DFF] hover:bg-[#F0F4FF] hover:border-[#165DFF] shrink-0 cursor-pointer"
              >
                <RefreshIcon className="w-3 h-3 mr-1" />
                同步到表单
              </Button>
            </div>

            <textarea
              value={rawToml}
              onChange={(e) => setRawToml(e.target.value)}
              placeholder="# 在此编写标准 FRP TOML 配置文件..."
              className="flex-1 w-full p-3.5 font-mono text-[13px] text-[#1F2329] bg-white border border-[#DEE0E3] rounded-[6px] transition-all hover:border-[#4080FF] focus:border-[#165DFF] focus:ring-2 focus:ring-[#165DFF]/20 focus:outline-none resize-none leading-relaxed select-text shadow-2xs"
            />
          </div>
        )}
      </div>
    </FeishuDialog>
  );
};
