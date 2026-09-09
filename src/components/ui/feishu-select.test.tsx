import { describe, expect, it, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { FeishuSelect } from './feishu-select';

describe('FeishuSelect', () => {
  afterEach(() => {
    cleanup();
  });

  const options = [
    { value: 'tcp', label: 'TCP 协议' },
    { value: 'udp', label: 'UDP 协议' },
    { value: 'http', label: 'HTTP 协议' },
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

    // 验证挂载至 document.body (Portal 行为)
    const portalMenu = option.closest('[style*="position: fixed"]');
    expect(portalMenu).toBeTruthy();
    expect(document.body.contains(portalMenu)).toBe(true);

    // 点击选择 UDP
    fireEvent.click(option);
    expect(handleChange).toHaveBeenCalledWith('udp');
    expect(screen.queryByText('UDP 协议')).toBeNull();
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
});
