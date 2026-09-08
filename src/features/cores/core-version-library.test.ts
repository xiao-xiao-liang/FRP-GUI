import { describe, expect, it } from 'vitest';
import type { FrpCore } from '../../types/frp';
import {
  deriveCoreReleaseRows,
  updateDownloadTelemetry,
} from './core-version-library';

const makeCore = (overrides: Partial<FrpCore>): FrpCore => ({
  id: 'core-default',
  name: '本地 FRPC',
  version: 'v0.71.0',
  os: 'windows',
  arch: 'amd64',
  path: 'D:\\frp\\frpc.exe',
  isDefault: false,
  isCustom: true,
  status: 'ready',
  ...overrides,
});

describe('core-version-library', () => {
  it('每个 Release 只生成一个版本行，且只由当前平台架构的本地核心标记为已下载', () => {
    const rows = deriveCoreReleaseRows({
      releases: [
        {
          tag: 'v0.71.0',
          name: 'Release v0.71.0',
          publishedAt: '2026-08-14T00:00:00Z',
          assets: [],
        },
      ],
      cores: [
        makeCore({ id: 'arm64', arch: 'arm64', path: 'D:\\frp-arm64\\frpc.exe' }),
        makeCore({ id: 'amd64', arch: 'amd64', path: 'D:\\frp-amd64\\frpc.exe' }),
      ],
      host: { os: 'windows', arch: 'amd64' },
      tasks: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: 'v0.71.0',
      availability: 'downloaded',
      installationId: 'amd64',
    });
  });

  it('在三个非零样本后展示 EMA ETA，并在连续三次零速后隐藏 ETA', () => {
    let telemetry = updateDownloadTelemetry(undefined, 1_000_000, 10_000_000, 1_000);
    telemetry = updateDownloadTelemetry(telemetry, 3_000_000, 10_000_000, 2_000);
    telemetry = updateDownloadTelemetry(telemetry, 5_000_000, 10_000_000, 3_000);
    telemetry = updateDownloadTelemetry(telemetry, 7_000_000, 10_000_000, 4_000);

    expect(telemetry.instantSpeedBytesPerSecond).toBe(2_000_000);
    expect(telemetry.etaSeconds).toBeGreaterThan(0);

    telemetry = updateDownloadTelemetry(telemetry, 7_000_000, 10_000_000, 5_000);
    telemetry = updateDownloadTelemetry(telemetry, 7_000_000, 10_000_000, 6_000);
    telemetry = updateDownloadTelemetry(telemetry, 7_000_000, 10_000_000, 7_000);

    expect(telemetry.etaSeconds).toBeUndefined();
  });

  it('当前平台的已取消任务显示为可继续，而不是可下载', () => {
    const rows = deriveCoreReleaseRows({
      releases: [{ tag: 'v0.70.1', name: 'Release v0.70.1', publishedAt: '2026-07-23T00:00:00Z', assets: [] }],
      cores: [],
      host: { os: 'windows', arch: 'amd64' },
      tasks: [{
        taskId: 'resume-1', releaseTag: 'v0.70.1', assetName: 'frp_0.70.1_windows_amd64.zip',
        phase: 'cancelled', targetOs: 'windows', targetArch: 'amd64', targetDir: 'D:\\frp', mirror: 'official', receivedBytes: 8,
      }],
    });

    expect(rows[0]).toMatchObject({ availability: 'resumable', task: { taskId: 'resume-1' } });
  });
});
