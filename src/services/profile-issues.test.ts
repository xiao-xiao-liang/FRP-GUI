import { describe, expect, it } from 'vitest';
import type { FrpcRuntimeLogEvent, ProcessStatus } from '../types/frp';
import { makeProfile } from '../test/fixtures';
import { getProfileIssue, selectProfileFailureMessage, type ProfileIssueAction } from './profile-issues';

const stats = { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0 };
type FailureLog = Pick<FrpcRuntimeLogEvent, 'level' | 'message'>;

describe('getProfileIssue', () => {
  it('错误状态缺少具体错误时给出查看日志的说明，不猜测原因', () => {
    const issue = getProfileIssue(makeProfile({ status: 'error' }));

    expect(issue).toMatchObject({ action: 'logs', actionLabel: '查看日志' });
    expect(issue?.detail).toMatch(/未收到具体错误/);
    expect(issue?.suggestion).toMatch(/日志/);
    expect(issue?.summary).not.toMatch(/认证|端口|超时/);
  });

  it('core_invalid 即使没有错误文本也引导配置核心', () => {
    const issue = getProfileIssue(makeProfile({
      status: 'error',
      stats: { ...stats, lastFailureKind: 'core_invalid' },
    }));

    expect(issue).toMatchObject({ action: 'repair_core', actionLabel: '配置核心' });
    expect(issue?.summary).toMatch(/核心/);
    expect(issue?.suggestion).toMatch(/核心/);
  });

  it.each<ProcessStatus>(['running', 'starting'])('%s 状态的非空警告需要处理', (status) => {
    const issue = getProfileIssue(makeProfile({
      status,
      stats: { ...stats, lastWarning: '远程端口 8009 已被占用' },
    }));

    expect(issue).toMatchObject({ action: 'edit', detail: '远程端口 8009 已被占用' });
  });

  it.each<ProcessStatus>(['stopped', 'stopping'])('%s 状态不显示以前的错误和警告', (status) => {
    expect(getProfileIssue(makeProfile({
      status,
      stats: { ...stats, lastError: '连接被拒绝', lastWarning: '远程端口 8009 已被占用' },
    }))).toBeNull();
  });

  it.each<ProcessStatus>(['running', 'starting'])('%s 状态没有非空警告时不需要处理', (status) => {
    expect(getProfileIssue(makeProfile({
      status,
      stats: { ...stats, lastError: '以前的错误', lastWarning: ' \n\t ' },
    }))).toBeNull();
  });

  it('错误状态优先解释错误，保留警告不会替换原因', () => {
    expect(getProfileIssue(makeProfile({
      status: 'error',
      stats: { ...stats, lastError: 'authentication failed', lastWarning: 'port already used' },
    }))).toMatchObject({ action: 'edit', detail: 'authentication failed', summary: expect.stringMatching(/认证/) });
  });

  it.each<[string, ProfileIssueAction, string, RegExp]>([
    ['指定的核心程序不存在或无效', 'repair_core', '配置核心', /核心/],
    ['核心程序不可执行', 'repair_core', '配置核心', /核心/],
    ['核心程序校验失败，请检查程序是否为有效的 frpc 可执行文件', 'repair_core', '配置核心', /核心/],
    ["token in login doesn't match token from configuration", 'edit', '编辑配置', /认证/],
    ['Token 认证失败', 'edit', '编辑配置', /认证/],
    ['authentication failed', 'edit', '编辑配置', /认证/],
    ['remote port already used', 'edit', '编辑配置', /端口/],
    ['listen tcp :7000: bind: address already in use', 'edit', '编辑配置', /端口/],
    ['远程端口 8009 已被占用', 'edit', '编辑配置', /端口/],
    ['dial tcp 192.0.2.5:7000: connect: connection refused', 'logs', '查看日志', /拒绝/],
    ['dial tcp 192.0.2.5:7000: network is unreachable', 'logs', '查看日志', /连接/],
    ['dial tcp 192.0.2.5:7000: i/o timeout', 'logs', '查看日志', /超时/],
    ['connection timeout', 'logs', '查看日志', /超时/],
    ['dial tcp: lookup frp.example.test: no such host', 'logs', '查看日志', /域名/],
  ])('识别具体原因并保留原始详情：%s', (detail, action, actionLabel, summaryPattern) => {
    const issue = getProfileIssue(makeProfile({ status: 'error', stats: { ...stats, lastError: detail } }));

    expect(issue).toMatchObject({ detail, action, actionLabel });
    expect(issue?.summary).toMatch(summaryPattern);
    expect(issue?.suggestion.trim()).not.toBe('');
  });

  it.each([
    ['dial tcp 127.0.0.1:8080: connect: connection refused', '目标地址拒绝连接'],
    ['dial tcp 127.0.0.1:8080: network is unreachable', '无法连接目标地址'],
    ['dial tcp 127.0.0.1:8080: i/o timeout', '连接超时'],
    ['dial tcp: lookup local-app.test: no such host', '域名解析失败'],
  ])('网络报错不把本地目标误认为服务端：%s', (detail, summary) => {
    const issue = getProfileIssue(makeProfile({ status: 'error', stats: { ...stats, lastError: detail } }));

    expect(issue).toMatchObject({ summary, detail, action: 'logs', actionLabel: '查看日志' });
    expect(issue?.suggestion).toMatch(/目标地址/);
    expect(JSON.stringify(issue)).not.toContain('服务端');
  });

  it.each([
    'login to the server failed: dial tcp 192.0.2.5:7000: i/o timeout',
    'dial tcp frp.example.test:7000: connect: connection refused',
    'dial tcp frp.example.test:7000: network is unreachable',
    'dial tcp frp.example.test:7000: i/o timeout',
    'login to the server failed: dial tcp: lookup frp.example.test: no such host',
  ])('确认故障指向当前连接服务端时才引导诊断：%s', (detail) => {
    expect(getProfileIssue(makeProfile({ status: 'error', stats: { ...stats, lastError: detail } })))
      .toMatchObject({ detail, action: 'diagnose', actionLabel: '检测连通性' });
  });

  it.each([
    'dial tcp frp.example.test:70000: i/o timeout',
    'dial tcp other-frp.example.test:7000: i/o timeout',
    'connect to local service error: local_addr=frp.example.test:7000: connection refused',
  ])('其他端点或明确本地服务不能误触发服务端诊断：%s', (detail) => {
    expect(getProfileIssue(makeProfile({ status: 'error', stats: { ...stats, lastError: detail } })))
      .toMatchObject({ detail, action: 'logs', actionLabel: '查看日志' });
  });

  it('未知问题直接显示原文并引导查看日志', () => {
    const detail = '代理 nas-web 的自定义检查返回 E42';

    expect(getProfileIssue(makeProfile({ status: 'error', stats: { ...stats, lastError: detail } })))
      .toMatchObject({ summary: detail, detail, action: 'logs', actionLabel: '查看日志' });
  });

  it('未知长文本只缩短摘要，详情保留全部安全文本', () => {
    const detail = '自定义异常：' + '详情'.repeat(200);
    const issue = getProfileIssue(makeProfile({ status: 'error', stats: { ...stats, lastError: detail } }));

    expect(issue?.detail).toBe(detail);
    expect(issue!.summary.length).toBeLessThan(detail.length);
    expect(issue?.summary).toMatch(/…$/);
  });

  it('原始详情保留换行和缩进供展开复制，摘要整理为单行', () => {
    const detail = '  自定义异常\n    代理 nas-web 返回 E42\n';
    const issue = getProfileIssue(makeProfile({ status: 'error', stats: { ...stats, lastError: detail } }));

    expect(issue?.detail).toBe(detail);
    expect(issue?.summary).toBe('自定义异常 代理 nas-web 返回 E42');
  });

  it('所有动态说明先清除 ANSI 并脱敏 token 与密码', () => {
    const issue = getProfileIssue(makeProfile({
      status: 'error',
      stats: { ...stats, lastError: '\u001b[31m自定义异常 token=private-token password="private-password"\u001b[0m' },
    }));

    expect(issue?.detail).toBe('自定义异常 token=****** password=******');
    expect(JSON.stringify(issue)).not.toMatch(/private-token|private-password|\u001b/);
  });
});

