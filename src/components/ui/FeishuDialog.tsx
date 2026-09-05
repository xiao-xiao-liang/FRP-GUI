import React, { useState, useEffect, useRef } from "react";
import { createRoot, Root } from "react-dom/client";

export type FeishuDialogType = "info" | "warning" | "danger" | "success" | "confirm";

export interface FeishuDialogProps {
  /** 是否显示对话框 */
  visible?: boolean;
  /** 语义类型：info (信息提示带蓝标) / danger (删除危险无标题图标，红色按钮) / confirm (通用操作确认) / warning / success */
  type?: FeishuDialogType;
  /** 对话框标题 */
  title?: React.ReactNode;
  /** 对话框正文内容 */
  content?: React.ReactNode;
  /** 子节点内容（与 content 作用相同） */
  children?: React.ReactNode;
  /** 是否在标题左侧显示状态图标。默认仅 info / warning / success 显示，danger 和 confirm 默认无图标 */
  showIcon?: boolean;
  /** 自定义状态图标 */
  icon?: React.ReactNode;
  /** 对话框宽度，飞书标准默认 420px */
  width?: number | string;
  /** 确认按钮文字，默认 '确定'（danger 类型默认为 '删除'） */
  okText?: string;
  /** 取消按钮文字，默认 '取消' */
  cancelText?: string;
  /** 是否显示取消按钮，默认 true（info 类型默认 false） */
  showCancel?: boolean;
  /** 是否显示右上角关闭 ✕ 按钮，默认 true */
  closable?: boolean;
  /** 点击遮罩层是否允许关闭，默认 true */
  maskClosable?: boolean;
  /** 是否在按下 ESC 键时关闭，默认 true */
  keyboard?: boolean;
  /** 确认按钮是否为高危红色按钮，默认由 type === 'danger' 决定 */
  danger?: boolean;
  /** 自定义底部操作栏（传 null 则隐藏 footer） */
  footer?: React.ReactNode;
  /** 确认回调（支持返回 Promise 自动进入 loading 态） */
  onOk?: () => void | Promise<any>;
  /** 取消/关闭回调 */
  onCancel?: () => void;
  /** 对话框彻底销毁后的回调 */
  afterClose?: () => void;
}

export interface FeishuDialogOptions extends Omit<FeishuDialogProps, "visible"> {
  /** 唯一标识（可选） */
  id?: string;
}

/** 飞书 Universe 官方矢量图标资产 (16x16 / 20x20) */
export const FeishuDialogIcons = {
  Info: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#3370FF]">
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
  Warning: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#ED6D0C]">
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
  Success: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#32A645]">
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
  Close: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20.207 20.207a.99.99 0 0 0 .003-1.403L13.406 12l6.804-6.804a.99.99 0 0 0-.003-1.403.99.99 0 0 0-1.403-.003L12 10.594 5.196 3.79a.99.99 0 0 0-1.403.003.99.99 0 0 0-.003 1.403L10.594 12 3.79 18.804a.99.99 0 0 0 .003 1.403.99.99 0 0 0 1.403.003L12 13.406l6.804 6.804a.99.99 0 0 0 1.403-.003Z"
        fill="currentColor"
      />
    </svg>
  ),
};

/**
 * 飞书 Universe Design (UD) 官方标准模态对话框 (FeishuDialog)
 */
