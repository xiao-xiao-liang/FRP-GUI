import { describe, expect, it } from 'vitest';
import { makeProfile } from '../test/fixtures';
import { buildProfileSharePayload, profileCredentialReference, sanitizeProfileForStorage } from './profile-secrets';

describe('profile-secrets', () => {
  it('本地持久化只保留方案元数据，移除 TOML 与配置中的凭据', () => {
    const profile = makeProfile({
      id: 'profile-1',
      rawToml: '[auth]\ntoken = "never-store-this"',
      config: {
        serverAddr: 'frp.example.test',
        serverPort: 7000,
        authToken: 'never-store-this',
        webServer: { user: 'admin', password: 'dashboard-secret' },
        proxies: [{ name: 'p1', type: 'tcp', localIP: '127.0.0.1', localPort: 22, secretKey: 'proxy-secret' }],
        visitors: [{ name: 'v1', type: 'stcp', serverName: 'p1', secretKey: 'visitor-secret', bindAddr: '127.0.0.1', bindPort: 6000 }],
      },
    });

    const stored = sanitizeProfileForStorage(profile);

    expect(stored.rawToml).toBe('');
    expect(stored.config.authToken).toBeUndefined();
    expect(stored.config.webServer?.password).toBeUndefined();
    if ('proxies' in stored.config) {
      expect(stored.config.proxies[0].secretKey).toBeUndefined();
      expect(stored.config.visitors[0].secretKey).toBeUndefined();
    }
    expect(JSON.stringify(stored)).not.toContain('never-store-this');
    expect(profileCredentialReference('profile-1')).toBe('frp-gui/profile/profile-1');
  });

  it('二维码分享载荷不包含原始 TOML 或任何凭据', () => {
    const profile = makeProfile({
      rawToml: '[auth]\ntoken = "never-share-this"',
      config: {
        serverAddr: 'frp.example.test',
        serverPort: 7000,
        authToken: 'never-share-this',
        proxies: [],
        visitors: [],
      },
    });

    const payload = buildProfileSharePayload(profile);

    expect(payload).toMatchObject({ app: 'frp-gui', version: '1.0', name: profile.name, type: profile.type });
    expect(JSON.stringify(payload)).not.toContain('never-share-this');
    expect(payload).not.toHaveProperty('toml');
  });
});
