import React, { useState, useRef, useEffect } from "react";
import { cn } from "../../../lib/utils";
import { Plus, X } from "lucide-react";
import { FeishuTooltip } from "../tooltip";
import { FeishuInput, FeishuInputRef } from "./FeishuInput";
import {
  FeishuFilterPopover,
  FilterCondition,
  FilterConjunction,
  FilterColumnMeta,
  getFieldIcon,
} from "./FeishuFilterPopover";

// --- 1:1 飞书官方原生 Universe Design 矢量图标组件 (禁止臆造，严格对齐设计稿) ---
const FeishuFilterIcon = ({ className }: { className?: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("w-3.5 h-3.5 shrink-0", className)}
    data-icon="ListFilterOutlined"
  >
    <path
      d="M15 3a2 2 0 0 1 2 2v2.15a1.4 1.4 0 0 1-.487 1.061L12 11.792v9.083c0 .578-.432 1.055-.991 1.125l-.142.009c-.197 0-.39-.051-.561-.149l-3.683-2.476C6.227 19.159 6 18.955 6 18.5v-6.71L1.49 8.212a1.4 1.4 0 0 1-.48-.89L1 7.149V5.001a2 2 0 0 1 2-2h12Zm5 14a1 1 0 1 1 0 2h-4a1 1 0 1 1 0-2h4ZM15 5H2.999L3 7l4.493 3.454c.267.228.453.528.496.872L8 11.5V18l2 1.385v-7.868c0-.35.13-.685.363-.94l.125-.122L15 7V5Zm7 8a1 1 0 1 1 0 2h-6a1 1 0 1 1 0-2h6Z"
      fill="currentColor"
    />
  </svg>
);

const FeishuGroupIcon = ({ className }: { className?: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("w-3.5 h-3.5 shrink-0", className)}
    data-icon="TableGroupOutlined"
  >
    <path
      d="M10 9a1 1 0 0 1 1-1h6.5a1 1 0 1 1 0 2H11a1 1 0 0 1-1-1Zm1 5a1 1 0 1 0 0 2h6.5a1 1 0 1 0 0-2H11ZM8.25 9a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm-1.5 7.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
      fill="currentColor"
    />
    <path
      d="M3.5 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h17a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-17Zm17 2v16h-17V4h17Z"
      fill="currentColor"
    />
  </svg>
);

const FeishuSortIcon = ({ className }: { className?: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("w-3.5 h-3.5 shrink-0", className)}
    data-icon="SorAToZOutlined"
  >
    <path
      d="M17 1.333h-1.803s-.419.137-.498.343l-3.664 9.598a.533.533 0 0 0 .498.724h.978a.533.533 0 0 0 .5-.347l.664-1.785h4.841l.663 1.786c.078.21.277.348.5.348h.987a.533.533 0 0 0 .498-.724l-3.666-9.6A.533.533 0 0 0 17 1.333Zm.725 6.4h-3.264l1.605-4.316h.05l1.61 4.316Zm-6.175 6.4c0-.294.238-.533.533-.533h8.522c.295 0 .534.239.534.534v.703c0 .154-.067.3-.183.402l-6.068 5.298h5.717c.295 0 .534.24.534.534v1.063a.533.533 0 0 1-.534.533h-8.522a.533.533 0 0 1-.534-.534v-.973c0-.154.067-.3.183-.402l5.763-5.027h-5.412a.533.533 0 0 1-.534-.534v-1.063Zm-8.923 2.534h2.705V3.2c0-.294.238-.533.533-.533h.933c.295 0 .534.239.534.533v19.16a.533.533 0 0 1-.965.314l-4-5.499a.32.32 0 0 1 .26-.508Z"
      fill="currentColor"
    />
  </svg>
);

const FeishuSearchIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("w-4 h-4 shrink-0", className)}
    data-icon="SearchOutlined"
  >
    <path
      d="M16.473 17.887A9.46 9.46 0 0 1 10.5 20a9.5 9.5 0 1 1 9.5-9.5 9.46 9.46 0 0 1-2.113 5.973l3.773 3.773a.996.996 0 0 1-.007 1.407.996.996 0 0 1-1.407.007l-3.773-3.773ZM18 10.5a7.5 7.5 0 1 0-15 0 7.5 7.5 0 0 0 15 0Z"
      fill="currentColor"
    />
  </svg>
);

