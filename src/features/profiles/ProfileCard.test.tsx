import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { ProfileCard } from './ProfileCard';
import { makeProfile } from '../../test/fixtures';

describe('ProfileCard (我的连接卡片)', () => {
  afterEach(() => {
    cleanup();
  });
  it('已停止状态显示“启动连接”主操作，并在更多菜单中逐一触发全部次级操作', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onEdit = vi.fn();
    const onViewLogs = vi.fn();
    const onSync = vi.fn();
    const onClone = vi.fn();
    const onDelete = vi.fn();

    const { unmount } = render(
      <ProfileCard
        profile={makeProfile({ status: 'stopped' })}
        onToggle={onToggle}
        onEdit={onEdit}
        onClone={onClone}
        onDelete={onDelete}
        onSync={onSync}
        onViewLogs={onViewLogs}
        onDiagnose={vi.fn()}
        onRepairCore={vi.fn()}
      />
    );

    // 1. 唯一主按钮
    const startBtn = screen.getByRole('button', { name: '启动连接' });
    expect(startBtn).toBeInTheDocument();
    await user.click(startBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    // 2. 依次测试更多操作下拉菜单中的 5 个次级操作
    // 2.1 编辑配置
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByText('编辑配置'));
    expect(onEdit).toHaveBeenCalledTimes(1);

    // 2.2 查看日志
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByText('查看日志'));
    expect(onViewLogs).toHaveBeenCalledTimes(1);

    // 2.3 扫码分享
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByText('扫码分享'));
    expect(onSync).toHaveBeenCalledTimes(1);

    // 2.4 克隆副本
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByText('克隆副本'));
    expect(onClone).toHaveBeenCalledTimes(1);

    // 2.5 删除连接
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    await user.click(screen.getByText('删除连接'));
    expect(onDelete).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('运行中状态显示“停止连接”主操作', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    render(
      <ProfileCard
        profile={makeProfile({ status: 'running' })}
        onToggle={onToggle}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={vi.fn()}
        onRepairCore={vi.fn()}
      />
    );

    const stopBtn = screen.getByRole('button', { name: '停止连接' });
    expect(stopBtn).toBeInTheDocument();
    await user.click(stopBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('启动中状态显示“启动中...”且按钮处于禁用状态', () => {
    render(
      <ProfileCard
        profile={makeProfile({ status: 'starting' })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={vi.fn()}
        onRepairCore={vi.fn()}
      />
    );

    const startingBtn = screen.getByRole('button', { name: /启动中/ });
    expect(startingBtn).toBeInTheDocument();
    expect(startingBtn).toBeDisabled();
  });

  it('停止中状态显示“停止中...”且按钮处于禁用状态', () => {
    render(
      <ProfileCard
        profile={makeProfile({ status: 'stopping' })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={vi.fn()}
        onRepairCore={vi.fn()}
      />
    );

    const stoppingBtn = screen.getByRole('button', { name: /停止中/ });
    expect(stoppingBtn).toBeInTheDocument();
    expect(stoppingBtn).toBeDisabled();
  });

  it('core_invalid 核心校验失败时主按钮显示“修复 FRPC 核心”，点击触发 onRepairCore 且不触发 onDiagnose', async () => {
    const user = userEvent.setup();
    const onRepairCore = vi.fn();
    const onDiagnose = vi.fn();

    render(
      <ProfileCard
        profile={makeProfile({
          status: 'error',
          stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '核心程序校验失败', lastFailureKind: 'core_invalid' },
        })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={onDiagnose}
        onRepairCore={onRepairCore}
      />
    );

    const repairBtn = screen.getByRole('button', { name: '修复 FRPC 核心' });
    expect(repairBtn).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '立即排查' })).not.toBeInTheDocument();
    await user.click(repairBtn);
    expect(onRepairCore).toHaveBeenCalledTimes(1);
    expect(onDiagnose).not.toHaveBeenCalled();
  });

  it('early_exit、startup 或未知错误时主按钮显示“查看启动日志”，点击触发 onViewLogs', async () => {
    const user = userEvent.setup();
    const onViewLogs = vi.fn();
    const onDiagnose = vi.fn();

    const { unmount } = render(
      <ProfileCard
        profile={makeProfile({
          status: 'error',
          stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '启动早退', lastFailureKind: 'early_exit' },
        })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={onViewLogs}
        onDiagnose={onDiagnose}
        onRepairCore={vi.fn()}
      />
    );

    const viewLogsBtn = screen.getByRole('button', { name: '查看启动日志' });
    expect(viewLogsBtn).toBeInTheDocument();
    await user.click(viewLogsBtn);
    expect(onViewLogs).toHaveBeenCalledTimes(1);
    expect(onDiagnose).not.toHaveBeenCalled();
    unmount();

    // 未知错误 (没有 lastFailureKind) 也回退到查看启动日志
    const onViewLogsFallback = vi.fn();
    render(
      <ProfileCard
        profile={makeProfile({
          status: 'error',
          stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '未知错误' },
        })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={onViewLogsFallback}
        onDiagnose={vi.fn()}
        onRepairCore={vi.fn()}
      />
    );

    const fallbackBtn = screen.getByRole('button', { name: '查看启动日志' });
    expect(fallbackBtn).toBeInTheDocument();
    await user.click(fallbackBtn);
    expect(onViewLogsFallback).toHaveBeenCalledTimes(1);
  });

  it('网络连通性检测保留在“更多操作”中，且不会成为错误状态的主操作', async () => {
    const user = userEvent.setup();
    const onDiagnose = vi.fn();

    render(
      <ProfileCard
        profile={makeProfile({
          status: 'error',
          stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '核心程序校验失败', lastFailureKind: 'core_invalid' },
        })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={onDiagnose}
        onRepairCore={vi.fn()}
      />
    );

    // 主按钮不是网络连通性检测或立即排查
    expect(screen.queryByRole('button', { name: '网络连通性检测' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '立即排查' })).not.toBeInTheDocument();

    // 打开更多操作菜单
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    const netCheckItem = screen.getByText('网络连通性检测');
    expect(netCheckItem).toBeInTheDocument();
    await user.click(netCheckItem);
    expect(onDiagnose).toHaveBeenCalledTimes(1);
  });

  it('core_invalid 错误卡上不存在“测速”或其他直接网络探测按钮；打开“更多操作”后才存在“网络连通性检测”，点击后才调用 onDiagnose', async () => {
    const user = userEvent.setup();
    const onDiagnose = vi.fn();
    const onRepairCore = vi.fn();

    render(
      <ProfileCard
        profile={makeProfile({
          status: 'error',
          stats: { bytesIn: 0, bytesOut: 0, curConns: 0, uptimeSeconds: 0, lastError: '核心程序校验失败', lastFailureKind: 'core_invalid' },
        })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={onDiagnose}
        onRepairCore={onRepairCore}
      />
    );

    // 1. core_invalid 错误卡上绝对不存在“测速”按钮或直接网络探测按钮
    expect(screen.queryByRole('button', { name: /测速/ })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/测速/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '网络连通性检测' })).not.toBeInTheDocument();

    // 2. 主按钮必须是修复 FRPC 核心
    const repairBtn = screen.getByRole('button', { name: '修复 FRPC 核心' });
    expect(repairBtn).toBeInTheDocument();

    // 3. 打开“更多操作”后才存在“网络连通性检测”
    await user.click(screen.getByRole('button', { name: '更多操作' }));
    const netCheckItem = screen.getByText('网络连通性检测');
    expect(netCheckItem).toBeInTheDocument();

    // 4. 点击后才调用 onDiagnose
    await user.click(netCheckItem);
    expect(onDiagnose).toHaveBeenCalledTimes(1);
  });

  it('运行中的连接显示代理警告但保留运行中主状态', () => {
    render(
      <ProfileCard
        profile={makeProfile({
          status: 'running',
          stats: {
            bytesIn: 0,
            bytesOut: 0,
            curConns: 0,
            uptimeSeconds: 0,
            pid: 8123,
            lastWarning: '远程端口 8009 已被占用',
          },
        })}
        onToggle={vi.fn()}
        onEdit={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        onSync={vi.fn()}
        onViewLogs={vi.fn()}
        onDiagnose={vi.fn()}
        onRepairCore={vi.fn()}
      />
    );
    expect(screen.getByText(/运行中 \(PID: 8123\)/)).toBeInTheDocument();
    expect(screen.getByText(/远程端口 8009 已被占用/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '停止连接' })).toBeInTheDocument();
    expect(screen.queryByText('正在启动...')).not.toBeInTheDocument();
  });
});