describe('selectProfileFailureMessage', () => {
  const logs: FailureLog[] = [
    { level: 'error', message: '旧错误' },
    { level: 'error', message: 'remote port already used' },
    { level: 'warn', message: '较新的警告' },
    { level: 'info', message: '进程退出' },
  ];

  it.each([
    'FRPC 在启动确认阶段退出，请查看桌面端真实日志',
    'FRPC 进程已意外退出',
    'FRPC 提前退出',
    '进程运行异常',
    '启动早退',
  ])('通用失败使用最新 error 而非更晚的 warn：%s', (fallback) => {
    expect(selectProfileFailureMessage(fallback, logs)).toBe('remote port already used');
  });

  it('没有非空 error 时选择最新的非空 warn', () => {
    expect(selectProfileFailureMessage('进程运行异常', [
      { level: 'warn', message: '旧警告' },
      { level: 'error', message: ' \n ' },
      { level: 'warn', message: 'authentication failed' },
      { level: 'error', message: '\u001b[31m\u001b[0m' },
    ])).toBe('authentication failed');
  });

  it('明确错误优先于运行日志', () => {
    expect(selectProfileFailureMessage('配置文件内容为空，拒绝启动或写入', logs))
      .toBe('配置文件内容为空，拒绝启动或写入');
    expect(selectProfileFailureMessage('FRPC 提前退出：connection refused', logs))
      .toBe('FRPC 提前退出：connection refused');
  });

  it.each<{ currentLogs: FailureLog[] }>([
    { currentLogs: [] },
    { currentLogs: [{ level: 'info', message: '客户端正在退出' }] },
    { currentLogs: [{ level: 'warn', message: '  ' }] },
  ])('没有具体的错误或警告日志时保留通用失败', ({ currentLogs }) => {
    expect(selectProfileFailureMessage('进程运行异常', currentLogs)).toBe('进程运行异常');
  });

  it('选中的日志内容与明确错误都会脱敏', () => {
    expect(selectProfileFailureMessage('进程运行异常', [
      { level: 'error', message: '\u001b[31m认证失败 token=private-token password=private-password\u001b[0m' },
    ])).toBe('认证失败 token=****** password=******');
    expect(selectProfileFailureMessage('自定义异常 token=private-token password=private-password', logs))
      .toBe('自定义异常 token=****** password=******');
  });

  it('筛选日志只判断非空，保留具体文本的原始格式', () => {
    const detail = '  自定义异常\n    代理 nas-web 返回 E42\n';

    expect(selectProfileFailureMessage('进程运行异常', [{ level: 'error', message: detail }])).toBe(detail);
    expect(selectProfileFailureMessage(detail, logs)).toBe(detail);
  });

  it('没有具体日志时保留通用失败原有格式', () => {
    expect(selectProfileFailureMessage('  进程运行异常\n', [])).toBe('  进程运行异常\n');
  });

  it('读取日志时不改变原数组顺序', () => {
    const before = logs.map((log) => ({ ...log }));

    selectProfileFailureMessage('进程运行异常', logs);

    expect(logs).toEqual(before);
  });
});
