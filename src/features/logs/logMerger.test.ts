import { describe, it, expect } from 'vitest';
import { mergeLogEntries } from './logMerger';
import { FrpcRuntimeLogEvent, LogEntry } from '../../types/frp';

describe('mergeLogEntries (运行时日志合并与排序)', () => {
  it('空事件列表返回原日志列表', () => {
    const prev: LogEntry[] = [
      {
        id: 'l1',
        sequence: 1,
        profileId: 'p1',
        profileName: 'p1',
        timestamp: '10:00:00',
        level: 'info',
        message: 'hello',
        raw: '[10:00:00] [INFO] hello',
      },
    ];
    expect(mergeLogEntries(prev, [])).toBe(prev);
  });

  it('正确合并去重并按时间戳、方案ID与序号递增排序', () => {
    const prev: LogEntry[] = [
      {
        id: 'runtime-p1-1',
        sequence: 1,
        profileId: 'p1',
        profileName: 'p1',
        timestamp: '10:00:00',
        level: 'info',
        message: 'msg 1',
        raw: '[10:00:00] [INFO] msg 1',
      },
    ];
    const events: FrpcRuntimeLogEvent[] = [
      {
        sequence: 3,
        profileId: 'p1',
        timestamp: '10:00:02',
        level: 'info',
        message: 'msg 3',
      },
      {
        sequence: 2,
        profileId: 'p1',
        timestamp: '10:00:01',
        level: 'warn',
        message: 'msg 2',
      },
      // 重复的 sequence 1 应覆盖或去重
      {
        sequence: 1,
        profileId: 'p2',
        timestamp: '09:59:59',
        level: 'error',
        message: 'p2 first msg',
      },
    ];

    const result = mergeLogEntries(prev, events);
    expect(result).toHaveLength(4);
    expect(result[0].profileId).toBe('p2');
    expect(result[1].sequence).toBe(1);
    expect(result[2].sequence).toBe(2);
    expect(result[3].sequence).toBe(3);
  });

  it('当某 profile 收到 sequence === 1 时重置并清除该 profile 既有日志', () => {
    const prev: LogEntry[] = [
      {
        id: 'runtime-p1-10',
        sequence: 10,
        profileId: 'p1',
        profileName: 'p1',
        timestamp: '09:00:00',
        level: 'info',
        message: 'old p1',
        raw: 'old',
      },
      {
        id: 'runtime-p2-5',
        sequence: 5,
        profileId: 'p2',
        profileName: 'p2',
        timestamp: '09:00:01',
        level: 'info',
        message: 'p2 keep',
        raw: 'p2 keep',
      },
    ];
    const events: FrpcRuntimeLogEvent[] = [
      {
        sequence: 1,
        profileId: 'p1',
        timestamp: '10:00:00',
        level: 'info',
        message: 'new p1 restart',
      },
    ];

    const result = mergeLogEntries(prev, events);
    expect(result.some((e) => e.id === 'runtime-p1-10')).toBe(false);
    expect(result.some((e) => e.id === 'runtime-p2-5')).toBe(true);
    expect(result.some((e) => e.id === 'runtime-p1-1')).toBe(true);
  });

  it('合并后最大保留 2000 条并保持时间有序', () => {
    const prev: LogEntry[] = [];
    const events: FrpcRuntimeLogEvent[] = Array.from({ length: 2500 }, (_, i) => ({
      sequence: i + 1,
      profileId: 'p1',
      timestamp: `10:00:${String(Math.floor(i / 60)).padStart(2, '0')}.${String(i % 60).padStart(2, '0')}`,
      level: 'info',
      message: `msg #${i}`,
    }));

    const result = mergeLogEntries(prev, events);
    expect(result.length).toBe(2000);
    expect(result[result.length - 1].sequence).toBe(2500);
  });
});
