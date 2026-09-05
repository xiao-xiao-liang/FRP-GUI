import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface FeishuHeaderCellProps {
  title: string | React.ReactNode;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  enableMenu?: boolean;
  dataType?: "string" | "text" | "number" | "select" | "user" | "date";
  isSorted?: boolean;
  sortDirection?: "asc" | "desc" | null;
  onSortAsc?: () => void;
  onSortDesc?: () => void;
  onFilter?: () => void;
  onGroup?: () => void;
  onFreeze?: () => void;
  isLast?: boolean;
  resizable?: boolean;
  isResizing?: boolean;
  onResizeStart?: (e: React.MouseEvent) => void;
}

const FEISHU_FONT_FAMILY =
  'LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Tahoma, "PingFang SC", "Microsoft Yahei", Arial, "Hiragino Sans GB", sans-serif';

// --- 1:1 飞书官方原生 Universe Design 矢量图标组件 ---
const FeishuSorAToZIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#646A75] shrink-0" data-icon="SorAToZOutlined">
    <path d="M17 1.333h-1.803s-.419.137-.498.343l-3.664 9.598a.533.533 0 0 0 .498.724h.978a.533.533 0 0 0 .5-.347l.664-1.785h4.841l.663 1.786c.078.21.277.348.5.348h.987a.533.533 0 0 0 .498-.724l-3.666-9.6A.533.533 0 0 0 17 1.333Zm.725 6.4h-3.264l1.605-4.316h.05l1.61 4.316Zm-6.175 6.4c0-.294.238-.533.533-.533h8.522c.295 0 .534.239.534.534v.703c0 .154-.067.3-.183.402l-6.068 5.298h5.717c.295 0 .534.24.534.534v1.063a.533.533 0 0 1-.534.533h-8.522a.533.533 0 0 1-.534-.534v-.973c0-.154.067-.3.183-.402l5.763-5.027h-5.412a.533.533 0 0 1-.534-.534v-1.063Zm-8.923 2.534h2.705V3.2c0-.294.238-.533.533-.533h.933c.295 0 .534.239.534.533v19.16a.533.533 0 0 1-.965.314l-4-5.499a.32.32 0 0 1 .26-.508Z" fill="currentColor" />
  </svg>
);

const FeishuSorZToAIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#646A75] shrink-0" data-icon="SorZToAOutlined">
    <path d="M2.627 16.667h2.705V3.2c0-.294.238-.533.533-.533h.933c.295 0 .534.239.534.533v19.16a.533.533 0 0 1-.965.314l-4-5.499a.32.32 0 0 1 .26-.508ZM16.999 12h-1.804s-.419.136-.498.343l-3.664 9.598a.533.533 0 0 0 .499.724h.977a.533.533 0 0 0 .5-.348l.664-1.785h4.842l.663 1.787a.533.533 0 0 0 .5.348h.986a.533.533 0 0 0 .498-.724l-3.666-9.6A.533.533 0 0 0 17 12Zm.725 6.4H14.46l1.604-4.317h.05l1.61 4.316ZM11.548 1.867c0-.295.239-.534.533-.534h8.523c.294 0 .533.24.533.534v.704c0 .154-.067.3-.183.401l-6.068 5.299h5.718c.294 0 .533.238.533.533v1.063a.533.533 0 0 1-.533.533H12.08a.533.533 0 0 1-.533-.533v-.974c0-.154.066-.3.182-.402l5.764-5.027H12.08a.533.533 0 0 1-.533-.533V1.867Z" fill="currentColor" />
  </svg>
);

const FeishuListFilterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#646A75] shrink-0" data-icon="ListFilterOutlined">
    <path d="M15 3a2 2 0 0 1 2 2v2.15a1.4 1.4 0 0 1-.487 1.061L12 11.792v9.083c0 .578-.432 1.055-.991 1.125l-.142.009c-.197 0-.39-.051-.561-.149l-3.683-2.476C6.227 19.159 6 18.955 6 18.5v-6.71L1.49 8.212a1.4 1.4 0 0 1-.48-.89L1 7.149V5.001a2 2 0 0 1 2-2h12Zm5 14a1 1 0 1 1 0 2h-4a1 1 0 1 1 0-2h4ZM15 5H2.999L3 7l4.493 3.454c.267.228.453.528.496.872L8 11.5V18l2 1.385v-7.868c0-.35.13-.685.363-.94l.125-.122L15 7V5Zm7 8a1 1 0 1 1 0 2h-6a1 1 0 1 1 0-2h6Z" fill="currentColor" />
  </svg>
);

const FeishuTableGroupIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#646A75] shrink-0" data-icon="TableGroupOutlined">
    <path d="M10 9a1 1 0 0 1 1-1h6.5a1 1 0 1 1 0 2H11a1 1 0 0 1-1-1Zm1 5a1 1 0 1 0 0 2h6.5a1 1 0 1 0 0-2H11ZM8.25 9a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm-1.5 7.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" fill="currentColor" />
    <path d="M3.5 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h17a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-17Zm17 2v16h-17V4h17Z" fill="currentColor" />
  </svg>
);

const FeishuFreeze1ColumnIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-[#646A75] shrink-0" data-icon="Freeze1ColumnOutlined">
    <path d="M4 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4Zm0-6.231 5-5V8.45l-5 5v2.318Zm5-9.44v-2.15l-5 5v2.152l5-5ZM7.057 4H4v3.057L7.057 4ZM4 17.89V20h.328L9 15.328V12.89l-5 5ZM6.45 20H9v-2.55L6.45 20ZM11 20h9V4h-9v16Z" fill="currentColor" />
  </svg>
);

// 1:1 飞书表头 Cell 组件 (自适应内容宽度、消除右侧多余空白、支持列宽拖拽、官方原装 5 大图标)
export const FeishuHeaderCell: React.FC<FeishuHeaderCellProps> = ({
  title,
  align = "left",
  sortable = true,
  enableMenu = true,
  dataType,
  isSorted = false,
  sortDirection = null,
  onSortAsc,
  onSortDesc,
  onFilter,
  onGroup,
  onFreeze,
  isLast = false,
  resizable = true,
  isResizing = false,
  onResizeStart,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const titleText = typeof title === "string" ? title : "此列";
  const isActions = title === "操作" || !enableMenu;

  const isNumeric = dataType === "number" || align === "right";
  const sortAscText = isNumeric ? "按 0 到 9 排序" : "按 A 到 Z 排序";
  const sortDescText = isNumeric ? "按 9 到 0 排序" : "按 Z 到 A 排序";

  // 仅在网页内点击外部时触发关闭
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  // 1. 操作列：无悬浮底块、无下拉箭头、不可展开、末尾不可拖拽，文字左边缘与下方按钮文字严格垂直对齐 (px-3)
  if (isActions) {
    return (
      <div
        style={{ fontFamily: FEISHU_FONT_FAMILY }}
        className="relative flex items-center h-9 w-full group px-3 select-none"
      >
        <span
          className={cn(
            "text-[13px] font-normal text-[#8F959E] w-full leading-none",
            align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
          )}
        >
          {title}
        </span>
        {/* 竖分割线：悬浮在表头任意列时整体显现 */}
        {!isLast && (
          <span className="feishu-col-divider absolute right-0 top-1/2 -translate-y-1/2 h-[20px] w-[2px] rounded-full bg-[#DEE0E3] opacity-0 group-hover/thead:opacity-100 transition-opacity duration-150 pointer-events-none z-10" />
        )}
      </div>
    );
  }

  // 2. 数据列：支持竖线拖拽调整列宽、内容自适应贴合下拉框 (w-max)
  return (
    <div
      ref={containerRef}
      style={{ fontFamily: FEISHU_FONT_FAMILY }}
      className="relative flex items-center h-9 w-full group px-1 select-none"
    >
      {/* 表头胶囊触发器 */}
      <div
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "inline-flex items-center justify-between gap-1 w-full h-7 px-2 rounded-[6px] transition-colors cursor-pointer select-none",
          open ? "bg-[#DFE1E5]" : "hover:bg-[#EAECEF]",
          align === "right" && "justify-end"
        )}
      >
        {/* 左侧：标题文字 + 紧贴的常驻修长 ↑/↓ 排序箭头 */}
        <div className="flex items-center gap-1 min-w-0 truncate">
          <span className="text-[13px] font-normal text-[#8F959E] group-hover:text-[#1F2329] truncate leading-none">
            {title}
          </span>
          {isSorted && (
            sortDirection === "asc" ? (
              <span className="text-[14px] text-[#646A75] font-normal leading-none select-none shrink-0 ml-0.5">
                ↑
              </span>
            ) : (
              <span className="text-[14px] text-[#646A75] font-normal leading-none select-none shrink-0 ml-0.5">
                ↓
              </span>
            )
          )}
        </div>

        {/* 右侧：下拉展开箭头 (悬浮或打开菜单时显现) */}
        <ChevronDown
          className={cn(
            "w-3 h-3 text-[#8F959E] shrink-0 transition-opacity",
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        />
      </div>

      {/* 1:1 飞书表头下拉框 (官方原装 5 个矢量图标、w-max 自适应内容、对称 8px 间距) */}
      {open && (
        <div
          style={{ fontFamily: FEISHU_FONT_FAMILY }}
          className="absolute left-0 top-[34px] z-50 w-max whitespace-nowrap bg-white rounded-[8px] border border-[#DEE0E1] p-1 shadow-[0_4px_16px_rgba(31,35,41,0.12)] text-[14px] text-[#1F2329] animate-in fade-in-80"
        >
          <div
            onClick={() => {
              onSortAsc && onSortAsc();
              setOpen(false);
            }}
            className="flex items-center gap-1.5 h-8 px-2 rounded-[4px] hover:bg-[#EAECEF] cursor-pointer select-none text-[#1F2329] text-[14px] transition-colors whitespace-nowrap"
          >
            <FeishuSorAToZIcon />
            <span>{sortAscText}</span>
          </div>

          <div
            onClick={() => {
              onSortDesc && onSortDesc();
              setOpen(false);
            }}
            className="flex items-center gap-1.5 h-8 px-2 rounded-[4px] hover:bg-[#EAECEF] cursor-pointer select-none text-[#1F2329] text-[14px] transition-colors whitespace-nowrap"
          >
            <FeishuSorZToAIcon />
            <span>{sortDescText}</span>
          </div>

          <div className="h-[1px] bg-[#EDF0F2] my-1" />

          <div
            onClick={() => {
              onFilter && onFilter();
              setOpen(false);
            }}
            className="flex items-center gap-1.5 h-8 px-2 rounded-[4px] hover:bg-[#EAECEF] cursor-pointer select-none text-[#1F2329] text-[14px] transition-colors whitespace-nowrap"
          >
            <FeishuListFilterIcon />
            <span>按 {titleText} 筛选</span>
          </div>

          <div
            onClick={() => {
              onGroup && onGroup();
              setOpen(false);
            }}
            className="flex items-center gap-1.5 h-8 px-2 rounded-[4px] hover:bg-[#EAECEF] cursor-pointer select-none text-[#1F2329] text-[14px] transition-colors whitespace-nowrap"
          >
            <FeishuTableGroupIcon />
            <span>按 {titleText} 分组</span>
          </div>

          <div className="h-[1px] bg-[#EDF0F2] my-1" />

          <div
            onClick={() => {
              onFreeze && onFreeze();
              setOpen(false);
            }}
            className="flex items-center gap-1.5 h-8 px-2 rounded-[4px] hover:bg-[#EAECEF] cursor-pointer select-none text-[#1F2329] text-[14px] transition-colors whitespace-nowrap"
          >
            <FeishuFreeze1ColumnIcon />
            <span>冻结至此字段/列</span>
          </div>
        </div>
      )}

      {/* 竖分割线：悬浮在表头任意位置时整体显现 (加粗2px 加高20px) */}
      {!isLast && (
        <span className="feishu-col-divider absolute right-0 top-1/2 -translate-y-1/2 h-[20px] w-[2px] rounded-full bg-[#DEE0E3] opacity-0 group-hover/thead:opacity-100 transition-opacity duration-150 pointer-events-none z-10" />
      )}

      {/* 拖拽全贯穿蓝色参考线：纯直无多余突出物的 2px 飞书纯蓝线 (1:1 还原图二) */}
      {!isLast && isResizing && (
        <div className="absolute right-0 top-0 w-[2px] h-[2000px] bg-[#3370FF] pointer-events-none z-50" />
      )}

      {/* 飞书原生可拖拽列宽手柄 (12px 舒适捕获热区，悬浮手柄时显现 #3370FF，拖拽时隐藏避免产生凸起) */}
      {!isLast && !isResizing && (
        <div
          onMouseDown={(e) => {
            if (!resizable) return;
            e.stopPropagation();
            e.preventDefault();
            onResizeStart && onResizeStart(e);
          }}
          onClick={(e) => e.stopPropagation()}
          className="absolute -right-1.5 top-0 bottom-0 w-3 z-20 cursor-col-resize flex items-center justify-center group/handle select-none"
        >
          <span className="h-[22px] w-[2px] rounded-full bg-[#3370FF] opacity-0 group-hover/handle:opacity-100 transition-opacity duration-150 pointer-events-none" />
        </div>
      )}
    </div>
  );
};
