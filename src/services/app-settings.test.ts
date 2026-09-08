import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings } from './app-settings';

describe('app-settings', () => {
  beforeEach(() => localStorage.clear());

  it('未保存设置时返回后台常驻的默认策略', () => {
    expect(loadAppSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('保存设置后只恢复受支持的选项', () => {
    saveAppSettings({
      closeBehavior: 'exit_app',
      launchBehavior: 'start_minimized',
      confirmExitWhenRunning: false,
      profileSort: 'updated_desc',
    });

    expect(loadAppSettings()).toEqual({
      closeBehavior: 'exit_app',
      launchBehavior: 'start_minimized',
      confirmExitWhenRunning: false,
      profileSort: 'updated_desc',
    });
  });

  it('旧设置缺少 profileSort 时自动补充默认排序', () => {
    localStorage.setItem(
      'frp_gui_settings',
      JSON.stringify({
        closeBehavior: 'exit_app',
        launchBehavior: 'start_minimized',
        confirmExitWhenRunning: false,
      })
    );
    expect(loadAppSettings()).toEqual({
      closeBehavior: 'exit_app',
      launchBehavior: 'start_minimized',
      confirmExitWhenRunning: false,
      profileSort: 'pinned_updated',
    });
  });

  it('profileSort 非法时只回退该字段且保留其他有效设置', () => {
    localStorage.setItem(
      'frp_gui_settings',
      JSON.stringify({
        closeBehavior: 'exit_app',
        launchBehavior: 'start_minimized',
        confirmExitWhenRunning: false,
        profileSort: 'invalid_sort',
      })
    );
    expect(loadAppSettings()).toEqual({
      closeBehavior: 'exit_app',
      launchBehavior: 'start_minimized',
      confirmExitWhenRunning: false,
      profileSort: 'pinned_updated',
    });
  });

  it('支持保存和读取合法的 profileSort', () => {
    saveAppSettings({
      closeBehavior: 'hide_to_tray',
      launchBehavior: 'show_window',
      confirmExitWhenRunning: true,
      profileSort: 'name_asc',
    });
    expect(loadAppSettings().profileSort).toBe('name_asc');
  });

  it('损坏或过期的持久化值回退到默认值', () => {
    localStorage.setItem('frp_gui_settings', '{ bad json');
    expect(loadAppSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });
});
