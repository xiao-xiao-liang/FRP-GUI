import { FrpcConfig, FrpsConfig, ProxyRule, VisitorRule } from '../types/frp';

/**
 * 纯 TypeScript 实现的轻量级 TOML 解析器 (专为 FRP v0.52+ TOML 格式优化，零外部依赖)
 */
function parseTomlSimple(toml: string): Record<string, any> {
  const lines = toml.split(/\r?\n/);
  const result: Record<string, any> = {};
  let currentSection: any = result;
  let currentArraySection: any[] | null = null;
  let currentArraySectionName: string | null = null;

  for (let rawLine of lines) {
    let line = rawLine.trim();
    // 忽略注释与空行
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue;
    }

    // 数组段 [[proxies]] 或 [[visitors]]
    const arraySectionMatch = line.match(/^\[\[([\w.-]+)\]\]$/);
    if (arraySectionMatch) {
      const sectionName = arraySectionMatch[1];
      if (!Array.isArray(result[sectionName])) {
        result[sectionName] = [];
      }
      const newObj = {};
      result[sectionName].push(newObj);
      currentSection = newObj;
      currentArraySection = result[sectionName];
      currentArraySectionName = sectionName;
      continue;
    }

    // 普通段 [auth] 或 [transport] 或 [webServer]
    const sectionMatch = line.match(/^\[([\w.-]+)\]$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1];
      if (!result[sectionName] || typeof result[sectionName] !== 'object') {
        result[sectionName] = {};
      }
      currentSection = result[sectionName];
      currentArraySection = null;
      currentArraySectionName = null;
      continue;
    }

    // 键值对 key = value
    const kvMatch = line.match(/^([\w.-]+)\s*=\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      let valStr = kvMatch[2].trim();

      // 解析值
      let val: any = valStr;
      if (valStr.startsWith('"') && valStr.endsWith('"')) {
        val = valStr.slice(1, -1);
      } else if (valStr.startsWith("'") && valStr.endsWith("'")) {
        val = valStr.slice(1, -1);
      } else if (valStr === 'true') {
        val = true;
      } else if (valStr === 'false') {
        val = false;
      } else if (!isNaN(Number(valStr))) {
        val = Number(valStr);
      } else if (valStr.startsWith('[') && valStr.endsWith(']')) {
        // 数组解析
        const inner = valStr.slice(1, -1).trim();
        if (!inner) {
          val = [];
        } else {
          val = inner.split(',').map((s) => {
            const item = s.trim();
            if (item.startsWith('"') && item.endsWith('"')) return item.slice(1, -1);
            if (item.startsWith("'") && item.endsWith("'")) return item.slice(1, -1);
            return item;
          });
        }
      }

      currentSection[key] = val;
    }
  }

  return result;
}

/**
 * 将 FrpcConfig 结构序列化为标准 FRP v0.52+ 格式的 frpc.toml
 */
