import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { DEFAULT_APP_SETTINGS } from '../../services/app-settings';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('SettingsPage', () => {
  it('显示后台常驻设置，并将用户选择回传给上层', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SettingsPage settings={DEFAULT_APP_SETTINGS} onChange={onChange} />);

    expect(screen.getByRole('heading', { name: '应用设置' })).toBeInTheDocument();
    expect(screen.getByLabelText('关闭主窗口时隐藏到托盘')).toBeChecked();
    expect(screen.getByLabelText('启动应用时显示主窗口')).toBeChecked();
    expect(screen.getByLabelText('关闭主窗口且有运行中连接时退出前确认')).toBeChecked();

    await user.click(screen.getByLabelText('关闭主窗口时退出应用'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_APP_SETTINGS, closeBehavior: 'exit_app' });
  });

  it('展示 Profile 默认排序设置并支持切换', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SettingsPage settings={DEFAULT_APP_SETTINGS} onChange={onChange} />);

    expect(screen.getByText('Profile 默认排序')).toBeInTheDocument();
    expect(screen.getByLabelText('置顶优先且按更新时间降序')).toBeChecked();

    await user.click(screen.getByLabelText('按名称升序'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_APP_SETTINGS, profileSort: 'name_asc' });
  });
});
