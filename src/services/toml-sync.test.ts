import { describe, expect, it } from 'vitest';
import {
  parseFrpcToml,
  parseFrpsToml,
  serializeFrpcToml,
  serializeFrpsToml,
} from './toml-sync';

describe('日志级别 TOML 同步', () => {
  it('FRPC 序列化并解析 [log].level', () => {
    const toml = serializeFrpcToml({
      serverAddr: 'frp.example.com',
      serverPort: 7000,
      proxies: [],
      visitors: [],
      log: { level: 'debug' },
    });

    expect(toml).toContain('[log]');
    expect(toml).toContain('level = "debug"');
    expect(parseFrpcToml(toml).log?.level).toBe('debug');
  });

  it('FRPS 序列化并解析 [log].level', () => {
    const toml = serializeFrpsToml({
      bindPort: 7000,
      log: { level: 'trace' },
    });

    expect(toml).toContain('[log]');
    expect(toml).toContain('level = "trace"');
    expect(parseFrpsToml(toml).log?.level).toBe('trace');
  });

  it('FRPC 序列化并解析完整 [log] 配置 (to, level, maxDays)', () => {
    const toml = serializeFrpcToml({
      serverAddr: 'frp.example.com',
      serverPort: 7000,
      proxies: [],
      visitors: [],
      log: { to: 'console', level: 'warn', maxDays: 14 },
    });

    expect(toml).toContain('to = "console"');
    expect(toml).toContain('level = "warn"');
    expect(toml).toContain('maxDays = 14');

    const parsed = parseFrpcToml(toml);
    expect(parsed.log?.to).toBe('console');
    expect(parsed.log?.level).toBe('warn');
    expect(parsed.log?.maxDays).toBe(14);
  });

  it('FRPS 序列化并解析完整 [log] 配置 (to, level, maxDays)', () => {
    const toml = serializeFrpsToml({
      bindPort: 7000,
      log: { to: 'console', level: 'warn', maxDays: 14 },
    });

    expect(toml).toContain('to = "console"');
    expect(toml).toContain('level = "warn"');
    expect(toml).toContain('maxDays = 14');

    const parsed = parseFrpsToml(toml);
    expect(parsed.log?.to).toBe('console');
    expect(parsed.log?.level).toBe('warn');
    expect(parsed.log?.maxDays).toBe(14);
  });
});
