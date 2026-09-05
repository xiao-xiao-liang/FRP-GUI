import React, { useState, useRef, useEffect } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import { cn } from "../../../lib/utils";
import { FeishuTooltip } from "../tooltip";
import { FeishuDatePicker } from "./FeishuDatePicker";

export type FilterConjunction = "AND" | "OR";

export interface FilterCondition {
  id: string;
  field: string;
  operator: string;
  value: any;
  datePreset?: string;
}

export interface FilterColumnMeta {
  key: string;
  title: string | React.ReactNode;
  dataIndex?: string;
  dataType?: "text" | "number" | "select" | "user" | "date" | "string";
  options?: Array<{ label: string; value: string; pillVariant?: any }>;
}

export interface FeishuFilterPopoverProps {
  columns: FilterColumnMeta[];
  conditions: FilterCondition[];
  conjunction: FilterConjunction;
  onChange: (conditions: FilterCondition[], conjunction: FilterConjunction) => void;
  onClose: () => void;
  matchedCount?: number;
  className?: string;
  popoverRef?: React.RefObject<HTMLDivElement | null>;
}

const FEISHU_FONT_FAMILY =
  'LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Tahoma, "PingFang SC", "Microsoft Yahei", Arial, "Hiragino Sans GB", sans-serif';

// 飞书原版帮助问号图标 (MaybeOutlined)
const HelpQuestionIcon = ({ className }: { className?: string }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    data-icon="MaybeOutlined"
  >
    <path
      d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-6a1 1 0 1 1 2 0 1 1 0 0 1-2 0ZM8.05 9.282a5.17 5.17 0 0 1 .039-.28c.195-1.085.689-1.883 1.481-2.394.62-.405 1.383-.608 2.288-.608 1.189 0 2.176.288 2.962.864.787.575 1.18 1.428 1.18 2.558 0 .693-.17 1.277-.513 1.752-.2.287-.584.655-1.152 1.103l-.56.44c-.305.24-.507.52-.607.84a2.742 2.742 0 0 0-.072.486.5.5 0 0 1-.498.457h-1.12a.5.5 0 0 1-.498-.546c.065-.696.134-1.136.207-1.321.137-.344.49-.74 1.058-1.188l.575-.455c.19-.144 1.166-.831 1.166-1.44 0-.608-.106-.832-.412-1.166-.305-.333-.993-.44-1.613-.44-.61 0-1.132.161-1.387.572-.118.19-.215.393-.284.6a2.097 2.097 0 0 0-.073.307.5.5 0 0 1-.493.415H8.547a.5.5 0 0 1-.497-.556Z"
      fill="currentColor"
    />
  </svg>
);

// 飞书原版搜索图标 (SearchOutlined - 16px 标准深色 #646A75 / var(--icon-n2))
const SearchIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("text-[#646A75]", className)}
    data-icon="SearchOutlined"
  >
    <path
      d="M16.473 17.887A9.46 9.46 0 0 1 10.5 20a9.5 9.5 0 1 1 9.5-9.5 9.46 9.46 0 0 1-2.113 5.973l3.773 3.773a.996.996 0 0 1-.007 1.407.996.996 0 0 1-1.407.007l-3.773-3.773ZM18 10.5a7.5 7.5 0 1 0-15 0 7.5 7.5 0 0 0 15 0Z"
      fill="currentColor"
    />
  </svg>
);

// 飞书原版对勾图标 (Checkmark)
const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M4.5 12.75l6 6 9-13.5"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 飞书原版语音麦克风图标
const MicIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </svg>
);

// 飞书原版发送箭头图标
const SendArrowIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
  </svg>
);

// --- 1:1 飞书多维表格字段前缀图标 (图三标准: A= 文本图标) ---
const FieldTextIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M3 18.5L7.5 6.5L12 18.5M4.8 15h5.4M14 9h7M14 13.5h7M14 18h7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const FieldSelectIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M6 3v12a3 3 0 0 0 3 3h12" />
    <path d="M18 15l3 3-3 3" />
    <circle cx="6" cy="3" r="1.5" fill="currentColor" />
  </svg>
);

const FieldNumberIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </svg>
);

const FieldUserIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const FieldPriorityIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const FieldDateIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
    <line x1="16" x2="16" y1="2" y2="6" />
    <line x1="8" x2="8" y1="2" y2="6" />
    <line x1="3" x2="21" y1="10" y2="10" />
  </svg>
);

export const getFieldIcon = (fieldKey: string, dataType?: string, isSelected: boolean = false) => {
  const iconColorClass = isSelected ? "text-[#3370FF]" : "text-[#646A75]";
  if (dataType === "number" || fieldKey === "amount") {
    return <FieldNumberIcon className={cn("shrink-0", iconColorClass)} />;
  }
  if (dataType === "date" || fieldKey.includes("Time") || fieldKey.includes("Date")) {
    return <FieldDateIcon className={cn("shrink-0", iconColorClass)} />;
  }
  if (dataType === "user" || fieldKey.includes("contact") || fieldKey.includes("owner")) {
    return <FieldUserIcon className={cn("shrink-0", iconColorClass)} />;
  }
  if (fieldKey === "priority") {
    return <FieldPriorityIcon className={cn("shrink-0", iconColorClass)} />;
  }
  if (fieldKey === "stage") {
    return <FieldSelectIcon className={cn("shrink-0", iconColorClass)} />;
  }
  return <FieldTextIcon className={cn("shrink-0", iconColorClass)} />;
};

// 1. 文本类运算符 (包含、不包含、等于、不等于、为空、不为空)
export const TEXT_OPERATORS = [
  { label: "包含", value: "包含" },
  { label: "不包含", value: "不包含" },
  { label: "等于", value: "等于" },
  { label: "不等于", value: "不等于" },
  { label: "为空", value: "为空" },
  { label: "不为空", value: "不为空" },
];

// 2. 数值类运算符 (等于、不等于、大于、大于等于、小于、小于等于、为空、不为空)
export const NUMBER_OPERATORS = [
  { label: "等于", value: "等于" },
  { label: "不等于", value: "不等于" },
  { label: "大于", value: "大于" },
  { label: "大于等于", value: "大于等于" },
  { label: "小于", value: "小于" },
  { label: "小于等于", value: "小于等于" },
  { label: "为空", value: "为空" },
  { label: "不为空", value: "不为空" },
];

// 3. 日期类运算符 (对齐图一飞书原生: 等于、晚于、早于、为空、不为空、包含、不包含)
export const DATE_OPERATORS = [
  { label: "等于", value: "等于" },
  { label: "晚于", value: "晚于" },
  { label: "早于", value: "早于" },
  { label: "为空", value: "为空" },
  { label: "不为空", value: "不为空" },
  { label: "包含", value: "包含" },
  { label: "不包含", value: "不包含" },
];

// 4. 日期预设选项 (完整 12 项清单)
export const DATE_PRESET_OPTIONS = [
  { label: "具体日期", value: "具体日期" },
  { label: "今天", value: "今天" },
  { label: "明天", value: "明天" },
  { label: "昨天", value: "昨天" },
  { label: "本周", value: "本周" },
  { label: "上周", value: "上周" },
  { label: "本月", value: "本月" },
  { label: "上月", value: "上月" },
  { label: "过去 7 天内", value: "过去 7 天内" },
  { label: "未来 7 天内", value: "未来 7 天内" },
  { label: "过去 30 天内", value: "过去 30 天内" },
  { label: "未来 30 天内", value: "未来 30 天内" },
];

export const getOperatorsByDataType = (dataType?: string) => {
  if (dataType === "number") return NUMBER_OPERATORS;
  if (dataType === "date") return DATE_OPERATORS;
  return TEXT_OPERATORS;
};

