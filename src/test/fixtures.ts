import type { FrpCore, Profile } from '../types/frp';

export const makeProfile = (overrides: Partial<Profile> = {}): Profile => ({
  id: 'profile-nas',
  name: '家庭 NAS',
  type: 'frpc',
  description: '公开家庭 NAS',
  config: {
    serverAddr: 'frp.example.test',
    serverPort: 7000,
    proxies: [{ name: 'nas-web', type: 'http', localIP: '127.0.0.1', localPort: 8080, customDomains: ['nas.example.test'] }],
    visitors: [],
  },
  rawToml: 'serverAddr = "frp.example.test"',
  status: 'stopped',
  stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 },
  groupId: undefined,
  tags: [],
  isPinned: false,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

export const makeCore = (overrides: Partial<FrpCore> = {}): FrpCore => ({
  id: 'core-0611',
  name: 'FRPC 核心',
  version: 'v0.61.1',
  arch: 'amd64',
  os: 'windows',
  path: 'C:\\Tools\\frpc.exe',
  isDefault: true,
  isCustom: true,
  status: 'ready',
  ...overrides,
});
