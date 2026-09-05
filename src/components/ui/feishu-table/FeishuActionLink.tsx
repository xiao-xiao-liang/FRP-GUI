import React from "react";
import { cn } from "../../../lib/utils";

export interface FeishuActionLinkProps {
  children: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: "primary" | "danger" | "secondary";
  underline?: boolean;
  className?: string;
}

/**
 * 1:1 飞书官方表格操作列链接按钮 (FeishuActionLink)
 * 严格依据 docs/design/CRM/DESIGN.md 规范：
 * 1. 圆角度数：radius-001: 6px (rounded-[6px])
 * 2. 内边距与高度：h-[28px] px-2 (space-001 4px / space-002 8px)
 * 3. 悬浮底色：Universe Design token rgba(31, 35, 41, 0.08) (#E5EBF4 / #EFF0F1)
 * 4. 纯净无下划线，首项负边距 first:-ml-2 实现与表头「操作」文字 1:1 绝对垂直对齐
 */
export const FeishuActionLink: React.FC<FeishuActionLinkProps> = ({
  children,
  onClick,
  variant = "primary",
  underline = false,
  className,
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center h-[28px] px-2 rounded-[6px] text-[14px] font-normal transition-all duration-150 cursor-pointer select-none border-none bg-transparent no-underline first:-ml-2",
        variant === "primary" && "text-[#3370FF] hover:bg-[#E5EBF4] hover:text-[#3370FF] active:bg-[#D5E1F0]",
        variant === "danger" && "text-[#F54A45] hover:bg-[#FEE8E8] hover:text-[#F54A45] active:bg-[#FDD1D0]",
        variant === "secondary" && "text-[#646A75] hover:bg-[rgba(31,35,41,0.08)] hover:text-[#1F2329] active:bg-[rgba(31,35,41,0.12)]",
        underline && "hover:underline",
        className
      )}
    >
      {children}
    </button>
  );
};
