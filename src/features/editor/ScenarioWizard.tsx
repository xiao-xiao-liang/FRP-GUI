import React, { useState } from 'react';
import { FrpCore, FrpServerNode, Profile } from '../../types/frp';
import { 
  ScenarioFormValues, 
  validateProfileForm, 
  buildScenarioProfile 
} from '../../services/profile-validator';
import { WIZARD_SCENARIOS, WizardScenario } from '../../services/presets';
import { testServerConnectivity } from '../../services/ipc';
import { Button } from '../../components/ui/button';
import { FeishuSelect } from '../../components/ui/feishu-select';
import { 
  Monitor, Terminal, Globe, HardDrive, Gamepad2, Sliders, 
  Eye, EyeOff, ChevronRight, AlertCircle, ArrowLeft 
} from 'lucide-react';
import { feishuToast } from '../../components/ui/FeishuToast';
import { ProfileTagEditor } from '../profiles/ProfileTagEditor';

const ICON_MAP: Record<string, React.FC<any>> = {
  Monitor, Terminal, Globe, HardDrive, Gamepad2, Sliders
};

export interface ScenarioWizardProps {
  activeCore: FrpCore | null;
  cores?: FrpCore[];
  serverNodes?: FrpServerNode[];
  onSave: (profile: Profile) => void;
  onCancel: () => void;
  onSwitchToAdvanced: (draft: ScenarioFormValues, coreId?: string) => void;
}

const maskTomlToken = (toml: string): string => {
  return toml
    .replace(/(auth\.token\s*=\s*)"[^"]*"/g, '$1"******"')
    .replace(/(token\s*=\s*)"[^"]*"/g, '$1"******"');
};