export function serializeFrpcToml(config: FrpcConfig): string {
  const lines: string[] = [];
  lines.push('# ========================================================');
  lines.push('# FRP 客户端配置文件 (由 FRP-GUI Pro 自动生成)');
  lines.push('# ========================================================');
  lines.push('');
  lines.push(`serverAddr = "${config.serverAddr || '127.0.0.1'}"`);
  lines.push(`serverPort = ${Number(config.serverPort) || 7000}`);

  if (config.authMethod) {
    lines.push('');
    lines.push('[auth]');
    lines.push(`method = "${config.authMethod}"`);
    lines.push(`token = "${config.authToken || ''}"`);
  } else if (config.authToken) {
    lines.push('');
    lines.push('[auth]');
    lines.push(`token = "${config.authToken}"`);
  }

  if (config.user) {
    lines.push(`user = "${config.user}"`);
  }

  if (config.transport) {
    lines.push('');
    lines.push('[transport]');
    if (config.transport.protocol) lines.push(`protocol = "${config.transport.protocol}"`);
    if (config.transport.tls?.enable !== undefined) {
      lines.push(`tls.enable = ${Boolean(config.transport.tls.enable)}`);
      if (config.transport.tls.serverName) {
        lines.push(`tls.serverName = "${config.transport.tls.serverName}"`);
      }
    }
  }

  if (config.log) {
    lines.push('');
    lines.push('[log]');
    if (config.log.to) {
      lines.push(`to = "${config.log.to}"`);
    }
    lines.push(`level = "${config.log.level || 'info'}"`);
    lines.push(`maxDays = ${Number(config.log.maxDays) || 3}`);
  }

  if (config.webServer && config.webServer.port) {
    lines.push('');
    lines.push('[webServer]');
    lines.push(`addr = "${config.webServer.addr || '127.0.0.1'}"`);
    lines.push(`port = ${Number(config.webServer.port)}`);
    lines.push(`user = "${config.webServer.user || 'admin'}"`);
    lines.push(`password = "${config.webServer.password || 'admin'}"`);
  }

  if (config.proxies && config.proxies.length > 0) {
    lines.push('');
    lines.push('# ---------------- 穿透规则列表 ----------------');
    for (const p of config.proxies) {
      lines.push('');
      lines.push('[[proxies]]');
      lines.push(`name = "${p.name}"`);
      lines.push(`type = "${p.type}"`);
      lines.push(`localIP = "${p.localIP || '127.0.0.1'}"`);
      lines.push(`localPort = ${Number(p.localPort)}`);

      if (p.remotePort && ['tcp', 'udp', 'tcpmux'].includes(p.type)) {
        lines.push(`remotePort = ${Number(p.remotePort)}`);
      }

      if (p.customDomains && p.customDomains.length > 0 && ['http', 'https', 'tcpmux'].includes(p.type)) {
        lines.push(`customDomains = [${p.customDomains.map((d) => `"${d}"`).join(', ')}]`);
      }

      if (p.subdomain && ['http', 'https'].includes(p.type)) {
        lines.push(`subdomain = "${p.subdomain}"`);
      }

      if (p.secretKey && ['stcp', 'sudp', 'xtcp'].includes(p.type)) {
        lines.push(`secretKey = "${p.secretKey}"`);
      }

      if (p.useEncryption !== undefined) lines.push(`transport.useEncryption = ${p.useEncryption}`);
      if (p.useCompression !== undefined) lines.push(`transport.useCompression = ${p.useCompression}`);
    }
  }

  if (config.visitors && config.visitors.length > 0) {
    lines.push('');
    lines.push('# ---------------- 访问者列表 (STCP/XTCP) ----------------');
    for (const v of config.visitors) {
      lines.push('');
      lines.push('[[visitors]]');
      lines.push(`name = "${v.name}"`);
      lines.push(`type = "${v.type}"`);
      lines.push(`serverName = "${v.serverName}"`);
      lines.push(`secretKey = "${v.secretKey}"`);
      lines.push(`bindAddr = "${v.bindAddr || '127.0.0.1'}"`);
      lines.push(`bindPort = ${Number(v.bindPort)}`);
      if (v.useEncryption !== undefined) lines.push(`transport.useEncryption = ${v.useEncryption}`);
      if (v.useCompression !== undefined) lines.push(`transport.useCompression = ${v.useCompression}`);
    }
  }

  return lines.join('\n');
}

/**
 * 解析 frpc.toml 为 FrpcConfig
 */
export function parseFrpcToml(tomlStr: string): FrpcConfig {
  const parsed = parseTomlSimple(tomlStr);
  const proxies: ProxyRule[] = [];
  const visitors: VisitorRule[] = [];

  if (Array.isArray(parsed.proxies)) {
    for (const p of parsed.proxies) {
      proxies.push({
        name: p.name || 'unnamed',
        type: p.type || 'tcp',
        localIP: p.localIP || '127.0.0.1',
        localPort: Number(p.localPort) || 80,
        remotePort: p.remotePort ? Number(p.remotePort) : undefined,
        customDomains: Array.isArray(p.customDomains) ? p.customDomains : undefined,
        subdomain: p.subdomain,
        secretKey: p.secretKey,
        useEncryption: p['transport.useEncryption'] ?? p.transport?.useEncryption,
        useCompression: p['transport.useCompression'] ?? p.transport?.useCompression,
      });
    }
  }

  if (Array.isArray(parsed.visitors)) {
    for (const v of parsed.visitors) {
      visitors.push({
        name: v.name || 'visitor',
        type: v.type || 'stcp',
        serverName: v.serverName || '',
        secretKey: v.secretKey || '',
        bindAddr: v.bindAddr || '127.0.0.1',
        bindPort: Number(v.bindPort) || 6000,
        useEncryption: v['transport.useEncryption'] ?? v.transport?.useEncryption,
        useCompression: v['transport.useCompression'] ?? v.transport?.useCompression,
      });
    }
  }

  return {
    serverAddr: parsed.serverAddr || '127.0.0.1',
    serverPort: Number(parsed.serverPort) || 7000,
    authMethod: parsed.auth?.method,
    authToken: parsed.auth?.token || parsed.authToken,
    user: parsed.user,
    transport: {
      protocol: parsed.transport?.protocol,
      tls: {
        enable: parsed['transport.tls.enable'] ?? parsed.transport?.tls?.enable ?? true,
      },
    },
    proxies,
    visitors,
    log: parsed.log,
  };
}

