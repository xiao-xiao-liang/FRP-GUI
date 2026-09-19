import { describe, expect, it, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FeishuSelect } from './feishu-select';

describe('FeishuSelect', () => {
  afterEach(() => {
    cleanup();
  });

  const options = [
    { value: 'tcp', label: 'TCP 协议', description: '标准可靠传输' },
    { value: 'udp', label: 'UDP 协议', description: '高速报文传输' },
    { value: 'http', label: 'HTTP 协议', description: '超文本传输协议' },
    { value: 'disabled-opt', label: '已禁用协议', disabled: true },
  ];

  it('初始展示选中项或占位符，且浮层默认不渲染', () => {
    render(<FeishuSelect options={options} value="tcp" placeholder="请选择协议" />);
    expect(screen.getByText('TCP 协议')).toBeInTheDocument();
    expect(screen.queryByText('UDP 协议')).toBeNull();
  });

  it('点击后通过 Portal 挂载至 document.body，点击选项后触发 onChange 并关闭', () => {
    const handleChange = vi.fn();
    render(<FeishuSelect options={options} value="tcp" onChange={handleChange} />);

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    // 展开后，浮层中的选项可见且挂载在 body 上
    const option = screen.getByText('UDP 协议');
    expect(option).toBeInTheDocument();
    expect(screen.getByText('高速报文传输')).toBeInTheDocument();

    // 验证挂载至 document.body (Portal 行为)
    const portalMenu = option.closest('[style*="position: fixed"]');
    expect(portalMenu).toBeTruthy();
    expect(document.body.contains(portalMenu)).toBe(true);

    // 点击选择 UDP
    fireEvent.click(option);
    expect(handleChange).toHaveBeenCalledWith('udp');
    expect(screen.queryByText('UDP 协议')).toBeNull();
  });

  it('点击禁用项不触发 onChange 也不关闭', () => {
    const handleChange = vi.fn();
    render(<FeishuSelect options={options} value="tcp" onChange={handleChange} />);

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const disabledOpt = screen.getByText('已禁用协议');
    fireEvent.click(disabledOpt);
    expect(handleChange).not.toHaveBeenCalled();
    expect(screen.getByText('已禁用协议')).toBeInTheDocument();
  });

  it('点击外部区域自动收起下拉浮层', () => {
    render(
      <div>
        <FeishuSelect options={options} value="tcp" />
        <div data-testid="outside-area">外部区域</div>
      </div>
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(screen.getByText('UDP 协议')).toBeInTheDocument();

    // 触发外部点击
    fireEvent.mouseDown(screen.getByTestId('outside-area'));
    expect(screen.queryByText('UDP 协议')).toBeNull();
  });

  it('支持可拆卸清除按钮 (allowClear)', () => {
    const handleChange = vi.fn();
    render(<FeishuSelect options={options} value="tcp" allowClear onChange={handleChange} />);

    // 清除按钮可见
    const clearBtn = screen.getByTitle('清除');
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('支持可拆卸搜索栏 (showSearch) 并在输入时实时过滤', () => {
    render(<FeishuSelect options={options} value="tcp" showSearch searchPlaceholder="搜索协议..." />);

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const searchInput = screen.getByPlaceholderText('搜索协议...');
    expect(searchInput).toBeInTheDocument();

    // 过滤 'udp'
    fireEvent.change(searchInput, { target: { value: 'udp' } });
    expect(screen.getByText('UDP 协议')).toBeInTheDocument();
    expect(screen.queryByText('HTTP 协议')).toBeNull();

    // 过滤无结果展示空提示
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
    expect(screen.getByText('无匹配选项')).toBeInTheDocument();
  });

  it('支持可拆卸插槽 dropdownHeader 与 dropdownFooter', () => {
    render(
      <FeishuSelect
        options={options}
        value="tcp"
        dropdownHeader={<div data-testid="custom-header">常用协议</div>}
        dropdownFooter={<div data-testid="custom-footer">+ 新建协议</div>}
      />
    );

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    expect(screen.getByTestId('custom-header')).toBeInTheDocument();
    expect(screen.getByTestId('custom-footer')).toBeInTheDocument();
  });

  it('支持外观变体 borderless 与 embedded', () => {
    const { rerender } = render(<FeishuSelect options={options} value="tcp" variant="borderless" />);
    let trigger = screen.getByRole('button');
    expect(trigger.className).toContain('border-transparent');

    rerender(<FeishuSelect options={options} value="tcp" variant="embedded" />);
    trigger = screen.getByRole('button');
    expect(trigger.className).toContain('border-transparent');
  });
});
