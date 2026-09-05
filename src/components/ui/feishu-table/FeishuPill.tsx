import React from "react";
import { cn } from "../../../lib/utils";

export type FeishuPillVariant = "blue" | "green" | "orange" | "cyan" | "gray" | "red" | "purple";

export interface FeishuPillProps {
  variant?: FeishuPillVariant;
  children: React.ReactNode;
  dotColor?: string;
  showDot?: boolean;
  className?: string;
}

// 1:1 飞书多维表格单选 Tag 胶囊样式 (对照 DESIGN.md: 全胶囊 rounded-full, 高度 24px)
const variantStyles: Record<FeishuPillVariant, { bg: string; text: string; dot: string }> = {
  blue: { bg: "bg-[#DEE9FE]", text: "text-[#1F2329]", dot: "bg-[#3370FF]" },
  orange: { bg: "bg-[#FFE6C7]", text: "text-[#1F2329]", dot: "bg-[#FF8800]" },
  cyan: { bg: "bg-[#CEF0FF]", text: "text-[#1F2329]", dot: "bg-[#00B5B8]" },
  green: { bg: "bg-[#CFF4EC]", text: "text-[#1F2329]", dot: "bg-[#00B42A]" },
  gray: { bg: "bg-[#F2F3F5]", text: "text-[#1F2329]", dot: "bg-[#8F959E]" },
  red: { bg: "bg-[#FFECEC]", text: "text-[#1F2329]", dot: "bg-[#F53F3F]" },
  purple: { bg: "bg-[#F2E9FE]", text: "text-[#1F2329]", dot: "bg-[#8D55ED]" },
};

export const FeishuPill: React.FC<FeishuPillProps> = ({
  variant = "blue",
  children,
  dotColor,
  showDot = true,
  className,
}) => {
  const style = variantStyles[variant] || variantStyles.blue;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center h-[24px] px-2.5 rounded-full text-[13px] font-normal leading-none select-none whitespace-nowrap",
        showDot && "gap-1.5",
        style.bg,
        style.text,
        className
      )}
    >
      {showDot && (
        <span
          style={dotColor ? { backgroundColor: dotColor } : undefined}
          className={cn("w-[6px] h-[6px] rounded-full shrink-0", !dotColor && style.dot)}
        />
      )}
      <span>{children}</span>
    </span>
  );
};
