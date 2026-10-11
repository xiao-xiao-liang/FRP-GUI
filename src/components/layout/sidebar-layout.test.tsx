import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from './AppSidebar';
import { useSidebarLayout } from './useSidebarLayout';

const STORAGE_KEY = 'frp_gui_sidebar_layout';

function SidebarHarness() {
  const layout = useSidebarLayout();
  return (
    <AppSidebar
      {...layout}
      currentNav="profiles"
      profileCount={3}
      serverNodeCount={1}
      isDesktop={false}
      onNavigate={() => undefined}
    />
  );
}

function saveLayout(collapsed: boolean, expandedWidth: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed, expandedWidth }));
}

function storedLayout() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

function sidebar() {
  return screen.getByRole('complementary', { name: '应用侧边栏' });
}

function resizeHandle() {
  return screen.getByRole('separator', { name: '调整侧边栏宽度' });
}

function expectWidth(width: number) {
  expect(sidebar()).toHaveStyle({ width: `${width}px` });
}

function pointer(target: Element | Window, type: string, clientX: number, pointerId = 1) {
  // jsdom 缺少 PointerEvent 时，保留鼠标坐标并补充当前指针标识。
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  fireEvent(target, event);
}

function controlAnimationFrames() {
  const pending = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const frame = nextFrame++;
    pending.set(frame, callback);
    return frame;
  });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => {
    pending.delete(frame);
  });
  return {
    request,
    cancel,
    pending,
    flush() {
      act(() => {
        const callbacks = [...pending.values()];
        pending.clear();
        callbacks.forEach((callback) => callback(0));
      });
    },
  };
}

let viewportDescriptor: PropertyDescriptor | undefined;
let originalCursor: string;
let originalUserSelect: string;

beforeEach(() => {
  viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1100 });
  originalCursor = document.body.style.cursor;
  originalUserSelect = document.body.style.userSelect;
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (viewportDescriptor) Object.defineProperty(window, 'innerWidth', viewportDescriptor);
  document.body.style.cursor = originalCursor;
  document.body.style.userSelect = originalUserSelect;
  localStorage.clear();
});

