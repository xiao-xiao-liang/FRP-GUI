import { PresetScenario } from '../types/frp';

export type ScenarioId = 'rdp' | 'ssh' | 'web' | 'nas' | 'game' | 'custom';

export interface ScenarioVariant {
  id: string;
  name: string;
  defaultLocalPort: number;
  defaultRemotePort?: number;
  defaultType: 'tcp' | 'udp' | 'http' | 'https';
  defaultName: string;
  defaultProxyName: string;
}

export interface WizardScenario {
  id: ScenarioId;
  name: string;
  badge: string;
  description: string;
  iconName: 'Monitor' | 'Terminal' | 'Globe' | 'HardDrive' | 'Gamepad2' | 'Sliders';
  defaultType: 'tcp' | 'udp' | 'http' | 'https';
  defaultLocalPort: number;
  defaultRemotePort?: number;
  defaultName: string;
  defaultProxyName: string;
  localPortPlaceholder: string;
  remotePortPlaceholder: string;
  tips: string;
  examples: { local: string; remote: string };
  variants?: ScenarioVariant[];
}

export const WIZARD_SCENARIOS: WizardScenario[] = [
  {
    id: 'rdp',
    name: 'Windows 远程桌面 (RDP)',
    badge: '推荐办公',
    description: '穿透本地 3389 端口，随时随地连接家中或公司 Windows 电脑桌面',
    iconName: 'Monitor',
    defaultType: 'tcp',
    defaultLocalPort: 3389,
    defaultRemotePort: 33389,
    defaultName: '我的 Windows 远程桌面',
    defaultProxyName: 'rdp-desktop',
    localPortPlaceholder: '3389',
    remotePortPlaceholder: '例如: 33389',
    tips: '提示：请在被控 Windows 电脑上开启“允许远程桌面”，公网设备使用微软官方远程桌面客户端连接即可。',
    examples: { local: '127.0.0.1:3389', remote: '服务器地址:33389' },
  },
  {
    id: 'ssh',
    name: 'SSH 远程终端',
    badge: '极客开发',
    description: '穿透本地 22 端口，在公网通过终端安全访问 Linux / macOS / Windows 命令行',
    iconName: 'Terminal',
    defaultType: 'tcp',
    defaultLocalPort: 22,
    defaultRemotePort: 6022,
    defaultName: '我的 SSH 终端',
    defaultProxyName: 'ssh-remote',
    localPortPlaceholder: '22',
    remotePortPlaceholder: '例如: 6022',
    tips: '连接命令示例：ssh username@服务器地址 -p 6022',
    examples: { local: '127.0.0.1:22', remote: 'ssh -p 6022' },
  },
  {
    id: 'web',
    name: '公开网站 (HTTP/HTTPS)',
    badge: '网站 / API',
    description: '通过自定义域名安全公开本地 Web 网站、前端项目或开发接口',
    iconName: 'Globe',
    defaultType: 'http',
    defaultLocalPort: 8080,
    defaultRemotePort: undefined,
    defaultName: '我的 Web 网站',
    defaultProxyName: 'web-app',
    localPortPlaceholder: '例如: 8080 或 3000',
    remotePortPlaceholder: '',
    tips: '提示：请配置自定义域名（需在 DNS 解析到 FRP 服务器公网 IP），公网用户通过浏览器访问该域名。',
    examples: { local: '127.0.0.1:8080', remote: 'http://app.example.com' },
  },
  {
    id: 'nas',
    name: '家庭 NAS / 私有云',
    badge: '家庭存储',
    description: '穿透家庭群晖 DSM、极空间、Alist、Jellyfin 影视库等私有云管理后台',
    iconName: 'HardDrive',
    defaultType: 'tcp',
    defaultLocalPort: 5000,
    defaultRemotePort: 5000,
    defaultName: '家庭 NAS 私有云',
    defaultProxyName: 'nas-storage',
    localPortPlaceholder: '5000 / 5244 / 8096',
    remotePortPlaceholder: '例如: 5000',
    tips: '提示：群晖默认 5000，Alist 默认 5244，Jellyfin/Emby 默认 8096。',
    examples: { local: '127.0.0.1:5000', remote: '服务器地址:5000' },
    variants: [
      { id: 'synology', name: '群晖 DSM (5000)', defaultLocalPort: 5000, defaultRemotePort: 5000, defaultType: 'tcp', defaultName: '群晖 NAS', defaultProxyName: 'synology-dsm' },
      { id: 'alist', name: 'Alist 网盘 (5244)', defaultLocalPort: 5244, defaultRemotePort: 5244, defaultType: 'tcp', defaultName: 'Alist 私有网盘', defaultProxyName: 'alist-web' },
      { id: 'jellyfin', name: 'Jellyfin/Emby (8096)', defaultLocalPort: 8096, defaultRemotePort: 8096, defaultType: 'tcp', defaultName: 'Jellyfin 影视库', defaultProxyName: 'jellyfin-media' },
    ],
  },
  {
    id: 'game',
    name: '游戏联机 (Minecraft 等)',
    badge: '游戏开黑',
    description: '穿透 Minecraft、泰拉瑞亚、幻兽帕鲁等本地架设的游戏私服与好友跨网联机',
    iconName: 'Gamepad2',
    defaultType: 'tcp',
    defaultLocalPort: 25565,
    defaultRemotePort: 25565,
    defaultName: 'Minecraft 游戏联机',
    defaultProxyName: 'mc-server',
    localPortPlaceholder: '25565 (Java) / 19132 (基岩)',
    remotePortPlaceholder: '例如: 25565',
    tips: '提示：Minecraft Java 版使用 TCP 25565，基岩版使用 UDP 19132。',
    examples: { local: '127.0.0.1:25565', remote: '服务器地址:25565' },
    variants: [
      { id: 'mc_java', name: 'Minecraft Java 版 (TCP 25565)', defaultLocalPort: 25565, defaultRemotePort: 25565, defaultType: 'tcp', defaultName: 'Minecraft Java 服务器', defaultProxyName: 'mc-java' },
      { id: 'mc_bedrock', name: 'Minecraft 基岩版 (UDP 19132)', defaultLocalPort: 19132, defaultRemotePort: 19132, defaultType: 'udp', defaultName: 'Minecraft 基岩服务器', defaultProxyName: 'mc-bedrock' },
      { id: 'terraria', name: '泰拉瑞亚 (TCP 7777)', defaultLocalPort: 7777, defaultRemotePort: 7777, defaultType: 'tcp', defaultName: '泰拉瑞亚联机服', defaultProxyName: 'terraria-server' },
      { id: 'custom_game', name: '其他自定义游戏', defaultLocalPort: 27015, defaultRemotePort: 27015, defaultType: 'tcp', defaultName: '自定义游戏服务器', defaultProxyName: 'game-server' },
    ],
  },
  {
    id: 'custom',
    name: '自定义连接 (高级模式)',
    badge: '自由配置',
    description: '自由定义任意 TCP / UDP / STCP / XTCP 端口映射或直接编辑 TOML 源码',
    iconName: 'Sliders',
    defaultType: 'tcp',
    defaultLocalPort: 3000,
    defaultRemotePort: 13000,
    defaultName: '我的自定义连接',
    defaultProxyName: 'custom-service',
    localPortPlaceholder: '本地监听端口',
    remotePortPlaceholder: '公网映射端口',
    tips: '提示：点击将直接进入完整高级配置模式。',
    examples: { local: '127.0.0.1:3000', remote: '服务器地址:13000' },
  },
];

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'ssh',
    name: 'SSH 远程连接',
    category: 'remote',
    description: '穿透本地 22 端口，支持在任意网络通过终端远程访问 Linux/Mac/Win 命令行',
    icon: 'Terminal',
    defaultRule: {
      name: 'ssh-remote',
      type: 'tcp',
      localIP: '127.0.0.1',
      localPort: 22,
      remotePort: 6022,
      useEncryption: true,
      useCompression: true,
    },
  },
  {
    id: 'rdp',
    name: 'Windows 远程桌面 (RDP)',
    category: 'remote',
    description: '穿透本地 3389 端口，使用微软官方远程桌面客户端随时连接回家中/公司电脑',
    icon: 'Monitor',
    defaultRule: {
      name: 'rdp-desktop',
      type: 'tcp',
      localIP: '127.0.0.1',
      localPort: 3389,
      remotePort: 33389,
      useEncryption: true,
      useCompression: true,
    },
  },
  {
    id: 'web-http',
    name: 'Web 网站 (HTTP 域名穿透)',
    category: 'web',
    description: '使用自定义域名或泛域名子域访问本地 Web 服务（Vue、React、Nginx 或本地后端 API）',
    icon: 'Globe',
    defaultRule: {
      name: 'web-app',
      type: 'http',
      localIP: '127.0.0.1',
      localPort: 8080,
      customDomains: ['app.example.com'],
      subdomain: 'app',
    },
  },
  {
    id: 'web-https',
    name: 'Web 网站 (HTTPS 加密穿透)',
    category: 'web',
    description: '通过 HTTPS 协议安全暴露本地 Web 服务',
    icon: 'Lock',
    defaultRule: {
      name: 'web-ssl',
      type: 'https',
      localIP: '127.0.0.1',
      localPort: 8443,
      customDomains: ['secure.example.com'],
    },
  },
  {
    id: 'stcp-p2p',
    name: 'STCP 安全点对点隧道 (无需公网端口)',
    category: 'p2p',
    description: '高度安全私密的点对点加密隧道，公网服务器不开放端口，需在访问端配置 Visitor 访问',
    icon: 'ShieldCheck',
    defaultRule: {
      name: 'secret-service',
      type: 'stcp',
      localIP: '127.0.0.1',
      localPort: 8000,
      secretKey: 'generate_strong_secret_key',
      useEncryption: true,
      useCompression: true,
    },
  },
  {
    id: 'minecraft',
    name: 'Minecraft / 游戏联机',
    category: 'game',
    description: '穿透 Minecraft Java 版 25565 端口或基岩版 19132 端口与好友公网联机开黑',
    icon: 'Gamepad2',
    defaultRule: {
      name: 'mc-server',
      type: 'tcp',
      localIP: '127.0.0.1',
      localPort: 25565,
      remotePort: 25565,
    },
  },
  {
    id: 'vnc',
    name: 'VNC 图形桌面',
    category: 'remote',
    description: '穿透 macOS 屏幕共享或 Linux VNC 5900 端口',
    icon: 'Tv',
    defaultRule: {
      name: 'vnc-desktop',
      type: 'tcp',
      localIP: '127.0.0.1',
      localPort: 5900,
      remotePort: 55900,
      useEncryption: true,
    },
  },
  {
    id: 'custom-tcp',
    name: '通用 TCP 端口转发',
    category: 'custom',
    description: '自定义任意本地 TCP 端口到远程服务器公网端口的直接映射',
    icon: 'Network',
    defaultRule: {
      name: 'custom-tcp-service',
      type: 'tcp',
      localIP: '127.0.0.1',
      localPort: 3000,
      remotePort: 13000,
    },
  },
];
