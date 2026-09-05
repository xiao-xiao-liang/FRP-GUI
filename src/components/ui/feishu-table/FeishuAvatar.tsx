import React from "react";
import { cn } from "../../../lib/utils";

export interface FeishuAvatarProps {
  name: string;
  avatarUrl?: string;
  bgColor?: string;
  className?: string;
}

const defaultBgColors = [
  "#3370FF",
  "#8D55ED",
  "#10A893",
  "#FF811A",
  "#F54A45",
  "#35BD4B",
];

function getAvatarBg(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % defaultBgColors.length;
  return defaultBgColors[index];
}

export const FeishuAvatar: React.FC<FeishuAvatarProps> = ({
  name,
  avatarUrl,
  bgColor,
  className,
}) => {
  const initial = name ? name.trim().charAt(0) : "U";
  const bg = bgColor || getAvatarBg(name);

  return (
    <div className={cn("inline-flex items-center gap-1.5 text-[14px] text-[#1F2329]", className)}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} className="w-[24px] h-[24px] rounded-full object-cover shrink-0" />
      ) : (
        <span
          style={{ backgroundColor: bg }}
          className="w-[24px] h-[24px] rounded-full inline-flex items-center justify-center text-[12px] font-semibold text-white shrink-0 shadow-xs"
        >
          {initial}
        </span>
      )}
      <span className="font-normal text-[#1F2329] truncate">{name}</span>
    </div>
  );
};
