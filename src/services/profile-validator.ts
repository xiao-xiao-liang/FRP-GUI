import { FrpcConfig, FrpCore, Profile, ProxyRule } from '../types/frp';
import { ScenarioId } from './presets';
import { serializeFrpcToml } from './toml-sync';

export interface ScenarioFormValues {
  name: string;
  serverAddr: string;
  serverPort: number;
  authToken?: string;
  scenarioId: ScenarioId;
  variantId?: string;
  proxyName: string;
  proxyType: 'tcp' | 'udp' | 'http' | 'https';
  localIP: string;
  localPort: number;
  remotePort?: number;
  customDomains?: string[];
  useEncryption?: boolean;
  useCompression?: boolean;
  transportProtocol?: 'tcp' | 'kcp' | 'quic' | 'websocket' | 'wss';
  tlsEnable?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  warnings: string[];
}

export function validateProfileForm(
  values: ScenarioFormValues,
  options?: { activeCore?: FrpCore | null }
): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  if (!values.name || !values.name.trim()) {
    errors.name = '请输入连接名称';
  }

  if (!values.serverAddr || !values.serverAddr.trim()) {
    errors.serverAddr = '请输入服务器地址';
  }

  if (!values.serverPort || values.serverPort < 1 || values.serverPort > 65535) {
    errors.serverPort = '服务器端口需在 1 - 65535 之间';
  }

  if (!values.localPort || values.localPort < 1 || values.localPort > 65535) {
    errors.localPort = '本地端口需在 1 - 65535 之间';
  }

  const isWeb = values.scenarioId === 'web' || values.proxyType === 'http' || values.proxyType === 'https';

  if (isWeb) {
    const hasDomain = values.customDomains && values.customDomains.some((d) => d && d.trim().length > 0);
    if (!hasDomain) {
      errors.customDomains = '请至少指定一个自定义域名';
    }
  } else {
    if (!values.remotePort || values.remotePort < 1 || values.remotePort > 65535) {
      errors.remotePort = '远程端口需在 1 - 65535 之间';
    }
  }

  if (options && options.activeCore === null) {
    warnings.push('当前未配置本地 FRP 核心引擎，保存后可在“FRP 核心管理”中配置后启动');
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}

export function buildScenarioProfile(values: ScenarioFormValues): Profile {
  const isWeb = values.scenarioId === 'web' || values.proxyType === 'http' || values.proxyType === 'https';

  const proxyRule: ProxyRule = {
    name: values.proxyName.trim() || `proxy-${Date.now()}`,
    type: values.proxyType,
    localIP: values.localIP || '127.0.0.1',
    localPort: values.localPort,
    remotePort: isWeb ? undefined : values.remotePort,
    customDomains: isWeb ? (values.customDomains?.filter((d) => d && d.trim().length > 0) || []) : undefined,
    useEncryption: values.useEncryption ?? true,
    useCompression: values.useCompression ?? true,
  };

  const config: FrpcConfig = {
    serverAddr: values.serverAddr.trim(),
    serverPort: values.serverPort,
    authToken: values.authToken && values.authToken.trim().length > 0 ? values.authToken.trim() : undefined,
    transport: {
      protocol: values.transportProtocol || 'tcp',
      tls: { enable: values.tlsEnable ?? false },
    },
    proxies: [proxyRule],
    visitors: [],
  };

  const rawToml = serializeFrpcToml(config);
  const now = Date.now();

  return {
    id: `prof_${now}_${Math.random().toString(36).slice(2, 7)}`,
    name: values.name.trim(),
    type: 'frpc',
    status: 'stopped',
    config,
    rawToml,
    stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
    createdAt: now,
    updatedAt: now,
  };
}
