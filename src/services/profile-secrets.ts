import { Profile } from '../types/frp';

const PROFILE_CREDENTIAL_PREFIX = 'frp-gui/profile/';

/** 为方案机密生成受限的系统凭据库引用。 */
export function profileCredentialReference(profileId: string): string {
  return `${PROFILE_CREDENTIAL_PREFIX}${profileId}`;
}

/**
 * 生成可写入 localStorage 的方案元数据副本。
 * TOML 与所有可用于认证或访问受保护隧道的字段只保存在桌面端系统凭据库。
 */
export function sanitizeProfileForStorage(profile: Profile): Profile {
  const config = {
    ...profile.config,
    authToken: undefined,
    webServer: profile.config.webServer
      ? { ...profile.config.webServer, password: undefined }
      : undefined,
  };

  if ('proxies' in config) {
    config.proxies = config.proxies.map((proxy) => ({ ...proxy, secretKey: undefined }));
    config.visitors = config.visitors.map((visitor) => ({ ...visitor, secretKey: undefined }));
  }

  return {
    ...profile,
    config,
    rawToml: '',
  };
}

/** 构建本地二维码使用的无凭据配置摘要。 */
export function buildProfileSharePayload(profile: Profile) {
  const safeProfile = sanitizeProfileForStorage(profile);
  return {
    app: 'frp-gui',
    version: '1.0',
    profileId: profile.id,
    type: profile.type,
    name: profile.name,
    config: safeProfile.config,
  };
}

export interface StoredProfileSecret {
  rawToml: string;
  config: Profile['config'];
}

export function serializeProfileSecret(profile: Profile): string {
  return JSON.stringify({ rawToml: profile.rawToml, config: profile.config });
}

export function parseProfileSecret(value: string): StoredProfileSecret | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredProfileSecret>;
    if (typeof parsed.rawToml !== 'string' || !parsed.config || typeof parsed.config !== 'object') {
      return null;
    }
    return { rawToml: parsed.rawToml, config: parsed.config as Profile['config'] };
  } catch {
    return null;
  }
}
