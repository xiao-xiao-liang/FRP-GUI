import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "../../../lib/utils";

export interface FeishuActionDropdownItem {
  key: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
}

export interface FeishuActionDropdownProps {
  items: FeishuActionDropdownItem[];
  trigger?: React.ReactNode;
  className?: string;
}

/**
 * 飞书 Universe 风格操作下拉菜单 (基于 React Portal 脱离表格 overflow 裁剪层，支持智能视口防遮挡与上下自适应翻转)
 */
export const FeishuActionDropdown: React.FC<FeishuActionDropdownProps> = ({
  items,
  trigger,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const calculatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = items.length * 34 + 16;
    const spaceBelow = window.innerHeight - rect.bottom;

    let top: number;
    if (spaceBelow < menuHeight && rect.top > menuHeight) {
      // 底部空间不足时向上翻转弹出
      top = rect.top - menuHeight - 4;
    } else {
      // 默认向下弹出
      top = rect.bottom + 4;
    }

    const right = window.innerWidth - rect.right;
    setMenuPosition({ top, right });
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
    } else {
      calculatePosition();
      setIsOpen(true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleScrollOrResize = () => {
      calculatePosition();
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, items.length]);

  return (
    <div className={cn("inline-flex items-center", className)} onClick={(e) => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="w-7 h-7 rounded-[6px] hover:bg-[#F2F3F5] text-[#8F959E] hover:text-[#1F2329] flex items-center justify-center transition-colors cursor-pointer"
      >
        {trigger || <MoreHorizontal className="w-4 h-4" />}
      </button>

      {isOpen &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: `${menuPosition.top}px`,
              right: `${menuPosition.right}px`,
              zIndex: 99999,
            }}
            className="w-32 bg-white rounded-[8px] border border-[#DEE0E3] shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item, idx) => (
              <React.Fragment key={item.key}>
                {idx > 0 && item.danger && <div className="h-[1px] bg-[#EFF0F1] my-1" />}
                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    setIsOpen(false);
                    item.onClick();
                  }}
                  className={cn(
                    "w-full px-3 py-1.5 text-left text-[13px] transition-colors cursor-pointer flex items-center gap-2",
                    item.danger
                      ? "text-[#F53F3F] hover:bg-[#FFF2F0]"
                      : "text-[#1F2329] hover:bg-[#F2F3F5]",
                    item.disabled && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              </React.Fragment>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
