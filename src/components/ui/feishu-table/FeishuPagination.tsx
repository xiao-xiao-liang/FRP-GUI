import React, { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Check } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface FeishuPaginationProps {
  current: number;
  total: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onChange?: (page: number, pageSize: number) => void;
  className?: string;
}

const FEISHU_FONT_FAMILY =
  'LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Tahoma, "PingFang SC", "Microsoft Yahei", Arial, "Hiragino Sans GB", sans-serif';

// 1:1 飞书多维表格底栏分页器 (弹出效果、圆角、阴影及失焦稳定机制完全对齐表头列下拉框)
export const FeishuPagination: React.FC<FeishuPaginationProps> = ({
  current,
  total,
  pageSize,
  pageSizeOptions = [10, 20, 30, 40, 50, 100],
  onChange,
  className,
}) => {
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [jumpPage, setJumpPage] = useState("");
  const pageSizeRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 仅在网页内点击外部时触发关闭，切换窗口与截图时不销毁（与表头下拉框 1:1 一致）
  useEffect(() => {
    if (!pageSizeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pageSizeRef.current && !pageSizeRef.current.contains(e.target as Node)) {
        setPageSizeOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [pageSizeOpen]);

  const handlePageChange = (p: number) => {
    if (p >= 1 && p <= totalPages && onChange) {
      onChange(p, pageSize);
    }
  };

  const handlePageSizeChange = (size: number) => {
    setPageSizeOpen(false);
    if (onChange) {
      onChange(1, size);
    }
  };

  const handleJumpSubmit = (e: React.FormEvent | React.FocusEvent) => {
    e.preventDefault();
    const p = parseInt(jumpPage, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages) {
      handlePageChange(p);
    }
    setJumpPage("");
  };

  return (
    <div
      style={{ fontFamily: FEISHU_FONT_FAMILY }}
      className={cn("flex items-center justify-end gap-3 pt-3 pb-1 bg-white text-[14px] text-[#1F2329] select-none tabular-nums", className)}
    >
      {/* 1. 共 X 条 (14px) */}
      <span className="text-[14px] text-[#1F2329] font-normal mr-1">共 {total} 条</span>

      {/* 2. 页码器 (< 1 2 3 >) (14px) */}
      <div className="flex items-center gap-1">
        {/* 上一页 < */}
        <button
          type="button"
          onClick={() => handlePageChange(current - 1)}
          disabled={current <= 1}
          className={cn(
            "w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors",
            current <= 1
              ? "text-[#BBBFC4] cursor-not-allowed"
              : "text-[#646A75] hover:text-[#1F2329] hover:bg-[#E5E7EB] cursor-pointer"
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* 页码按钮 */}
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
          const isActive = page === current;
          return (
            <button
              key={page}
              type="button"
              onClick={() => handlePageChange(page)}
              style={{ fontFamily: FEISHU_FONT_FAMILY }}
              className={cn(
                "min-w-[26px] h-7 px-1.5 rounded-[6px] text-[14px] transition-colors cursor-pointer flex items-center justify-center leading-none",
                isActive
                  ? "bg-[#D8DBDE] text-[#1F2329] font-medium"
                  : "text-[#1F2329] font-normal hover:bg-[#E5E7EB]"
              )}
            >
              {page}
            </button>
          );
        })}

        {/* 下一页 > */}
        <button
          type="button"
          onClick={() => handlePageChange(current + 1)}
          disabled={current >= totalPages}
          className={cn(
            "w-7 h-7 rounded-[6px] flex items-center justify-center transition-colors",
            current >= totalPages
              ? "text-[#BBBFC4] cursor-not-allowed"
              : "text-[#646A75] hover:text-[#1F2329] hover:bg-[#E5E7EB] cursor-pointer"
          )}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 3. 每页条数选择器 (弹出效果与阴影、圆角、机制与表头列下拉框 100% 对齐) */}
      <div ref={pageSizeRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setPageSizeOpen((prev) => !prev)}
          style={{ fontFamily: FEISHU_FONT_FAMILY }}
          className={cn(
            "h-[30px] px-2.5 rounded-[6px] border bg-white text-[13px] text-[#1F2329] inline-flex items-center justify-between gap-1 cursor-pointer transition-all outline-none",
            pageSizeOpen
              ? "border-[#3370FF] ring-1 ring-[#3370FF]"
              : "border-[#D0D3D6] hover:border-[#8F959E]"
          )}
        >
          <span className="leading-none text-[13px]">{pageSize} 条/页</span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-[#8F959E] transition-transform duration-200 ease-out",
              pageSizeOpen && "rotate-180"
            )}
          />
        </button>

        {/* 下拉弹窗选项列表 (1:1 弹出效果：rounded-[8px]、shadow-[0_4px_16px_rgba(31,35,41,0.12)]、fade-in-80) */}
        {pageSizeOpen && (
          <div
            style={{ fontFamily: FEISHU_FONT_FAMILY }}
            className="absolute left-0 bottom-[34px] z-50 min-w-[96px] w-[102px] bg-white rounded-[8px] border border-[#DEE0E1] p-1 shadow-[0_4px_16px_rgba(31,35,41,0.12)] text-[14px] text-[#1F2329] animate-in fade-in-80 duration-150 ease-out tabular-nums"
          >
            {pageSizeOptions.map((option) => {
              const isSelected = option === pageSize;
              return (
                <div
                  key={option}
                  onClick={() => handlePageSizeChange(option)}
                  style={{ fontFamily: FEISHU_FONT_FAMILY }}
                  className={cn(
                    "flex items-center justify-between h-[28px] px-2 rounded-[4px] outline-none cursor-pointer text-[14px] transition-colors select-none",
                    isSelected
                      ? "bg-[#EAECEF] text-[#3370FF] font-medium"
                      : "text-[#1F2329] hover:bg-[#EAECEF]"
                  )}
                >
                  <span className="text-[14px]">{option} 条/页</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#3370FF] shrink-0" />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. 跳至 [ ] 页 (14px) */}
      <form onSubmit={handleJumpSubmit} className="flex items-center gap-1.5" style={{ fontFamily: FEISHU_FONT_FAMILY }}>
        <span className="text-[14px] text-[#1F2329]">跳至</span>
        <input
          type="text"
          value={jumpPage}
          onChange={(e) => setJumpPage(e.target.value)}
          onBlur={handleJumpSubmit}
          style={{ fontFamily: FEISHU_FONT_FAMILY }}
          className="w-10 h-[30px] border border-[#D0D3D6] rounded-[6px] bg-white text-center text-[13px] text-[#1F2329] outline-none focus:border-[#3370FF] focus:ring-1 focus:ring-[#3370FF] transition-all"
        />
        <span className="text-[14px] text-[#1F2329]">页</span>
      </form>
    </div>
  );
};
