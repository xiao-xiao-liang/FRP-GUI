import React, { useEffect, useState, useRef, useCallback } from "react";
import { createRoot, Root } from "react-dom/client";

/** 飞书 Toast 支持的语义类型 */
export type FeishuToastType = "success" | "error" | "warning" | "info" | "loading";

export interface FeishuToastOptions {
  /** 唯一标识符（可选，不传则自动生成） */
  id?: string;
  /** Toast 显示内容或自定义节点 */
  content: React.ReactNode;
  /** 语义类型，默认为 'info' */
  type?: FeishuToastType;
  /** 停留持续时间（毫秒），设为 0 则不自动关闭；loading 默认为 0，其它默认为 3000ms */
  duration?: number;
  /** 是否允许鼠标悬浮时暂停倒计时，默认为 true */
  pauseOnHover?: boolean;
  /** 是否显示右侧关闭按钮，默认为 false */
  closable?: boolean;
  /** 自定义操作区（如右侧链接/按钮） */
  action?: React.ReactNode;
  /** 关闭时的回调函数 */
  onClose?: () => void;
}

export interface FeishuToastItemInternal extends FeishuToastOptions {
  id: string;
  createdAt: number;
  remainingTime: number;
  isExiting: boolean;
}

/** 飞书 Universe Design (UD) 像素级颜色与样式映射 */
const TOAST_THEME_MAP: Record<
  FeishuToastType,
  {
    bg: string;
    border: string;
    iconColor: string;
  }
> = {
  success: {
    bg: "bg-[#E4FAE1]", // --function-success-fill-solid-01: rgb(228, 250, 225)
    border: "border-[#32A645]", // --function-success-content-default: rgb(50, 166, 69)
    iconColor: "text-[#32A645]",
  },
  error: {
    bg: "bg-[#FEF1F1]", // --function-danger-fill-solid-01: rgb(254, 241, 241)
    border: "border-[#F54A45]", // --function-danger-content-default: rgb(245, 74, 69)
    iconColor: "text-[#F54A45]",
  },
  warning: {
    bg: "bg-[#FFF3E5]", // --function-warning-fill-solid-01: rgb(255, 243, 229)
    border: "border-[#ED6D0C]", // --function-warning-content-default: rgb(237, 109, 12)
    iconColor: "text-[#ED6D0C]",
  },
  info: {
    bg: "bg-[#F0F4FF]", // --function-info-fill-solid-01: rgb(240, 244, 255)
    border: "border-[#1456F0]", // --function-info-content-default: rgb(20, 86, 240)
    iconColor: "text-[#1456F0]",
  },
  loading: {
    bg: "bg-[#F0F4FF]",
    border: "border-[#3370FF]",
    iconColor: "text-[#3370FF]",
  },
};

/** 飞书 Universe 官方 16x16 矢量状态图标 */
export const FeishuToastIcons = {
  Success: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path
        d="M11.996 22.98c-6.067 0-10.983-4.918-10.983-10.984S5.93 1.013 11.996 1.013c6.066 0 10.983 4.917 10.983 10.983 0 6.066-4.917 10.984-10.983 10.984Z"
        fill="currentColor"
      />
      <path
        d="M17.537 10.746a1.38 1.38 0 0 0-.005-1.95 1.378 1.378 0 0 0-1.95-.005l-4.89 4.89-2.285-2.285a1.375 1.375 0 0 0-1.942.012 1.373 1.373 0 0 0-.013 1.942c1.178 1.175 2.356 2.348 3.53 3.528.392.394 1.03.394 1.422 0 2.037-2.051 4.087-4.09 6.133-6.132Z"
        fill="#FFFFFF"
      />
    </svg>
  ),
  Error: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path
        d="M12 23C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Z"
        fill="currentColor"
      />
      <path
        d="M7.465 8.879 10.585 12l-3.12 3.121a1 1 0 1 0 1.414 1.414L12 13.415l3.121 3.12a1 1 0 1 0 1.415-1.414L13.414 12l3.122-3.121a1 1 0 0 0-1.415-1.415l-3.12 3.122-3.122-3.122A1 1 0 0 0 7.465 8.88Z"
        fill="#FFFFFF"
      />
    </svg>
  ),
  Warning: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path
        d="M12 23C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Z"
        fill="currentColor"
      />
      <path
        d="M12 6a1.25 1.25 0 0 0-1.25 1.25v6a1.25 1.25 0 0 0 2.5 0v-6A1.25 1.25 0 0 0 12 6Zm0 10.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Z"
        fill="#FFFFFF"
      />
    </svg>
  ),
  Info: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <path
        d="M12 23C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Z"
        fill="currentColor"
      />
      <path
        d="M12 6a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5Zm-1.25 5a1.25 1.25 0 0 1 2.5 0v5.5a1.25 1.25 0 0 1-2.5 0V11Z"
        fill="#FFFFFF"
      />
    </svg>
  ),
  Loading: () => (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className="shrink-0 animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="42 15"
      />
    </svg>
  ),
  Close: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
};