export const ScenarioWizard: React.FC<ScenarioWizardProps> = ({
  activeCore,
  cores = [],
  serverNodes = [],
  onSave,
  onCancel,
  onSwitchToAdvanced,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [scenarioId, setScenarioId] = useState<string>('rdp');
  const [variantId, setVariantId] = useState<string>('');
  
  const [draft, setDraft] = useState<Partial<ScenarioFormValues>>({
    serverAddr: '',
    serverPort: 7000,
    authToken: '',
  });

  const [tags, setTags] = useState<string[]>([]);
  const [coreId, setCoreId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);
  const [testError, setTestError] = useState('');
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const scenario = WIZARD_SCENARIOS.find(s => s.id === scenarioId) || WIZARD_SCENARIOS[0];
  const variant = scenario.variants?.find(v => v.id === variantId) || null;

  const currentLocalPort = variant?.defaultLocalPort ?? scenario.defaultLocalPort;
  const currentRemotePort = variant?.defaultRemotePort ?? scenario.defaultRemotePort;
  const currentProxyType = variant?.defaultType ?? scenario.defaultType;
  const currentName = variant?.defaultName ?? scenario.defaultName;
  const currentProxyName = variant?.defaultProxyName ?? scenario.defaultProxyName;
  const reusableServerNodes = serverNodes.filter((node) =>
    node.status === 'running'
    && node.serviceStatus === 'running'
    && Boolean(node.deployment)
    && Boolean(node.credentialRef),
  );
  const downloadedCoreOptions = cores
    .filter((core) => Boolean(core.path) && core.status !== 'not_downloaded')
    .map((core) => ({ value: core.id, label: `${core.version} · ${core.os}/${core.arch}` }));
  const selectedCore = cores.find((core) => core.id === coreId) ?? null;

  const handleNextStep = (s: WizardScenario) => {
    if (s.id === 'custom') {
      onSwitchToAdvanced({
        name: s.defaultName,
        serverAddr: draft.serverAddr || '',
        serverPort: draft.serverPort || 7000,
        authToken: draft.authToken,
        serverNodeId: draft.serverNodeId,
        scenarioId: s.id,
        proxyName: s.defaultProxyName,
        proxyType: s.defaultType,
        localIP: '127.0.0.1',
        localPort: s.defaultLocalPort,
        remotePort: s.defaultRemotePort,
        useEncryption: draft.useEncryption,
        useCompression: draft.useCompression,
        transportProtocol: draft.transportProtocol,
        tlsEnable: draft.tlsEnable,
      }, coreId);
      return;
    }
    setScenarioId(s.id);
    if (s.variants?.length) {
      setVariantId(s.variants[0].id);
    } else {
      setVariantId('');
    }
    setStep(2);
  };

  const handleSelectVariant = (vId: string) => {
    setVariantId(vId);
    setDraft(d => ({
      ...d,
      name: undefined,
      localPort: undefined,
      remotePort: undefined,
    }));
  };

  const parsePort = (val: any, fallback?: number): number | undefined => {
    if (typeof val === 'number') return isNaN(val) ? fallback : val;
    if (typeof val === 'string' && val.trim() !== '') {
      const p = parseInt(val, 10);
      return isNaN(p) ? fallback : p;
    }
    return fallback;
  };

  const buildDraft = (): ScenarioFormValues => {
    return {
      name: (draft.name !== undefined && draft.name.trim() !== '') ? draft.name.trim() : currentName,
      serverAddr: draft.serverAddr || '',
      serverPort: parsePort(draft.serverPort, 7000) ?? 7000,
      authToken: draft.authToken,
      serverNodeId: draft.serverNodeId,
      scenarioId: scenario.id,
      variantId,
      proxyName: currentProxyName,
      proxyType: currentProxyType,
      localIP: '127.0.0.1',
      localPort: parsePort(draft.localPort, currentLocalPort) ?? 0,
      remotePort: parsePort(draft.remotePort, currentRemotePort),
      customDomains: draft.customDomains,
      useEncryption: draft.useEncryption,
      useCompression: draft.useCompression,
      transportProtocol: draft.transportProtocol,
      tlsEnable: draft.tlsEnable,
      tags,
    };
  };

  const handleSave = async (forceSave = false) => {
    const fullDraft = buildDraft();
    if (!coreId) {
      feishuToast.error('请选择已下载的 FRP 核心版本');
      return;
    }
    const validation = validateProfileForm(fullDraft, { activeCore: selectedCore });
    
    if (!validation.valid) {
      const firstErr = Object.values(validation.errors)[0];
      feishuToast.error(firstErr);
      return;
    }

    if (!forceSave) {
      setTesting(true);
      setTestResult(null);
      setTestError('');
      setTestLatency(null);
      try {
        const res = await testServerConnectivity(fullDraft.serverAddr, fullDraft.serverPort);
        if (res.status === 'success') {
          const profile = { ...buildScenarioProfile(fullDraft), coreId };
          onSave(profile);
        } else {
          setTestResult('failed');
          setTestError(res.error || '连接超时或目标主机不可达');
          setTestLatency(res.latencyMs);
        }
      } catch (e: any) {
        setTestResult('failed');
        setTestError(e.message || '网络探测异常');
      } finally {
        setTesting(false);
      }
    } else {
      const profile = { ...buildScenarioProfile(fullDraft), coreId };
      onSave(profile);
    }
  };

  if (step === 1) {
    return (
      <div data-testid="scenario-wizard" className="p-4 space-y-4">
        <h2 className="text-lg font-bold">选择应用场景</h2>
        <div className="grid grid-cols-2 gap-4">
          {WIZARD_SCENARIOS.map(s => {
            const Icon = ICON_MAP[s.iconName];
            return (
              <div 
                key={s.id} 
                onClick={() => handleNextStep(s)}
                className="p-4 border rounded cursor-pointer hover:bg-gray-50 flex flex-col gap-2 relative"
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5 text-blue-500" />
                  <span className="font-medium text-gray-800">{s.name}</span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{s.description}</p>
                <span className="absolute top-2 right-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{s.badge}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const isWeb = scenario.id === 'web';
  const profileToPreview = buildScenarioProfile(buildDraft());

  return (
    <div data-testid="scenario-wizard" className="p-4 flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4" /></Button>
        <h2 className="text-lg font-bold">配置 {scenario.name}</h2>
      </div>

      <div className="space-y-4 flex-1">
        {downloadedCoreOptions.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">未检测到可用 FRP 核心</div>
              <div className="text-xs text-amber-700 mt-0.5">
                您可以继续完成配置并保存，稍后在“核心管理”中下载或设置 FRP 客户端核心。
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">FRP 核心版本</label>
          <FeishuSelect
            options={downloadedCoreOptions}
            value={coreId}
            onChange={setCoreId}
            placeholder={downloadedCoreOptions.length ? '请选择已下载版本' : '暂无已下载版本'}
            disabled={downloadedCoreOptions.length === 0}
            className="w-full"
          />
          <p className="mt-1 text-xs text-gray-500">仅可选择已下载或已导入的 FRPC 核心。</p>
        </div>

        {scenario.variants && (
          <div className="flex gap-2">
            {scenario.variants.map(v => (
              <Button 
                key={v.id} 
                variant={variantId === v.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSelectVariant(v.id)}
              >
                {v.name}
              </Button>
            ))}
          </div>
        )}

        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">连接名称</label>
          <input 
            id="name"
            type="text" 
            className="w-full border rounded px-3 py-2 text-sm"
            value={draft.name ?? currentName} 
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder={currentName}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="serverAddr" className="block text-sm font-medium mb-1">服务器地址</label>
            <input 
              id="serverAddr"
              type="text" 
              className="w-full border rounded px-3 py-2 text-sm"
              value={draft.serverAddr ?? ''} 
              onChange={e => setDraft(d => ({ ...d, serverAddr: e.target.value }))}
              placeholder="例: frp.example.com"
            />
          </div>
          <div>
            <label htmlFor="serverPort" className="block text-sm font-medium mb-1">服务器端口</label>
            <input 
              id="serverPort"
              type="number" 
              className="w-full border rounded px-3 py-2 text-sm"
              value={draft.serverPort !== undefined ? draft.serverPort : 7000} 
              onChange={e => setDraft(d => ({ ...d, serverPort: e.target.value === '' ? ('' as any) : parseInt(e.target.value, 10) }))}
            />
          </div>
        </div>

        {reusableServerNodes.length > 0 && (
          <div>
            <label htmlFor="serverNode" className="block text-sm font-medium mb-1">已部署 FRPS 节点</label>
            <select
              id="serverNode"
              className="w-full border rounded px-3 py-2 text-sm"
              value={draft.serverNodeId || ''}
              onChange={(event) => {
                const node = reusableServerNodes.find((item) => item.id === event.target.value);
                setDraft((current) => node
                  ? {
                    ...current,
                    serverNodeId: node.id,
                    serverAddr: node.host,
                    serverPort: node.frpsBindPort,
                    authToken: '',
                  }
                  : { ...current, serverNodeId: undefined });
              }}
            >
              <option value="">手动填写服务器与 Token</option>
              {reusableServerNodes.map((node) => (
                <option key={node.id} value={node.id}>{node.name}（{node.host}:{node.frpsBindPort}）</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">选择节点后，桌面端会在启动时从系统凭据库读取 Token。</p>
          </div>
        )}

        <div>
          <label htmlFor="authToken" className="block text-sm font-medium mb-1">认证 Token</label>
          <div className="relative">
            <input 
              id="authToken"
              type={showPassword ? 'text' : 'password'} 
              className="w-full border rounded px-3 py-2 text-sm pr-10"
              value={draft.authToken ?? ''} 
              onChange={e => setDraft(d => ({ ...d, authToken: e.target.value }))}
              disabled={Boolean(draft.serverNodeId)}
            />
            <button 
              type="button" 
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-2 text-gray-500 hover:text-gray-700"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {isWeb ? (
          <div>
            <label htmlFor="customDomains" className="block text-sm font-medium mb-1">自定义域名</label>
            <input 
              id="customDomains"
              type="text" 
              className="w-full border rounded px-3 py-2 text-sm"
              value={draft.customDomains?.join(', ') || ''} 
              onChange={e => setDraft(d => ({ ...d, customDomains: e.target.value.split(',').map(s => s.trim()) }))}
              placeholder="例: myapp.example.com"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="localPort" className="block text-sm font-medium mb-1">本地监听端口</label>
              <input 
                id="localPort"
                type="number" 
                className="w-full border rounded px-3 py-2 text-sm"
                value={draft.localPort !== undefined ? draft.localPort : (currentLocalPort ?? '')} 
                onChange={e => setDraft(d => ({ ...d, localPort: e.target.value === '' ? ('' as any) : parseInt(e.target.value, 10) }))}
              />
            </div>
            <div>
              <label htmlFor="remotePort" className="block text-sm font-medium mb-1">公网访问端口</label>
              <input 
                id="remotePort"
                type="number" 
                className="w-full border rounded px-3 py-2 text-sm"
                value={draft.remotePort !== undefined ? draft.remotePort : (currentRemotePort ?? '')} 
                onChange={e => setDraft(d => ({ ...d, remotePort: e.target.value === '' ? ('' as any) : parseInt(e.target.value, 10) }))}
              />
            </div>
          </div>
        )}

        <div className="pt-1">
          <ProfileTagEditor tags={tags} onChange={setTags} />
        </div>

        <div className="bg-blue-50 text-blue-800 p-3 rounded text-sm">
          {scenario.tips}
        </div>

        {testResult === 'failed' && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded text-sm flex justify-between items-center">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">连通性探测失败</div>
                <div className="text-xs text-red-600 mt-0.5">
                  原因：{testError} {testLatency !== null && `(耗时: ${testLatency}ms)`}
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => handleSave(false)}>重试检测</Button>
              <Button size="sm" variant="destructive" onClick={() => handleSave(true)}>仍然保存</Button>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t">
          <button 
            type="button" 
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '收起高级设置' : '高级设置与预览'} <ChevronRight className={`w-4 h-4 transform ${showAdvanced ? 'rotate-90' : ''}`} />
          </button>
          
          {showAdvanced && (
            <div className="mt-2 space-y-2">
              <div 
                data-testid="toml-preview"
                className="bg-gray-100 p-3 rounded font-mono text-xs overflow-auto max-h-40 whitespace-pre-wrap text-gray-700"
              >
                {maskTomlToken(profileToPreview.rawToml)}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => onSwitchToAdvanced(buildDraft(), coreId)}
              >
                转为高级编辑模式
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>取消</Button>
        <Button onClick={() => handleSave(false)} disabled={testing}>
          {testing ? '检测中...' : '检查并保存'}
        </Button>
      </div>
    </div>
  );
};
