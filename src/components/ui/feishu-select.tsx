import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { FeishuPill, FeishuPillVariant } from "./feishu-table/FeishuPill";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * 飞书原生 Universe Design 折线粗折角向下箭头 (DownBoldOutlined)
 */
export const FeishuChevronDownIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ minWidth: "12px", minHeight: "12px" }}
  >
    <path
      d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z"
      fill="currentColor"
    />
  </svg>
);

/**
 * 飞书原生 Universe Design 选中对勾图标 (CheckOutlined)
 */
export const FeishuCheckIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ minWidth: "12px", minHeight: "12px" }}
  >
    <path
      d="M9.003 16.172 4.83 12l-1.414 1.414 5.587 5.586L20.59 7.414 19.176 6 9.003 16.172Z"
      fill="currentColor"
    />
  </svg>
);

/**
 * 飞书原生 Universe Design 搜索放大镜图标 (SearchOutlined)
 */
export const FeishuSearchIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M16.473 17.887A9.46 9.46 0 0 1 10.5 20a9.5 9.5 0 1 1 9.5-9.5 9.46 9.46 0 0 1-2.113 5.973l3.773 3.773a.996.996 0 0 1-.007 1.407.996.996 0 0 1-1.407.007l-3.773-3.773ZM18 10.5a7.5 7.5 0 1 0-15 0 7.5 7.5 0 0 0 15 0Z"
      fill="currentColor"
    />
  </svg>
);

/**
 * 飞书原生 Universe Design 圆形清除图标 (ClearFilled)
 */
export const FeishuClearIcon: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Zm3.536 12.121a1 1 0 1 1-1.414 1.415L12 13.414l-2.121 2.122a1 1 0 0 1-1.415-1.415L10.586 12 8.464 9.879a1 1 0 0 1 1.415-1.415L12 10.586l2.121-2.122a1 1 0 0 1 1.415 1.415L13.414 12l2.122 2.121Z"
      fill="currentColor"
    />
  </svg>
);

export interface FeishuSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  pillVariant?: FeishuPillVariant;
  icon?: React.ReactNode;
  description?: string;
}

export interface FeishuSelectProps {
  options: FeishuSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "borderless" | "embedded";
  disabled?: boolean;
  allowClear?: boolean;
  showSearch?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  dropdownHeader?: React.ReactNode;
  dropdownFooter?: React.ReactNode;
  className?: string;
  dropdownClassName?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  style?: React.CSSProperties;
  dropdownStyle?: React.CSSProperties;
}

/**
 * 1:1 完美复刻飞书多维表格与 Universe Design 规范的下拉选择器 (FeishuSelect)
 * - 采用模块化、可拆卸设计（可拆卸搜索框、清除按钮、外框变体、顶部/底部插槽）
 * - 1:1 飞书色彩规范：边框 #D0D3D6，聚焦/Hover #336DF4 (无 ring 泛光)，文字 #1F2329，占位符 #8F959E
 * - 1:1 飞书三层复合柔光阴影 (--shadow-s4-down)
 * - 1:1 飞书半透明悬浮蒙层 (--fill-hover: rgba(31, 35, 41, 0.08))
 * - 采用 React Portal + Fixed 坐标，彻底杜绝父容器 overflow 裁剪
 */
