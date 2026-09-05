import React from "react";
import { cn } from "../../../lib/utils";

export interface FeishuCellMainSubProps {
  main: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}

export const FeishuCellMainSub: React.FC<FeishuCellMainSubProps> = ({
  main,
  sub,
  className,
}) => {
  return (
    <div className={cn("flex flex-col justify-center py-0.5", className)}>
      <div className="text-[14px] font-medium text-[#1F2329] truncate">{main}</div>
      {sub && (
        <div className="text-[12px] text-[#8F959E] tabular-nums mt-0.5 truncate">{sub}</div>
      )}
    </div>
  );
};