// 1:1 飞书官方高级搜索/匹配选项图标 (AdvancedActivedOutlined - 放大一号至 16px)
const FeishuAdvancedActivedIcon = ({ className }: { className?: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={cn("w-4 h-4 shrink-0", className)}
    data-icon="AdvancedActivedOutlined"
  >
    <path
      d="M1 4a1 1 0 0 1 1-1h20a1 1 0 1 1 0 2H2a1 1 0 0 1-1-1Zm3 8a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm4 7a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2H8Z"
      fill="currentColor"
    />
  </svg>
);

const FEISHU_FONT_FAMILY =
  'LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Tahoma, "PingFang SC", "Microsoft Yahei", Arial, "Hiragino Sans GB", sans-serif';

export interface FeishuToolbarProps {
  title?: string;
  totalCount?: number;
  selectedCount?: number;
  matchedCount?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  onSearchScopeChange?: (selectedFieldKeys: string[]) => void;
  onAdd?: () => void;
  addButtonText?: string;
  onExport?: () => void;
  onBatchDelete?: () => void;
  customLeftTools?: React.ReactNode;
  customRightTools?: React.ReactNode;
  columns?: FilterColumnMeta[];
  filterConditions?: FilterCondition[];
  filterConjunction?: FilterConjunction;
  onFilterChange?: (conditions: FilterCondition[], conjunction: FilterConjunction) => void;
  isFilterOpen?: boolean;
  onToggleFilterOpen?: (open?: boolean) => void;
  className?: string;
}

export const FeishuToolbar: React.FC<FeishuToolbarProps> = ({
  title,
  totalCount = 0,
  selectedCount = 0,
  matchedCount,
  searchable = true,
  searchPlaceholder = "在列表中搜索",
  onSearch,
  onSearchScopeChange,
  onAdd,
  addButtonText = "+ 新增",
  onExport,
  onBatchDelete,
  customLeftTools,
  customRightTools,
  columns = [],
  filterConditions = [],
  filterConjunction = "AND",
  onFilterChange,
  isFilterOpen,
  onToggleFilterOpen,
  className,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [internalPopup, setInternalPopup] = useState<"filter" | "group" | "sort" | null>(null);

  const activePopup = isFilterOpen !== undefined ? (isFilterOpen ? "filter" : internalPopup === "filter" ? null : internalPopup) : internalPopup;

  // 模拟分组字段状态
  const [selectedGroup, setSelectedGroup] = useState<string>("stage");

  // 模拟排序规则状态
  const [sortList, setSortList] = useState<Array<{ id: string; field: string; order: "asc" | "desc" }>>([
    { id: "1", field: "amount", order: "desc" },
  ]);

  const [isSearchSettingsOpen, setIsSearchSettingsOpen] = useState(false);
  const [fieldFilterKeyword, setFieldFilterKeyword] = useState("");

  // 可供搜索的有效列清单 (1:1 包含飞书 CRM 完整 12 字段)
  const effectiveColumns = React.useMemo(() => {
    if (columns && columns.length > 0) return columns;
    return [
      { key: "customerName", title: "客户名称", dataType: "text" },
      { key: "description", title: "商机描述", dataType: "text" },
      { key: "stage", title: "商机阶段", dataType: "select" },
      { key: "amount", title: "商机金额", dataType: "number" },
      { key: "priority", title: "优先级", dataType: "select" },
      { key: "owner", title: "销售负责人", dataType: "user" },
      { key: "winRate", title: "赢率预测", dataType: "number" },
      { key: "actualAmount", title: "实际成交金额", dataType: "number" },
      { key: "expectedCloseDate", title: "预计成交日期", dataType: "date" },
      { key: "lastFollowUpDate", title: "最后跟进日期", dataType: "date" },
      { key: "actualCloseDate", title: "实际成交日期", dataType: "date" },
      { key: "aiSummary", title: "一句话进展", dataType: "text" },
    ];
  }, [columns]);

  // 已选中的字段 Keys (默认全选)
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>(() =>
    effectiveColumns.map((c) => (c.key || (c as any).dataIndex || ""))
  );

  useEffect(() => {
    if (effectiveColumns.length > 0) {
      const allKeys = effectiveColumns.map((c) => (c.key || (c as any).dataIndex || ""));
      setSelectedFieldKeys(allKeys);
    }
  }, [effectiveColumns]);

  const isAllFieldsSelected = selectedFieldKeys.length === effectiveColumns.length;
  const isPartialSelected = selectedFieldKeys.length > 0 && selectedFieldKeys.length < effectiveColumns.length;

  const handleToggleAllFields = () => {
    const newKeys = isAllFieldsSelected ? [] : effectiveColumns.map((c) => (c.key || (c as any).dataIndex || ""));
    setSelectedFieldKeys(newKeys);
    if (onSearchScopeChange) onSearchScopeChange(newKeys);
  };

  const handleToggleField = (colKey: string) => {
    const newKeys = selectedFieldKeys.includes(colKey)
      ? selectedFieldKeys.filter((k) => k !== colKey)
      : [...selectedFieldKeys, colKey];
    setSelectedFieldKeys(newKeys);
    if (onSearchScopeChange) onSearchScopeChange(newKeys);
  };

  const filteredFieldList = effectiveColumns.filter((col) => {
    const title = col.title || (col as any).name || col.key || "";
    return title.toLowerCase().includes(fieldFilterKeyword.toLowerCase());
  });

  const toolbarRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);
  const groupButtonRef = useRef<HTMLDivElement>(null);
  const sortButtonRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const innerSearchInputRef = useRef<HTMLInputElement>(null);

  // 点击外部/筛选按钮关闭弹窗与收起搜索
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (activePopup === "filter") {
        if (
          filterButtonRef.current &&
          !filterButtonRef.current.contains(target) &&
          filterPopoverRef.current &&
          !filterPopoverRef.current.contains(target)
        ) {
          if (onToggleFilterOpen) {
            onToggleFilterOpen(false);
          }
          setInternalPopup(null);
        }
      } else if (activePopup === "group") {
        if (groupButtonRef.current && !groupButtonRef.current.contains(target)) {
          setInternalPopup(null);
        }
      } else if (activePopup === "sort") {
        if (sortButtonRef.current && !sortButtonRef.current.contains(target)) {
          setInternalPopup(null);
        }
      }

      // 搜索框外部点击收起
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setIsSearchSettingsOpen(false);
        if (!searchValue) {
          setIsSearching(false);
        }
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activePopup, onToggleFilterOpen, searchValue]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);
    if (onSearch) {
      onSearch(val);
    }
  };

  const togglePopup = (popup: "filter" | "group" | "sort") => {
    if (popup === "filter") {
      const willOpen = activePopup !== "filter";
      if (onToggleFilterOpen) {
        onToggleFilterOpen(willOpen);
      }
      setInternalPopup(willOpen ? "filter" : null);
    } else {
      if (onToggleFilterOpen && activePopup === "filter") {
        onToggleFilterOpen(false);
      }
      setInternalPopup((prev) => (prev === popup ? null : popup));
    }
  };

  const activeFilterCount = filterConditions.filter(
    (c) => c.operator === "is_empty" || c.operator === "is_not_empty" || (c.value !== undefined && c.value !== null && c.value !== "")
  ).length;

  return (
    <div
      ref={toolbarRef}
      style={{ fontFamily: FEISHU_FONT_FAMILY }}
      className={cn("bg-white select-none px-5 pt-3.5 pb-2.5 relative", className)}
    >
      {/* 标题 */}
      {title && (
        <h2 className="text-[17px] font-medium text-[#1F2329] mb-3">
          {title}
        </h2>
      )}

      <div className="flex items-center justify-between gap-3">
        {/* 左侧操作组 */}
        <div className="flex items-center gap-2">
          {selectedCount > 0 ? (
            <div className="flex items-center gap-2 px-2.5 py-1 bg-[#E8F3FF] border border-[#B3D4FF] rounded-[6px] text-[13px] text-[#3370FF]">
              <span className="font-semibold">已选中 {selectedCount} 项</span>
              {onBatchDelete && (
                <button
                  onClick={onBatchDelete}
                  className="text-[#F53F3F] hover:underline font-medium ml-2 cursor-pointer"
                >
                  批量删除
                </button>
              )}
            </div>
          ) : (
            <>
              {onAdd && (
                <button
                  type="button"
                  onClick={onAdd}
                  className="h-[30px] px-2.5 rounded-[6px] bg-[#EFF0F1] hover:bg-[#E4E6E9] active:bg-[#D8DBDE] text-[#1F2329] text-[13px] font-medium inline-flex items-center justify-center transition-colors cursor-pointer"
                >
                  {addButtonText}
                </button>
              )}
              {onExport && (
                <button
                  type="button"
                  onClick={onExport}
                  className="h-[30px] px-2.5 rounded-[6px] border border-[#D0D3D6] bg-white text-[#1F2329] text-[13px] font-medium inline-flex items-center justify-center hover:bg-[#F5F6F7] active:bg-[#EFF0F1] transition-colors cursor-pointer"
                >
                  导出
                </button>
              )}
              {customLeftTools}
            </>
          )}
        </div>

        {/* 右侧工具组 (间距 gap-1.5, 悬浮底块 hover:bg-[#EFF0F1], 激活态 bg-[#EFF0F1] text-[#1F2329]) */}
        <div className="flex items-center gap-1.5 text-[14px]">
          {/* 1. 筛选按钮 (1:1 飞书原生纯蓝数字徽标) */}
          <button
            ref={filterButtonRef}
            type="button"
            onClick={() => togglePopup("filter")}
            className={cn(
              "h-[30px] px-2.5 rounded-[6px] text-[14px] transition-colors cursor-pointer inline-flex items-center gap-1.5 select-none",
              activePopup === "filter"
                ? "bg-[#EFF0F1] text-[#1F2329]"
                : "text-[#1F2329] hover:bg-[#EFF0F1]"
            )}
          >
            <FeishuFilterIcon className="text-[#1F2329]" />
            <span>筛选</span>
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#3370FF] text-white text-[11px] font-medium flex items-center justify-center ml-0.5 leading-none shrink-0">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* 2. 分组按钮及弹框 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => togglePopup("group")}
              className={cn(
                "h-[30px] px-2 rounded-[6px] text-[13px] transition-colors cursor-pointer inline-flex items-center gap-1.5 select-none",
                activePopup === "group"
                  ? "bg-[#E8F3FF] text-[#3370FF] font-medium"
                  : "text-[#646A75] hover:bg-[#EFF0F1] hover:text-[#1F2329]"
              )}
            >
              <FeishuGroupIcon className={activePopup === "group" ? "text-[#3370FF]" : "text-[#646A75]"} />
              <span>分组</span>
            </button>

            {/* 1:1 飞书官方分组弹框 */}
            {activePopup === "group" && (
              <div className="absolute right-0 top-[36px] z-50 w-[260px] bg-white rounded-[8px] border border-[#DEE0E1] p-3 shadow-[0_4px_16px_rgba(31,35,41,0.12)] text-[13px] text-[#1F2329] animate-in fade-in-80 duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#EDF0F2]">
                  <span className="text-[13px] font-medium text-[#1F2329]">按字段分组</span>
                  <button
                    type="button"
                    onClick={() => setSelectedGroup("none")}
                    className="text-[13px] text-[#8F959E] hover:text-[#1F2329] cursor-pointer"
                  >
                    清除分组
                  </button>
                </div>

                <div className="space-y-1 py-1">
                  {[
                    { key: "stage", label: "商机阶段" },
                    { key: "contactName", label: "客户联系人" },
                    { key: "priority", label: "优先级" },
                    { key: "customerName", label: "客户名称" },
                  ].map((item) => (
                    <div
                      key={item.key}
                      onClick={() => {
                        setSelectedGroup(item.key);
                        setInternalPopup(null);
                      }}
                      className={cn(
                        "flex items-center justify-between h-7 px-2 rounded-[4px] cursor-pointer transition-colors select-none",
                        selectedGroup === item.key
                          ? "bg-[#E8F3FF] text-[#3370FF] font-medium"
                          : "text-[#1F2329] hover:bg-[#EFF0F1]"
                      )}
                    >
                      <span>{item.label}</span>
                      {selectedGroup === item.key && <span className="text-[#3370FF] text-[13px]">✓</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 3. 排序按钮及弹框 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => togglePopup("sort")}
              className={cn(
                "h-[30px] px-2 rounded-[6px] text-[13px] transition-colors cursor-pointer inline-flex items-center gap-1.5 select-none",
                activePopup === "sort"
                  ? "bg-[#E8F3FF] text-[#3370FF] font-medium"
                  : "text-[#646A75] hover:bg-[#EFF0F1] hover:text-[#1F2329]"
              )}
            >
              <FeishuSortIcon className={activePopup === "sort" ? "text-[#3370FF]" : "text-[#646A75]"} />
              <span>排序</span>
            </button>

            {/* 1:1 飞书官方排序弹框 */}
            {activePopup === "sort" && (
              <div className="absolute right-0 top-[36px] z-50 w-[280px] bg-white rounded-[8px] border border-[#DEE0E1] p-3 shadow-[0_4px_16px_rgba(31,35,41,0.12)] text-[13px] text-[#1F2329] animate-in fade-in-80 duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#EDF0F2]">
                  <span className="text-[13px] font-medium text-[#1F2329]">自定义排序</span>
                  <button
                    type="button"
                    onClick={() => setSortList([])}
                    className="text-[13px] text-[#8F959E] hover:text-[#1F2329] cursor-pointer"
                  >
                    重置
                  </button>
                </div>

                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {sortList.map((sortItem, idx) => (
                    <div key={sortItem.id} className="flex items-center gap-2">
                      <select
                        value={sortItem.field}
                        onChange={(e) => {
                          const updated = [...sortList];
                          updated[idx].field = e.target.value;
                          setSortList(updated);
                        }}
                        className="flex-1 h-7 px-2 rounded-[4px] border border-[#DEE0E3] bg-white text-[13px] text-[#1F2329] outline-none focus:border-[#3370FF]"
                      >
                        <option value="amount">商机金额</option>
                        <option value="customerName">客户名称</option>
                        <option value="stage">商机阶段</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...sortList];
                          updated[idx].order = updated[idx].order === "asc" ? "desc" : "asc";
                          setSortList(updated);
                        }}
                        className="h-7 px-2 rounded-[4px] border border-[#DEE0E3] bg-white text-[13px] text-[#1F2329] hover:bg-[#F5F6F7] cursor-pointer"
                      >
                        {sortItem.order === "asc" ? "升序 ↑" : "降序 ↓"}
                      </button>

                      {sortList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSortList(sortList.filter((_, i) => i !== idx))}
                          className="p-1 text-[#8F959E] hover:text-[#F54A45] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-2.5 mt-2 border-t border-[#EDF0F2] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setSortList([
                        ...sortList,
                        { id: String(Date.now()), field: "amount", order: "asc" },
                      ]);
                    }}
                    className="text-[13px] text-[#3370FF] hover:text-[#2A62EA] inline-flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加排序字段</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInternalPopup(null)}
                    className="h-6 px-2.5 rounded-[4px] bg-[#3370FF] hover:bg-[#2A62EA] text-white text-[13px] cursor-pointer"
                  >
                    完成
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 4. 搜索框 (使用 1:1 FeishuInput 飞书原生输入框组件) */}
          {searchable && (
            <div ref={searchContainerRef} className="relative">
              {isSearching ? (
                <FeishuInput
                  ref={searchInputRef as any}
                  value={searchValue}
                  onChange={(val) => {
                    setSearchValue(val);
                    if (onSearch) onSearch(val);
                  }}
                  onClear={() => {
                    setSearchValue("");
                    if (onSearch) onSearch("");
                  }}
                  onFocus={() => {
                    setIsSearchSettingsOpen(false);
                  }}
                  onClick={() => {
                    setIsSearchSettingsOpen(false);
                  }}
                  placeholder={searchPlaceholder}
                  autoFocus={true}
                  prefix={<FeishuSearchIcon className="text-[#8F959E]" />}
                  suffix={
                    <FeishuTooltip title="查找设置" side="top" sideOffset={6}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsSearchSettingsOpen(!isSearchSettingsOpen);
                        }}
                        className={cn(
                          "w-6 h-6 rounded-[4px] flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-0.5",
                          isSearchSettingsOpen || !isAllFieldsSelected
                            ? "bg-[#E8F3FF] text-[#3370FF]"
                            : "hover:bg-[#EFF0F1] text-[#646A75] hover:text-[#1F2329]"
                        )}
                      >
                        <FeishuAdvancedActivedIcon className="w-4 h-4" />
                      </button>
                    </FeishuTooltip>
                  }
                  containerClassName="w-[210px] h-[30px]"
                />
              ) : (
                <div
                  onClick={() => {
                    setIsSearching(true);
                    setTimeout(() => searchInputRef.current?.focus(), 50);
                  }}
                  className="flex items-center h-[30px] px-2 rounded-[6px] text-[#1F2329] hover:bg-[#EFF0F1] cursor-pointer transition-all duration-200 select-none"
                >
                  <FeishuSearchIcon className="shrink-0 text-[#1F2329]" />
                  <span className="text-[14px] text-[#1F2329] ml-1.5 whitespace-nowrap">搜索</span>
                </div>
              )}

              {/* 1:1 飞书官方搜索设置面板 (在以下字段范围内查找 - 1:1 对齐图二) */}
              {isSearchSettingsOpen && isSearching && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-[36px] z-[1050] w-[240px] bg-white rounded-[8px] border border-[#DEE0E3] shadow-[0_4px_16px_rgba(0,0,0,0.12)] pt-3 pb-2 text-[14px] text-[#1F2329] animate-in fade-in-80 duration-100 select-none box-border"
                >
                  {/* 标题 */}
                  <div className="px-3 pb-2 text-[14px] font-medium text-[#1F2329]">
                    在以下字段范围内查找
                  </div>

                  {/* 内部快速查找输入框 (使用 1:1 FeishuInput 飞书原生输入框) */}
                  <div className="px-3 pb-2.5">
                    <FeishuInput
                      ref={innerSearchInputRef as any}
                      value={fieldFilterKeyword}
                      onChange={setFieldFilterKeyword}
                      placeholder="查找"
                      autoFocus={true}
                      containerClassName="h-[32px] rounded-[6px]"
                    />
                  </div>

                  {/* 字段复选框滚动列表 (若搜不到任何字段，展示“未找到字段”提示) */}
                  {filteredFieldList.length === 0 ? (
                    <div className="px-3 py-3 text-[14px] text-[#8F959E] select-none">
                      未找到字段
                    </div>
                  ) : (
                    <div className="max-h-[300px] overflow-y-auto feishu-dropdown-scrollbar py-0.5">
                      {/* ① 顶层“所有字段”总控行 (mx-1.5 圆角矩形悬浮，不顶格左右边界) */}
                      <div
                        onClick={handleToggleAllFields}
                        className="mx-1.5 px-2 h-[32px] rounded-[4px] flex items-center gap-2 hover:bg-[#EFF0F1] cursor-pointer transition-colors"
                      >
                        <div
                          className={cn(
                            "w-4 h-4 rounded-[4px] flex items-center justify-center transition-colors shrink-0",
                            isAllFieldsSelected
                              ? "bg-[#3370FF] text-white"
                              : isPartialSelected
                              ? "bg-[#3370FF] text-white"
                              : "border border-[#8F959E] bg-white"
                          )}
                        >
                          {isAllFieldsSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                          {isPartialSelected && !isAllFieldsSelected && (
                            <div className="w-2 h-0.5 bg-white rounded-full" />
                          )}
                        </div>
                        <span className="text-[14px] text-[#1F2329] flex items-center">
                          <span>所有字段</span>
                          <span className={cn("ml-1", selectedFieldKeys.length === 0 ? "text-[#F54A45]" : "text-[#8F959E]")}>
                            （已选 {selectedFieldKeys.length}）
                          </span>
                        </span>
                      </div>

                      {/* ② 各个字段具体行 (mx-1.5 圆角矩形悬浮，带对应类型图标) */}
                      {filteredFieldList.map((col) => {
                        const colKey = col.key || (col as any).dataIndex || "";
                        const isChecked = selectedFieldKeys.includes(colKey);

                        return (
                          <div
                            key={colKey}
                            onClick={() => handleToggleField(colKey)}
                            className="mx-1.5 px-2 h-[32px] rounded-[4px] flex items-center gap-2 hover:bg-[#EFF0F1] cursor-pointer transition-colors"
                          >
                            <div
                              className={cn(
                                "w-4 h-4 rounded-[4px] flex items-center justify-center transition-colors shrink-0",
                                isChecked
                                  ? "bg-[#3370FF] text-white"
                                  : "border border-[#8F959E] bg-white"
                              )}
                            >
                              {isChecked && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                            <div className="shrink-0 flex items-center justify-center text-[#646A75]">
                              {getFieldIcon(colKey, col.dataType)}
                            </div>
                            <span className="text-[14px] text-[#1F2329] truncate">
                              {col.title || (col as any).name || colKey}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {customRightTools}
        </div>
      </div>

      {/* 1:1 飞书官方筛选交互 Popover (挂载在工具栏右侧对齐 right-5，与图一 1:1 一致) */}
      {activePopup === "filter" && (
        <FeishuFilterPopover
          popoverRef={filterPopoverRef}
          columns={columns}
          conditions={filterConditions}
          conjunction={filterConjunction}
          onChange={(newConds, newConj) => {
            if (onFilterChange) {
              onFilterChange(newConds, newConj);
            }
          }}
          onClose={() => {
            if (onToggleFilterOpen) onToggleFilterOpen(false);
            setInternalPopup(null);
          }}
          matchedCount={matchedCount}
          className="right-5 top-[48px]"
        />
      )}
    </div>
  );
};
