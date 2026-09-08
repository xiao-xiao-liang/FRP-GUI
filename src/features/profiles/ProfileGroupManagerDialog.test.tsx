import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileGroupManagerDialog } from './ProfileGroupManagerDialog';
import type { ProfileGroup } from '../../types/frp';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('ProfileGroupManagerDialog', () => {
  const initialGroups: ProfileGroup[] = [
    { id: 'g-1', name: '办公连接', createdAt: 100, updatedAt: 100 },
    { id: 'g-2', name: '家庭设备', createdAt: 200, updatedAt: 200 },
  ];

  it('渲染分组列表并在输入合法名称时触发创建', async () => {
    const onCreateGroup = vi.fn();
    const user = userEvent.setup();

    render(
      <ProfileGroupManagerDialog
        visible={true}
        groups={initialGroups}
        onClose={vi.fn()}
        onCreateGroup={onCreateGroup}
        onRenameGroup={vi.fn()}
        onDeleteGroup={vi.fn()}
      />
    );

    expect(screen.getByText('办公连接')).toBeInTheDocument();
    expect(screen.getByText('家庭设备')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('输入新分组名称');
    await user.type(input, '  游戏服务器  ');
    await user.click(screen.getByRole('button', { name: '添加分组' }));

    expect(onCreateGroup).toHaveBeenCalledWith('游戏服务器');
  });

  it('校验空名称、超长名称和重名并给出明确提示', async () => {
    const onCreateGroup = vi.fn();
    const user = userEvent.setup();

    render(
      <ProfileGroupManagerDialog
        visible={true}
        groups={initialGroups}
        onClose={vi.fn()}
        onCreateGroup={onCreateGroup}
        onRenameGroup={vi.fn()}
        onDeleteGroup={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText('输入新分组名称');
    const addBtn = screen.getByRole('button', { name: '添加分组' });

    // 空名称
    await user.click(addBtn);
    expect(screen.getByText('分组名称不能为空')).toBeInTheDocument();
    expect(onCreateGroup).not.toHaveBeenCalled();

    // 重名 (忽略大小写)
    await user.type(input, '办公连接');
    await user.click(addBtn);
    expect(screen.getByText('该分组名称已存在（不区分大小写）')).toBeInTheDocument();
    expect(onCreateGroup).not.toHaveBeenCalled();

    // 超长名称 (> 30)
    await user.clear(input);
    await user.type(input, 'A'.repeat(31));
    await user.click(addBtn);
    expect(screen.getByText('分组名称不能超过 30 个字符')).toBeInTheDocument();
    expect(onCreateGroup).not.toHaveBeenCalled();
  });

  it('支持重命名现有分组并校验', async () => {
    const onRenameGroup = vi.fn();
    const user = userEvent.setup();

    render(
      <ProfileGroupManagerDialog
        visible={true}
        groups={initialGroups}
        onClose={vi.fn()}
        onCreateGroup={vi.fn()}
        onRenameGroup={onRenameGroup}
        onDeleteGroup={vi.fn()}
      />
    );

    // 点击“办公连接”那一行的重命名按钮
    const row = screen.getByText('办公连接').closest('li')!;
    await user.click(within(row).getByRole('button', { name: '重命名' }));

    const editInput = within(row).getByDisplayValue('办公连接');
    await user.clear(editInput);
    await user.type(editInput, '家庭设备'); // 与已存在的另一组重名
    await user.click(within(row).getByRole('button', { name: '保存' }));

    expect(screen.getByText('该分组名称已存在（不区分大小写）')).toBeInTheDocument();
    expect(onRenameGroup).not.toHaveBeenCalled();

    // 改为合法新名称
    await user.clear(editInput);
    await user.type(editInput, '公司网络');
    await user.click(within(row).getByRole('button', { name: '保存' }));

    expect(onRenameGroup).toHaveBeenCalledWith('g-1', '公司网络');
  });

  it('删除分组前弹出确认提示，确认后触发删除回调', async () => {
    const onDeleteGroup = vi.fn();
    const user = userEvent.setup();

    render(
      <ProfileGroupManagerDialog
        visible={true}
        groups={initialGroups}
        onClose={vi.fn()}
        onCreateGroup={vi.fn()}
        onRenameGroup={vi.fn()}
        onDeleteGroup={onDeleteGroup}
      />
    );

    const row = screen.getByText('办公连接').closest('li')!;
    await user.click(within(row).getByRole('button', { name: '删除' }));

    // 弹出确认对话框
    expect(screen.getByText(/确定要删除分组“办公连接”吗/)).toBeInTheDocument();

    // 点击确认删除
    const confirmBtn = screen.getByRole('button', { name: '确认删除' });
    await user.click(confirmBtn);

    expect(onDeleteGroup).toHaveBeenCalledWith('g-1');
  });
});
