import { describe, it, expect } from 'vitest';
import { WIZARD_SCENARIOS } from './presets';
import { 
  validateProfileForm, 
  buildScenarioProfile, 
  ScenarioFormValues 
} from './profile-validator';
import { makeCore } from '../test/fixtures';

describe('profile-validator (场景预设、表单校验与 Profile 构造)', () => {
  it('从 presets 导出 6 大核心场景，且包含代码级默认值与变体 (Web 无 remotePort)', () => {
    expect(WIZARD_SCENARIOS).toHaveLength(6);
    const ids = WIZARD_SCENARIOS.map((s) => s.id);
    expect(ids).toEqual(['rdp', 'ssh', 'web', 'nas', 'game', 'custom']);

    const rdp = WIZARD_SCENARIOS.find((s) => s.id === 'rdp')!;
    expect(rdp.defaultName).toBe('我的 Windows 远程桌面');
    expect(rdp.defaultProxyName).toBe('rdp-desktop');
    expect(rdp.defaultLocalPort).toBe(3389);
    expect(rdp.defaultRemotePort).toBe(33389);
    expect(rdp.defaultType).toBe('tcp');

    const web = WIZARD_SCENARIOS.find((s) => s.id === 'web')!;
    expect(web.defaultName).toBe('我的 Web 网站');
    expect(web.defaultProxyName).toBe('web-app');
    expect(web.defaultLocalPort).toBe(8080);
    expect(web.defaultRemotePort).toBeUndefined();
    expect(web.defaultType).toBe('http');

    const nas = WIZARD_SCENARIOS.find((s) => s.id === 'nas')!;
    expect(nas.variants).toHaveLength(3);
    expect(nas.variants?.map((v) => v.id)).toEqual(['synology', 'alist', 'jellyfin']);
    expect(nas.variants?.[0].defaultLocalPort).toBe(5000);
    expect(nas.variants?.[1].defaultLocalPort).toBe(5244);
    expect(nas.variants?.[2].defaultLocalPort).toBe(8096);

    const game = WIZARD_SCENARIOS.find((s) => s.id === 'game')!;
    expect(game.variants).toHaveLength(4);
    expect(game.variants?.map((v) => v.id)).toEqual(['mc_java', 'mc_bedrock', 'terraria', 'custom_game']);
    expect(game.variants?.[0].defaultType).toBe('tcp');
    expect(game.variants?.[0].defaultLocalPort).toBe(25565);
    expect(game.variants?.[1].defaultType).toBe('udp');
    expect(game.variants?.[1].defaultLocalPort).toBe(19132);
  });

  it('校验必填项与端口合法区间 (1-65535)', () => {
    const invalidValues: ScenarioFormValues = {
      name: '',
      serverAddr: '',
      serverPort: 0,
      scenarioId: 'rdp',
      proxyName: 'rdp-desktop',
      proxyType: 'tcp',
      localIP: '127.0.0.1',
      localPort: 70000,
      remotePort: -1,
    };

    const res = validateProfileForm(invalidValues);
    expect(res.valid).toBe(false);
    expect(res.errors.name).toBe('请输入连接名称');
    expect(res.errors.serverAddr).toBe('请输入服务器地址');
    expect(res.errors.serverPort).toBe('服务器端口需在 1 - 65535 之间');
    expect(res.errors.localPort).toBe('本地端口需在 1 - 65535 之间');
    expect(res.errors.remotePort).toBe('远程端口需在 1 - 65535 之间');
  });

  it('Web 场景校验自定义域名且不生成或校验远程端口', () => {
    const webNoDomain: ScenarioFormValues = {
      name: '我的博客',
      serverAddr: 'frp.example.com',
      serverPort: 7000,
      scenarioId: 'web',
      proxyName: 'web-blog',
      proxyType: 'http',
      localIP: '127.0.0.1',
      localPort: 8080,
      customDomains: [],
    };

    const res1 = validateProfileForm(webNoDomain);
    expect(res1.valid).toBe(false);
    expect(res1.errors.customDomains).toBe('请至少指定一个自定义域名');

    const res2 = validateProfileForm({
      ...webNoDomain,
      customDomains: ['blog.example.com'],
    });
    expect(res2.valid).toBe(true);
    expect(res2.errors.remotePort).toBeUndefined();

    // 检查 buildScenarioProfile 不为 Web 规则生成 remotePort
    const profile = buildScenarioProfile({
      ...webNoDomain,
      customDomains: ['blog.example.com'],
    });
    const conf: any = profile.config;
    expect(conf.proxies[0].remotePort).toBeUndefined();
    expect(conf.proxies[0].customDomains).toEqual(['blog.example.com']);
    expect(profile.rawToml).not.toContain('remotePort');
    expect(profile.rawToml).toContain('customDomains = ["blog.example.com"]');
  });

  it('未配置核心时进入 warnings 且不阻断 valid=true', () => {
    const validValues: ScenarioFormValues = {
      name: '家庭 NAS',
      serverAddr: 'frp.example.com',
      serverPort: 7000,
      scenarioId: 'nas',
      variantId: 'synology',
      proxyName: 'nas-dsm',
      proxyType: 'tcp',
      localIP: '127.0.0.1',
      localPort: 5000,
      remotePort: 5000,
    };

    const resWithoutCore = validateProfileForm(validValues, { activeCore: null });
    expect(resWithoutCore.valid).toBe(true);
    expect(resWithoutCore.warnings.length).toBeGreaterThan(0);
    expect(resWithoutCore.warnings[0]).toContain('未配置本地 FRP 核心');

    const resWithCore = validateProfileForm(validValues, { activeCore: makeCore() });
    expect(resWithCore.valid).toBe(true);
    expect(resWithCore.warnings).toHaveLength(0);
  });

  it('buildScenarioProfile 生成合规 Profile 并正确序列化 rawToml', () => {
    const values: ScenarioFormValues = {
      name: 'Minecraft 游戏服',
      serverAddr: 'mc.frp.test',
      serverPort: 7000,
      authToken: 'secret-token-123',
      scenarioId: 'game',
      variantId: 'mc_bedrock',
      proxyName: 'mc-bedrock-server',
      proxyType: 'udp',
      localIP: '127.0.0.1',
      localPort: 19132,
      remotePort: 19132,
      useEncryption: true,
      useCompression: true,
    };

    const profile = buildScenarioProfile(values);
    expect(profile.name).toBe('Minecraft 游戏服');
    expect(profile.type).toBe('frpc');
    expect(profile.status).toBe('stopped');
    expect(profile.config).toMatchObject({
      serverAddr: 'mc.frp.test',
      serverPort: 7000,
      authToken: 'secret-token-123',
    });

    const conf: any = profile.config;
    expect(conf.proxies[0]).toMatchObject({
      name: 'mc-bedrock-server',
      type: 'udp',
      localPort: 19132,
      remotePort: 19132,
    });

    expect(profile.rawToml).toContain('serverAddr = "mc.frp.test"');
    expect(profile.rawToml).toContain('type = "udp"');
    expect(profile.rawToml).toContain('remotePort = 19132');
    expect(typeof profile.createdAt).toBe('number');
    expect(profile.updatedAt).toBe(profile.createdAt);
  });
});
