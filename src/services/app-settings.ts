import type { ProfileSort } from '../types/frp';

export type CloseBehavior = 'hide_to_tray' | 'exit_app';
export type LaunchBehavior = 'show_window' | 'start_minimized';

export interface AppSettings {
  closeBehavior: CloseBehavior;
  launchBehavior: LaunchBehavior;
  confirmExitWhenRunning: boolean;
  profileSort: ProfileSort;
}

const STORAGE_KEY = 'frp_gui_settings';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  closeBehavior: 'hide_to_tray',
  launchBehavior: 'show_window',
  confirmExitWhenRunning: true,
  profileSort: 'pinned_updated',
};

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_APP_SETTINGS;

    const closeBehavior: CloseBehavior =
      parsed.closeBehavior === 'hide_to_tray' || parsed.closeBehavior === 'exit_app'
        ? parsed.closeBehavior
        : DEFAULT_APP_SETTINGS.closeBehavior;

    const launchBehavior: LaunchBehavior =
      parsed.launchBehavior === 'show_window' || parsed.launchBehavior === 'start_minimized'
        ? parsed.launchBehavior
        : DEFAULT_APP_SETTINGS.launchBehavior;

    const confirmExitWhenRunning: boolean =
      typeof parsed.confirmExitWhenRunning === 'boolean'
        ? parsed.confirmExitWhenRunning
        : DEFAULT_APP_SETTINGS.confirmExitWhenRunning;

    const profileSort: ProfileSort =
      parsed.profileSort === 'pinned_updated' ||
      parsed.profileSort === 'updated_desc' ||
      parsed.profileSort === 'name_asc'
        ? parsed.profileSort
        : DEFAULT_APP_SETTINGS.profileSort;

    return {
      closeBehavior,
      launchBehavior,
      confirmExitWhenRunning,
      profileSort,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveAppSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
