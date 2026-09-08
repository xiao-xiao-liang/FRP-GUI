import type { ProcessStatus, Profile, ProfileGroup, ProfileSort, ProfileType } from '../types/frp';

export const STORAGE_KEY_PROFILE_GROUPS = 'frp_gui_profile_groups';

export interface ProfileFilterCriteria {
  groupId?: string;
  tag?: string;
  status?: ProcessStatus | 'all';
  type?: ProfileType | 'all';
  keyword?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface BatchActionTargetsResult {
  executable: Profile[];
  skipped: Profile[];
  canExecute: boolean;
  reason?: string;
}

export function normalizeGroupName(name: string): string {
  return name.trim();
}

export function validateGroupName(
  name: string,
  existingGroups: ProfileGroup[],
  currentGroupId?: string
): ValidationResult {
  const trimmed = normalizeGroupName(name);
  if (!trimmed) {
    return { valid: false, error: '分组名称不能为空' };
  }
  if (trimmed.length > 30) {
    return { valid: false, error: '分组名称不能超过 30 个字符' };
  }
  const isDuplicate = existingGroups.some(
    g => g.id !== currentGroupId && g.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (isDuplicate) {
    return { valid: false, error: '该分组名称已存在（不区分大小写）' };
  }
  return { valid: true };
}

export function normalizeTag(tag: string): string {
  return tag.trim();
}

export function validateTag(tag: string, currentTags: string[]): ValidationResult {
  const trimmed = normalizeTag(tag);
  if (!trimmed) {
    return { valid: false, error: '标签内容不能为空' };
  }
  if (trimmed.length > 24) {
    return { valid: false, error: '标签长度不能超过 24 个字符' };
  }
  if (currentTags.length >= 10) {
    return { valid: false, error: '单个连接最多设置 10 个标签' };
  }
  const isDuplicate = currentTags.some(t => t.toLowerCase() === trimmed.toLowerCase());
  if (isDuplicate) {
    return { valid: false, error: '该标签已存在（不区分大小写）' };
  }
  return { valid: true };
}

export function normalizeTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const trimmed = normalizeTag(raw);
    if (!trimmed || trimmed.length > 24) continue;
    const lower = trimmed.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(trimmed);
      if (result.length >= 10) break;
    }
  }

  return result;
}

export function normalizeProfileOrganization(profile: Profile): Profile {
  return {
    ...profile,
    groupId: profile.groupId ? profile.groupId.trim() || undefined : undefined,
    tags: normalizeTags(profile.tags),
    isPinned: Boolean(profile.isPinned),
  };
}

