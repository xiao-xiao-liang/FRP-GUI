import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileTagEditor } from './ProfileTagEditor';

afterEach(cleanup);

describe('ProfileTagEditor', () => {
  it('渲染已有标签并支持删除指定标签', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProfileTagEditor tags={['开发', '测试']} onChange={onChange} />);

    expect(screen.getByText('开发')).toBeInTheDocument();
    expect(screen.getByText('测试')).toBeInTheDocument();
    expect(screen.getByText('2/10')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: '删除标签 开发' });
    await user.click(deleteBtn);

    expect(onChange).toHaveBeenCalledWith(['测试']);
  });

  it('添加合法标签：自动去除首尾空白并清空输入框', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProfileTagEditor tags={['现有']} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/输入标签名称/);
    await user.type(input, '  新标签  ');
    await user.click(screen.getByRole('button', { name: '添加标签' }));

    expect(onChange).toHaveBeenCalledWith(['现有', '新标签']);
  });

  it('按回车键可直接添加标签', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProfileTagEditor tags={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/输入标签名称/);
    await user.type(input, '回车标签{Enter}');

    expect(onChange).toHaveBeenCalledWith(['回车标签']);
  });

  it('校验规则：空标签、超长标签、大小写重复和超过 10 项均被拦截并给出提示', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<ProfileTagEditor tags={['Web']} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/输入标签名称/);
    const addBtn = screen.getByRole('button', { name: '添加标签' });

    // 1. 空标签
    await user.click(addBtn);
    expect(screen.getByText('标签内容不能为空')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    // 2. 超长标签 (> 24)
    await user.type(input, 'A'.repeat(25));
    await user.click(addBtn);
    expect(screen.getByText('标签长度不能超过 24 个字符')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    // 3. 大小写不敏感查重
    await user.clear(input);
    await user.type(input, 'web');
    await user.click(addBtn);
    expect(screen.getByText('该标签已存在（不区分大小写）')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    // 4. 达到 10 项上限时输入框与添加按钮均被禁用
    rerender(
      <ProfileTagEditor
        tags={Array.from({ length: 10 }, (_, i) => `Tag-${i}`)}
        onChange={onChange}
      />
    );
    expect(screen.getByPlaceholderText('已达 10 个标签上限')).toBeDisabled();
    expect(screen.getByRole('button', { name: '添加标签' })).toBeDisabled();
  });
});
