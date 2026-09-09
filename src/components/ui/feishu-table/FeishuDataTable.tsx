import React, { useState, useMemo, useEffect, useRef } from "react";
import { cn } from "../../../lib/utils";
import { FeishuToolbar } from "./FeishuToolbar";
import { FeishuPagination } from "./FeishuPagination";
import {
  FilterCondition,
  FilterConjunction,
  FilterColumnMeta,
  getOperatorsByDataType,
} from "./FeishuFilterPopover";
import { FeishuHeaderCell } from "./FeishuHeaderCell";
import { FeishuEmptyState } from "./FeishuEmptyState";
import { FeishuSkeleton } from "../feishu-skeleton";

const evaluateCondition = (item: any, condition: FilterCondition): boolean => {
  const val = item[condition.field];
  const target = condition.value;
  const op = condition.operator;

  if (op === "为空" || op === "is_empty") {
    return val === undefined || val === null || val === "";
  }
  if (op === "不为空" || op === "is_not_empty") {
    return val !== undefined && val !== null && val !== "";
  }
  if (target === undefined || target === null || target === "") {
    return true;
  }

  const strVal = String(val ?? "").toLowerCase();
  const strTarget = String(target).toLowerCase();

  switch (op) {
    case "包含":
    case "contains":
      return strVal.includes(strTarget);
    case "不包含":
    case "not_contains":
      return !strVal.includes(strTarget);
    case "等于":
    case "equals":
    case "=":
      if (typeof val === "number" || (!isNaN(Number(target)) && typeof val !== "string" && !isNaN(Number(val)))) {
        return Number(val) === Number(target);
      }
      return strVal === strTarget;
    case "不等于":
    case "not_equals":
    case "≠":
      if (typeof val === "number" || (!isNaN(Number(target)) && typeof val !== "string" && !isNaN(Number(val)))) {
        return Number(val) !== Number(target);
      }
      return strVal !== strTarget;
    case "大于":
    case ">":
      return Number(val) > Number(target);
    case "大于等于":
    case "≥":
    case ">=":
      return Number(val) >= Number(target);
    case "小于":
    case "<":
      return Number(val) < Number(target);
    case "小于等于":
    case "≤":
    case "<=":
      return Number(val) <= Number(target);
    case "早于":
      return new Date(val).getTime() < new Date(target).getTime();
    case "晚于":
      return new Date(val).getTime() > new Date(target).getTime();
    case "in":
      if (Array.isArray(target)) return target.includes(val);
      return strVal === strTarget;
    default:
      return strVal.includes(strTarget);
  }
};

export const FEISHU_FONT_FAMILY =
  'LarkHackSafariFont, LarkEmojiFont, LarkChineseQuote, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Tahoma, "PingFang SC", "Microsoft Yahei", Arial, "Hiragino Sans GB", sans-serif';

export interface FeishuColumn<T> {
  key: string;
  title: string | React.ReactNode;
  dataIndex?: keyof T;
  width?: string | number;
  minWidth?: number;
  maxWidth?: number;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  enableMenu?: boolean;
  resizable?: boolean;
  fixed?: "left" | "right" | boolean;
  dataType?: "string" | "text" | "number" | "select" | "user" | "date";
  options?: Array<{ label: string; value: string; pillVariant?: any }>;
  render?: (value: any, record: T, index: number) => React.ReactNode;
}

export interface FeishuTabItem {
  key: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

export interface FeishuSortRule {
  key: string;
  direction: "asc" | "desc";
}

export interface FeishuDataTableProps<T> {
  title?: string;
  columns: FeishuColumn<T>[];
  data: T[];
  rowKey: keyof T | ((record: T) => string | number);
  selectable?: boolean;
  selectedRowKeys?: (string | number)[];
  onSelectionChange?: (selectedKeys: (string | number)[], selectedRows: T[]) => void;
  // Tabs
  tabs?: FeishuTabItem[];
  activeTabKey?: string;
  onTabChange?: (key: string) => void;
  // Search & Toolbar
  searchable?: boolean;
  searchPlaceholder?: string;
  onAdd?: () => void;
  addButtonText?: string;
  onExport?: () => void;
  onBatchDelete?: () => void;
  customLeftTools?: React.ReactNode;
  customRightTools?: React.ReactNode;
  // Pagination
  pagination?: {
    current: number;
    total: number;
    pageSize: number;
    onChange?: (page: number, pageSize: number) => void;
  };
  emptyText?: string;
  className?: string;
  loading?: boolean;
  loadingRows?: number;
  viewMode?: 'table' | 'card';
  renderCardView?: (data: T[], loading?: boolean) => React.ReactNode;
}

/** 估算字符串物理像素渲染宽度辅助函数 */
function estimateStringWidth(str: string): number {
  if (!str) return 0;
  let width = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 255) {
      width += 14.5;
    } else {
      width += 8.5;
    }
  }
  return width;
}

