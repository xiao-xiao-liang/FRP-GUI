import { describe, expect, it } from 'vitest';
import type { RuntimeTrafficSample } from '../types/frp';
import { makeProfile } from '../test/fixtures';
import { applyRuntimeTrafficState, formatTrafficRate, mergeRuntimeTraffic, summarizeRuntimeTraffic } from './runtime-traffic';

const now = 10_000;
const sample = (overrides: Partial<RuntimeTrafficSample> = {}): RuntimeTrafficSample => ({
  profileId: 'p1', runId: 'run-1', startedAt: 1_000, sequence: 2, timestamp: now,
  availability: 'available', uploadBytesPerSecond: 1_500, downloadBytesPerSecond: 2_000,
  ...overrides,
});
const running = (id: string) => makeProfile({ id, status: 'running' });

describe('运行期流量状态', () => {
  it('汇总多个正在运行的连接，排除已停止连接的旧速率', () => {
    const state = mergeRuntimeTraffic({}, [sample(), sample({ profileId: 'p2', runId: 'run-2' }), sample({ profileId: 'stopped' })]);
    expect(summarizeRuntimeTraffic([running('p1'), running('p2'), makeProfile({ id: 'stopped' })], state, now)).toMatchObject({
      status: 'available', uploadBytesPerSecond: 3_000, downloadBytesPerSecond: 4_000, availableCount: 2, runningCount: 2,
    });
  });

  it('无运行连接时显示真实的零和未运行状态', () => {
    expect(summarizeRuntimeTraffic([makeProfile()], {}, now)).toMatchObject({ status: 'idle', uploadBytesPerSecond: 0, downloadBytesPerSecond: 0, label: '未运行' });
  });

  it('缺失样本和非法速率不会冒充空闲零值', () => {
    expect(summarizeRuntimeTraffic([running('p1')], {}, now)).toMatchObject({ status: 'unavailable', uploadBytesPerSecond: null, label: '等待流量样本' });
    const state = mergeRuntimeTraffic({}, [sample({ uploadBytesPerSecond: NaN })]);
    expect(summarizeRuntimeTraffic([running('p1')], state, now)).toMatchObject({ status: 'unavailable', uploadBytesPerSecond: null });
  });

  it('首个有效间隔前显示采集中，超过三秒后失效', () => {
    const state = mergeRuntimeTraffic({}, [sample({ availability: 'collecting' })]);
    expect(summarizeRuntimeTraffic([running('p1')], state, now + 3_000)).toMatchObject({ status: 'collecting', label: '采集中', uploadBytesPerSecond: null });
    expect(summarizeRuntimeTraffic([running('p1')], state, now + 3_001)).toMatchObject({ status: 'unavailable', label: '流量采样已过期', uploadBytesPerSecond: null });
  });

  it('过期速率不参与合计，部分覆盖明确标注分母', () => {
    const state = mergeRuntimeTraffic({}, [sample(), sample({ profileId: 'p2', timestamp: now - 3_001 })]);
    expect(summarizeRuntimeTraffic([running('p1'), running('p2')], state, now)).toMatchObject({
      status: 'partial', uploadBytesPerSecond: 1_500, availableCount: 1, runningCount: 2, label: '已统计 1 / 2 个运行连接',
    });
  });

  it('不可采集的原因长期保留，不被过期计时覆盖', () => {
    const state = mergeRuntimeTraffic({}, [sample({ availability: 'unavailable', reason: '暂不支持 QUIC 传输' })]);
    expect(summarizeRuntimeTraffic([running('p1')], state, now + 30_000)).toMatchObject({ status: 'unavailable', label: '暂不支持 QUIC 传输', uploadBytesPerSecond: null });
  });

  it('晚到的快照不能覆盖较新事件或新运行实例', () => {
    let state = mergeRuntimeTraffic({}, [sample({ sequence: 8 })]);
    state = mergeRuntimeTraffic(state, [sample({ sequence: 3, uploadBytesPerSecond: 99 })]);
    state = mergeRuntimeTraffic(state, [sample({ runId: 'run-new', startedAt: 5_000, sequence: 1, uploadBytesPerSecond: 42 })]);
    state = mergeRuntimeTraffic(state, [sample({ sequence: 99, timestamp: now + 1, uploadBytesPerSecond: 99 })]);
    expect(summarizeRuntimeTraffic([running('p1')], state, now).uploadBytesPerSecond).toBe(42);
  });

  it('重启清空旧速率，拒绝旧 runId，接受本次新运行样本', () => {
    let state = mergeRuntimeTraffic({}, [sample()]);
    state = applyRuntimeTrafficState(state, { profileId: 'p1', status: 'starting', timestamp: 5_000 });
    state = mergeRuntimeTraffic(state, [sample({ sequence: 99, timestamp: now + 1 })]);
    state = applyRuntimeTrafficState(state, { profileId: 'p1', status: 'running', timestamp: 6_000 });
    expect(summarizeRuntimeTraffic([running('p1')], state, now).uploadBytesPerSecond).toBeNull();
    state = mergeRuntimeTraffic(state, [sample({ runId: 'run-new', startedAt: 5_001, sequence: 1, uploadBytesPerSecond: 42 })]);
    expect(summarizeRuntimeTraffic([running('p1')], state, now).uploadBytesPerSecond).toBe(42);
  });

  it.each(['stopping', 'stopped', 'error'] as const)('%s 清空流量且忽略迟到样本', (status) => {
    let state = mergeRuntimeTraffic({}, [sample()]);
    state = applyRuntimeTrafficState(state, { profileId: 'p1', status, timestamp: now });
    state = mergeRuntimeTraffic(state, [sample({ sequence: 3 })]);
    expect(summarizeRuntimeTraffic([running('p1')], state, now).uploadBytesPerSecond).toBeNull();
  });

  it('重复 starting 事件保留本次已收到的采集状态', () => {
    let state = applyRuntimeTrafficState({}, { profileId: 'p1', status: 'starting', timestamp: 5_000 });
    state = mergeRuntimeTraffic(state, [sample({ runId: 'run-new', startedAt: 5_001, availability: 'collecting' })]);
    state = applyRuntimeTrafficState(state, { profileId: 'p1', status: 'starting', timestamp: 5_000 });
    expect(summarizeRuntimeTraffic([running('p1')], state, now).status).toBe('collecting');
  });

  it('本地停止后，迟到的旧 running 事件不能在没有历史样本时重新开放采集', () => {
    let state = applyRuntimeTrafficState({}, { profileId: 'p1', status: 'running', timestamp: 1_000 });
    state = applyRuntimeTrafficState(state, { profileId: 'p1', status: 'stopping', timestamp: now });
    state = applyRuntimeTrafficState(state, { profileId: 'p1', status: 'running', timestamp: now - 1 });
    state = mergeRuntimeTraffic(state, [sample()]);
    expect(summarizeRuntimeTraffic([running('p1')], state, now).uploadBytesPerSecond).toBeNull();
  });

  it.each(['starting', 'stopping', 'stopped', 'error'] as const)('迟到的旧 %s 事件不能清除较新运行周期的样本', (status) => {
    let state = applyRuntimeTrafficState({}, { profileId: 'p1', status: 'running', timestamp: now });
    state = mergeRuntimeTraffic(state, [sample()]);
    const current = state;
    state = applyRuntimeTrafficState(state, { profileId: 'p1', status, timestamp: now - 1 });
    expect(state).toBe(current);
    expect(summarizeRuntimeTraffic([running('p1')], state, now).uploadBytesPerSecond).toBe(1_500);
  });

  it('同一时间戳的合法停止、启动和运行更新仍能采集新周期', () => {
    let state = applyRuntimeTrafficState({}, { profileId: 'p1', status: 'stopping', timestamp: now });
    state = applyRuntimeTrafficState(state, { profileId: 'p1', status: 'starting', timestamp: now });
    state = applyRuntimeTrafficState(state, { profileId: 'p1', status: 'running', timestamp: now });
    state = mergeRuntimeTraffic(state, [sample({ runId: 'new-run', startedAt: now })]);
    expect(summarizeRuntimeTraffic([running('p1')], state, now).uploadBytesPerSecond).toBe(1_500);
  });

  it('字节速率使用十进制单位自动换算', () => {
    expect([0, 123, 1_500, 1_000_000].map(formatTrafficRate)).toEqual(['0 B/s', '123 B/s', '1.5 KB/s', '1 MB/s']);
  });

  it('不足一字节的非零速率不能四舍五入成空闲零值', () => {
    expect([0.1, 0.4, 0.9].map(formatTrafficRate)).toEqual(['<1 B/s', '<1 B/s', '<1 B/s']);
  });
});