// 辅助日期计算
export const getRelativeDateStr = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// 1:1 飞书 Universe Design 原装自定义下拉组件 (.ud__select__selector + .ud__select__dropdown)
interface CustomDropdownProps {
  value: string;
  options: Array<{
    label: string;
    value: string;
    icon?: (isSelected: boolean) => React.ReactNode;
  }>;
  onChange: (val: string) => void;
  className?: string;
  buttonClassName?: string;
  showSearch?: boolean;
  searchPlaceholder?: string;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({
  value,
  options,
  onChange,
  className,
  buttonClassName,
  showSearch = false,
  searchPlaceholder = "搜索字段",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [searchKeyword, setSearchKeyword] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleToggle = () => {
    if (!isOpen && dropdownRef.current) {
      // 空间感知自适应计算 (Placement: top / bottom)
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const estimatedHeight = showSearch ? 260 : options.length * 34 + 12;
      if (spaceBelow < estimatedHeight + 10 && rect.top > estimatedHeight) {
        setPlacement("top");
      } else {
        setPlacement("bottom");
      }
    }
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen) {
      setSearchKeyword("");
      return;
    }
    if (showSearch) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, showSearch]);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  const filteredOptions =
    showSearch && searchKeyword.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(searchKeyword.trim().toLowerCase()))
      : options;

  return (
    <div ref={dropdownRef} className={cn("relative inline-block", isOpen ? "z-50" : "z-10", className)}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          borderColor: isOpen ? "#3370FF" : undefined,
        }}
        className={cn(
          "feishu-box-trigger h-[32px] px-2.5 rounded-[6px] border border-[#DEE0E3] bg-white text-[14px] text-[#1F2329] flex items-center justify-between gap-1.5 cursor-pointer transition-colors duration-150 select-none w-full outline-none",
          isOpen ? "border-[#3370FF]" : "",
          buttonClassName
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          {selectedOption?.icon && selectedOption.icon(false)}
          <span className="truncate">{selectedOption?.label}</span>
        </div>
        {/* 1:1 飞书规则：纯悬浮不反转箭头，仅在 isOpen 打开时旋转 180 度 */}
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-[#8F959E] shrink-0 transition-transform duration-200 pointer-events-none",
            isOpen ? "rotate-180" : "rotate-0"
          )}
        />
      </button>

      {/* 1:1 飞书官方下拉浮层 (.ud__select__dropdown，严格 2px 0 内边距，紧凑贴顶 3px，圆角 6px) */}
      {isOpen && (
        <div
          className={cn(
            "absolute left-0 z-[1050] min-w-full w-max max-w-[240px] bg-white rounded-[6px] border border-[#DEE0E3] shadow-[0_4px_16px_rgba(0,0,0,0.12)] text-[14px] select-none py-[2px]",
            placement === "top"
              ? "bottom-[36px] mb-1 animate-in fade-in-80 slide-in-from-bottom-2 duration-100"
              : "top-[36px] mt-1 animate-in fade-in-80 slide-in-from-top-2 duration-100"
          )}
        >
          {/* 顶部搜索框 (.ud__select__search) */}
          {showSearch && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 mb-[2px] border-b border-[#DEE0E3] bg-white">
              <SearchIcon className="w-4 h-4 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full text-[14px] text-[#1F2329] placeholder:text-[#8F959E] outline-none bg-transparent"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword("")}
                  className="p-0.5 text-[#8F959E] hover:text-[#1F2329] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* 选项列表: 严格依据 .ud__select__list__item 规则 (mx-[3px] my-[1px] px-[8px] h-[32px] rounded-[4px]) */}
          <div
            className={cn(
              showSearch
                ? "feishu-dropdown-scrollbar max-h-[240px] overflow-y-auto"
                : "overflow-y-visible h-auto"
            )}
            style={{ overscrollBehavior: "contain" }}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "mx-[3px] my-[1px] px-[8px] h-[32px] rounded-[4px] flex items-center justify-between gap-2 text-[14px] cursor-pointer transition-colors whitespace-nowrap bg-transparent hover:bg-[#EFF0F1]",
                      isSelected
                        ? "text-[#3370FF] font-medium"
                        : "text-[#1F2329]"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 truncate">
                      {opt.icon && opt.icon(isSelected)}
                      <span className="truncate">{opt.label}</span>
                    </div>
                    {isSelected && <CheckIcon className="w-4 h-4 text-[#3370FF] shrink-0" />}
                  </div>
                );
              })
            ) : (
              <div className="py-3 text-center text-[13px] text-[#8F959E]">
                无匹配字段
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const FeishuFilterPopover: React.FC<FeishuFilterPopoverProps> = ({
  columns,
  conditions,
  conjunction,
  onChange,
  onClose,
  className,
  popoverRef,
}) => {
  // AI 自然语言输入框状态
  const [aiPrompt, setAiPrompt] = useState("");

  // 有效过滤字段（过滤掉操作列和无 dataIndex 列）
  const validColumns = columns.filter((c) => c.key !== "actions" && c.dataIndex);

  const fieldOptions = validColumns.map((col) => {
    const key = (col.dataIndex || col.key) as string;
    return {
      label: typeof col.title === "string" ? col.title : key,
      value: key,
      icon: (isSelected: boolean) => getFieldIcon(key, col.dataType, isSelected),
    };
  });

  const handleAddCondition = () => {
    const defaultCol = validColumns[0] || { key: "customerName" };
    const fieldType = defaultCol.dataType || "text";
    const defaultOp = getOperatorsByDataType(fieldType)[0]?.value || "等于";
    const newCond: FilterCondition = {
      id: String(Date.now()),
      field: defaultCol.dataIndex || defaultCol.key,
      operator: defaultOp,
      value: "",
      datePreset: fieldType === "date" ? "具体日期" : undefined,
    };
    onChange([...conditions, newCond], conjunction);
  };

  const handleUpdateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const next = [...conditions];
    const target = { ...next[index], ...updates };

    // 若更改了字段，联动重置其运算符与默认预设
    if (updates.field && updates.field !== next[index].field) {
      const colMeta = validColumns.find((c) => (c.dataIndex || c.key) === updates.field);
      const fieldType = colMeta?.dataType || "text";
      const validOps = getOperatorsByDataType(fieldType);
      const isOpValid = validOps.some((op) => op.value === target.operator);
      if (!isOpValid) {
        target.operator = validOps[0]?.value || "等于";
      }
      if (fieldType === "date") {
        target.datePreset = target.datePreset || "具体日期";
      } else {
        delete target.datePreset;
      }
    }

    // 若更改了日期预设（今天/明天/昨天/具体日期），自动填充对应的标准日期
    if (updates.datePreset) {
      if (updates.datePreset === "今天") {
        target.value = getRelativeDateStr(0);
      } else if (updates.datePreset === "明天") {
        target.value = getRelativeDateStr(1);
      } else if (updates.datePreset === "昨天") {
        target.value = getRelativeDateStr(-1);
      }
    }

    next[index] = target;
    onChange(next, conjunction);
  };

  const handleRemoveCondition = (index: number) => {
    const next = conditions.filter((_, i) => i !== index);
    onChange(next, conjunction);
  };

  // AI 自然语言智能筛选解析触发
  const handleAiSubmit = () => {
    if (!aiPrompt.trim()) return;
    const text = aiPrompt.trim();

    let matchedField = "customerName";
    let matchedOp = "包含";
    let matchedVal = text;

    if (text.includes("大于") || text.includes(">")) {
      matchedField = "amount";
      matchedOp = "大于";
      matchedVal = text.replace(/[^0-9]/g, "");
    } else if (text.includes("小于") || text.includes("<")) {
      matchedField = "amount";
      matchedOp = "小于";
      matchedVal = text.replace(/[^0-9]/g, "");
    } else if (text.includes("赢单") || text.includes("谈判") || text.includes("意向")) {
      matchedField = "stage";
      matchedOp = "等于";
      matchedVal = text.includes("赢单") ? "赢单" : text.includes("谈判") ? "商务谈判" : "意向沟通";
    }

    const newCond: FilterCondition = {
      id: String(Date.now()),
      field: matchedField,
      operator: matchedOp,
      value: matchedVal,
    };

    onChange([newCond], conjunction);
    setAiPrompt("");
  };

  return (
    <div
      ref={popoverRef}
      style={{ fontFamily: FEISHU_FONT_FAMILY }}
      className={cn(
        "absolute right-0 top-[42px] z-50 w-[530px] max-w-[calc(100vw-32px)] bg-white rounded-[10px] border border-[#DEE0E3] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.15)] text-[14px] text-[#1F2329] animate-in fade-in-80 duration-150 select-none",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 嵌入 1:1 飞书 hover 样式与 5px 细滚动条规则 */}
      <style>{`
        .feishu-box-trigger:hover,
        .feishu-input-box:hover,
        .feishu-input-box:focus,
        .feishu-input-box:focus-within {
          border-color: #3370FF !important;
        }
        .feishu-dropdown-scrollbar {
          overscroll-behavior: contain !important;
          overscroll-behavior-y: contain !important;
        }
        .feishu-dropdown-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .feishu-dropdown-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .feishu-dropdown-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(31, 35, 41, 0.28);
          border-radius: 9999px;
          transition: background-color 0.2s cubic-bezier(0.34, 0.69, 0.1, 1);
        }
        .feishu-dropdown-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: rgba(31, 35, 41, 0.55);
        }
      `}</style>

      {/* 1. 顶部标题栏: 设置筛选条件 + 复用 FeishuTooltip 的帮助问号 */}
      <div className="flex items-center gap-1 text-[14px] font-medium text-[#1F2329]">
        <span>设置筛选条件</span>
        <FeishuTooltip title="设置条件来过滤数据" side="top" sideOffset={6}>
          <button
            type="button"
            className="text-[#8F959E] hover:text-[#1F2329] transition-colors p-0.5 inline-flex items-center cursor-pointer"
          >
            <HelpQuestionIcon className="w-4 h-4 text-[#8F959E]" />
          </button>
        </FeishuTooltip>
      </div>

      {/* 2. AI 自然语言筛选框: 告诉 AI 你想看到什么 + 🎤 + ➤ */}
      <div className="feishu-input-box my-3.5 h-[38px] px-3 border border-[#DEE0E3] rounded-[6px] flex items-center bg-white transition-colors duration-150">
        <input
          type="text"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAiSubmit();
          }}
          placeholder="告诉 AI 你想看到什么"
          className="flex-1 text-[14px] text-[#1F2329] placeholder:text-[#8F959E] outline-none bg-transparent"
        />

        <div className="flex items-center gap-2 text-[#8F959E]">
          <FeishuTooltip title="语音输入" side="top" sideOffset={6}>
            <button
              type="button"
              className="text-[#646A75] hover:text-[#1F2329] transition-colors p-1 cursor-pointer"
            >
              <MicIcon className="w-4 h-4" />
            </button>
          </FeishuTooltip>
          <FeishuTooltip title="发送" side="top" sideOffset={6}>
            <button
              type="button"
              onClick={handleAiSubmit}
              className={cn(
                "transition-colors p-1 cursor-pointer",
                aiPrompt.trim() ? "text-[#3370FF]" : "text-[#8F959E] hover:text-[#646A75]"
              )}
            >
              <SendArrowIcon className="w-4 h-4" />
            </button>
          </FeishuTooltip>
        </div>
      </div>

      {/* 3. 符合以下 [ 所有 ∨ ] 条件 (仅在 conditions.length >= 2 时显现) */}
      {conditions.length >= 2 && (
        <div className="flex items-center gap-1.5 text-[14px] text-[#1F2329] mb-3 select-none animate-in fade-in-50 duration-150">
          <span className="text-[#646A75]">符合以下</span>
          <CustomDropdown
            value={conjunction}
            options={[
              { label: "所有", value: "AND" },
              { label: "任意", value: "OR" },
            ]}
            onChange={(val) => onChange(conditions, val as FilterConjunction)}
            className="w-[72px]"
            buttonClassName="h-[28px] px-2 py-0 border-transparent hover:border-[#3370FF] bg-transparent text-[14px]"
          />
          <span className="text-[#646A75]">条件</span>
        </div>
      )}

      {/* 4. 结构化筛选条件行列表: [ 字段 ∨ ] [ 运算符 ∨ ] [ 目标值 / (日期预设+日期控件) ] ✕ */}
      {conditions.length > 0 && (
        <div className="space-y-2.5 mb-3">
          {conditions.map((cond, idx) => {
            const colMeta = validColumns.find((c) => (c.dataIndex || c.key) === cond.field);
            const fieldType = colMeta?.dataType || "text";
            const operatorOptions = getOperatorsByDataType(fieldType);
            const isNullOp = cond.operator === "为空" || cond.operator === "不为空";

            return (
              <div key={cond.id || idx} className="flex items-center gap-2 relative">
                {/* ① 字段选择器 (客户名称 ∨ - 带搜索字段输入框、左侧类型图标与蓝字对勾) */}
                <CustomDropdown
                  value={cond.field}
                  options={fieldOptions}
                  onChange={(val) => handleUpdateCondition(idx, { field: val })}
                  className="w-[130px] shrink-0"
                  showSearch={true}
                  searchPlaceholder="搜索字段"
                />

                {/* ② 运算符选择器 (根据列类型动态给出: 文本/数值/日期 - 纯净无滚动条) */}
                <CustomDropdown
                  value={cond.operator || operatorOptions[0].value}
                  options={operatorOptions}
                  onChange={(val) => handleUpdateCondition(idx, { operator: val })}
                  className={fieldType === "number" ? "w-[98px] shrink-0" : "w-[90px] shrink-0"}
                  showSearch={false}
                />

                {/* ③ 目标值输入区域 (文本/数值/日期差异化渲染) */}
                {!isNullOp && (
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    {fieldType === "date" ? (
                      <>
                        {/* 日期预设下拉 (完整 12 项清单，宽度 108px，纯净无滚动条) */}
                        <CustomDropdown
                          value={cond.datePreset || "具体日期"}
                          options={DATE_PRESET_OPTIONS}
                          onChange={(val) => handleUpdateCondition(idx, { datePreset: val as any })}
                          className="w-[108px] shrink-0"
                          showSearch={false}
                        />

                        {/* 1:1 原装飞书日历选择器 */}
                        <div className="relative flex-1 min-w-0">
                          <FeishuDatePicker
                            value={cond.value ?? ""}
                            onChange={(dateVal) => handleUpdateCondition(idx, { value: dateVal, datePreset: "具体日期" })}
                            placeholder="年 / 月 / 日"
                          />
                        </div>
                      </>
                    ) : fieldType === "number" ? (
                      <input
                        type="number"
                        placeholder="请输入数字"
                        value={cond.value ?? ""}
                        onChange={(e) => handleUpdateCondition(idx, { value: e.target.value })}
                        className="feishu-input-box w-full h-[32px] px-3 rounded-[6px] border border-[#DEE0E3] bg-white text-[14px] text-[#1F2329] placeholder:text-[#8F959E] outline-none transition-colors duration-150 tabular-nums"
                      />
                    ) : (
                      <input
                        type="text"
                        placeholder="请输入"
                        value={cond.value ?? ""}
                        onChange={(e) => handleUpdateCondition(idx, { value: e.target.value })}
                        className="feishu-input-box w-full h-[32px] px-3 rounded-[6px] border border-[#DEE0E3] bg-white text-[14px] text-[#1F2329] placeholder:text-[#8F959E] outline-none transition-colors duration-150"
                      />
                    )}
                  </div>
                )}

                {/* 空值操作占位 (保持行对齐) */}
                {isNullOp && <div className="flex-1" />}

                {/* ④ 行末删除叉号 (✕) */}
                <button
                  type="button"
                  onClick={() => handleRemoveCondition(idx)}
                  className="w-7 h-7 flex items-center justify-center text-[#8F959E] hover:text-[#1F2329] rounded-[4px] hover:bg-[#EFF0F1] transition-colors cursor-pointer shrink-0"
                  title="删除条件"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. 底部: + 添加条件 */}
      <div className={conditions.length > 0 ? "pt-1" : ""}>
        <button
          type="button"
          onClick={handleAddCondition}
          className="text-[14px] font-medium text-[#1F2329] hover:text-[#3370FF] inline-flex items-center gap-1.5 transition-colors cursor-pointer select-none"
        >
          <Plus className="w-4 h-4 text-[#1F2329]" />
          <span>添加条件</span>
        </button>
      </div>
    </div>
  );
};