export function createProfileGroup(
  name: string,
  existingGroups: ProfileGroup[]
): { group: ProfileGroup; groups: ProfileGroup[] } {
  const trimmed = normalizeGroupName(name);
  const now = Date.now();
  const group: ProfileGroup = {
    id: `group-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
  return {
    group,
    groups: [...existingGroups, group],
  };
}

export function renameProfileGroup(
  groupId: string,
  newName: string,
  existingGroups: ProfileGroup[]
): ProfileGroup[] {
  const trimmed = normalizeGroupName(newName);
  const now = Date.now();
  return existingGroups.map(g =>
    g.id === groupId ? { ...g, name: trimmed, updatedAt: now } : g
  );
}

export function deleteProfileGroup(
  groupId: string,
  existingGroups: ProfileGroup[],
  profiles: Profile[]
): { groups: ProfileGroup[]; updatedProfiles: Profile[] } {
  const groups = existingGroups.filter(g => g.id !== groupId);
  const updatedProfiles = profiles.map(p =>
    p.groupId === groupId ? { ...p, groupId: undefined } : p
  );
  return { groups, updatedProfiles };
}

export function loadProfileGroups(): ProfileGroup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROFILE_GROUPS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string')
      .map(item => ({
        id: String(item.id),
        name: String(item.name),
        createdAt: Number(item.createdAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now(),
      }));
  } catch {
    return [];
  }
}

export function saveProfileGroups(groups: ProfileGroup[]): void {
  // Only persist non-sensitive group metadata
  const sanitized = groups.map(g => ({
    id: g.id,
    name: g.name,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  }));
  localStorage.setItem(STORAGE_KEY_PROFILE_GROUPS, JSON.stringify(sanitized));
}

export function filterProfiles(
  profiles: Profile[],
  criteria: ProfileFilterCriteria
): Profile[] {
  return profiles.filter(p => {
    if (criteria.groupId) {
      if (criteria.groupId === 'ungrouped') {
        if (p.groupId) return false;
      } else if (criteria.groupId !== 'all') {
        if (p.groupId !== criteria.groupId) return false;
      }
    }

    if (criteria.tag && criteria.tag !== 'all') {
      const tagLower = criteria.tag.toLowerCase();
      const hasTag = p.tags?.some(t => t.toLowerCase() === tagLower);
      if (!hasTag) return false;
    }

    if (criteria.status && criteria.status !== 'all') {
      if (p.status !== criteria.status) return false;
    }

    if (criteria.type && criteria.type !== 'all') {
      if (p.type !== criteria.type) return false;
    }

    if (criteria.keyword && criteria.keyword.trim()) {
      const q = criteria.keyword.trim().toLowerCase();
      const nameMatch = p.name.toLowerCase().includes(q);
      const descMatch = (p.description || '').toLowerCase().includes(q);
      if (!nameMatch && !descMatch) return false;
    }

    return true;
  });
}

export function sortProfiles(profiles: Profile[], sort: ProfileSort): Profile[] {
  const list = [...profiles];
  return list.sort((a, b) => {
    if (sort === 'pinned_updated') {
      const pinA = a.isPinned ? 1 : 0;
      const pinB = b.isPinned ? 1 : 0;
      if (pinA !== pinB) {
        return pinB - pinA;
      }
      if (b.updatedAt !== a.updatedAt) {
        return b.updatedAt - a.updatedAt;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    }

    if (sort === 'updated_desc') {
      if (b.updatedAt !== a.updatedAt) {
        return b.updatedAt - a.updatedAt;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    }

    if (sort === 'name_asc') {
      if (a.name !== b.name) {
        return a.name < b.name ? -1 : 1;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    }

    return 0;
  });
}

export function getBatchActionTargets(
  selectedProfiles: Profile[],
  action: 'start' | 'stop' | 'delete'
): BatchActionTargetsResult {
  if (selectedProfiles.length === 0) {
    return {
      executable: [],
      skipped: [],
      canExecute: false,
      reason: '未选择任何连接',
    };
  }

  if (action === 'start') {
    const isAllStopped = selectedProfiles.every(p => p.status === 'stopped');
    if (isAllStopped) {
      return {
        executable: selectedProfiles,
        skipped: [],
        canExecute: true,
      };
    }
    return {
      executable: [],
      skipped: selectedProfiles,
      canExecute: false,
      reason: '仅当所有选中连接均已停止时可批量启动',
    };
  }

  if (action === 'stop') {
    const isAllRunning = selectedProfiles.every(p => p.status === 'running');
    if (isAllRunning) {
      return {
        executable: selectedProfiles,
        skipped: [],
        canExecute: true,
      };
    }
    return {
      executable: [],
      skipped: selectedProfiles,
      canExecute: false,
      reason: '仅当所有选中连接均在运行时可批量停止',
    };
  }

  if (action === 'delete') {
    const isAllStopped = selectedProfiles.every(p => p.status === 'stopped');
    if (isAllStopped) {
      return {
        executable: selectedProfiles,
        skipped: [],
        canExecute: true,
      };
    }
    return {
      executable: [],
      skipped: selectedProfiles,
      canExecute: false,
      reason: '仅当所有选中连接均已停止时可批量删除',
    };
  }

  return { executable: [], skipped: selectedProfiles, canExecute: false };
}
