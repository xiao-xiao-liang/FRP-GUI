import React, { useState, useRef, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import { cn } from "../../../lib/utils";

interface FeishuDatePickerProps {
  value?: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

type DatePickerMode = "date" | "month" | "year";

const ChevronLeftIcon = ({ className }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const DoubleLeftIcon = ({ className }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="11 17 6 12 11 7" />
    <polyline points="18 17 13 12 18 7" />
  </svg>
);

const DoubleRightIcon = ({ className }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="13 17 18 12 13 7" />
    <polyline points="6 17 11 12 6 7" />
  </svg>
);

export const FeishuDatePicker: React.FC<FeishuDatePickerProps> = ({
  value,
  onChange,
  placeholder = "年 / 月 / 日",
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<DatePickerMode>("date");
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [isHovered, setIsHovered] = useState(false);

  // 当前视图年月
  const initialDate = value ? new Date(value) : new Date();
  const [viewYear, setViewYear] = useState(isNaN(initialDate.getFullYear()) ? new Date().getFullYear() : initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(isNaN(initialDate.getMonth()) ? new Date().getMonth() : initialDate.getMonth());

  // 年份跨度基准 (20 年一个区间)
  const startYearRange = Math.floor(viewYear / 20) * 20;

  const containerRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 320 && rect.top > 320) {
        setPlacement("top");
      } else {
        setPlacement("bottom");
      }
      setMode("date");
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // 计算当前月日历天数网格（包含上月末和下月初，按周一至周日排列）
  const getCalendarDays = () => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    let startDayOfWeek = firstDayOfMonth.getDay();
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
    }> = [];

    // 上月末尾填充
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(viewYear, viewMonth - 1, dayNum);
      const dateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      days.push({ dateStr, dayNumber: dayNum, isCurrentMonth: false });
    }

    // 本月天数
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      days.push({ dateStr, dayNumber: i, isCurrentMonth: true });
    }

    // 下月初填充至完整 42 天 (6 行)
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(viewYear, viewMonth + 1, i);
      const dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
      days.push({ dateStr, dayNumber: i, isCurrentMonth: false });
    }

    return days;
  };

  const handleSelectDate = (dateStr: string) => {
    onChange(dateStr);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const monthsList = [
    "1月", "2月", "3月", "4月", "5月", "6月",
    "7月", "8月", "9月", "10月", "11月", "12月"
  ];

  const yearRangeList = Array.from({ length: 20 }, (_, i) => startYearRange + i);

  // 格式化日期为 1:1 飞书标准形式: YYYY/MM/DD (例如 2026/08/18)
  const displayDateText = value ? value.replace(/-/g, "/") : placeholder;

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn("relative inline-block w-[110px] min-w-[110px] select-none", className)}
    >
      {/* 触发输入框: [ 2026/08/18 ∨ ] (1:1 对齐图二飞书原生紧凑宽度与 4px 贴合间隙) */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "feishu-box-trigger w-full h-[32px] px-2 rounded-[6px] border border-[#DEE0E3] bg-white text-[13px] text-[#1F2329] flex items-center justify-between gap-1 cursor-pointer transition-colors duration-150 outline-none",
          isOpen ? "border-[#3370FF]" : ""
        )}
      >
        <span className={cn("truncate", !value ? "text-[#8F959E]" : "text-[#1F2329]")}>
          {displayDateText}
        </span>
        <div className="flex items-center shrink-0 ml-0.5">
          {value && isHovered ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="p-0.5 text-[#8F959E] hover:text-[#1F2329] rounded"
            >
              <X className="w-3.5 h-3.5" />
            </div>
          ) : (
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-[#646A75] shrink-0 transition-transform duration-200 pointer-events-none",
                isOpen ? "rotate-180" : "rotate-0"
              )}
            />
          )}
        </div>
      </button>

      {/* 1:1 原生飞书 Universe Design 日历浮层面板 (.ud__picker-dropdown，右对齐 right-0，固定 278px 宽度，p-[15px]) */}
      {isOpen && (
        <div
          className={cn(
            "absolute right-0 z-[1050] w-[278px] bg-white rounded-[8px] border border-[#DEE0E3] shadow-[0_4px_16px_rgba(0,0,0,0.12)] p-[15px] text-[14px] text-[#1F2329] box-border",
            placement === "top"
              ? "bottom-[36px] mb-1 animate-in fade-in-80 slide-in-from-bottom-2 duration-100"
              : "top-[36px] mt-1 animate-in fade-in-80 slide-in-from-top-2 duration-100"
          )}
        >
          {/* ===================== ① 日期视图 (Date / Day View - 1:1 对齐图一) ===================== */}
          {mode === "date" && (
            <div className="w-[248px]">
              {/* Header: [ 2026年 ][ 8月 ][ ∨ ]             <   > */}
              <div className="flex items-center justify-between mb-3 text-[14px]">
                <div className="flex items-center">
                  {/* 年份独立按钮 */}
                  <button
                    type="button"
                    onClick={() => setMode("year")}
                    className="ud__picker-panel-header-btn text-[14px] font-medium text-[#1F2329] hover:text-[#3370FF] mr-1 cursor-pointer transition-colors"
                  >
                    {`${viewYear}年`}
                  </button>

                  {/* 月份独立按钮 */}
                  <button
                    type="button"
                    onClick={() => setMode("month")}
                    className="ud__picker-panel-header-btn text-[14px] font-medium text-[#1F2329] hover:text-[#3370FF] cursor-pointer transition-colors"
                  >
                    {`${viewMonth + 1}月`}
                  </button>

                  {/* 折叠切换小箭头 */}
                  <div
                    onClick={() => setMode("month")}
                    className="w-5 h-5 rounded-[4px] bg-[#EFF0F1] flex items-center justify-center cursor-pointer hover:bg-[#E1EAFF] transition-colors ml-1.5 group"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-[#646A75] group-hover:text-[#3370FF] transition-transform" />
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[#646A75]">
                  <button
                    type="button"
                    onClick={handlePrevMonth}
                    className="w-6 h-6 rounded-[4px] flex items-center justify-center hover:bg-[#EFF0F1] hover:text-[#1F2329] cursor-pointer transition-colors"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextMonth}
                    className="w-6 h-6 rounded-[4px] flex items-center justify-center hover:bg-[#EFF0F1] hover:text-[#1F2329] cursor-pointer transition-colors"
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 星期表头: 一  二  三  四  五  六  日 */}
              <div className="grid grid-cols-7 text-center text-[12px] text-[#8F959E] mb-2 font-normal">
                <div>一</div>
                <div>二</div>
                <div>三</div>
                <div>四</div>
                <div>五</div>
                <div>六</div>
                <div>日</div>
              </div>

              {/* 42 天日期网格 */}
              <div className="grid grid-cols-7 gap-y-1 text-center text-[13px]">
                {getCalendarDays().map((item, idx) => {
                  const isSelected = value === item.dateStr;
                  const isToday = item.dateStr === todayStr;

                  return (
                    <div
                      key={idx}
                      onClick={() => handleSelectDate(item.dateStr)}
                      className="h-[30px] flex items-center justify-center cursor-pointer"
                    >
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center transition-colors text-[13px]",
                          isSelected
                            ? "bg-[#3370FF] text-white font-medium shadow-sm"
                            : isToday
                            ? "border border-[#3370FF] text-[#3370FF] font-medium hover:bg-[#EFF0F1]"
                            : item.isCurrentMonth
                            ? "text-[#1F2329] hover:bg-[#EFF0F1]"
                            : "text-[#8F959E]/60 hover:bg-[#EFF0F1]/50"
                        )}
                      >
                        {item.dayNumber}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===================== ② 月份视图 (Month View - 1:1 对齐图二) ===================== */}
          {mode === "month" && (
            <div className="w-[248px]">
              {/* Header: [ 2026年 ][ 8月 ][ ∧ ]             <<   >> */}
              <div className="flex items-center justify-between mb-4 text-[14px]">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setMode("year")}
                    className="ud__picker-panel-header-btn text-[14px] font-medium text-[#1F2329] hover:text-[#3370FF] mr-1 cursor-pointer transition-colors"
                  >
                    {`${viewYear}年`}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode("date")}
                    className="ud__picker-panel-header-btn text-[14px] font-medium text-[#1F2329] hover:text-[#3370FF] cursor-pointer transition-colors"
                  >
                    {`${viewMonth + 1}月`}
                  </button>

                  <div
                    onClick={() => setMode("date")}
                    className="w-5 h-5 rounded-[4px] bg-[#EFF0F1] flex items-center justify-center cursor-pointer hover:bg-[#E1EAFF] transition-colors ml-1.5 group"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-[#646A75] group-hover:text-[#3370FF] rotate-180 transition-transform" />
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[#646A75]">
                  <button
                    type="button"
                    onClick={() => setViewYear(viewYear - 1)}
                    className="w-6 h-6 rounded-[4px] flex items-center justify-center hover:bg-[#EFF0F1] hover:text-[#1F2329] cursor-pointer transition-colors"
                  >
                    <DoubleLeftIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewYear(viewYear + 1)}
                    className="w-6 h-6 rounded-[4px] flex items-center justify-center hover:bg-[#EFF0F1] hover:text-[#1F2329] cursor-pointer transition-colors"
                  >
                    <DoubleRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 12 个月份矩阵 (3 列 x 4 行，依据 .ud__picker-month-panel-cell width: 48px, height: 32px) */}
              <div className="grid grid-cols-3 gap-y-4 gap-x-2 text-center text-[13px] py-1">
                {monthsList.map((m, idx) => {
                  const isCurrent = idx === viewMonth;
                  return (
                    <div
                      key={m}
                      onClick={() => {
                        setViewMonth(idx);
                        setMode("date");
                      }}
                      className="flex items-center justify-center cursor-pointer"
                    >
                      <div
                        className={cn(
                          "w-[48px] h-[32px] rounded-[4px] flex items-center justify-center transition-colors",
                          isCurrent
                            ? "text-[#3370FF] font-medium hover:bg-[#EFF0F1]"
                            : "text-[#1F2329] hover:bg-[#EFF0F1]"
                        )}
                      >
                        {m}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===================== ③ 年份跨度视图 (Year Range View - 1:1 对齐图三) ===================== */}
          {mode === "year" && (
            <div className="w-[248px]">
              {/* Header: 2020 - 2039                         <<   >> */}
              <div className="flex items-center justify-between mb-4 text-[14px]">
                <div className="font-medium text-[#3370FF]">
                  {`${startYearRange} - ${startYearRange + 19}`}
                </div>

                <div className="flex items-center gap-1 text-[#646A75]">
                  <button
                    type="button"
                    onClick={() => setViewYear(viewYear - 20)}
                    className="w-6 h-6 rounded-[4px] flex items-center justify-center hover:bg-[#EFF0F1] hover:text-[#1F2329] cursor-pointer transition-colors"
                  >
                    <DoubleLeftIcon className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewYear(viewYear + 20)}
                    className="w-6 h-6 rounded-[4px] flex items-center justify-center hover:bg-[#EFF0F1] hover:text-[#1F2329] cursor-pointer transition-colors"
                  >
                    <DoubleRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 20 个年份矩阵 (4 列 x 5 行，依据 .ud__picker-year-panel-cell width: 48px, height: 30px) */}
              <div className="grid grid-cols-4 gap-y-2 text-center text-[13px] py-1">
                {yearRangeList.map((yr) => {
                  const isCurrent = yr === viewYear;
                  return (
                    <div
                      key={yr}
                      onClick={() => {
                        setViewYear(yr);
                        setMode("month");
                      }}
                      className="flex items-center justify-center cursor-pointer"
                    >
                      <div
                        className={cn(
                          "w-[48px] h-[30px] rounded-[4px] flex items-center justify-center transition-colors",
                          isCurrent
                            ? "text-[#3370FF] font-medium hover:bg-[#EFF0F1]"
                            : "text-[#1F2329] hover:bg-[#EFF0F1]"
                        )}
                      >
                        {yr}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
