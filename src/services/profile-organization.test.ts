import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEY_PROFILE_GROUPS,
  normalizeGroupName,
  validateGroupName,
  normalizeTag,
  validateTag,
  normalizeTags,
  normalizeProfileOrganization,
  createProfileGroup,
  renameProfileGroup,
  deleteProfileGroup,
  loadProfileGroups,
  saveProfileGroups,
  filterProfiles,
  sortProfiles,
  getBatchActionTargets,
} from './profile-organization';
import type { Profile, ProfileGroup } from '../types/frp';
import { makeProfile } from '../test/fixtures';

describe('profile-organization pure functions', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('normalizeProfileOrganization', () => {
    it('handles legacy profile without groupId, tags, isPinned and provides defaults', () => {
      const legacyProfile = makeProfile({
        id: 'p-1',
        name: 'Legacy Profile',
      });
      delete (legacyProfile as any).groupId;
      delete (legacyProfile as any).tags;
      delete (legacyProfile as any).isPinned;

      const normalized = normalizeProfileOrganization(legacyProfile);
      expect(normalized.groupId).toBeUndefined();
      expect(normalized.tags).toEqual([]);
      expect(normalized.isPinned).toBe(false);
    });

    it('retains valid groupId, normalized tags and isPinned', () => {
      const profile = makeProfile({
        id: 'p-2',
        groupId: 'group-1',
        tags: [' Dev ', 'WEB', 'dev'],
        isPinned: true,
      });
      const normalized = normalizeProfileOrganization(profile);
      expect(normalized.groupId).toBe('group-1');
      // Case-insensitive deduplication, retains first occurrence casing
      expect(normalized.tags).toEqual(['Dev', 'WEB']);
      expect(normalized.isPinned).toBe(true);
    });
  });

  describe('group name validation and normalization', () => {
    const existing: ProfileGroup[] = [
      { id: 'g-1', name: 'Work', createdAt: 100, updatedAt: 100 },
      { id: 'g-2', name: 'Personal', createdAt: 200, updatedAt: 200 },
    ];

    it('normalizes group name by trimming whitespace', () => {
      expect(normalizeGroupName('  Office Project  ')).toBe('Office Project');
    });

    it('rejects empty or whitespace-only group name', () => {
      expect(validateGroupName('', existing).valid).toBe(false);
      expect(validateGroupName('   ', existing).valid).toBe(false);
    });

    it('rejects group name longer than 30 characters', () => {
      const longName = 'A'.repeat(31);
      const res = validateGroupName(longName, existing);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/30/);
    });

    it('rejects case-insensitive duplicate group name', () => {
      const res = validateGroupName('work', existing);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/重复|已存在/);
    });

    it('allows same name when renaming the current group', () => {
      const res = validateGroupName('Work', existing, 'g-1');
      expect(res.valid).toBe(true);
    });
  });

  describe('tag validation and normalization', () => {
    it('normalizes tag by trimming whitespace', () => {
      expect(normalizeTag('  production  ')).toBe('production');
    });

    it('rejects empty or whitespace-only tag', () => {
      expect(validateTag('', []).valid).toBe(false);
      expect(validateTag('   ', []).valid).toBe(false);
    });

    it('rejects tag longer than 24 characters', () => {
      const longTag = 'T'.repeat(25);
      const res = validateTag(longTag, []);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/24/);
    });

    it('rejects duplicate tag case-insensitively', () => {
      const res = validateTag('web', ['WEB', 'api']);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/重复|已存在/);
    });

    it('rejects adding beyond 10 tags', () => {
      const currentTags = Array.from({ length: 10 }, (_, i) => `tag-${i}`);
      const res = validateTag('tag-new', currentTags);
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/10/);
    });

    it('normalizes tag array with deduplication and cap of 10', () => {
      const tags = [' Prod ', 'api', 'PROD', 'web', 'db', 'extra'];
      expect(normalizeTags(tags)).toEqual(['Prod', 'api', 'web', 'db', 'extra']);
    });

    it('normalizeTags 必须丢弃空标签与超过 24 个字符的标签，保留首次输入的大小写，大小写不敏感去重，最多保留 10 项', () => {
      const tags = [
        '   ',
        '',
        'Backend',
        'a'.repeat(25), // 25 chars -> should be discarded
        'backend', // duplicate of Backend -> should be discarded
        'Valid-24-chars-xxxxxxxxx', // exactly 24 chars -> should be kept
        'Frontend',
        'FRONTEND',
        'Database',
        'Cache',
        'Queue',
        'Auth',
        'Storage',
        'Monitoring',
        'Logging',
        'ExtraTag11', // 11th valid tag -> capped
        'ExtraTag12',
      ];
      const result = normalizeTags(tags);
      expect(result).toEqual([
        'Backend',
        'Valid-24-chars-xxxxxxxxx',
        'Frontend',
        'Database',
        'Cache',
        'Queue',
        'Auth',
        'Storage',
        'Monitoring',
        'Logging',
      ]);
      expect(result).toHaveLength(10);
      expect(result).not.toContain('');
      expect(result.some(t => t.length > 24)).toBe(false);
    });

    it('旧数据迁移：normalizeProfileOrganization 自动清理包含脏数据或非法标签的旧 Profile', () => {
      const dirtyLegacyProfile = makeProfile({
        id: 'p-dirty',
        name: 'Dirty Profile',
        tags: [
          '',
          '   ',
          'Production',
          'THIS_TAG_IS_WAY_TOO_LONG_AND_EXCEEDS_24_CHARS',
          'production',
          'Staging',
        ],
      });
      const migrated = normalizeProfileOrganization(dirtyLegacyProfile);
      expect(migrated.tags).toEqual(['Production', 'Staging']);
    });
  });

  describe('group CRUD pure operations', () => {
    it('creates a new profile group', () => {
      const initial: ProfileGroup[] = [];
      const { group, groups } = createProfileGroup('Staging', initial);
      expect(group.id).toBeDefined();
      expect(group.name).toBe('Staging');
      expect(groups).toHaveLength(1);
      expect(groups[0]).toBe(group);
    });

    it('renames an existing profile group', () => {
      const initial: ProfileGroup[] = [
        { id: 'g-1', name: 'Dev', createdAt: 1, updatedAt: 1 },
      ];
      const updated = renameProfileGroup('g-1', 'Development', initial);
      expect(updated[0].name).toBe('Development');
      expect(updated[0].updatedAt).toBeGreaterThanOrEqual(1);
    });

    it('deletes a profile group and unlinks referenced profiles without deleting profiles', () => {
      const initialGroups: ProfileGroup[] = [
        { id: 'g-1', name: 'Dev', createdAt: 1, updatedAt: 1 },
        { id: 'g-2', name: 'Prod', createdAt: 2, updatedAt: 2 },
      ];
      const profiles: Profile[] = [
        makeProfile({ id: 'p-1', groupId: 'g-1', name: 'P1' }),
        makeProfile({ id: 'p-2', groupId: 'g-2', name: 'P2' }),
        makeProfile({ id: 'p-3', groupId: undefined, name: 'P3' }),
      ];

      const { groups, updatedProfiles } = deleteProfileGroup('g-1', initialGroups, profiles);
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe('g-2');

      const p1 = updatedProfiles.find(p => p.id === 'p-1');
      const p2 = updatedProfiles.find(p => p.id === 'p-2');
      const p3 = updatedProfiles.find(p => p.id === 'p-3');
      expect(p1?.groupId).toBeUndefined();
      expect(p2?.groupId).toBe('g-2');
      expect(p3?.groupId).toBeUndefined();
    });
  });

  describe('localStorage persistence', () => {
    it('returns empty array when storage is empty or corrupted', () => {
      expect(loadProfileGroups()).toEqual([]);

      localStorage.setItem(STORAGE_KEY_PROFILE_GROUPS, '{ bad json');
      expect(loadProfileGroups()).toEqual([]);

      localStorage.setItem(STORAGE_KEY_PROFILE_GROUPS, JSON.stringify({ notAnArray: true }));
      expect(loadProfileGroups()).toEqual([]);
    });

    it('saves and loads groups safely without sensitive data', () => {
      const groups: ProfileGroup[] = [
        { id: 'g-1', name: 'Office', createdAt: 100, updatedAt: 100 },
      ];
      saveProfileGroups(groups);
      const loaded = loadProfileGroups();
      expect(loaded).toEqual(groups);

      const raw = localStorage.getItem(STORAGE_KEY_PROFILE_GROUPS);
      expect(raw).not.toContain('token');
      expect(raw).not.toContain('rawToml');
    });
  });

  describe('filterProfiles (AND multi-condition)', () => {
    const p1 = makeProfile({
      id: 'p-1',
      name: 'Office NAS',
      description: 'Main storage',
      type: 'frpc',
      status: 'running',
      groupId: 'g-1',
      tags: ['office', 'storage'],
    });
    const p2 = makeProfile({
      id: 'p-2',
      name: 'Home Web',
      description: 'Blog server',
      type: 'frpc',
      status: 'stopped',
      groupId: 'g-2',
      tags: ['home', 'web'],
    });
    const p3 = makeProfile({
      id: 'p-3',
      name: 'Office Proxy',
      description: 'Dev proxy',
      type: 'frps',
      status: 'running',
      groupId: 'g-1',
      tags: ['office', 'proxy'],
    });
    const p4 = makeProfile({
      id: 'p-4',
      name: 'Standalone App',
      description: 'No group',
      type: 'frpc',
      status: 'error',
      groupId: undefined,
      tags: [],
    });
    const all = [p1, p2, p3, p4];

    it('returns all profiles when filter criteria is empty', () => {
      expect(filterProfiles(all, {})).toHaveLength(4);
    });

    it('filters by groupId (including ungrouped)', () => {
      expect(filterProfiles(all, { groupId: 'g-1' })).toEqual([p1, p3]);
      expect(filterProfiles(all, { groupId: 'ungrouped' })).toEqual([p4]);
    });

    it('filters by tag (case-insensitive)', () => {
      expect(filterProfiles(all, { tag: 'OFFICE' })).toEqual([p1, p3]);
      expect(filterProfiles(all, { tag: 'web' })).toEqual([p2]);
    });

    it('filters by status and type', () => {
      expect(filterProfiles(all, { status: 'running' })).toEqual([p1, p3]);
      expect(filterProfiles(all, { type: 'frps' })).toEqual([p3]);
    });

    it('filters by keyword in name or description', () => {
      expect(filterProfiles(all, { keyword: 'nas' })).toEqual([p1]);
      expect(filterProfiles(all, { keyword: 'dev proxy' })).toEqual([p3]);
    });

    it('combines all criteria with AND logic', () => {
      const result = filterProfiles(all, {
        groupId: 'g-1',
        tag: 'office',
        status: 'running',
        type: 'frpc',
        keyword: 'Main',
      });
      expect(result).toEqual([p1]);
    });
  });

  describe('sortProfiles', () => {
    const p1 = makeProfile({ id: 'p-1', name: 'Alpha', isPinned: false, updatedAt: 200 });
    const p2 = makeProfile({ id: 'p-2', name: 'Beta', isPinned: true, updatedAt: 100 });
    const p3 = makeProfile({ id: 'p-3', name: 'Charlie', isPinned: true, updatedAt: 300 });
    const p4 = makeProfile({ id: 'p-4', name: 'Delta', isPinned: false, updatedAt: 200 });
    const list = [p1, p2, p3, p4];

    it('sorts by pinned_updated: pinned first (by updatedAt desc), then unpinned (by updatedAt desc, id tie-breaker)', () => {
      const sorted = sortProfiles(list, 'pinned_updated');
      // Pinned: p3 (updatedAt: 300), p2 (updatedAt: 100)
      // Unpinned: p1 (updatedAt: 200, id: p-1), p4 (updatedAt: 200, id: p-4)
      expect(sorted.map(p => p.id)).toEqual(['p-3', 'p-2', 'p-1', 'p-4']);
    });

    it('sorts by updated_desc with id tie-breaker', () => {
      const sorted = sortProfiles(list, 'updated_desc');
      // 300 -> p3
      // 200 -> p1, p4 (tie broken by id asc: 'p-1' < 'p-4')
      // 100 -> p2
      expect(sorted.map(p => p.id)).toEqual(['p-3', 'p-1', 'p-4', 'p-2']);
    });

    it('sorts by name_asc with id tie-breaker', () => {
      const listWithDuplicateName = [
        makeProfile({ id: 'p-b', name: 'Same', updatedAt: 10 }),
        makeProfile({ id: 'p-a', name: 'Same', updatedAt: 20 }),
        makeProfile({ id: 'p-c', name: 'Apple', updatedAt: 30 }),
      ];
      const sorted = sortProfiles(listWithDuplicateName, 'name_asc');
      expect(sorted.map(p => p.id)).toEqual(['p-c', 'p-a', 'p-b']);
    });
  });

  describe('getBatchActionTargets', () => {
    const pStopped = makeProfile({ id: 'p-stopped', status: 'stopped' });
    const pError = makeProfile({ id: 'p-error', status: 'error' });
    const pRunning = makeProfile({ id: 'p-running', status: 'running' });
    const pStarting = makeProfile({ id: 'p-starting', status: 'starting' });
    const pStopping = makeProfile({ id: 'p-stopping', status: 'stopping' });

    it('空选择对三个操作均返回不可执行', () => {
      for (const action of ['start', 'stop', 'delete'] as const) {
        const result = getBatchActionTargets([], action);
        expect(result.canExecute).toBe(false);
        expect(result.executable).toHaveLength(0);
        expect(result.skipped).toHaveLength(0);
      }
    });

    it('所有选中项均已停止或失败且无进程时，仅 start 和 delete 可执行', () => {
      for (const selected of [
        [pStopped, makeProfile({ id: 'p-stopped-2', status: 'stopped' })],
        [pStopped, pError],
        [pError],
      ]) {

        const startRes = getBatchActionTargets(selected, 'start');
        expect(startRes.canExecute).toBe(true);
        expect(startRes.executable).toEqual(selected);
        expect(startRes.skipped).toEqual([]);

        const deleteRes = getBatchActionTargets(selected, 'delete');
        expect(deleteRes.canExecute).toBe(true);
        expect(deleteRes.executable).toEqual(selected);
        expect(deleteRes.skipped).toEqual([]);

        const stopRes = getBatchActionTargets(selected, 'stop');
        expect(stopRes.canExecute).toBe(false);
        expect(stopRes.executable).toEqual([]);
        expect(stopRes.skipped).toEqual(selected);
        expect(stopRes.reason).toMatch(/仅当所有选中连接均在运行/);
      }
    });

    it('所有选中项均为 running 时，仅 stop 可执行，start 和 delete 不可执行并给出中文原因', () => {
      const selected = [pRunning, makeProfile({ id: 'p-running-2', status: 'running' })];

      const stopRes = getBatchActionTargets(selected, 'stop');
      expect(stopRes.canExecute).toBe(true);
      expect(stopRes.executable.map(p => p.id)).toEqual(['p-running', 'p-running-2']);
      expect(stopRes.skipped).toEqual([]);

      const startRes = getBatchActionTargets(selected, 'start');
      expect(startRes.canExecute).toBe(false);
      expect(startRes.executable).toEqual([]);
      expect(startRes.skipped).toEqual(selected);
      expect(startRes.reason).toMatch(/仅当所有选中连接均未运行/);

      const deleteRes = getBatchActionTargets(selected, 'delete');
      expect(deleteRes.canExecute).toBe(false);
      expect(deleteRes.executable).toEqual([]);
      expect(deleteRes.skipped).toEqual(selected);
      expect(deleteRes.reason).toMatch(/仅当所有选中连接均未运行/);
    });

    it('混合 stopped 与 running 时，三个操作均返回不可执行和中文原因', () => {
      const selected = [pStopped, pRunning];

      const startRes = getBatchActionTargets(selected, 'start');
      expect(startRes.canExecute).toBe(false);
      expect(startRes.executable).toEqual([]);
      expect(startRes.skipped).toEqual(selected);
      expect(startRes.reason).toMatch(/仅当所有选中连接均未运行/);

      const stopRes = getBatchActionTargets(selected, 'stop');
      expect(stopRes.canExecute).toBe(false);
      expect(stopRes.executable).toEqual([]);
      expect(stopRes.skipped).toEqual(selected);
      expect(stopRes.reason).toMatch(/仅当所有选中连接均在运行/);

      const deleteRes = getBatchActionTargets(selected, 'delete');
      expect(deleteRes.canExecute).toBe(false);
      expect(deleteRes.executable).toEqual([]);
      expect(deleteRes.skipped).toEqual(selected);
      expect(deleteRes.reason).toMatch(/仅当所有选中连接均未运行/);
    });

    it('包含仍有进程的异常连接、starting 或 stopping 时，三个操作均不可执行', () => {
      const cases = [
        [pStopped, { ...pError, stats: { ...pError.stats, pid: 123 } }],
        [pStopped, { ...pStopped, id: 'p-stopped-with-pid', stats: { ...pStopped.stats, pid: 123 } }],
        [pRunning, pStarting],
        [pStopped, pStopping],
      ];

      for (const selected of cases) {
        const startRes = getBatchActionTargets(selected, 'start');
        expect(startRes.canExecute).toBe(false);
        expect(startRes.executable).toEqual([]);
        expect(startRes.reason).toBeDefined();

        const stopRes = getBatchActionTargets(selected, 'stop');
        expect(stopRes.canExecute).toBe(false);
        expect(stopRes.executable).toEqual([]);
        expect(stopRes.reason).toBeDefined();

        const deleteRes = getBatchActionTargets(selected, 'delete');
        expect(deleteRes.canExecute).toBe(false);
        expect(deleteRes.executable).toEqual([]);
        expect(deleteRes.reason).toBeDefined();
      }
    });
  });
});
