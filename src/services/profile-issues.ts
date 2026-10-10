import type { FrpcRuntimeLogEvent, Profile } from '../types/frp';
import { sanitizeRuntimeText } from './ipc';

export type ProfileIssueAction = 'repair_core' | 'edit' | 'diagnose' | 'logs';

export interface ProfileIssue {
  summary: string;
  detail: string;
  suggestion: string;
  action: ProfileIssueAction;
  actionLabel: string;
}

const MAX_SUMMARY_LENGTH = 120;
const GENERIC_FAILURE_MESSAGES = new Set([
  'frpc在启动确认阶段退出，请查看桌面端真实日志',
  'frpc进程已意外退出',
  'frpc进程意外退出',
  'frpc进程提前退出',
  'frpc提前退出',
  'frpc进程运行异常',
  '进程运行异常',
  '启动早退',
  '启动frpc进程失败',
]);

function summarizeDetail(detail: string): string {
  const summary = detail.replace(/\s+/g, ' ').trim();
  return summary.length > MAX_SUMMARY_LENGTH
    ? `${summary.slice(0, MAX_SUMMARY_LENGTH - 1)}…`
    : summary;
}

function canDiagnoseServerTarget(profile: Profile, detail: string): boolean {
  if (profile.type !== 'frpc' || !('serverAddr' in profile.config)) return false;
  if (/local[_ -]?(?:addr|address|service)|本地(?:地址|服务)/i.test(detail)) return false;
  if (/\blogin to (?:the )?server failed\b/i.test(detail)) return true;

  const serverAddr = profile.config.serverAddr.trim().replace(/^\[|\]$/g, '');
  if (!serverAddr) return false;
  const endpoint = `${serverAddr.includes(':') ? `[${serverAddr}]` : serverAddr}:${profile.config.serverPort}`;
  const escapedEndpoint = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\w.:-])${escapedEndpoint}(?=$|[^\\w.-])`, 'i').test(detail);
}

/** 将当前连接问题转换为具体原因、原始详情和可执行建议。 */
export function getProfileIssue(profile: Profile): ProfileIssue | null {
  const isError = profile.status === 'error';
  const isActive = profile.status === 'running' || profile.status === 'starting';
  if (!isError && !isActive) return null;

  const source = isError ? profile.stats.lastError : profile.stats.lastWarning;
  let detail = sanitizeRuntimeText(source || '');
  if (!isError && !detail.trim()) return null;

  const isCoreInvalid = isError && profile.stats.lastFailureKind === 'core_invalid';
  if (!detail.trim()) {
    detail = isCoreInvalid
      ? 'FRP 核心校验失败，请重新配置可用的核心程序。'
      : '连接运行失败，未收到具体错误，请查看运行日志。';
  }

  if (isCoreInvalid || /core_invalid|核心[\s\S]*(?:不存在|无效|不可执行|校验失败|版本检查超时)|(?:core|frpc)[\s\S]*(?:not found|not executable)/i.test(detail)) {
    return {
      summary: 'FRP 核心不可用',
      detail,
      suggestion: '选择已安装且可执行的 FRP 核心，保存后重新启动连接。',
      action: 'repair_core',
      actionLabel: '配置核心',
    };
  }

  if (/认证(?:失败|错误)|鉴权(?:失败|错误)|auth(?:entication|orization)?[\s\S]*(?:fail(?:ed|ure)?|error|invalid)|(?:invalid|incorrect|mismatch(?:ed)?)\s+token|token[\s\S]*(?:不匹配|错误|失败|无效|does(?:n't| not) match|mismatch|invalid|incorrect|not correct|fail(?:ed|ure)?)/i.test(detail)) {
    return {
      summary: '服务端认证失败',
      detail,
      suggestion: '检查连接的认证方式与 Token，确保和服务端配置一致后重试。',
      action: 'edit',
      actionLabel: '编辑配置',
    };
  }

  if (/端口[\s\S]*(?:占用|冲突)|port[\s\S]*already (?:used|in use)|address already in use|bind[\s\S]*address in use/i.test(detail)) {
    return {
      summary: '连接使用的端口已被占用',
      detail,
      suggestion: '检查日志中的冲突端口，修改对应端口或停止占用该端口的服务后重试。',
      action: 'edit',
      actionLabel: '编辑配置',
    };
  }

  // 现有诊断只检测配置中的服务端端点，不能用于日志里的本地服务。
  const canDiagnose = canDiagnoseServerTarget(profile, detail);
  const networkAction: Pick<ProfileIssue, 'action' | 'actionLabel'> = canDiagnose
    ? { action: 'diagnose', actionLabel: '检测连通性' }
    : { action: 'logs', actionLabel: '查看日志' };
  const networkSuggestionTail = canDiagnose
    ? '，再检测服务端连通性。'
    : '，并查看该连接的运行日志。';

  if (/no such host|域名[\s\S]*解析失败|dns[\s\S]*(?:failed|failure|error)/i.test(detail)) {
    return {
      summary: '域名解析失败',
      detail,
      suggestion: `检查报错中的目标地址与 DNS 设置${networkSuggestionTail}`,
      ...networkAction,
    };
  }

  if (/timeout|timed out|超时/i.test(detail)) {
    return {
      summary: '连接超时',
      detail,
      suggestion: `检查报错中的目标地址、端口和网络状态${networkSuggestionTail}`,
      ...networkAction,
    };
  }

  if (/connection refused|连接[\s\S]*拒绝|dial tcp/i.test(detail)) {
    return {
      summary: /connection refused|连接[\s\S]*拒绝/i.test(detail)
        ? '目标地址拒绝连接'
        : '无法连接目标地址',
      detail,
      suggestion: `检查报错中的目标地址、端口及对应服务是否运行${networkSuggestionTail}`,
      ...networkAction,
    };
  }

  return {
    summary: summarizeDetail(detail),
    detail,
    suggestion: '查看该连接的运行日志，依据具体错误检查配置后重试。',
    action: 'logs',
    actionLabel: '查看日志',
  };
}

/** 仅为通用失败补充本次启动日志中的具体错误，不覆盖明确原因。 */
export function selectProfileFailureMessage(
  fallback: string,
  logs: Array<Pick<FrpcRuntimeLogEvent, 'level' | 'message'>>,
): string {
  const safeFallback = sanitizeRuntimeText(fallback);
  const normalizedFallback = safeFallback.replace(/\s+/g, '').toLowerCase();
  if (!GENERIC_FAILURE_MESSAGES.has(normalizedFallback)) return safeFallback;

  // 调用方按连接与启动轮次筛选日志；数组尾部代表最新收到的记录。
  for (const level of ['error', 'warn'] as const) {
    for (let index = logs.length - 1; index >= 0; index -= 1) {
      if (logs[index].level !== level) continue;
      const message = sanitizeRuntimeText(logs[index].message);
      if (message.trim()) return message;
    }
  }

  return safeFallback;
}
