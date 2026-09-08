import type { FrpCore, CoreDownloadTask } from '../../types/frp';

export interface CoreReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
}

export interface CoreRelease {
  tag: string;
  name: string;
  publishedAt: string;
  downloadCount?: number;
  assets: CoreReleaseAsset[];
}

export type CoreAvailability = 'downloaded' | 'available' | 'downloading' | 'resumable' | 'failed';

export interface CoreReleaseRow {
  id: string;
  version: string;
  release: CoreRelease;
  availability: CoreAvailability;
  installationId?: string;
  installation?: FrpCore;
  task?: CoreDownloadTask;
}

export interface DownloadTelemetry {
  lastReceivedBytes: number;
  lastSampledAtMs: number;
  instantSpeedBytesPerSecond?: number;
  emaSpeedBytesPerSecond?: number;
  nonZeroSamples: number;
  consecutiveZeroSamples: number;
  etaSeconds?: number;
}

export function deriveCoreReleaseRows(input: {
  releases: CoreRelease[];
  cores: FrpCore[];
  host: { os: string; arch: string };
  tasks: CoreDownloadTask[];
}): CoreReleaseRow[] {
  return input.releases.map((release) => {
    const task = input.tasks.find(
      (candidate) =>
        candidate.releaseTag === release.tag &&
        candidate.targetOs === input.host.os &&
        candidate.targetArch === input.host.arch &&
        candidate.phase !== 'completed'
    );
    const installation = input.cores.find(
      (core) =>
        core.version === release.tag &&
        core.os === input.host.os &&
        core.arch === input.host.arch &&
        core.status !== 'not_downloaded' &&
        Boolean(core.path)
    );

    let availability: CoreAvailability = 'available';
    if (task?.phase === 'downloading' || task?.phase === 'verifying' || task?.phase === 'extracting' || task?.phase === 'inspecting') {
      availability = 'downloading';
    } else if (task?.phase === 'failed') {
      availability = 'failed';
    } else if (task?.phase === 'cancelled') {
      availability = 'resumable';
    } else if (installation) {
      availability = 'downloaded';
    }

    return {
      id: `release_${release.tag}`,
      version: release.tag,
      release,
      availability,
      installationId: installation?.id,
      installation,
      task,
    };
  });
}

export function updateDownloadTelemetry(
  previous: DownloadTelemetry | undefined,
  receivedBytes: number,
  totalBytes: number | undefined,
  sampledAtMs: number
): DownloadTelemetry {
  if (!previous) {
    return {
      lastReceivedBytes: receivedBytes,
      lastSampledAtMs: sampledAtMs,
      nonZeroSamples: 0,
      consecutiveZeroSamples: 0,
    };
  }

  const elapsedSeconds = Math.max((sampledAtMs - previous.lastSampledAtMs) / 1000, 0.001);
  const instantSpeedBytesPerSecond = Math.max((receivedBytes - previous.lastReceivedBytes) / elapsedSeconds, 0);
  const hasSpeed = instantSpeedBytesPerSecond > 0;
  const nonZeroSamples = hasSpeed ? previous.nonZeroSamples + 1 : previous.nonZeroSamples;
  const consecutiveZeroSamples = hasSpeed ? 0 : previous.consecutiveZeroSamples + 1;
  const emaSpeedBytesPerSecond = hasSpeed
    ? previous.emaSpeedBytesPerSecond === undefined
      ? instantSpeedBytesPerSecond
      : 0.25 * instantSpeedBytesPerSecond + 0.75 * previous.emaSpeedBytesPerSecond
    : previous.emaSpeedBytesPerSecond;
  const canShowEta = Boolean(totalBytes) && nonZeroSamples >= 3 && consecutiveZeroSamples < 3 && Boolean(emaSpeedBytesPerSecond);
  const etaSeconds = canShowEta
    ? Math.max(0, Math.ceil(((totalBytes ?? receivedBytes) - receivedBytes) / (emaSpeedBytesPerSecond ?? 1)))
    : undefined;

  return {
    lastReceivedBytes: receivedBytes,
    lastSampledAtMs: sampledAtMs,
    instantSpeedBytesPerSecond,
    emaSpeedBytesPerSecond,
    nonZeroSamples,
    consecutiveZeroSamples,
    etaSeconds,
  };
}
