import React from "react";
import { cn } from "../../../lib/utils";

export interface FeishuTagProps {
  children: React.ReactNode;
  className?: string;
}

// 对照图一：联系人灰底 Tag 圆角为 6px，高度 23px
export const FeishuTag: React.FC<FeishuTagProps> = ({ children, className }) => {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-[25px] px-2.5 rounded-[6px] bg-[#F2F3F5] text-[#1F2329] text-[13px] font-normal leading-none select-none whitespace-nowrap",
        className
      )}
    >
      {children}
    </span>
  );
};