interface ToastItemProps {
  item: FeishuToastItemInternal;
  onDismiss: (id: string) => void;
}

/** 单个飞书 Toast 卡片视图 */
const FeishuToastItemView: React.FC<ToastItemProps> = ({ item, onDismiss }) => {
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const remainingTimeRef = useRef<number>(
    item.duration !== undefined ? item.duration : item.type === "loading" ? 0 : 3000
  );

  const theme = TOAST_THEME_MAP[item.type || "info"];

  const startTimer = useCallback(() => {
    if (remainingTimeRef.current <= 0) return;
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      onDismiss(item.id);
    }, remainingTimeRef.current);
  }, [item.id, onDismiss]);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      const elapsed = Date.now() - startTimeRef.current;
      remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
    }
  }, []);

  useEffect(() => {
    // 触发入场动画
    const enterRaf = requestAnimationFrame(() => setMounted(true));
    startTimer();

    return () => {
      cancelAnimationFrame(enterRaf);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startTimer]);

  const handleMouseEnter = () => {
    if (item.pauseOnHover !== false) {
      pauseTimer();
    }
  };

  const handleMouseLeave = () => {
    if (item.pauseOnHover !== false) {
      startTimer();
    }
  };

  return (
    <div
      className={`ud__msg-manager-item flex justify-center w-full ${
        item.isExiting ? "overflow-hidden pointer-events-none" : ""
      }`}
      style={{
        maxHeight: item.isExiting ? 0 : 200,
        marginBottom: item.isExiting ? 0 : 16,
        opacity: item.isExiting ? 0 : mounted ? 1 : 0,
        transform: item.isExiting
          ? "translateY(-8px) scale(0.96)"
          : mounted
          ? "translateY(0)"
          : "translateY(-100%)",
        transitionProperty: "opacity, transform, max-height, margin-bottom",
        transitionDuration: item.isExiting ? "200ms, 200ms, 280ms, 280ms" : "300ms",
        transitionTimingFunction: "cubic-bezier(0.34, 0.69, 0.1, 1)",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Toast 实体卡片 */}
      <div
        role="alert"
        className={`ud__notice ud__toast overflow-hidden pointer-events-auto inline-flex items-center text-left max-w-[600px] rounded-[6px] border ${theme.bg} ${theme.border} text-[#1F2329] font-medium text-[14px] leading-[22px] tabular-nums select-none`}
        style={{
          padding: "15px 3px 15px 19px",
          boxShadow:
            "0px 8px 24px 8px rgba(31, 35, 41, 0.04), 0px 6px 12px 0px rgba(31, 35, 41, 0.04), 0px 4px 8px -8px rgba(31, 35, 41, 0.06)",
          fontFamily:
            'LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Tahoma, "PingFang SC", "Microsoft Yahei", Arial, sans-serif',
        }}
      >
        {/* 状态图标：使用 self-start 配合 mt-[3px] 严格锁定在第一行文本基线，绝对不会在高度收起时下移溢出 */}
        <span
          className={`universe-icon ud__notice__statusIcon mr-[8px] mt-[3px] self-start shrink-0 ${theme.iconColor}`}
        >
          {item.type === "success" && <FeishuToastIcons.Success />}
          {item.type === "error" && <FeishuToastIcons.Error />}
          {item.type === "warning" && <FeishuToastIcons.Warning />}
          {item.type === "info" && <FeishuToastIcons.Info />}
          {item.type === "loading" && <FeishuToastIcons.Loading />}
        </span>

        {/* 消息正文与描述 */}
        <div className="ud__notice__main -mr-[16px] grow flex items-start">
          <div className="ud__notice__description flex flex-wrap items-center justify-between grow">
            <div className="ud__notice__description-content pr-[32px] break-words grow text-[#1F2329]">
              {item.content}
            </div>

            {/* 可选操作项 */}
            {item.action && (
              <div className="ud__notice__action pr-[16px] shrink-0 text-[#3370FF]">
                {item.action}
              </div>
            )}
          </div>
        </div>

        {/* 可选关闭按钮 */}
        {item.closable && (
          <button
            type="button"
            onClick={() => onDismiss(item.id)}
            className="mr-2.5 -ml-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-[#8F959E] hover:bg-[#1F2329]/[0.06] hover:text-[#1F2329] transition-colors cursor-pointer"
            title="关闭"
          >
            <FeishuToastIcons.Close />
          </button>
        )}
      </div>
    </div>
  );
};

// 全局 Toast 状态订阅与单例管理器
type ToastListener = (toasts: FeishuToastItemInternal[]) => void;

class FeishuToastManager {
  private toasts: FeishuToastItemInternal[] = [];
  private listeners: Set<ToastListener> = new Set();
  private containerMounted = false;
  private root: Root | null = null;

  public subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener(this.toasts);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  private ensureContainer() {
    if (typeof window === "undefined" || this.containerMounted) return;

    const existingContainer = document.getElementById("feishu-toast-root-container");
    if (existingContainer) {
      this.containerMounted = true;
      return;
    }

    const div = document.createElement("div");
    div.id = "feishu-toast-root-container";
    document.body.appendChild(div);
    this.root = createRoot(div);
    this.root.render(<FeishuToastContainer />);
    this.containerMounted = true;
  }

  public show(options: FeishuToastOptions): string {
    this.ensureContainer();

    const id = options.id || `feishu-toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const duration =
      options.duration !== undefined
        ? options.duration
        : options.type === "loading"
        ? 0
        : 3000;

    const newItem: FeishuToastItemInternal = {
      ...options,
      id,
      duration,
      createdAt: Date.now(),
      remainingTime: duration,
      isExiting: false,
    };

    // 智能去重：优先匹配明确指定的 ID；若未指定 ID，则自动去重同类型且内容完全相同的活跃 Toast，避免多重调用堆叠
    const existingIndex = this.toasts.findIndex(
      (t) =>
        !t.isExiting &&
        (options.id
          ? t.id === options.id
          : typeof t.content === "string" && t.content === options.content && t.type === options.type)
    );

    if (existingIndex > -1) {
      const existingId = this.toasts[existingIndex].id;
      this.toasts[existingIndex] = {
        ...newItem,
        id: existingId,
      };
      this.notify();
      return existingId;
    }

    this.toasts.push(newItem);
    this.notify();
    return id;
  }

  public dismiss(id?: string) {
    if (!id) {
      // 关闭全部
      this.toasts = this.toasts.map((t) => ({ ...t, isExiting: true }));
      this.notify();
      setTimeout(() => {
        this.toasts.forEach((t) => t.onClose?.());
        this.toasts = [];
        this.notify();
      }, 400);
      return;
    }

    const target = this.toasts.find((t) => t.id === id);
    if (target && !target.isExiting) {
      target.isExiting = true;
      this.notify();

      setTimeout(() => {
        target.onClose?.();
        this.toasts = this.toasts.filter((t) => t.id !== id);
        this.notify();
      }, 400);
    }
  }

  public success(content: React.ReactNode, duration = 3000, onClose?: () => void): string {
    return this.show({ type: "success", content, duration, onClose });
  }

  public error(content: React.ReactNode, duration = 3500, onClose?: () => void): string {
    return this.show({ type: "error", content, duration, onClose });
  }

  public warning(content: React.ReactNode, duration = 3500, onClose?: () => void): string {
    return this.show({ type: "warning", content, duration, onClose });
  }

  public info(content: React.ReactNode, duration = 3000, onClose?: () => void): string {
    return this.show({ type: "info", content, duration, onClose });
  }

  public loading(content: React.ReactNode, onClose?: () => void): () => void {
    const id = this.show({ type: "loading", content, duration: 0, onClose });
    return () => this.dismiss(id);
  }
}

/** 全局单例管理器 */
export const feishuToast = new FeishuToastManager();

/**
 * 飞书 Toast 容器组件（可直接放置在 App 根节点，也支持 feishuToast.show 自动动态注入）
 */
export const FeishuToastContainer: React.FC<{ maxCount?: number }> = ({ maxCount = 5 }) => {
  const [toasts, setToasts] = useState<FeishuToastItemInternal[]>([]);

  useEffect(() => {
    return feishuToast.subscribe((updatedToasts) => {
      setToasts(updatedToasts.slice(-maxCount));
    });
  }, [maxCount]);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="ud__msg-manager ud__msg-manager--top fixed top-[32px] left-0 w-full flex flex-col items-center pointer-events-none z-[9999] px-4 select-none"
    >
      {toasts.map((toast) => (
        <FeishuToastItemView
          key={toast.id}
          item={toast}
          onDismiss={(id) => feishuToast.dismiss(id)}
        />
      ))}
    </div>
  );
};