/**
 * 序列化 FrpsConfig
 */
export function serializeFrpsToml(config: FrpsConfig): string {
  const lines: string[] = [];
  lines.push('# ========================================================');
  lines.push('# FRP 服务端配置文件 (由 FRP-GUI Pro 自动生成)');
  lines.push('# ========================================================');
  lines.push('');
  if (config.bindAddr) lines.push(`bindAddr = "${config.bindAddr}"`);
  lines.push(`bindPort = ${Number(config.bindPort) || 7000}`);

  if (config.vhostHTTPPort) lines.push(`vhostHTTPPort = ${Number(config.vhostHTTPPort)}`);
  if (config.vhostHTTPSPort) lines.push(`vhostHTTPSPort = ${Number(config.vhostHTTPSPort)}`);
  if (config.subDomainHost) lines.push(`subDomainHost = "${config.subDomainHost}"`);

  if (config.authMethod || config.authToken) {
    lines.push('');
    lines.push('[auth]');
    if (config.authMethod) lines.push(`method = "${config.authMethod}"`);
    if (config.authToken) lines.push(`token = "${config.authToken}"`);
  }

  if (config.webServer && config.webServer.port) {
    lines.push('');
    lines.push('[webServer]');
    lines.push(`addr = "${config.webServer.addr || '0.0.0.0'}"`);
    lines.push(`port = ${Number(config.webServer.port)}`);
    lines.push(`user = "${config.webServer.user || 'admin'}"`);
    lines.push(`password = "${config.webServer.password || 'admin'}"`);
  }

  if (config.log) {
    lines.push('');
    lines.push('[log]');
    if (config.log.to) {
      lines.push(`to = "${config.log.to}"`);
    }
    lines.push(`level = "${config.log.level || 'info'}"`);
    lines.push(`maxDays = ${Number(config.log.maxDays) || 3}`);
  }

  return lines.join('\n');
}

/**
 * 解析 frps.toml 为 FrpsConfig
 */
export function parseFrpsToml(tomlStr: string): FrpsConfig {
  const parsed = parseTomlSimple(tomlStr);
  return {
    bindAddr: parsed.bindAddr,
    bindPort: Number(parsed.bindPort) || 7000,
    vhostHTTPPort: parsed.vhostHTTPPort ? Number(parsed.vhostHTTPPort) : undefined,
    vhostHTTPSPort: parsed.vhostHTTPSPort ? Number(parsed.vhostHTTPSPort) : undefined,
    authMethod: parsed.auth?.method,
    authToken: parsed.auth?.token,
    subDomainHost: parsed.subDomainHost,
    webServer: parsed.webServer,
    log: parsed.log,
  };
}

export const DEFAULT_FRPC_CONFIG: FrpcConfig = {
  serverAddr: 'frp.example.com',
  serverPort: 7000,
  authToken: 'my_secret_token_123',
  transport: {
    protocol: 'tcp',
    tls: {
      enable: true,
    },
  },
  proxies: [
    {
      name: 'ssh-tunnel',
      type: 'tcp',
      localIP: '127.0.0.1',
      localPort: 22,
      remotePort: 6022,
      useEncryption: true,
      useCompression: true,
    },
    {
      name: 'web-service',
      type: 'http',
      localIP: '127.0.0.1',
      localPort: 8080,
      customDomains: ['myweb.example.com'],
    },
  ],
  visitors: [],
};

export const DEFAULT_FRPS_CONFIG: FrpsConfig = {
  bindAddr: '0.0.0.0',
  bindPort: 7000,
  vhostHTTPPort: 80,
  vhostHTTPSPort: 443,
  authToken: 'my_secret_token_123',
  webServer: {
    addr: '0.0.0.0',
    port: 7500,
    user: 'admin',
    password: 'admin_password',
  },
};
