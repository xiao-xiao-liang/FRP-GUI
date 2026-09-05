// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

describe('全局数字输入框样式', () => {
  it('隐藏 Chromium/WebKit 和 Firefox 的微调箭头但不改变 number 类型', () => {
    expect(css).toContain('input[type="number"]');
    expect(css).toContain('appearance: textfield');
    expect(css).toContain('-moz-appearance: textfield');
    expect(css).toContain('input[type="number"]::-webkit-inner-spin-button');
    expect(css).toContain('input[type="number"]::-webkit-outer-spin-button');
    expect(css).toContain('-webkit-appearance: none');
  });
});
