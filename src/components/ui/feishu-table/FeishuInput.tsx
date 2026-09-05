import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { X } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface FeishuInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix" | "onChange"> {
  value?: string;
  onChange?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  allowClear?: boolean;
  autoFocus?: boolean;
  focusedBorderColor?: string;
  defaultBorderColor?: string;
  containerClassName?: string;
  inputClassName?: string;
  status?: 'error' | 'warning' | 'default';
}

export interface FeishuInputRef {
  focus: () => void;
  blur: () => void;
  input: HTMLInputElement | null;
}

/**
 * 1:1 飞书 Universe Design 原生输入框组件 (.ud__inputWrapper)
 * 特性:
 * 1. 点击容器任何位置立即自动聚焦内部原生 input；
 * 2. 聚焦时呈现纯正 1px solid #3370FF 飞书蓝高亮边框；
 * 3. 悬浮时 border-color 变为 #3370FF；
 * 4. 支持前后缀图标与一键清空按钮 (X)。
 */
export const FeishuInput = forwardRef<FeishuInputRef, FeishuInputProps>(
  (
    {
      value = "",
      onChange,
      onClear,
      placeholder = "请输入",
      prefix,
      suffix,
      allowClear = true,
      autoFocus = false,
      focusedBorderColor = "#165DFF",
      defaultBorderColor = "#DEE0E3",
      containerClassName,
      inputClassName,
      disabled = false,
      status,
      className,
      onFocus,
      onBlur,
      onClick,
      ...restProps
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const innerInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => innerInputRef.current?.focus(),
      blur: () => innerInputRef.current?.blur(),
      input: innerInputRef.current,
    }));

    useEffect(() => {
      if (autoFocus) {
        innerInputRef.current?.focus();
      }
    }, [autoFocus]);

    const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
      innerInputRef.current?.focus();
      if (onClick) onClick(e as any);
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onChange) onChange("");
      if (onClear) onClear();
      innerInputRef.current?.focus();
    };

    return (
      <div
        onClick={handleContainerClick}
        style={{
          borderColor: status === 'error' ? '#F53F3F' : (isFocused ? focusedBorderColor : defaultBorderColor),
          backgroundColor: disabled ? "#F5F6F7" : "#FFFFFF",
        }}
        className={cn(
          "ud__inputWrapper relative flex items-center h-[30px] px-2 rounded-[6px] border bg-white transition-colors duration-150 cursor-text select-none",
          status === 'error'
            ? "border-[#F53F3F]"
            : (isFocused ? "border-[#3370FF]" : "hover:border-[#3370FF]"),
          disabled ? "opacity-60 cursor-not-allowed" : "",
          containerClassName,
          className
        )}
      >
        {/* 前缀图标 */}
        {prefix && <div className="shrink-0 flex items-center mr-1.5">{prefix}</div>}

        {/* 原生输入框 */}
        <input
          ref={innerInputRef}
          type="text"
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange && onChange(e.target.value)}
          onFocus={(e) => {
            setIsFocused(true);
            if (onFocus) onFocus(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            if (onBlur) onBlur(e);
          }}
          className={cn(
            "ud__input flex-1 min-w-0 bg-transparent border-none outline-none text-[13px] text-[#1F2329] placeholder:text-[#8F959E] leading-[20px]",
            inputClassName
          )}
          {...restProps}
        />

        {/* 一键清空叉号 (X) */}
        {allowClear && value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-0.5 text-[#8F959E] hover:text-[#1F2329] rounded cursor-pointer shrink-0 ml-0.5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* 后缀插槽 (如 AdvancedActivedOutlined 设置按钮) */}
        {suffix && <div className="shrink-0 flex items-center ml-0.5">{suffix}</div>}
      </div>
    );
  }
);

FeishuInput.displayName = "FeishuInput";