describe('侧边栏布局交互', () => {
  it('恢复保存的收起状态，展开和重新挂载后保留上次宽度', () => {
    saveLayout(true, 288);
    const view = render(<SidebarHarness />);

    expectWidth(56);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '展开侧边栏' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: '展开侧边栏' }));
    expectWidth(288);
    expect(resizeHandle()).toHaveAttribute('aria-valuenow', '288');
    expect(storedLayout()).toEqual({ collapsed: false, expandedWidth: 288 });

    view.unmount();
    render(<SidebarHarness />);
    expectWidth(288);
    fireEvent.click(screen.getByRole('button', { name: '收起侧边栏' }));
    expectWidth(56);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
    expect(storedLayout()).toEqual({ collapsed: true, expandedWidth: 288 });
    fireEvent.click(screen.getByRole('button', { name: '展开侧边栏' }));
    expectWidth(288);
  });

  it('只处理当前指针，合并拖动帧并在结束时保存限制范围内的最终宽度', () => {
    const frames = controlAnimationFrames();
    render(<SidebarHarness />);
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    pointer(resizeHandle(), 'pointerdown', 224, 7);

    pointer(window, 'pointermove', 500, 8);
    pointer(window, 'pointerup', 500, 8);
    pointer(window, 'pointercancel', 500, 8);
    expect(frames.pending.size).toBe(0);
    expect(document.body.style.cursor).toBe('col-resize');

    pointer(window, 'pointermove', 260, 7);
    pointer(window, 'pointermove', 300, 7);
    expect(frames.request).toHaveBeenCalledTimes(1);
    expectWidth(224);
    frames.flush();
    expectWidth(300);

    pointer(window, 'pointermove', 0, 7);
    frames.flush();
    expectWidth(200);
    pointer(window, 'pointermove', 1000, 7);
    frames.flush();
    expectWidth(320);
    expect(storageWrite).not.toHaveBeenCalled();

    // 结束前尚未渲染的新坐标，也必须作为最终偏好保存。
    pointer(window, 'pointermove', 312, 7);
    pointer(window, 'pointerup', 312, 7);
    expectWidth(312);
    expect(storedLayout()).toEqual({ collapsed: false, expandedWidth: 312 });
    expect(storageWrite).toHaveBeenCalledTimes(1);
    expect(frames.pending.size).toBe(0);
    expect(document.body.style.cursor).toBe(originalCursor);
    expect(document.body.style.userSelect).toBe(originalUserSelect);
  });

  it('支持方向键及 Shift 步长、Home/End、Enter 和双击重置', () => {
    render(<SidebarHarness />);
    const handle = resizeHandle();

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expectWidth(232);
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    expectWidth(264);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expectWidth(256);
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
    expectWidth(224);
    fireEvent.keyDown(handle, { key: 'Home' });
    expectWidth(200);
    fireEvent.keyDown(handle, { key: 'End' });
    expectWidth(320);
    fireEvent.keyDown(handle, { key: 'Enter' });
    expectWidth(224);
    fireEvent.keyDown(handle, { key: 'End' });
    fireEvent.doubleClick(handle);
    expectWidth(224);
    expect(storedLayout()).toEqual({ collapsed: false, expandedWidth: 224 });
  });

  it('指针取消和 Escape 恢复原宽度，窗口失焦提交最终宽度并恢复页面状态', () => {
    const frames = controlAnimationFrames();
    saveLayout(false, 280);
    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'text';
    render(<SidebarHarness />);
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');

    for (const cancellation of ['pointercancel', 'Escape']) {
      pointer(resizeHandle(), 'pointerdown', 280);
      pointer(window, 'pointermove', 320);
      frames.flush();
      expectWidth(320);
      if (cancellation === 'Escape') fireEvent.keyDown(window, { key: 'Escape' });
      else pointer(window, cancellation, 320);

      expectWidth(280);
      expect(storageWrite).not.toHaveBeenCalled();
      expect(storedLayout()).toEqual({ collapsed: false, expandedWidth: 280 });
      expect(document.body.style.cursor).toBe('crosshair');
      expect(document.body.style.userSelect).toBe('text');
    }

    pointer(resizeHandle(), 'pointerdown', 280);
    pointer(window, 'pointermove', 304);
    fireEvent.blur(window);
    expectWidth(304);
    expect(storedLayout()).toEqual({ collapsed: false, expandedWidth: 304 });
    expect(storageWrite).toHaveBeenCalledTimes(1);
    expect(frames.pending.size).toBe(0);
    expect(document.body.style.cursor).toBe('crosshair');
    expect(document.body.style.userSelect).toBe('text');
  });

  it('拖动中卸载会取消待处理帧、移除监听并恢复页面状态', () => {
    const frames = controlAnimationFrames();
    const windowAdd = vi.spyOn(window, 'addEventListener');
    const windowRemove = vi.spyOn(window, 'removeEventListener');
    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'text';
    const view = render(<SidebarHarness />);
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const handle = resizeHandle();
    const handleAdd = vi.spyOn(handle, 'addEventListener');
    const handleRemove = vi.spyOn(handle, 'removeEventListener');
    const releasePointerCapture = vi.fn();
    Object.defineProperties(handle, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: releasePointerCapture },
    });

    pointer(handle, 'pointerdown', 224, 3);
    pointer(window, 'pointermove', 300, 3);
    expect(frames.pending.size).toBe(1);
    const trackedEvents = ['resize', 'pointermove', 'pointerup', 'pointercancel', 'blur', 'keydown'];
    const registeredListeners = windowAdd.mock.calls.filter(([type]) => trackedEvents.includes(type));
    expect(registeredListeners.map(([type]) => type)).toEqual(expect.arrayContaining(trackedEvents));
    const captureListener = handleAdd.mock.calls.find(([type]) => type === 'lostpointercapture')?.[1];
    expect(captureListener).toEqual(expect.any(Function));

    view.unmount();
    expect(frames.cancel).toHaveBeenCalledWith(frames.request.mock.results[0].value);
    expect(frames.pending.size).toBe(0);
    registeredListeners.forEach(([type, listener]) => {
      expect(windowRemove).toHaveBeenCalledWith(type, listener);
    });
    expect(handleRemove).toHaveBeenCalledWith('lostpointercapture', captureListener);
    expect(releasePointerCapture).toHaveBeenCalledWith(3);
    expect(document.body.style.cursor).toBe('crosshair');
    expect(document.body.style.userSelect).toBe('text');

    pointer(window, 'pointermove', 320, 3);
    pointer(window, 'pointerup', 320, 3);
    expect(frames.pending.size).toBe(0);
    expect(storageWrite).not.toHaveBeenCalled();
    expect(storedLayout()).toEqual({ collapsed: false, expandedWidth: 224 });
  });

  it('窄窗口保留正文最小宽度，窗口恢复后还原偏好且不覆盖存储', () => {
    saveLayout(false, 320);
    render(<SidebarHarness />);
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    expectWidth(320);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 860 });
    fireEvent(window, new Event('resize'));
    expectWidth(300);
    expect(resizeHandle()).toHaveAttribute('aria-valuemax', '300');
    expect(window.innerWidth - Number.parseFloat(sidebar().style.width)).toBe(560);
    expect(storedLayout()).toEqual({ collapsed: false, expandedWidth: 320 });
    expect(storageWrite).not.toHaveBeenCalled();

    pointer(resizeHandle(), 'pointerdown', 300);
    pointer(window, 'pointerup', 300);
    expectWidth(300);
    expect(storedLayout()).toEqual({ collapsed: false, expandedWidth: 320 });
    expect(storageWrite).not.toHaveBeenCalled();

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1100 });
    fireEvent(window, new Event('resize'));
    expectWidth(320);
    expect(resizeHandle()).toHaveAttribute('aria-valuemax', '320');
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('窗口变化取消尚未提交的拖动，清理页面状态并保留原宽度偏好', () => {
    const frames = controlAnimationFrames();
    saveLayout(false, 320);
    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'text';
    render(<SidebarHarness />);
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');

    pointer(resizeHandle(), 'pointerdown', 320, 5);
    pointer(window, 'pointermove', 280, 5);
    frames.flush();
    expectWidth(280);
    pointer(window, 'pointermove', 264, 5);
    expect(frames.pending.size).toBe(1);

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 860 });
    fireEvent(window, new Event('resize'));
    expectWidth(300);
    expect(frames.pending.size).toBe(0);
    expect(document.body.style.cursor).toBe('crosshair');
    expect(document.body.style.userSelect).toBe('text');
    expect(storedLayout()).toEqual({ collapsed: false, expandedWidth: 320 });
    expect(storageWrite).not.toHaveBeenCalled();

    pointer(window, 'pointerup', 264, 5);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1100 });
    fireEvent(window, new Event('resize'));
    expectWidth(320);
    expect(storedLayout()).toEqual({ collapsed: false, expandedWidth: 320 });
    expect(storageWrite).not.toHaveBeenCalled();
  });
});