export const FeishuDialog: React.FC<FeishuDialogProps> = ({
  visible = false,
  type = "confirm",
  title,
  content,
  children,
  showIcon,
  icon,
  width = 420,
  okText,
  cancelText = "取消",
  showCancel,
  closable = true,
  maskClosable = true,
  keyboard = true,
  danger,
  footer,
  onOk,
  onCancel,
  afterClose,
}) => {
  const [mounted, setMounted] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [okLoading, setOkLoading] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const isDanger = danger !== undefined ? danger : type === "danger";
  const shouldShowCancel = showCancel !== undefined ? showCancel : type !== "info";
  const defaultOkText = okText || (isDanger ? "删除" : "确定");

  // 图标显示策略：官方 danger 和 confirm 对话框默认纯净无图标；info/warning/success 默认带图标
  const displayIcon =
    icon !== undefined
      ? icon
      : showIcon !== undefined
      ? showIcon
        ? type === "info"
          ? <FeishuDialogIcons.Info />
          : type === "warning"
          ? <FeishuDialogIcons.Warning />
          : type === "success"
          ? <FeishuDialogIcons.Success />
          : null
        : null
      : type === "info"
      ? <FeishuDialogIcons.Info />
      : type === "warning"
      ? <FeishuDialogIcons.Warning />
      : type === "success"
      ? <FeishuDialogIcons.Success />
      : null;

  // 动画状态控制
  useEffect(() => {
    if (visible) {
      setMounted(true);
      const timer = requestAnimationFrame(() => setAnimating(true));
      return () => cancelAnimationFrame(timer);
    } else if (mounted) {
      setAnimating(false);
      const timer = setTimeout(() => {
        setMounted(false);
        afterClose?.();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible, mounted, afterClose]);

  // ESC 键关闭
  useEffect(() => {
    if (!mounted || !keyboard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mounted, keyboard, onCancel]);

  const handleMaskClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && maskClosable) {
      onCancel?.();
    }
  };

  const handleOkClick = async () => {
    if (!onOk) {
      onCancel?.();
      return;
    }
    try {
      const result = onOk();
      if (result && typeof result.then === "function") {
        setOkLoading(true);
        await result;
      }
    } finally {
      setOkLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="ud__portal fixed inset-0 z-[1000] select-none">
      {/* 1. 遮罩层 (飞书标准轻量蒙层 30% 浓度) */}
      <div
        className="ud__dialog__mask fixed inset-0 bg-[#1F2329]/30 transition-opacity"
        style={{
          opacity: animating ? 1 : 0,
          transitionDuration: animating ? "200ms" : "150ms",
          transitionTimingFunction: "cubic-bezier(0.34, 0.69, 0.1, 1)",
        }}
      />

      {/* 2. 居中定位包裹层 */}
      <div
        onClick={handleMaskClick}
        className="ud__dialog__wrap fixed inset-0 flex items-center justify-center p-4 overflow-y-auto"
      >
        {/* 3. 对话框实体卡片 (缩放+淡入: scale 0.9 -> scale 1) */}
        <div
          ref={contentRef}
          role="dialog"
          aria-modal="true"
          className="ud__dialog__content ud__modal relative w-full bg-white rounded-[10px] border border-[#DEE0E3] overflow-visible text-left"
          style={{
            width: typeof width === "number" ? `${width}px` : width,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "calc(100vh - 64px)",
            boxShadow:
              "0px 8px 32px 0px rgba(31, 35, 41, 0.12), 0px 4px 8px -8px rgba(31, 35, 41, 0.06)",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
            opacity: animating ? 1 : 0,
            transform: animating ? "scale(1)" : "scale(0.92)",
            transitionProperty: "opacity, transform",
            transitionDuration: animating ? "200ms" : "150ms",
            transitionTimingFunction: "cubic-bezier(0.34, 0.69, 0.1, 1)",
          }}
        >
          {/* 右上角关闭按钮 */}
          {closable && (
            <button
              type="button"
              onClick={onCancel}
              className="ud__modal__close absolute right-6 top-6 flex h-5 w-5 items-center justify-center rounded-[4px] text-[#646A73] hover:text-[#1F2329] hover:bg-[#F2F3F5] transition-colors cursor-pointer"
              aria-label="关闭"
            >
              <FeishuDialogIcons.Close />
            </button>
          )}

          {/* 标题栏：纯净 16px 标题，字重 500 (font-medium，不粗重)，颜色 #1F2329 */}
          <div className={`ud__modal__header px-6 pt-6 pb-2 flex items-start gap-2.5 ${closable ? "pr-14" : "pr-6"}`}>
            {displayIcon && <span className="mt-[2px]">{displayIcon}</span>}

            <div className="ud__modal__title text-[16px] font-medium text-[#1F2329] leading-[24px] grow break-words">
              {title || (type === "info" ? "提示" : type === "danger" ? "确认删除" : "提示")}
            </div>
          </div>

          {/* 正文内容区：官方核心一级文本色 #1F2329（绝不偏灰），字号 14px，行高 22px */}
          <div className="ud__modal__body px-6 pb-6 text-[14px] font-normal text-[#1F2329] leading-[22px] break-words">
            {content || children}
          </div>

          {/* 底部按钮栏：间距 12px，按钮高度 32px，最小宽度 80px，圆角 6px */}
          {footer !== null && (
            <div className="ud__modal__footer px-6 pb-6 flex items-center justify-end gap-3">
              {footer !== undefined ? (
                footer
              ) : (
                <>
                  {/* 取消按钮：官方尺寸 min-w-[80px] h-[32px] 白底浅灰边框 */}
                  {shouldShowCancel && (
                    <button
                      type="button"
                      onClick={onCancel}
                      disabled={okLoading}
                      className="ud__button ud__button--outlined inline-flex h-[32px] min-w-[80px] px-[11px] items-center justify-center rounded-[6px] border border-[#DEE0E3] bg-white text-[14px] font-normal text-[#1F2329] shadow-none transition-colors hover:bg-[#F2F3F5] active:bg-[#E5E6EB] cursor-pointer select-none disabled:opacity-50"
                    >
                      {cancelText}
                    </button>
                  )}

                  {/* 确定/删除主按钮：官方尺寸 min-w-[80px] h-[32px] */}
                  <button
                    type="button"
                    onClick={handleOkClick}
                    disabled={okLoading}
                    className={`ud__button inline-flex h-[32px] min-w-[80px] px-[11px] items-center justify-center rounded-[6px] text-[14px] font-normal text-white shadow-none transition-colors cursor-pointer select-none disabled:opacity-50 ${
                      isDanger
                        ? "bg-[#F54A45] hover:bg-[#FF7570] active:bg-[#E22E28]"
                        : "bg-[#3370FF] hover:bg-[#2860E1] active:bg-[#1F4EC9]"
                    }`}
                  >
                    {okLoading ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                          <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                        </svg>
                        <span>处理中...</span>
                      </span>
                    ) : (
                      defaultOkText
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 命令式调用管理器 (feishuDialog.confirm / feishuDialog.info / feishuDialog.danger)
// ============================================================================

interface DialogInstanceInternal extends FeishuDialogOptions {
  id: string;
  visible: boolean;
}

class FeishuDialogManager {
  private dialogs: DialogInstanceInternal[] = [];
  private listeners: Set<() => void> = new Set();
  private containerMounted = false;
  private root: Root | null = null;

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  public getDialogs(): DialogInstanceInternal[] {
    return [...this.dialogs];
  }

  private ensureContainer() {
    if (typeof window === "undefined" || this.containerMounted) return;

    const existing = document.getElementById("feishu-dialog-root-container");
    if (existing) {
      this.containerMounted = true;
      return;
    }

    const div = document.createElement("div");
    div.id = "feishu-dialog-root-container";
    document.body.appendChild(div);
    this.root = createRoot(div);
    this.root.render(<FeishuDialogPortalContainer />);
    this.containerMounted = true;
  }

  public open(options: FeishuDialogOptions): { close: () => void; update: (newOpts: Partial<FeishuDialogOptions>) => void } {
    this.ensureContainer();

    const id = options.id || `feishu-dialog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const dialogItem: DialogInstanceInternal = {
      ...options,
      id,
      visible: true,
    };

    const existingIdx = this.dialogs.findIndex((d) => d.id === id);
    if (existingIdx > -1) {
      this.dialogs[existingIdx] = dialogItem;
    } else {
      this.dialogs.push(dialogItem);
    }

    this.notify();

    const close = () => this.close(id);
    const update = (newOpts: Partial<FeishuDialogOptions>) => {
      const idx = this.dialogs.findIndex((d) => d.id === id);
      if (idx > -1) {
        this.dialogs[idx] = { ...this.dialogs[idx], ...newOpts };
        this.notify();
      }
    };

    return { close, update };
  }

  public close(id: string) {
    const target = this.dialogs.find((d) => d.id === id);
    if (target) {
      target.visible = false;
      this.notify();
      setTimeout(() => {
        this.dialogs = this.dialogs.filter((d) => d.id !== id);
        this.notify();
      }, 300);
    }
  }

  public closeAll() {
    this.dialogs.forEach((d) => (d.visible = false));
    this.notify();
    setTimeout(() => {
      this.dialogs = [];
      this.notify();
    }, 300);
  }

  /** 信息提示弹窗（带蓝标，单确定按钮，按钮严格 min-w-[80px] h-[32px]） */
  public info(options: string | FeishuDialogOptions) {
    const config = typeof options === "string" ? { content: options } : options;
    return this.open({
      title: "提示",
      type: "info",
      showCancel: false,
      ...config,
    });
  }

  /** 警告确认弹窗 */
  public warning(options: string | FeishuDialogOptions) {
    const config = typeof options === "string" ? { content: options } : options;
    return this.open({
      title: "警告",
      type: "warning",
      showCancel: true,
      ...config,
    });
  }

  /** 危险/删除确认弹窗（官方标准：纯文本无左侧图标，红色「删除」按钮 + 「取消」按钮，严格尺寸） */
  public danger(options: string | FeishuDialogOptions) {
    const config = typeof options === "string" ? { content: options } : options;
    return this.open({
      title: "确认删除",
      type: "danger",
      okText: "删除",
      danger: true,
      showCancel: true,
      showIcon: false,
      ...config,
    });
  }

  /** 通用操作确认弹窗（默认纯净无图标） */
  public confirm(options: FeishuDialogOptions) {
    return this.open({
      title: "提示",
      type: "confirm",
      showCancel: true,
      showIcon: false,
      ...options,
    });
  }
}

/** 全局单例管理器 */
export const feishuDialog = new FeishuDialogManager();

/**
 * 全局 Dialog 挂载容器
 */
export const FeishuDialogPortalContainer: React.FC = () => {
  const [, setTick] = useState(0);

  useEffect(() => {
    return feishuDialog.subscribe(() => {
      setTick((t) => t + 1);
    });
  }, []);

  const dialogs = feishuDialog.getDialogs();
  if (dialogs.length === 0) return null;

  return (
    <>
      {dialogs.map((dialog) => (
        <FeishuDialog
          key={dialog.id}
          {...dialog}
          visible={dialog.visible}
          onCancel={() => {
            dialog.onCancel?.();
            feishuDialog.close(dialog.id);
          }}
          onOk={async () => {
            if (dialog.onOk) {
              const res = dialog.onOk();
              if (res && typeof res.then === "function") {
                await res;
              }
            }
            feishuDialog.close(dialog.id);
          }}
        />
      ))}
    </>
  );
};

export const feishuConfirm = (options: { title: string; content: string; type?: FeishuDialogType; okText?: string }): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    feishuDialog.open({
      title: options.title,
      content: options.content,
      type: options.type || "confirm",
      okText: options.okText || "确定",
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
};