/**
 * 1:1 飞书官方数据表格组件 (FeishuDataTable)
 * 支持基于最长内容的智能自适应列宽、列名下限保护与最大上限截断、平滑精确的列宽拖拽引擎、最右侧操作列吸附不遮挡
 */
export function FeishuDataTable<T extends Record<string, any>>({
                                                                 title,
                                                                 columns,
                                                                 data = [],
                                                                 rowKey,
                                                                 selectable = true,
                                                                 selectedRowKeys: externalSelectedKeys,
                                                                 onSelectionChange,
                                                                 tabs,
                                                                 activeTabKey,
                                                                 onTabChange,
                                                                 searchable = true,
                                                                 searchPlaceholder = "在列表中搜索",
                                                                 onAdd,
                                                                 addButtonText = "+ 新增",
                                                                 onExport,
                                                                 onBatchDelete,
                                                                 customLeftTools,
                                                                 customRightTools,
                                                                 pagination,
                                                                 emptyText = "暂无相关数据",
                                                                 className,
                                                                 loading = false,
                                                                 loadingRows = 6,
                                                                 viewMode = "table",
                                                                 renderCardView,
                                                               }: FeishuDataTableProps<T>) {
  // 内部选中的 Keys（如果非受控）
  const [internalSelectedKeys, setInternalSelectedKeys] = useState<(string | number)[]>([]);
  const selectedKeys = externalSelectedKeys !== undefined ? externalSelectedKeys : internalSelectedKeys;

  // 搜索关键词与搜索字段范围
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScopeKeys, setSearchScopeKeys] = useState<string[]>([]);

  // 筛选条件与逻辑
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [filterConjunction, setFilterConjunction] = useState<FilterConjunction>("AND");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // 多列排序规则
  const [sortRules, setSortRules] = useState<FeishuSortRule[]>([]);

  // 列宽调整状态与 DOM 引用
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingKey, setResizingKey] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const thRefs = useRef<Record<string, HTMLTableCellElement | null>>({});
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // 基于表头文本与当前数据内容动态测算每列最优自适应宽度
  const computedColumnWidths = useMemo<Record<string, number>>(() => {
    const widths: Record<string, number> = {};
    columns.forEach((col) => {
      if (columnWidths[col.key] !== undefined) {
        widths[col.key] = columnWidths[col.key];
        return;
      }

      // 表头标题文字下限宽度
      const titleStr = typeof col.title === "string" ? col.title : "";
      const headerTitleWidth = estimateStringWidth(titleStr) + 40;
      const minBound = col.minWidth !== undefined ? Math.max(col.minWidth, headerTitleWidth) : headerTitleWidth;
      const maxBound = col.maxWidth !== undefined ? col.maxWidth : (col.key === "actions" || col.fixed === "right" ? 260 : 400);

      // 操作列安全宽度
      if (col.key === "actions" || col.fixed === "right") {
        widths[col.key] = Math.max(minBound, typeof col.width === "number" ? col.width : 220);
        return;
      }

      // 遍历当前数据列表中该列的最长内容估算宽度
      let maxContentWidth = 0;
      data.forEach((row) => {
        const val = col.dataIndex ? row[col.dataIndex] : undefined;
        let strVal = "";
        if (val !== null && val !== undefined) {
          strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
        }
        const w = estimateStringWidth(strVal);
        if (w > maxContentWidth) {
          maxContentWidth = w;
        }
      });

      const cellNeededWidth = maxContentWidth > 0 ? maxContentWidth + 48 : minBound;
      const idealWidth = Math.max(minBound, cellNeededWidth);
      const clampedWidth = Math.min(maxBound, Math.max(minBound, idealWidth));

      if (typeof col.width === "number") {
        widths[col.key] = Math.min(maxBound, Math.max(minBound, col.width));
      } else {
        widths[col.key] = Math.round(clampedWidth);
      }
    });
    return widths;
  }, [columns, data, columnWidths]);

  // 判断是否曾手动拖拽调整过列宽
  const hasResized = Object.keys(columnWidths).length > 0;

  // 监听容器宽度以实现智能自适应列宽（在操作列固定的同时，其余列根据内容与列数占满空间）
  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };

    updateWidth();

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.round(entry.contentRect.width);
          if (w > 0) {
            setContainerWidth(w);
          }
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    } else {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }
  }, []);

  // 固定列识别函数（如操作列或明确标注 sticky/fixed 的列）
  const isFixedColumn = (c: FeishuColumn<T>) =>
    c.key === "actions" || c.fixed === "right" || c.fixed === "left" || c.fixed === true;

  // 基础最小表格宽度（保证窄屏下不会挤压列，支持横向滚动）
  const minTableWidth = useMemo(() => {
    let total = selectable ? 48 : 0;
    columns.forEach((c) => {
      total += computedColumnWidths[c.key] || (typeof c.width === "number" ? c.width : 160);
    });
    return total;
  }, [columns, computedColumnWidths, selectable]);

  // 计算最终用于排版的各列像素宽度：
  // 1. 手动调整过列宽时：直接使用用户调整后的像素；
  // 2. 默认自适应模式下：操作列等固定列锁定设定尺寸，多余容器空间按各内容列字符与权重自适应撑满 100%。
  const effectiveColumnWidths = useMemo<Record<string, number>>(() => {
    if (hasResized) {
      const widths: Record<string, number> = {};
      columns.forEach((col) => {
        widths[col.key] =
          columnWidths[col.key] !== undefined
            ? columnWidths[col.key]
            : (typeof col.width === "number" ? col.width : 160);
      });
      return widths;
    }

    const baseWidths: Record<string, number> = {};
    let fixedTotal = selectable ? 48 : 0;
    let contentBaseTotal = 0;
    const contentCols: FeishuColumn<T>[] = [];

    columns.forEach((col) => {
      const base = computedColumnWidths[col.key] ?? (typeof col.width === "number" ? col.width : 160);
      baseWidths[col.key] = base;
      if (isFixedColumn(col)) {
        fixedTotal += base;
      } else {
        contentBaseTotal += base;
        contentCols.push(col);
      }
    });

    if (!containerWidth || containerWidth <= fixedTotal + contentBaseTotal || contentBaseTotal === 0) {
      return baseWidths;
    }

    const extraSpace = containerWidth - fixedTotal - contentBaseTotal;
    const finalWidths: Record<string, number> = { ...baseWidths };
    // 均等平分剩余空间给各内容列，避免某列由于长字数而垄断空间产生巨大空隙
    const equalShare = Math.floor(extraSpace / contentCols.length);
    const remainder = extraSpace % contentCols.length;

    contentCols.forEach((col, idx) => {
      finalWidths[col.key] = baseWidths[col.key] + equalShare + (idx < remainder ? 1 : 0);
    });

    return finalWidths;
  }, [hasResized, columns, columnWidths, computedColumnWidths, containerWidth, selectable]);

  // 表格总物理像素宽度 (拖拽后根据各列真实像素宽度累加，锁定物理排版)
  const totalTableWidth = useMemo(() => {
    let total = selectable ? 44 : 0;
    columns.forEach((c) => {
      const explicitWidth = columnWidths[c.key];
      total += typeof explicitWidth === "number" ? explicitWidth : (effectiveColumnWidths[c.key] || computedColumnWidths[c.key] || 160);
    });
    return total;
  }, [columns, columnWidths, effectiveColumnWidths, computedColumnWidths, selectable]);

  // Tab 栏动画指示条定位计算
  const tabElementsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const [inkStyle, setInkStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  // 横向滚动状态监听 (控制右侧固定列动态阴影)
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);
  const [isScrolledToEnd, setIsScrolledToEnd] = useState(false);

  const checkScrollState = () => {
    const el = tableContainerRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 1;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setHasHorizontalOverflow(hasOverflow);
    setIsScrolledToEnd(atEnd);
  };

  useEffect(() => {
    checkScrollState();
    const el = tableContainerRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScrollState, { passive: true });
    window.addEventListener("resize", checkScrollState);
    return () => {
      el.removeEventListener("scroll", checkScrollState);
      window.removeEventListener("resize", checkScrollState);
    };
  }, [totalTableWidth]);

  useEffect(() => {
    if (tabs && tabs.length > 0 && activeTabKey) {
      const activeEl = tabElementsRef.current[activeTabKey];
      if (activeEl) {
        setInkStyle({
          left: activeEl.offsetLeft,
          width: activeEl.offsetWidth,
        });
      }
    }
  }, [activeTabKey, tabs]);

  // 行主键获取器
  const getRowId = (record: T): string | number => {
    if (typeof rowKey === "function") {
      return rowKey(record);
    }
    return record[rowKey];
  };

  // 1:1 飞书精准平滑列宽拖拽逻辑 (按下瞬间快照锁定全部列的真实 DOM 物理像素宽度，拖拽期间仅当前列增减且 1:1 跟随鼠标)
  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const nextWidths: Record<string, number> = {};
    columns.forEach((c) => {
      const el = thRefs.current[c.key];
      if (el) {
        nextWidths[c.key] = Math.round(el.getBoundingClientRect().width);
      } else {
        nextWidths[c.key] = columnWidths[c.key] || effectiveColumnWidths[c.key] || computedColumnWidths[c.key] || 160;
      }
    });

    const domTh = thRefs.current[colKey];
    const thRect = domTh ? domTh.getBoundingClientRect() : null;
    const startWidth = thRect ? Math.round(thRect.width) : (nextWidths[colKey] || 160);
    nextWidths[colKey] = startWidth;

    setColumnWidths(nextWidths);
    setResizingKey(colKey);
    startXRef.current = e.clientX;
    startWidthRef.current = startWidth;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startXRef.current;
      const targetCol = columns.find((c) => c.key === colKey);
      const minBound = targetCol?.minWidth || 60;
      const maxBound = targetCol?.maxWidth || 1000;
      const calculatedWidth = Math.max(minBound, Math.min(maxBound, startWidthRef.current + deltaX));
      setColumnWidths((prev) => ({
        ...prev,
        [colKey]: calculatedWidth,
      }));
    };

    const handleMouseUp = () => {
      setResizingKey(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // 全选/反选处理
  const isAllSelected = useMemo(() => {
    if (!data.length) return false;
    return data.every((item) => selectedKeys.includes(getRowId(item)));
  }, [data, selectedKeys]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = data.map((item) => getRowId(item));
      setInternalSelectedKeys(allIds);
      onSelectionChange?.(allIds, data);
    } else {
      setInternalSelectedKeys([]);
      onSelectionChange?.([], []);
    }
  };

  const handleSelectRow = (id: string | number, record: T, checked: boolean) => {
    let next: (string | number)[];
    if (checked) {
      next = [...selectedKeys, id];
    } else {
      next = selectedKeys.filter((k) => k !== id);
    }
    setInternalSelectedKeys(next);
    const nextRows = data.filter((item) => next.includes(getRowId(item)));
    onSelectionChange?.(next, nextRows);
  };

  // 复合排序控制
  const handleSetColumnSort = (key: string, direction: "asc" | "desc") => {
    setSortRules((prev) => {
      const existing = prev.find((r) => r.key === key);
      if (existing && existing.direction === direction) {
        return prev.filter((r) => r.key !== key);
      }
      const others = prev.filter((r) => r.key !== key);
      return [...others, { key, direction }];
    });
  };

  // 核心数据管道 (筛选 -> 搜索 -> 排序 -> 分页)
  const processedData = useMemo(() => {
    let result = [...data];

    // 1. 筛选条件
    if (filterConditions.length > 0) {
      result = result.filter((item) => {
        if (filterConjunction === "AND") {
          return filterConditions.every((cond) => evaluateCondition(item, cond));
        } else {
          return filterConditions.some((cond) => evaluateCondition(item, cond));
        }
      });
    }

    // 2. 搜索关键词
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((item) => {
        if (searchScopeKeys && searchScopeKeys.length > 0) {
          return searchScopeKeys.some((k) => {
            const val = item[k];
            return val !== null && val !== undefined && String(val).toLowerCase().includes(q);
          });
        }
        return Object.values(item).some(
          (val) => val !== null && val !== undefined && String(val).toLowerCase().includes(q)
        );
      });
    }

    // 3. 多列复合排序
    if (sortRules.length > 0) {
      result.sort((a, b) => {
        for (const rule of sortRules) {
          const col = columns.find((c) => c.key === rule.key);
          const field = (col?.dataIndex || rule.key) as string;
          const aVal = a[field];
          const bVal = b[field];

          if (aVal === bVal) continue;
          if (aVal === null || aVal === undefined) return 1;
          if (bVal === null || bVal === undefined) return -1;

          let comp = 0;
          if (typeof aVal === "number" && typeof bVal === "number") {
            comp = aVal - bVal;
          } else {
            comp = String(aVal).localeCompare(String(bVal), "zh-CN");
          }

          if (comp !== 0) {
            return rule.direction === "asc" ? comp : -comp;
          }
        }
        return 0;
      });
    }

    return result;
  }, [data, filterConditions, filterConjunction, searchQuery, searchScopeKeys, sortRules, columns]);

  // 分页截取
  const paginatedData = useMemo(() => {
    if (!pagination) return processedData;
    const { current, pageSize } = pagination;
    const start = (current - 1) * pageSize;
    return processedData.slice(start, start + pageSize);
  }, [processedData, pagination]);

  const filterColumnMetas: FilterColumnMeta[] = useMemo(() => {
    return columns.map((col) => ({
      key: col.key,
      title: typeof col.title === "string" ? col.title : col.key,
      dataIndex: col.dataIndex as string,
      dataType: col.dataType || "text",
      options: col.options,
    }));
  }, [columns]);

  return (
    <div
      style={{ fontFamily: FEISHU_FONT_FAMILY }}
      className={cn(
        "flex flex-col bg-white border border-[#DEE0E3] rounded-xl shadow-2xs overflow-hidden select-none",
        className
      )}
    >
      {/* 1. 顶栏 Tab 导航栏 */}
      {tabs && tabs.length > 0 && (
        <div className="relative flex items-center border-b border-[#DEE0E3] px-5 bg-white shrink-0">
          <div className="flex items-center gap-6 relative">
            {tabs.map((tab) => {
              const isActive = tab.key === activeTabKey;
              return (
                <div
                  key={tab.key}
                  ref={(el) => {
                    tabElementsRef.current[tab.key] = el;
                  }}
                  onClick={() => onTabChange?.(tab.key)}
                  className={cn(
                    "flex items-center gap-2 py-3 cursor-pointer text-[14px] transition-colors relative",
                    isActive
                      ? "text-feishu-blue font-medium"
                      : "text-[#646A73] hover:text-feishu-text-primary"
                  )}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded-full text-[12px] tabular-nums font-normal",
                        isActive
                          ? "bg-feishu-blue-light text-feishu-blue"
                          : "bg-[#F2F3F5] text-feishu-text-muted"
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </div>
              );
            })}
            <div
              className="absolute bottom-0 h-0.5 bg-feishu-blue rounded-full transition-all duration-200 ease-out pointer-events-none"
              style={{
                left: `${inkStyle.left}px`,
                width: `${inkStyle.width}px`,
              }}
            />
          </div>
        </div>
      )}

      {/* 2. 飞书原生功能工具栏 */}
      <FeishuToolbar
        title={title}
        totalCount={processedData.length}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        onSearch={setSearchQuery}
        columns={filterColumnMetas}
        onSearchScopeChange={setSearchScopeKeys}
        filterConditions={filterConditions}
        filterConjunction={filterConjunction}
        onFilterChange={(newConds, newConj) => {
          setFilterConditions(newConds);
          setFilterConjunction(newConj);
        }}
        isFilterOpen={isFilterOpen}
        onToggleFilterOpen={(open) => setIsFilterOpen(open !== undefined ? open : !isFilterOpen)}
        selectedCount={selectedKeys.length}
        onBatchDelete={onBatchDelete}
        onAdd={onAdd}
        addButtonText={addButtonText}
        onExport={onExport}
        customLeftTools={customLeftTools}
        customRightTools={customRightTools}
      />

      {/* 3. 核心内容展示区（支持表格视图与卡片视图平滑切换） */}
      {viewMode === "card" && renderCardView ? (
        <div
          key="card-view-content"
          className="flex-1 min-h-[320px] overflow-y-auto bg-[#F8F9FA] p-4 transition-all duration-200 ease-out animate-in fade-in-50"
        >
          {renderCardView(paginatedData, loading)}
        </div>
      ) : (
        <div
          key="table-view-content"
          ref={tableContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative custom-scrollbar transition-all duration-200 ease-out animate-in fade-in-50"
        >
        <table
          className="text-left border-collapse text-[14px]"
          style={{
            tableLayout: "fixed",
            minWidth: !hasResized && minTableWidth ? `${minTableWidth}px` : undefined,
            width: hasResized && totalTableWidth ? `${totalTableWidth}px` : "100%",
          }}
        >
          {/* 受控自适应列宽体系 */}
          <colgroup>
            {selectable && <col style={{ width: "48px" }} />}
            {columns.map((col) => {
              const explicitWidth = effectiveColumnWidths[col.key];
              return (
                <col
                  key={col.key}
                  style={explicitWidth !== undefined ? { width: `${explicitWidth}px` } : undefined}
                />
              );
            })}
          </colgroup>

          {/* 表头 */}
          <thead className="bg-white border-b border-[#DEE0E3] select-none text-feishu-text-secondary group/thead feishu-table-head">
          <tr>
            {/* Checkbox 列 */}
            {selectable && (
              <th className="w-12 pl-5 pr-3 py-2.5 text-center font-normal relative">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 rounded border-feishu-border text-feishu-blue focus:ring-0 cursor-pointer accent-feishu-blue"
                />
                <span className="feishu-col-divider absolute right-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-[#DEE0E3] opacity-0 group-hover/thead:opacity-100 transition-opacity duration-150 pointer-events-none z-10" />
              </th>
            )}

            {/* 字段列头 */}
            {columns.map((col, idx) => {
              const sortRule = sortRules.find((r) => r.key === col.key);
              const isStickyRight = col.fixed === "right";
              const showStickyShadow = isStickyRight && hasHorizontalOverflow && !isScrolledToEnd;
              const isFirstCol = idx === 0 && !selectable;
              const isLastCol = idx === columns.length - 1;

              return (
                <th
                  key={col.key}
                  ref={(el) => {
                    thRefs.current[col.key] = el;
                  }}
                  className={cn(
                    "p-0 font-normal border-none transition-shadow duration-200",
                    isFirstCol && "pl-2",
                    isLastCol && "pr-2",
                    isStickyRight && "sticky right-0 bg-white z-30",
                    showStickyShadow && "shadow-[-6px_0_16px_rgba(31,35,41,0.06)]"
                  )}
                >
                  <FeishuHeaderCell
                    title={col.title}
                    align={col.align}
                    sortable={col.sortable}
                    enableMenu={col.enableMenu}
                    dataType={col.dataType}
                    isSorted={!!sortRule}
                    sortDirection={sortRule?.direction}
                    onSortAsc={() => handleSetColumnSort(col.key, "asc")}
                    onSortDesc={() => handleSetColumnSort(col.key, "desc")}
                    onFilter={() => {
                      const fieldKey = (col.dataIndex || col.key) as string;
                      const existingIdx = filterConditions.findIndex((c) => c.field === fieldKey);
                      if (existingIdx === -1) {
                        const ops = getOperatorsByDataType(col.dataType);
                        setFilterConditions((prev) => [
                          ...prev,
                          { id: String(Date.now()), field: fieldKey, operator: ops[0].value, value: "" },
                        ]);
                      }
                      setIsFilterOpen(true);
                    }}
                    resizable={col.resizable !== false}
                    isResizing={resizingKey === col.key}
                    isLast={idx === columns.length - 1}
                    onResizeStart={(e) => handleResizeStart(col.key, e)}
                  />
                </th>
              );
            })}
          </tr>
          </thead>

          {/* 表格内容行 */}
          <tbody className="divide-y divide-[#DEE0E3]/60 bg-white">
          {loading ? (
            Array.from({ length: loadingRows }).map((_, rIdx) => (
              <tr key={`table-skeleton-${rIdx}`} className="h-[48px] border-b border-[#DEE0E3]/60 bg-white" data-testid="table-skeleton-row">
                {selectable && (
                  <td className="w-12 pl-5 pr-3 py-2.5 text-center">
                    <FeishuSkeleton className="w-4 h-4 mx-auto rounded-[3px]" />
                  </td>
                )}
                {columns.map((col, cIdx) => (
                  <td key={`skeleton-col-${cIdx}`} className="px-3 py-2.5">
                    <FeishuSkeleton
                      className={cn(
                        'h-4',
                        cIdx === 0
                          ? 'w-16 h-5 rounded-[4px]'
                          : cIdx === 1
                          ? 'w-14 h-5 rounded-full'
                          : cIdx === columns.length - 1
                          ? 'w-20 h-7 rounded-[6px] ml-auto'
                          : cIdx % 2 === 0
                          ? 'w-28'
                          : 'w-16'
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : paginatedData.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
                className="p-0 text-center bg-white"
              >
                <FeishuEmptyState
                  title={
                    searchQuery || filterConditions.length > 0
                      ? "未找到匹配的数据"
                      : emptyText || "暂无相关记录"
                  }
                  description={
                    searchQuery || filterConditions.length > 0
                      ? `未找到与 “${searchQuery}” 相关的结果，请尝试更换关键词`
                      : "当前暂无数据"
                  }
                />
              </td>
            </tr>
          ) : (
            paginatedData.map((record, index) => {
              const id = getRowId(record);
              const isSelected = selectedKeys.includes(id);

              return (
                <tr
                  key={id}
                  className={cn(
                    "hover:bg-[#F8F9FA] transition-colors group",
                    isSelected && "bg-[#F0F4FF] hover:bg-[#E8F0FF]"
                  )}
                >
                  {/* Checkbox 单元格 */}
                  {selectable && (
                    <td className="w-12 pl-5 pr-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleSelectRow(id, record, e.target.checked)}
                        className="w-4 h-4 rounded border-feishu-border text-feishu-blue focus:ring-0 cursor-pointer accent-feishu-blue"
                      />
                    </td>
                  )}

                  {/* 数据单元格 */}
                  {columns.map((col, cIdx) => {
                    const val = col.dataIndex ? record[col.dataIndex] : undefined;
                    const colKey = (col.key || col.dataIndex) as string;
                    const isStickyRight = col.fixed === "right";
                    const showStickyShadow = isStickyRight && hasHorizontalOverflow && !isScrolledToEnd;
                    const isFirstCol = cIdx === 0 && !selectable;
                    const isLastCol = cIdx === columns.length - 1;

                    // 检查当前单元格是否命中了搜索关键词
                    const isScopeMatched =
                      !searchScopeKeys || searchScopeKeys.length === 0 || searchScopeKeys.includes(colKey);
                    const isSearchMatched =
                      searchQuery.trim().length > 0 &&
                      isScopeMatched &&
                      val !== null &&
                      val !== undefined &&
                      String(val).toLowerCase().includes(searchQuery.trim().toLowerCase());

                    return (
                      <td
                        key={col.key}
                        className={cn(
                          "py-2.5 text-feishu-text-primary leading-5.5 transition-colors border-none",
                          isFirstCol ? "pl-5 pr-3" : isLastCol ? "pl-3 pr-5" : "px-3",
                          !isStickyRight && "truncate",
                          isStickyRight && "sticky right-0 bg-white group-hover:bg-[#F8F9FA] z-20 overflow-visible whitespace-nowrap",
                          showStickyShadow && "shadow-[-6px_0_16px_rgba(31,35,41,0.06)]",
                          isSearchMatched
                            ? "bg-[#DCE8FD]"
                            : isSelected
                              ? isStickyRight ? "bg-[#F0F4FF]! group-hover:bg-[#E8F0FF]!" : "bg-transparent"
                              : "",
                          col.align === "center" && "text-center",
                          col.align === "right" && "text-right",
                          col.dataType === "number" && "tabular-nums"
                        )}
                      >
                        {col.render ? col.render(val, record, index) : String(val ?? "—")}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
          </tbody>
        </table>
      </div>
      )}

      {/* 4. 分页控制条 */}
      {pagination && (
        <FeishuPagination
          current={pagination.current}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onChange={pagination.onChange}
          className="border-t border-[#DEE0E3] px-5 py-3"
        />
      )}
    </div>
  );
}
