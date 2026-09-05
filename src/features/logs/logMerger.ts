import { FrpcRuntimeLogEvent, LogEntry } from '../../types/frp';

export const MAX_RUNTIME_LOGS = 2000;

/**
 * 快速安全地合并与排序运行时日志条目
 * 使用轻量高效的字符串比较代替全量 localeCompare，消除高频日志涌入时的卡顿
 */
export function mergeLogEntries(
  previous: LogEntry[],
  events: FrpcRuntimeLogEvent[],
  maxCapacity: number = MAX_RUNTIME_LOGS
): LogEntry[] {
  if (!events || events.length === 0) {
    return previous;
  }

  // 检查是否有 profile 重启后序号被重置（例如收到 sequence === 1），如有则剔除该 profile 既有旧日志
  const resetProfileIds = new Set<string>();
  for (const event of events) {
    if (event.sequence === 1) {
      resetProfileIds.add(event.profileId);
    }
  }

  const filteredPrevious = resetProfileIds.size > 0
    ? previous.filter((entry) => !resetProfileIds.has(entry.profileId))
    : previous;

  const byId = new Map(filteredPrevious.map((entry) => [entry.id, entry]));
  for (const event of events) {
    const id = `runtime-${event.profileId}-${event.sequence}`;
    byId.set(id, {
      id,
      sequence: event.sequence,
      profileId: event.profileId,
      profileName: event.profileId,
      timestamp: event.timestamp,
      level: event.level,
      message: event.message,
      raw: `[${event.timestamp}] [${event.level.toUpperCase()}] ${event.message}`,
    });
  }

  // 使用原生 ASCII 序比较 (<, >) 替代 localeCompare，大幅降低 CPU 开销
  return [...byId.values()]
    .sort((left, right) => {
      if (left.timestamp !== right.timestamp) {
        return left.timestamp < right.timestamp ? -1 : 1;
      }
      if (left.profileId !== right.profileId) {
        return left.profileId < right.profileId ? -1 : 1;
      }
      return left.sequence - right.sequence;
    })
    .slice(-maxCapacity);
}
