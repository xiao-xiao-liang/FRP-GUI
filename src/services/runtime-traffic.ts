import type { FrpcRuntimeStateEvent, ProcessStatus, Profile, RuntimeTrafficSample } from '../types/frp';

interface RuntimeTrafficEntry {
  sample?: RuntimeTrafficSample;
  latest?: RuntimeTrafficSample;
  status?: ProcessStatus;
  stateTimestamp?: number;
  minimumStartedAt?: number;
  retiredRunId?: string;
}

export type RuntimeTrafficState = Record<string, RuntimeTrafficEntry>;

interface RuntimeTrafficSummary {
  status: 'idle' | 'collecting' | 'unavailable' | 'available' | 'partial';
  uploadBytesPerSecond: number | null;
  downloadBytesPerSecond: number | null;
  availableCount: number;
  runningCount: number;
  label: string;
  reason?: string;
}

const SAMPLE_MAX_AGE_MS = 3_000;

/** 按启动周期与序号合并事件和快照，旧数据不能恢复已经清除的速率。 */
export function mergeRuntimeTraffic(state: RuntimeTrafficState, samples: RuntimeTrafficSample[]): RuntimeTrafficState {
  let next = state;
  for (const sample of samples) {
    if (!Number.isFinite(sample.uploadBytesPerSecond) || sample.uploadBytesPerSecond < 0
      || !Number.isFinite(sample.downloadBytesPerSecond) || sample.downloadBytesPerSecond < 0) continue;
    const current = next[sample.profileId];
    if (current?.status && !['starting', 'running'].includes(current.status)) continue;
    if (sample.startedAt < (current?.minimumStartedAt ?? 0) || sample.runId === current?.retiredRunId) continue;
    if (current?.latest) {
      const latest = current.latest;
      if (sample.runId === latest.runId) {
        if (sample.startedAt !== latest.startedAt || sample.sequence <= latest.sequence) continue;
      } else if (sample.startedAt <= latest.startedAt) continue;
    }
    next = { ...next, [sample.profileId]: { ...current, sample, latest: sample } };
  }
  return next;
}

/** 生命周期只维护内存屏障，不写入方案配置或持久化统计。 */
export function applyRuntimeTrafficState(state: RuntimeTrafficState, event: FrpcRuntimeStateEvent): RuntimeTrafficState {
  const current = state[event.profileId];
  if (event.timestamp < (current?.stateTimestamp ?? 0)) return state;
  if (event.status === 'running') {
    return { ...state, [event.profileId]: { ...current, status: event.status, stateTimestamp: event.timestamp } };
  }
  if (event.status === 'starting') {
    const minimumStartedAt = Math.max(current?.minimumStartedAt ?? 0, event.timestamp);
    const belongsToCurrentStart = current?.sample && current.sample.startedAt >= minimumStartedAt;
    return {
      ...state,
      [event.profileId]: {
        ...current,
        status: event.status,
        stateTimestamp: event.timestamp,
        minimumStartedAt,
        sample: belongsToCurrentStart ? current.sample : undefined,
        retiredRunId: belongsToCurrentStart ? current.retiredRunId : current?.latest?.runId ?? current?.retiredRunId,
      },
    };
  }
  return { ...state, [event.profileId]: { ...current, status: event.status, stateTimestamp: event.timestamp, sample: undefined, retiredRunId: current?.latest?.runId ?? current?.retiredRunId } };
}

/** 仅汇总正在运行且未过期的样本，缺失与不可采集均不冒充零值。 */
export function summarizeRuntimeTraffic(profiles: Profile[], state: RuntimeTrafficState, now: number): RuntimeTrafficSummary {
  const runningProfiles = profiles.filter((profile) => profile.status === 'running');
  const runningCount = runningProfiles.length;
  if (runningCount === 0) {
    return { status: 'idle', uploadBytesPerSecond: 0, downloadBytesPerSecond: 0, availableCount: 0, runningCount, label: '未运行' };
  }

  let uploadBytesPerSecond = 0;
  let downloadBytesPerSecond = 0;
  let availableCount = 0;
  let collectingCount = 0;
  const reasons = new Set<string>();
  for (const profile of runningProfiles) {
    const sample = state[profile.id]?.sample;
    if (!sample) {
      reasons.add('等待流量样本');
    } else if (sample.availability === 'unavailable') {
      reasons.add(sample.reason || '当前连接无法采集');
    } else if (sample.availability === 'stopped') {
      reasons.add('流量采集已停止');
    } else if (now - sample.timestamp > SAMPLE_MAX_AGE_MS) {
      reasons.add('流量采样已过期');
    } else if (sample.availability === 'collecting') {
      collectingCount++;
    } else {
      availableCount++;
      uploadBytesPerSecond += sample.uploadBytesPerSecond;
      downloadBytesPerSecond += sample.downloadBytesPerSecond;
    }
  }

  const reason = [...reasons].join('；');
  if (availableCount === 0) {
    const collecting = collectingCount === runningCount;
    return { status: collecting ? 'collecting' : 'unavailable', uploadBytesPerSecond: null, downloadBytesPerSecond: null, availableCount, runningCount, label: collecting ? '采集中' : reason, reason };
  }
  const partial = availableCount < runningCount;
  return {
    status: partial ? 'partial' : 'available', uploadBytesPerSecond, downloadBytesPerSecond, availableCount, runningCount,
    label: partial ? `已统计 ${availableCount} / ${runningCount} 个运行连接` : '实时采集', reason,
  };
}

export function formatTrafficRate(bytesPerSecond: number): string {
  if (bytesPerSecond > 0 && bytesPerSecond < 1) return '<1 B/s';
  if (bytesPerSecond < 1_000) return `${Math.round(bytesPerSecond)} B/s`;
  const divisor = bytesPerSecond < 1_000_000 ? 1_000 : 1_000_000;
  const unit = divisor === 1_000 ? 'KB/s' : 'MB/s';
  return `${Number((bytesPerSecond / divisor).toFixed(1))} ${unit}`;
}
