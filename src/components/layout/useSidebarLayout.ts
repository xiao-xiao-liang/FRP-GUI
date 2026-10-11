import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

const STORAGE_KEY = 'frp_gui_sidebar_layout';
const DEFAULT_WIDTH = 224;
const COLLAPSED_WIDTH = 56;
const MIN_WIDTH = 200;
const MAX_WIDTH = 320;
const MIN_CONTENT_WIDTH = 560;

interface SidebarPreferences {
  collapsed: boolean;
  expandedWidth: number;
}

interface SidebarDrag {
  initialWidth: number;
  width: number;
  cleanup: () => void;
}

function clampWidth(width: number, maximum = MAX_WIDTH): number {
  return Math.max(MIN_WIDTH, Math.min(maximum, Math.round(width)));
}

function getMaxWidth(viewportWidth: number): number {
  return clampWidth(viewportWidth - MIN_CONTENT_WIDTH);
}

function loadPreferences(): SidebarPreferences {
  const defaults = { collapsed: false, expandedWidth: DEFAULT_WIDTH };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaults;
    const stored = parsed as Partial<SidebarPreferences>;
    return {
      collapsed: typeof stored.collapsed === 'boolean' ? stored.collapsed : defaults.collapsed,
      expandedWidth: typeof stored.expandedWidth === 'number' && Number.isFinite(stored.expandedWidth)
        ? clampWidth(stored.expandedWidth)
        : defaults.expandedWidth,
    };
  } catch (error) {
    console.warn('无法恢复侧边栏布局，使用默认布局', error);
    return defaults;
  }
}

export function useSidebarLayout() {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragRef = useRef<SidebarDrag | null>(null);
  const maxWidth = getMaxWidth(viewportWidth);
  const expandedWidth = clampWidth(dragWidth ?? preferences.expandedWidth, maxWidth);

  const finishDrag = useCallback((save: boolean) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    drag.cleanup();
    setDragWidth(null);
    if (save && drag.width !== drag.initialWidth) {
      setPreferences((previous) => ({ ...previous, expandedWidth: drag.width }));
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      // 布局偏好保存失败不影响当前窗口操作，并保留可诊断的失败原因。
      console.warn('无法保存侧边栏布局，本次调整仅在当前窗口生效', error);
    }
  }, [preferences]);

  useEffect(() => {
    const handleResize = () => {
      finishDrag(false);
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      const drag = dragRef.current;
      dragRef.current = null;
      drag?.cleanup();
    };
  }, [finishDrag]);

  const onToggleCollapse = useCallback(() => {
    finishDrag(false);
    setPreferences((previous) => ({ ...previous, collapsed: !previous.collapsed }));
  }, [finishDrag]);

  const onResetWidth = useCallback(() => {
    finishDrag(false);
    setPreferences((previous) => ({ ...previous, expandedWidth: DEFAULT_WIDTH }));
  }, [finishDrag]);

  const onResizeStart = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (preferences.collapsed || event.button !== 0 || dragRef.current) return;
    event.preventDefault();

    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = expandedWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    let frame: number | null = null;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (moveEvent.pointerId !== pointerId || !drag) return;
      drag.width = clampWidth(startWidth + moveEvent.clientX - startX, getMaxWidth(window.innerWidth));
      // 一帧内只更新一次布局，拖动过程不写入本地存储。
      if (frame === null) {
        frame = window.requestAnimationFrame(() => {
          frame = null;
          if (dragRef.current === drag) setDragWidth(drag.width);
        });
      }
    };
    const handleUp = (upEvent: globalThis.PointerEvent) => {
      if (upEvent.pointerId === pointerId) finishDrag(true);
    };
    const handleCancel = (cancelEvent: globalThis.PointerEvent) => {
      if (cancelEvent.pointerId === pointerId) finishDrag(false);
    };
    const handleBlur = () => finishDrag(true);
    const handleKeyDown = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        finishDrag(false);
      }
    };

    dragRef.current = {
      initialWidth: startWidth,
      width: startWidth,
      cleanup: () => {
        if (frame !== null) window.cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        window.removeEventListener('pointercancel', handleCancel);
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('keydown', handleKeyDown);
        handle.removeEventListener('lostpointercapture', handleCancel);
        if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
      },
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown);
    handle.addEventListener('lostpointercapture', handleCancel);
    handle.setPointerCapture?.(pointerId);
    setDragWidth(startWidth);
  }, [preferences.collapsed, expandedWidth, finishDrag]);

  const onResizeKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (preferences.collapsed || dragRef.current) return;
    const step = event.shiftKey ? 32 : 8;
    let nextWidth: number;
    switch (event.key) {
      case 'ArrowLeft': nextWidth = expandedWidth - step; break;
      case 'ArrowRight': nextWidth = expandedWidth + step; break;
      case 'Home': nextWidth = MIN_WIDTH; break;
      case 'End': nextWidth = maxWidth; break;
      case 'Enter':
        event.preventDefault();
        onResetWidth();
        return;
      default: return;
    }
    event.preventDefault();
    setPreferences((previous) => ({ ...previous, expandedWidth: clampWidth(nextWidth, maxWidth) }));
  }, [preferences.collapsed, expandedWidth, maxWidth, onResetWidth]);

  return {
    collapsed: preferences.collapsed,
    width: preferences.collapsed ? COLLAPSED_WIDTH : expandedWidth,
    maxWidth,
    isResizing: dragWidth !== null,
    onToggleCollapse,
    onResizeStart,
    onResizeKeyDown,
    onResetWidth,
  };
}