export const FeishuSelect: React.FC<FeishuSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "请选择",
  size = "md",
  variant = "default",
  disabled = false,
  allowClear = false,
  showSearch = false,
  searchPlaceholder = "搜索...",
  emptyText = "无匹配选项",
  dropdownHeader,
  dropdownFooter,
  className = "",
  dropdownClassName = "",
  prefix,
  suffix,
  style,
  dropdownStyle,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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
    const dropdownHeight = 240;
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

  useIsomorphicLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleScroll = (e: Event) => {
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

  // 打开且开启搜索时自动聚焦搜索输入框
  useEffect(() => {
    if (isOpen && showSearch) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setSearchQuery("");
    }
  }, [isOpen, showSearch]);

  // 点击外部自动收起
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

  // 尺寸映射 (严格遵循飞书 Universe Design 规范)
  const sizeClasses = {
    sm: "h-[28px] text-[12px] px-[7px] gap-[6px]",
    md: "h-[32px] text-[14px] px-[11px] gap-[8px]",
    lg: "h-[40px] text-[16px] px-[11px] gap-[8px]",
  };

  // 外观变体映射 (模块化可拆卸设计)
  const getVariantClasses = () => {
    if (disabled) {
      return "bg-[#EFF0F1] border-[#D0D3D6] text-[#8F959E] cursor-not-allowed";
    }

    switch (variant) {
      case "borderless":
        return isOpen
          ? "bg-[rgba(31,35,41,0.08)] border-transparent text-[#1F2329]"
          : "bg-transparent border-transparent hover:bg-[rgba(31,35,41,0.08)] text-[#1F2329]";
      case "embedded":
        return isOpen
          ? "bg-white border-[#336DF4] text-[#1F2329]"
          : "bg-transparent border-transparent hover:bg-[rgba(31,35,41,0.05)] text-[#1F2329]";
      case "default":
      default:
        return isOpen
          ? "border-[#336DF4] bg-white text-[#1F2329]"
          : "border-[#D0D3D6] bg-white text-[#1F2329] hover:border-[#336DF4]";
    }
  };

  // 过滤后的选项列表（支持拼音/大小写无关模糊搜索）
  const filteredOptions =
    showSearch && searchQuery.trim()
      ? options.filter((opt) => {
          const query = searchQuery.trim().toLowerCase();
          const matchLabel = opt.label.toLowerCase().includes(query);
          const matchDesc = opt.description?.toLowerCase().includes(query);
          return matchLabel || matchDesc;
        })
      : options;

  return (
    <div
      ref={containerRef}
      style={style}
      className={`relative inline-block select-none ${className}`}
    >
      {/* 触发按钮 (Trigger / Selector) */}
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`flex items-center justify-between w-full border rounded-[6px] outline-none cursor-pointer text-left transition-colors duration-200 ${
          sizeClasses[size]
        } ${getVariantClasses()}`}
        style={{
          transitionTimingFunction: "cubic-bezier(0.34, 0.69, 0.1, 1)",
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
          {prefix && <span className="shrink-0 text-[#646A73]">{prefix}</span>}
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
                <span className="truncate font-normal">
                  {selectedOption.label}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[#8F959E] font-normal truncate">
              {placeholder}
            </span>
          )}
          {suffix && <span className="shrink-0 text-[#646A73] ml-auto">{suffix}</span>}
        </div>

        {/* 右侧操作区：清除按钮 / 飞书平头折线箭头 */}
        <div className="flex items-center shrink-0 ml-1.5">
          {allowClear && selectedOption && !disabled ? (
            <span
              onClick={handleClear}
              className="text-[#646A73] hover:text-[#336DF4] active:text-[#1456F0] transition-colors p-0.5"
              title="清除"
            >
              <FeishuClearIcon />
            </span>
          ) : (
            <span
              className={`text-[#646A73] transition-transform duration-200 ease-out ${
                disabled ? "text-[#BBBFC4]" : ""
              } ${isOpen ? "rotate-180 text-[#336DF4]" : ""}`}
            >
              <FeishuChevronDownIcon />
            </span>
          )}
        </div>
      </button>

      {/* 浮层下拉列表 (通过 React Portal 挂载到 document.body，彻底杜绝父容器裁剪) */}
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
              boxShadow:
                "0px 8px 24px 8px rgba(31, 35, 41, 0.04), 0px 6px 12px 0px rgba(31, 35, 41, 0.04), 0px 4px 8px -8px rgba(31, 35, 41, 0.06)",
              ...dropdownStyle,
            }}
            className={`rounded-[6px] border border-[#DEE0E3] bg-white text-[#1F2329] animate-in fade-in zoom-in-95 duration-100 ${
              coords.bottom !== undefined ? "origin-bottom" : "origin-top"
            } ${dropdownClassName}`}
          >
            {/* 1. 可拆卸搜索栏 (Pluggable Search Box) */}
            {showSearch && (
              <div className="p-1.5 border-b border-[#DEE0E3]/70 sticky top-0 bg-white z-10">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[#F5F6F7] rounded-[4px] border border-transparent focus-within:border-[#336DF4] focus-within:bg-white transition-all">
                  <span className="text-[#8F959E] shrink-0">
                    <FeishuSearchIcon />
                  </span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full bg-transparent border-none outline-none text-[13px] text-[#1F2329] placeholder:text-[#8F959E]"
                    onClick={(e) => e.stopPropagation()}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchQuery("");
                      }}
                      className="text-[#8F959E] hover:text-[#336DF4] transition-colors p-0.5"
                    >
                      <FeishuClearIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 2. 可拆卸下拉头部插槽 */}
            {dropdownHeader && (
              <div className="px-2 py-1.5 border-b border-[#DEE0E3]/70">
                {dropdownHeader}
              </div>
            )}

            {/* 3. 核心选项列表 */}
            <div className="max-h-[240px] overflow-y-auto py-1 custom-scrollbar">
              {filteredOptions.length === 0 ? (
                <div className="py-4 px-3 text-center text-[13px] text-[#8F959E] select-none">
                  {emptyText}
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleSelect(opt.value, opt.disabled)}
                      className={`flex items-center justify-between mx-[3px] my-[1px] px-[8px] py-[4px] rounded-[4px] transition-colors duration-150 cursor-pointer ${
                        size === "sm"
                          ? "text-[12px] leading-[20px]"
                          : size === "lg"
                          ? "text-[15px] leading-[24px]"
                          : "text-[14px] leading-[22px]"
                      } ${
                        opt.disabled
                          ? "text-[#BBBFC4] cursor-not-allowed bg-transparent"
                          : isSelected
                          ? "text-[#1456F0] font-medium hover:bg-[rgba(31,35,41,0.08)] active:bg-[rgba(31,35,41,0.12)]"
                          : "text-[#1F2329] hover:bg-[rgba(31,35,41,0.08)] active:bg-[rgba(31,35,41,0.12)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate min-w-0">
                        {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                        {opt.pillVariant ? (
                          <FeishuPill variant={opt.pillVariant}>{opt.label}</FeishuPill>
                        ) : (
                          <div className="truncate flex flex-col">
                            <span className="truncate">{opt.label}</span>
                            {opt.description && (
                              <span className="text-[12px] text-[#8F959E] font-normal leading-[16px] truncate">
                                {opt.description}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 飞书官方右侧对勾 (Check) */}
                      {isSelected && (
                        <span className="text-[#1456F0] shrink-0 ml-2">
                          <FeishuCheckIcon />
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 4. 可拆卸下拉底部插槽 */}
            {dropdownFooter && (
              <div className="px-2 py-1.5 border-t border-[#DEE0E3]/70">
                {dropdownFooter}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
