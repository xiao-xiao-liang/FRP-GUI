import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import { FeishuPill, FeishuPillVariant } from "./feishu-table/FeishuPill";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface FeishuSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  pillVariant?: FeishuPillVariant;
  icon?: React.ReactNode;
}

export interface FeishuSelectProps {
  options: FeishuSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  allowClear?: boolean;
  className?: string;
  dropdownClassName?: string;
  prefix?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * 1:1 飞书设计规范标准下拉选择器 (FeishuSelect)
 * 支持纯文字选项、Pill 状态药丸选项、自定义图标、清除按钮与流畅的展开收起动效
 * 采用 React Portal + Fixed 坐标，彻底杜绝父级表格 overflow: hidden / auto 的遮挡裁剪问题
 */
export const FeishuSelect: React.FC<FeishuSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "请选择",
  size = "md",
  disabled = false,
  allowClear = false,
  className = "",
  dropdownClassName = "",
  prefix,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  }>({ left: 0, width: 0 });

  const selectedOption = options.find((opt) => opt.value === value);

  // 动态计算下拉框相对于视口的精确坐标与展开方向 (向下优先，靠近屏幕底部时自动向上翻转)
  const updatePosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dropdownHeight = 220; // 预估下拉菜单最大高度
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    setCoords({
      left: Math.max(0, rect.left),
      width: Math.max(rect.width || 0, 80),
      top: openUp ? undefined : rect.bottom + 4,
      bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
    });
  };

  // 展开时计算坐标，并在视口滚动或尺寸变化时保持跟随 (使用 LayoutEffect 在绘制前同步对齐)
  useIsomorphicLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleScroll = (e: Event) => {
        // 如果是在下拉选项自身内部滚动，不触发重新计算
        if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
          return;
        }
        updatePosition();
      };
      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isOpen]);

  // 点击外部自动收起（同时监听触发容器与 Portal 挂载的浮层容器）
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // 按 Esc 键自动收起
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleToggle = () => {
    if (!disabled) {
      // 打开前同步测算坐标，首帧挂载即处于正确位置，彻底杜绝从屏幕左侧飞入的动画破绽
      if (!isOpen) {
        updatePosition();
      }
      setIsOpen((prev) => !prev);
    }
  };

  const handleSelect = (val: string, optDisabled?: boolean) => {
    if (optDisabled) return;
    onChange?.(val);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.("");
  };

  // 尺寸映射
  const sizeClasses = {
    sm: "h-7 text-[13px] px-2.5 rounded-[6px] gap-1.5",
    md: "h-8 text-[14px] px-3 rounded-[6px] gap-2",
    lg: "h-9 text-[15px] px-3.5 rounded-[8px] gap-2",
  };

  return (
    <div
      ref={containerRef}
      style={style}
      className={`relative inline-block select-none text-[#1F2329] ${className}`}
    >
      {/* 触发按钮 */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`flex items-center justify-between w-full border bg-white transition-all cursor-pointer outline-none ${
          sizeClasses[size]
        } ${
          disabled
            ? "bg-[#F5F6F7] border-[#DEE0E3] text-[#8F959E] cursor-not-allowed"
            : isOpen
            ? "border-[#165DFF] ring-2 ring-[#165DFF]/20 shadow-2xs"
            : "border-[#DEE0E3] hover:border-[#4080FF] shadow-2xs"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate text-left">
          {prefix && <span className="shrink-0 text-[#8F959E]">{prefix}</span>}
          {selectedOption ? (
            <div className="flex items-center gap-1.5 truncate">
              {selectedOption.icon && (
                <span className="shrink-0">{selectedOption.icon}</span>
              )}
              {selectedOption.pillVariant ? (
                <FeishuPill variant={selectedOption.pillVariant}>
                  {selectedOption.label}
                </FeishuPill>
              ) : (
                <span
                  className={`text-[#1F2329] font-normal truncate ${
                    size === "sm" ? "text-[12px]" : size === "lg" ? "text-[15px]" : "text-[14px]"
                  }`}
                >
                  {selectedOption.label}
                </span>
              )}
            </div>
          ) : (
            <span
              className={`text-[#8F959E] font-normal truncate ${
                size === "sm" ? "text-[12px]" : size === "lg" ? "text-[15px]" : "text-[14px]"
              }`}
            >
              {placeholder}
            </span>
          )}
        </div>

        {/* 右侧操作区：清除按钮 / 下拉小箭头 */}
        <div className="flex items-center shrink-0 ml-1.5">
          {allowClear && selectedOption && !disabled ? (
            <span
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-[#F2F3F5] text-[#8F959E] hover:text-[#1F2329] transition-colors"
              title="清除选择"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          ) : (
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#8F959E] transition-transform duration-200 ${
                isOpen ? "rotate-180 text-[#3370FF]" : ""
              }`}
            />
          )}
        </div>
      </button>

      {/* 浮层下拉列表 (通过 React Portal 挂载到 document.body，避免受父容器 overflow 裁剪) */}
      {isOpen &&
        typeof document !== "undefined" &&
        coords.width > 0 &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              left: `${coords.left}px`,
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              minWidth: `${coords.width}px`,
              zIndex: 99999,
            }}
            className={`rounded-[8px] border border-[#DEE0E3] bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,0.12)] animate-in fade-in zoom-in-95 ${
              coords.bottom !== undefined ? "origin-bottom" : "origin-top"
            } duration-100 ${dropdownClassName}`}
          >
            <div className="max-h-[240px] overflow-y-auto space-y-0.5 custom-scrollbar">
              {options.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt.value, opt.disabled)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-[6px] transition-colors cursor-pointer ${
                      size === "sm" ? "text-[12px] leading-[18px]" : "text-[14px] leading-[22px]"
                    } ${
                      opt.disabled
                        ? "text-[#C9CDD4] cursor-not-allowed bg-transparent"
                        : isSelected
                        ? "bg-[#E8F3FF] text-[#3370FF] font-medium"
                        : "text-[#1F2329] hover:bg-[#F2F3F5]"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                      {opt.pillVariant ? (
                        <FeishuPill variant={opt.pillVariant}>{opt.label}</FeishuPill>
                      ) : (
                        <span className="truncate">{opt.label}</span>
                      )}
                    </div>

                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[#3370FF] shrink-0 ml-2" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
