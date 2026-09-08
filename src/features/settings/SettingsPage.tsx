import React from 'react';
import { AppSettings } from '../../services/app-settings';
import { FEISHU_FONT_FAMILY } from '../../components/ui/feishu-table';

interface SettingsPageProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}

interface ChoiceProps {
  name: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

const Choice: React.FC<ChoiceProps> = ({ name, label, description, checked, onChange }) => (
  <label className={`flex cursor-pointer items-start gap-3 rounded-[8px] border p-3 transition-colors ${checked ? 'border-[#3370FF] bg-[#F0F5FF]' : 'border-[#DEE0E3] bg-white hover:bg-[#F7F8FA]'}`}>
    <input aria-label={label} type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-[#3370FF]" />
    <span>
      <span className="block text-[14px] font-medium text-[#1F2329]">{label}</span>
      <span className="mt-1 block text-[12px] leading-5 text-[#646A75]">{description}</span>
    </span>
  </label>
);

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onChange }) => {
  const update = (patch: Partial<AppSettings>) => onChange({ ...settings, ...patch });

  return (
    <section style={{ fontFamily: FEISHU_FONT_FAMILY }} className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-[20px] font-semibold text-[#1F2329]">应用设置</h2>
        <p className="mt-1 text-[13px] text-[#646A75]">控制桌面窗口、托盘和退出应用时的行为。</p>
      </div>

      <div className="rounded-[10px] border border-[#DEE0E3] bg-white p-5 shadow-2xs">
        <h3 className="text-[15px] font-semibold text-[#1F2329]">关闭主窗口</h3>
        <p className="mt-1 text-[13px] text-[#646A75]">隐藏到托盘后，正在运行的 FRPC 连接会继续保持。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Choice name="close-behavior" label="关闭主窗口时隐藏到托盘" description="应用在后台继续运行，可从系统托盘重新打开。" checked={settings.closeBehavior === 'hide_to_tray'} onChange={() => update({ closeBehavior: 'hide_to_tray' })} />
          <Choice name="close-behavior" label="关闭主窗口时退出应用" description="关闭窗口会停止由本应用托管的连接并退出。" checked={settings.closeBehavior === 'exit_app'} onChange={() => update({ closeBehavior: 'exit_app' })} />
        </div>
      </div>

      <div className="rounded-[10px] border border-[#DEE0E3] bg-white p-5 shadow-2xs">
        <h3 className="text-[15px] font-semibold text-[#1F2329]">启动显示</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Choice name="launch-behavior" label="启动应用时显示主窗口" description="适合日常管理连接和查看运行状态。" checked={settings.launchBehavior === 'show_window'} onChange={() => update({ launchBehavior: 'show_window' })} />
          <Choice name="launch-behavior" label="启动应用时直接进入托盘" description="应用启动后在后台运行，双击托盘图标可打开窗口。" checked={settings.launchBehavior === 'start_minimized'} onChange={() => update({ launchBehavior: 'start_minimized' })} />
        </div>
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-[10px] border border-[#DEE0E3] bg-white p-5 shadow-2xs">
        <span>
          <span className="block text-[15px] font-semibold text-[#1F2329]">关闭主窗口时确认</span>
          <span className="mt-1 block text-[13px] text-[#646A75]">关闭主窗口且有运行中连接时，退出应用前要求确认。</span>
        </span>
        <input aria-label="关闭主窗口且有运行中连接时退出前确认" type="checkbox" checked={settings.confirmExitWhenRunning} onChange={(event) => update({ confirmExitWhenRunning: event.target.checked })} className="h-4 w-4 accent-[#3370FF]" />
      </label>

      <div className="rounded-[10px] border border-[#DEE0E3] bg-white p-5 shadow-2xs">
        <h3 className="text-[15px] font-semibold text-[#1F2329]">Profile 默认排序</h3>
        <p className="mt-1 text-[13px] text-[#646A75]">选择进入应用或重置筛选时 Profile 列表的默认排列顺序。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Choice
            name="profile-sort"
            label="置顶优先且按更新时间降序"
            description="置顶项排在最前，其余连接按最近更新时间降序排列。"
            checked={settings.profileSort === 'pinned_updated'}
            onChange={() => update({ profileSort: 'pinned_updated' })}
          />
          <Choice
            name="profile-sort"
            label="仅按最近更新降序"
            description="按连接最近更新时间降序排列，忽略置顶状态。"
            checked={settings.profileSort === 'updated_desc'}
            onChange={() => update({ profileSort: 'updated_desc' })}
          />
          <Choice
            name="profile-sort"
            label="按名称升序"
            description="按连接名称字典顺序升序排列。"
            checked={settings.profileSort === 'name_asc'}
            onChange={() => update({ profileSort: 'name_asc' })}
          />
        </div>
      </div>

      <p className="text-center text-[12px] text-[#8F959E]">FRP-GUI Pro · 桌面端设置会自动保存</p>
    </section>
  );
};
