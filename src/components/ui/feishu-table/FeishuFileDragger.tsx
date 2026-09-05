import React, { useRef, useState } from "react";
import {
  UploadCloud,
  X,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileType as FileIcon,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { FEISHU_FONT_FAMILY } from "./FeishuDataTable";

export interface FeishuFileDraggerProps {
  file: File | null;
  onFileSelect: (file: File) => void;
  onFileRemove: () => void;
  accept?: string;
  maxSizeMB?: number;
  disabled?: boolean;
  className?: string;
}

// 支持的文件格式徽标定义 (与飞书多维表格与云文档标准对齐)
const FORMAT_PILLS = [
  { label: "PDF", bg: "bg-[#FFF2F0]", text: "text-[#F53F3F]", border: "border-[#FFECEC]" },
  { label: "DOCX", bg: "bg-[#E8F4FF]", text: "text-[#1456F0]", border: "border-[#D0E2FF]" },
  { label: "MD", bg: "bg-[#E8F3FF]", text: "text-[#3370FF]", border: "border-[#CDE3FF]" },
  { label: "XLSX", bg: "bg-[#E8F7EC]", text: "text-[#00B42A]", border: "border-[#D1F2D9]" },
  { label: "PPTX", bg: "bg-[#FFF7E8]", text: "text-[#FF7D00]", border: "border-[#FFE7BA]" },
  { label: "TXT", bg: "bg-[#F2F3F5]", text: "text-[#646A75]", border: "border-[#DEE0E3]" },
];

export const FeishuFileDragger: React.FC<FeishuFileDraggerProps> = ({
                                                                      file,
                                                                      onFileSelect,
                                                                      onFileRemove,
                                                                      accept = ".pdf,.docx,.doc,.md,.markdown,.txt,.xlsx,.xls,.pptx,.ppt",
                                                                      maxSizeMB = 50,
                                                                      disabled = false,
                                                                      className,
                                                                    }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  // 获取选中文件的飞书标准彩色图标
  const renderFileIcon = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".pdf")) {
      return (
        <div className="w-11 h-11 rounded-lg bg-[#FFF2F0] text-feishu-danger flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6" />
        </div>
      );
    }
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
      return (
        <div className="w-11 h-11 rounded-lg bg-feishu-blue-light text-feishu-blue flex items-center justify-center shrink-0">
          <FileCode className="w-6 h-6" />
        </div>
      );
    }
    if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
      return (
        <div className="w-11 h-11 rounded-lg bg-[#E8F4FF] text-[#1456F0] flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6" />
        </div>
      );
    }
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
      return (
        <div className="w-11 h-11 rounded-lg bg-[#E8F7EC] text-feishu-success flex items-center justify-center shrink-0">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
      );
    }
    if (lower.endsWith(".pptx") || lower.endsWith(".ppt")) {
      return (
        <div className="w-11 h-11 rounded-lg bg-feishu-warning-bg text-feishu-warning flex items-center justify-center shrink-0">
          <FileText className="w-6 h-6" />
        </div>
      );
    }
    return (
      <div className="w-11 h-11 rounded-lg bg-[#F2F3F5] text-feishu-text-secondary flex items-center justify-center shrink-0">
        <FileIcon className="w-6 h-6" />
      </div>
    );
  };

  return (
    <div style={{ fontFamily: FEISHU_FONT_FAMILY }} className={cn("w-full select-none", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            onFileSelect(e.target.files[0]);
          }
        }}
      />

      {file ? (
        /* 状态 3: 文件已就绪态 (File Selected / Ready Card) */
        <div className="group relative rounded-[10px] border border-[#DEE0E3] bg-white p-4 shadow-2xs hover:border-feishu-blue/60 hover:shadow-xs transition-all duration-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            {renderFileIcon(file.name)}
            <div className="min-w-0">
              <p
                className="text-[14px] font-semibold text-feishu-text-primary group-hover:text-feishu-blue transition-colors truncate max-w-85"
                title={file.name}
              >
                {file.name}
              </p>
              <p className="mt-0.5 text-[12px] text-feishu-text-muted tabular-nums font-normal">
                {(file.size / (1024 * 1024)).toFixed(2)} MB · 文档格式校验通过，随时可导入解析
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="text-[13px] text-feishu-blue hover:underline px-2 py-1 transition-colors"
            >
              重新选择
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFileRemove();
              }}
              title="清除文件"
              className="w-7 h-7 rounded-md hover:bg-[#FFF2F0] text-feishu-text-muted hover:text-feishu-danger flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        /* 状态 1 & 2: 默认待拖拽 / 悬停拖拽激活态 */
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={cn(
            "group relative rounded-xl p-6 text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center",
            isDragging
              ? "border-[1.5px] border-dashed border-feishu-blue bg-feishu-blue-light/40 ring-4 ring-[#3370FF]/10 shadow-xs scale-[0.99]"
              : "border border-[#DEE0E3] bg-white hover:border-feishu-blue hover:bg-[#F0F6FF]/25 hover:shadow-2xs"
          )}
        >
          {/* 中心图标 (飞书品牌浅蓝 12px 圆角底块) */}
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 shadow-2xs",
              isDragging
                ? "bg-feishu-blue text-white scale-105"
                : "bg-feishu-blue-light text-feishu-blue group-hover:-translate-y-0.5"
            )}
          >
            <UploadCloud className={cn("w-6 h-6", isDragging ? "stroke-2" : "stroke-[1.8]")} />
          </div>

          {isDragging ? (
            <div className="mt-3 space-y-1 animate-in fade-in zoom-in-95 duration-100">
              <p className="text-[15px] font-semibold text-feishu-blue">释放文件立即导入</p>
              <p className="text-[12px] text-feishu-blue/80">松开鼠标即可自动解析结构并建立索引</p>
            </div>
          ) : (
            <>
              {/* 主提示文案 (带飞书蓝高亮链接) */}
              <div className="mt-3 text-[14px] font-medium text-feishu-text-primary">
                拖拽文件至此处，或 <span className="text-feishu-blue font-semibold hover:underline">点击上传</span>
              </div>

              {/* 支持的格式微胶囊徽标组 */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                {FORMAT_PILLS.map((pill) => (
                  <span
                    key={pill.label}
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-semibold border leading-tight select-none",
                      pill.bg,
                      pill.text,
                      pill.border
                    )}
                  >
                    {pill.label}
                  </span>
                ))}
              </div>

              {/* 容量提示 */}
              <div className="mt-2.5 text-[12px] text-feishu-text-muted">
                单文件最大支持 {maxSizeMB}MB
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
