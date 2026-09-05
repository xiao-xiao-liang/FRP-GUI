import React from "react";

export type DocFormatType =
  | "word"
  | "pdf"
  | "excel"
  | "ppt"
  | "markdown"
  | "txt"
  | "code"
  | "default";

export interface FeishuDocIconProps {
  /** 文件名称（组件将自动提取扩展名解析格式） */
  fileName?: string;
  /** 显式指定文档格式（优先级高于 fileName 解析） */
  format?: DocFormatType | string;
  /** 尺寸大小（像素，默认 28） */
  size?: number | string;
  /** 额外的 CSS 类名 */
  className?: string;
  /** 额外内联样式 */
  style?: React.CSSProperties;
}

/**
 * 根据文件名或扩展名解析标准格式
 */
export function getDocFormat(fileName?: string, explicitFormat?: string): DocFormatType {
  if (explicitFormat) {
    const f = explicitFormat.toLowerCase();
    if (f.includes("word") || f === "docx" || f === "doc") return "word";
    if (f.includes("pdf")) return "pdf";
    if (f.includes("excel") || f === "xlsx" || f === "xls" || f === "csv") return "excel";
    if (f.includes("ppt") || f === "pptx") return "ppt";
    if (f.includes("markdown") || f === "md") return "markdown";
    if (f.includes("txt") || f === "text" || f === "log") return "txt";
    if (f.includes("json") || f.includes("code") || f === "xml" || f === "yaml" || f === "yml") return "code";
  }

  if (!fileName) return "default";
  const lower = fileName.toLowerCase().trim();

  if (lower.endsWith(".docx") || lower.endsWith(".doc")) return "word";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) return "excel";
  if (lower.endsWith(".pptx") || lower.endsWith(".ppt")) return "ppt";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".txt") || lower.endsWith(".log")) return "txt";
  if (
    lower.endsWith(".json") ||
    lower.endsWith(".js") ||
    lower.endsWith(".ts") ||
    lower.endsWith(".py") ||
    lower.endsWith(".sql") ||
    lower.endsWith(".html") ||
    lower.endsWith(".css")
  ) {
    return "code";
  }

  return "default";
}

/**
 * 1:1 精确对接 thesvg.org 官方矢量图标资产 (FeishuDocIcon)
 */
export const FeishuDocIcon: React.FC<FeishuDocIconProps> = ({
  fileName,
  format: explicitFormat,
  size = 20,
  className = "",
  style,
}) => {
  const resolvedFormat = getDocFormat(fileName, explicitFormat);
  const sizePx = typeof size === "number" ? `${size}px` : size;

  const baseStyle: React.CSSProperties = {
    width: sizePx,
    height: sizePx,
    minWidth: sizePx,
    minHeight: sizePx,
    display: "inline-block",
    flexShrink: 0,
    verticalAlign: "middle",
    ...style,
  };

  switch (resolvedFormat) {
    // 1. PDF 官方矢量 (https://thesvg.org/icons/pdf/default.svg)
    case "pdf":
      return (
        <svg
          viewBox="0 0 75.32 92.604"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={baseStyle}
          className={`shrink-0 ${className}`}
        >
          {/* 红色外边框卡片 */}
          <path
            fill="#ff2116"
            d="M-29.633 123.947c-3.552 0-6.443 2.894-6.443 6.446v49.498c0 3.551 2.891 6.445 6.443 6.445h37.85c3.552 0 6.443-2.893 6.443-6.445v-40.702s.102-1.191-.416-2.351a6.516 6.516 0 0 0-1.275-1.844 1.058 1.058 0 0 0-.006-.008l-9.39-9.21a1.058 1.058 0 0 0-.016-.016s-.802-.764-1.99-1.274c-1.4-.6-2.842-.537-2.842-.537l.021-.002z"
            transform="translate(53.548 -183.975) scale(1.4843)"
          />
          {/* 白色内底 */}
          <path
            fill="#f5f5f5"
            d="M-29.633 126.064h28.38a1.058 1.058 0 0 0 .02 0s1.135.011 1.965.368a5.385 5.385 0 0 1 1.373.869l9.368 9.19s.564.595.838 1.208c.22.495.234 1.4.234 1.4a1.058 1.058 0 0 0-.002.046v40.746a4.294 4.294 0 0 1-4.326 4.328h-37.85a4.294 4.294 0 0 1-4.326-4.328v-49.498a4.294 4.294 0 0 1 4.326-4.328z"
            transform="translate(53.548 -183.975) scale(1.4843)"
          />
          {/* Adobe 经典红色丝带图形 */}
          <path
            fill="#ff2116"
            d="M18.804 55.135c-2.162-2.162.177-5.133 6.526-8.288l3.994-1.985 1.557-3.405a134.054 134.054 0 0 0 2.838-6.79l1.283-3.386-.884-2.506c-1.087-3.08-1.474-7.71-.785-9.374.934-2.255 3.994-2.024 5.205.393.946 1.888.849 5.307-.272 9.618l-.92 3.534.81 1.375c.445.756 1.746 2.55 2.89 3.989l2.152 2.676 2.677-.35c8.503-1.11 11.416.777 11.416 3.48 0 3.413-6.677 3.695-12.284-.243-1.262-.886-2.128-1.767-2.128-1.767s-3.513.716-5.243 1.182c-1.785.48-2.675.782-5.29 1.665 0 0-.918 1.332-1.516 2.301-2.224 3.604-4.821 6.59-6.676 7.677-2.077 1.217-4.254 1.3-5.35.204zm3.393-1.212c1.216-.751 3.676-3.66 5.378-6.361l.69-1.093-3.14 1.578c-4.848 2.438-7.066 4.735-5.913 6.125.648.78 1.423.716 2.985-.25zm31.494-8.84c1.189-.833 1.016-2.51-.328-3.187-1.045-.527-1.888-.635-4.606-.595-1.67.114-4.354.45-4.81.553 0 0 1.476 1.02 2.13 1.394.872.498 2.99 1.422 4.537 1.895 1.526.467 2.409.418 3.077-.06zm-12.663-5.264c-.72-.756-1.943-2.334-2.719-3.507-1.014-1.33-1.523-2.27-1.523-2.27s-.741 2.386-1.35 3.82l-1.898 4.692-.55 1.065s2.925-.96 4.414-1.348c1.576-.412 4.776-1.041 4.776-1.041zm-4.081-16.365c.184-1.54.261-3.078-.233-3.853-1.373-1.5-3.03-.25-2.749 3.318.095 1.2.393 3.25.791 4.515l.725 2.299.51-1.732c.28-.952.71-2.998.956-4.547z"
          />
          {/* 底部 PDF 文字 */}
          <path
            fill="#2c2c2c"
            d="M-20.93 167.839h2.365q1.133 0 1.84.217.706.21 1.19.944.482.728.482 1.756 0 .945-.392 1.624-.392.678-1.056.98-.658.3-2.03.3h-.818v3.73h-1.581zm1.58 1.224v3.33h.785q1.05 0 1.448-.391.406-.392.406-1.274 0-.657-.266-1.063-.266-.413-.588-.504-.315-.098-1-.098zm5.508-1.224h2.148q1.56 0 2.49.552.938.553 1.414 1.645.483 1.091.483 2.42 0 1.4-.434 2.499-.427 1.091-1.316 1.763-.881.672-2.518.672h-2.267zm1.58 1.266v7.018h.659q1.378 0 2-.952.623-.958.623-2.553 0-3.513-2.623-3.513zm6.473-1.266h5.304v1.266h-3.723v2.855h2.981v1.266h-2.98v4.164H-5.79z"
            transform="translate(53.548 -183.975) scale(1.4843)"
          />
        </svg>
      );

    // 2. Microsoft Word 官方矢量 (https://thesvg.org/icons/microsoft-word/default.svg)
    case "word":
      return (
        <svg
          viewBox="0 0 486 500"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={baseStyle}
          className={`shrink-0 ${className}`}
        >
          <defs>
            <radialGradient id="thesvg-word-a" cx="-689.34" cy="753.93" r="13.89" fx="-689.34" fy="753.93" gradientTransform="matrix(47.56 0 0 -20.15 33260.63 15691.18)" gradientUnits="userSpaceOnUse">
              <stop offset=".18" stopColor="#1657f4"/>
              <stop offset=".57" stopColor="#0036c4"/>
            </radialGradient>
            <radialGradient id="thesvg-word-c" cx="-730.97" cy="806.4" r="13.89" fx="-730.97" fy="806.4" gradientTransform="matrix(-20.22495 21.28288 52.40647 49.82267 -56559.12 -24498.36)" gradientUnits="userSpaceOnUse">
              <stop offset=".14" stopColor="#d471ff"/>
              <stop offset=".83" stopColor="#509df5" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="thesvg-word-d" cx="-682.21" cy="801.86" r="13.89" fx="-682.21" fy="801.86" gradientTransform="matrix(0 18.62 101.62 0 -81063.08 13022.32)" gradientUnits="userSpaceOnUse">
              <stop offset=".28" stopColor="#4f006f" stopOpacity="0"/>
              <stop offset="1" stopColor="#4f006f"/>
            </radialGradient>
            <radialGradient id="thesvg-word-f" cx="-749.58" cy="798.74" r="13.89" fx="-749.58" fy="798.74" gradientTransform="matrix(-28.7167 6.70901 16.06567 68.78884 -33867.69 -49911.37)" gradientUnits="userSpaceOnUse">
              <stop offset=".06" stopColor="#e4a7fe"/>
              <stop offset=".54" stopColor="#e4a7fe" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="thesvg-word-g" cx="-675.64" cy="797.48" r="13.89" fx="-675.64" fy="797.48" gradientTransform="matrix(15.99196 15.99755 15.99476 -15.99476 -1949 23805.98)" gradientUnits="userSpaceOnUse">
              <stop offset=".08" stopColor="#367af2"/>
              <stop offset=".87" stopColor="#001a8f"/>
            </radialGradient>
            <radialGradient id="thesvg-word-h" cx="-657.62" cy="854.65" r="13.89" fx="-657.62" fy="854.65" gradientTransform="matrix(0 11.2 12.76 0 -10796.09 7734.8)" gradientUnits="userSpaceOnUse">
              <stop offset=".59" stopColor="#2763e5" stopOpacity="0"/>
              <stop offset=".97" stopColor="#58aafe"/>
            </radialGradient>
            <linearGradient id="thesvg-word-b" x1="69.43" x2="388.45" y1="238.11" y2="238.11" gradientTransform="matrix(1 0 0 -1 0 502)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#66c0ff"/>
              <stop offset=".26" stopColor="#0094f0"/>
            </linearGradient>
            <linearGradient id="thesvg-word-e" x1="69.48" x2="485.94" y1="380.04" y2="373.16" gradientTransform="matrix(1 0 0 -1 0 502)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#9deaff"/>
              <stop offset=".2" stopColor="#3bd5ff"/>
            </linearGradient>
          </defs>
          <path d="m69.43 376.25 194.4-237.36L486 293.13v158.26c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31-37.31-83.31-83.33v-40.42Z" fill="url(#thesvg-word-a)"/>
          <path d="M69.43 208.87c0-34.52 27.98-62.5 62.49-62.5h283.11L486 111.11v173.61c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31 37.31-83.31 83.33v-207.8Z" fill="url(#thesvg-word-b)"/>
          <path d="M69.43 208.87c0-34.52 27.98-62.5 62.49-62.5h283.11L486 111.11v173.61c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31 37.31-83.31 83.33v-207.8Z" fill="url(#thesvg-word-c)" fillOpacity="0.6"/>
          <path d="M69.43 208.87c0-34.52 27.98-62.5 62.49-62.5h283.11L486 111.11v173.61c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31 37.31-83.31 83.33v-207.8Z" fill="url(#thesvg-word-d)" fillOpacity="0.1"/>
          <path d="M69.43 83.33C69.43 37.31 106.73 0 152.74 0H437.4C464.24 0 486 21.76 486 48.61v69.44c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31 37.31-83.31 83.33V83.33Z" fill="url(#thesvg-word-e)"/>
          <path d="M69.43 83.33C69.43 37.31 106.73 0 152.74 0H437.4C464.24 0 486 21.76 486 48.61v69.44c0 26.85-21.76 48.61-48.6 48.61H152.74c-46.01 0-83.31 37.31-83.31 83.33V83.33Z" fill="url(#thesvg-word-f)" fillOpacity="0.8"/>
          <rect width="222.17" height="222.22" y="236.11" rx="45.13" ry="45.13" fill="url(#thesvg-word-g)"/>
          <rect width="222.17" height="222.22" y="236.11" rx="45.13" ry="45.13" fill="url(#thesvg-word-h)" fillOpacity="0.65"/>
          <path d="M187.26 283.73 159.92 410.7l-32.69.02-16.14-76.19-16.9 76.19h-33L34.91 283.75h26.95l16.21 83.79 16.11-83.79h33.04l16.87 83.79 15.82-83.79 27.34-.02Z" fill="#fff"/>
        </svg>
      );

    // 3. Microsoft Excel 官方矢量 (https://thesvg.org/icons/microsoft-excel/default.svg)
    case "excel":
      return (
        <svg
          viewBox="0 0 486 500"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={baseStyle}
          className={`shrink-0 ${className}`}
        >
          <defs>
            <radialGradient id="thesvg-excel-a" cx="-746.66" cy="781.44" r="13.89" fx="-746.66" fy="781.44" gradientTransform="matrix(-28.32596 -29.80763 -23.11916 21.97986 -2596.39 -38900.31)" gradientUnits="userSpaceOnUse">
              <stop offset=".06" stopColor="#379539"/>
              <stop offset=".42" stopColor="#297c2d"/>
              <stop offset=".7" stopColor="#15561c"/>
            </radialGradient>
            <radialGradient id="thesvg-excel-b" cx="-773.19" cy="771.25" r="13.89" fx="-773.19" fy="771.25" gradientTransform="matrix(-11.97612 -11.58137 -8.95853 9.26806 -2155.12 -15858.88)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#073b10"/>
              <stop offset=".99" stopColor="#084a13" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="thesvg-excel-f" cx="-824.11" cy="810.99" r="13.89" fx="-824.11" fy="810.99" gradientTransform="matrix(-9.02 0 0 19.09 -7120.4 -15378.69)" gradientUnits="userSpaceOnUse">
              <stop offset=".29" stopColor="#4eb43b"/>
              <stop offset="1" stopColor="#72cc61" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="thesvg-excel-h" cx="-769.14" cy="808.9" r="13.89" fx="-769.14" fy="808.9" gradientTransform="matrix(-16.9077 -13.68182 13.64112 -16.86345 -23523.37 3309.71)" gradientUnits="userSpaceOnUse">
              <stop offset=".44" stopColor="#79e96d"/>
              <stop offset="1" stopColor="#d0eb76"/>
            </radialGradient>
            <radialGradient id="thesvg-excel-i" cx="-675.64" cy="793.28" r="13.89" fx="-675.64" fy="793.28" gradientTransform="matrix(15.99196 15.99755 45.54153 -45.54797 -25315.85 47178.18)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#20a85e"/>
              <stop offset=".94" stopColor="#09442a"/>
            </radialGradient>
            <radialGradient id="thesvg-excel-j" cx="-657.62" cy="853.99" r="13.89" fx="-657.62" fy="853.99" gradientTransform="matrix(0 11.2 12.9 0 -10902.85 7734.8)" gradientUnits="userSpaceOnUse">
              <stop offset=".58" stopColor="#33a662" stopOpacity="0"/>
              <stop offset=".97" stopColor="#98f0b0"/>
            </radialGradient>
            <linearGradient id="thesvg-excel-c" x1="69.43" x2="260.84" y1="210.33" y2="210.33" gradientTransform="matrix(1 0 0 -1 0 502)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#52d17c"/>
              <stop offset=".33" stopColor="#4aa647"/>
            </linearGradient>
            <linearGradient id="thesvg-excel-d" x1="194.4" x2="194.4" y1="335.33" y2="161.68" gradientTransform="matrix(1 0 0 -1 0 502)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#29852f"/>
              <stop offset=".5" stopColor="#4aa647" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="thesvg-excel-e" x1="80.49" x2="311.45" y1="297.22" y2="497.54" gradientTransform="matrix(1 0 0 -1 0 502)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#66d052"/>
              <stop offset="1" stopColor="#85e972"/>
            </linearGradient>
            <linearGradient id="thesvg-excel-g" x1="182.11" x2="69.43" y1="377" y2="377" gradientTransform="matrix(1 0 0 -1 0 502)" gradientUnits="userSpaceOnUse">
              <stop offset=".18" stopColor="#c0e075" stopOpacity="0"/>
              <stop offset="1" stopColor="#d1eb95"/>
            </linearGradient>
          </defs>
          <path d="M69.43 159.72c0-34.52 27.98-62.5 62.49-62.5h354.09v361.11c0 23.01-18.65 41.67-41.66 41.67H152.74c-46.01 0-83.31-37.31-83.31-83.33V159.72Z" fill="url(#thesvg-excel-a)"/>
          <path d="M69.43 159.72c0-34.52 27.98-62.5 62.49-62.5h354.09v361.11c0 23.01-18.65 41.67-41.66 41.67H152.74c-46.01 0-83.31-37.31-83.31-83.33V159.72Z" fill="url(#thesvg-excel-b)" fillOpacity="0.7"/>
          <path d="M69.43 229.17c0-34.52 27.98-62.5 62.49-62.5h187.46c-23.01 0-41.66 18.66-41.66 41.67v83.33c0 23.01-18.65 41.67-41.66 41.67h-83.31c-46.01 0-83.31 37.31-83.31 83.33v-187.5Z" fill="url(#thesvg-excel-c)"/>
          <path d="M69.43 229.17c0-34.52 27.98-62.5 62.49-62.5h187.46c-23.01 0-41.66 18.66-41.66 41.67v83.33c0 23.01-18.65 41.67-41.66 41.67h-83.31c-46.01 0-83.31 37.31-83.31 83.33v-187.5Z" fill="url(#thesvg-excel-d)" fillOpacity="0.3"/>
          <path d="M69.43 83.33C69.43 37.31 106.73 0 152.74 0h166.63v166.67H152.74c-46.01 0-83.31 37.31-83.31 83.33V83.33Z" fill="url(#thesvg-excel-e)"/>
          <path d="M69.43 83.33C69.43 37.31 106.73 0 152.74 0h166.63v166.67H152.74c-46.01 0-83.31 37.31-83.31 83.33V83.33Z" fill="url(#thesvg-excel-f)"/>
          <path d="M69.43 83.33C69.43 37.31 106.73 0 152.74 0h166.63v166.67H152.74c-46.01 0-83.31 37.31-83.31 83.33V83.33Z" fill="url(#thesvg-excel-g)"/>
          <rect width="208.29" height="166.67" x="277.71" rx="41.66" ry="41.66" fill="url(#thesvg-excel-h)"/>
          <rect width="222.17" height="222.22" y="236.11" rx="45.13" ry="45.13" fill="url(#thesvg-excel-i)"/>
          <rect width="222.17" height="222.22" y="236.11" rx="45.13" ry="45.13" fill="url(#thesvg-excel-j)" fillOpacity="0.3"/>
          <path d="M169.48 410.71h-34.25l-21.5-40.47c-.77-1.42-1.36-2.54-1.77-3.37-.35-.88-.74-1.89-1.15-3.01h-.35c-.53 1.42-1.03 2.57-1.5 3.45-.47.89-1.03 1.98-1.68 3.28l-22.3 40.11h-32.3l38.76-63.58-36.1-63.4h33.8l19.11 36.13c.77 1.48 1.42 2.78 1.95 3.9.59 1.06 1.18 2.33 1.77 3.81h.35l1.95-4.07c.53-1 1.24-2.33 2.12-3.98l19.82-35.77h32.21l-36.63 62.43 37.7 64.55Z" fill="#fff"/>
        </svg>
      );

    // 4. Microsoft PowerPoint 官方矢量 (https://thesvg.org/icons/microsoft-powerpoint/default.svg)
    case "ppt":
      return (
        <svg
          viewBox="60 78.75 581.25 562.5"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={baseStyle}
          className={`shrink-0 ${className}`}
        >
          <defs>
            <radialGradient id="thesvg-ppt-b" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="rotate(135 185.459 218.557) scale(564.67953 950.43148)" gradientUnits="userSpaceOnUse">
              <stop offset=".152" stopColor="#aa1d2d"/>
              <stop offset=".381" stopColor="#d12b18" stopOpacity=".44"/>
              <stop offset=".602" stopColor="#ff3c00" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="thesvg-ppt-c" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(484.01207 -228.61784 414.17447 876.85825 -19.41 588.618)" gradientUnits="userSpaceOnUse">
              <stop offset=".407" stopColor="#ff66fb" stopOpacity=".5"/>
              <stop offset="1" stopColor="#ea3d01" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="thesvg-ppt-e" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(355.8576 74.56878 -71.0897 339.25471 312.756 393.631)" gradientUnits="userSpaceOnUse">
              <stop offset=".786" stopColor="#ffa05c" stopOpacity="0"/>
              <stop offset=".905" stopColor="#ffce84"/>
            </radialGradient>
            <radialGradient id="thesvg-ppt-f" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(307.21144 -201.01593 192.23383 293.78981 369.795 355.78)" gradientUnits="userSpaceOnUse">
              <stop offset=".295" stopColor="#ff99e9" stopOpacity=".8"/>
              <stop offset=".728" stopColor="#ff99e9" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="thesvg-ppt-g" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(257.14316 -294.39511 268.86446 234.84308 328.567 398.718)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#fd6ef9"/>
              <stop offset=".637" stopColor="#f94"/>
              <stop offset=".852" stopColor="#fcc479"/>
            </radialGradient>
            <radialGradient id="thesvg-ppt-h" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(-29.04584 196.8193 -444.81484 -65.64406 302.985 115.92)" gradientUnits="userSpaceOnUse">
              <stop offset=".144" stopColor="#ff8d13"/>
              <stop offset=".537" stopColor="#ff7f29" stopOpacity="0"/>
            </radialGradient>
            <radialGradient id="thesvg-ppt-i" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="rotate(45 -386.466 244.891) scale(339.41099)" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#f8193e"/>
              <stop offset=".939" stopColor="#920616"/>
            </radialGradient>
            <radialGradient id="thesvg-ppt-j" cx="0" cy="0" r="1" fx="0" fy="0" gradientTransform="matrix(0 168 -191.25 0 179.97 489)" gradientUnits="userSpaceOnUse">
              <stop offset=".576" stopColor="#ffb055" stopOpacity="0"/>
              <stop offset=".974" stopColor="#fff2be" stopOpacity=".3"/>
            </radialGradient>
            <linearGradient id="thesvg-ppt-a" x1="22.096" x2="-.876" y1="4.056" y2="26.033" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse">
              <stop offset=".058" stopColor="#ff7f48"/>
              <stop offset="1" stopColor="#e5495b"/>
            </linearGradient>
            <linearGradient id="thesvg-ppt-d" x1="27.549" x2="47.729" y1="28.172" y2="13.216" gradientTransform="scale(15)" gradientUnits="userSpaceOnUse">
              <stop offset=".311" stopColor="#ff6e30"/>
              <stop offset=".635" stopColor="#ffa05c"/>
            </linearGradient>
          </defs>
          <path d="M641.2 360c0-155.332-125.907-281.25-281.223-281.25C204.66 78.75 78.75 204.668 78.75 360s125.91 281.25 281.227 281.25c155.316 0 281.222-125.918 281.222-281.25Z" fill="url(#thesvg-ppt-a)"/>
          <path d="M641.2 360c0-155.332-125.907-281.25-281.223-281.25C204.66 78.75 78.75 204.668 78.75 360s125.91 281.25 281.227 281.25c155.316 0 281.222-125.918 281.222-281.25Z" fill="url(#thesvg-ppt-b)"/>
          <path d="M641.2 360c0-155.332-125.907-281.25-281.223-281.25C204.66 78.75 78.75 204.668 78.75 360s125.91 281.25 281.227 281.25c155.316 0 281.222-125.918 281.222-281.25Z" fill="url(#thesvg-ppt-c)"/>
          <path d="M360.016 78.75c155.312.004 281.218 125.922 281.218 281.25 0 51.672-13.96 100.07-38.273 141.68l4.57-10.121c27.832-61.797-17.406-131.727-85.183-131.676l-111.93.086c-27.824.023-50.402-22.535-50.402-50.36V197.477c-.004-67.805-70.012-112.993-131.793-85.067l-8.996 4.074c41.406-23.992 89.492-37.734 140.789-37.734Z" fill="url(#thesvg-ppt-d)"/>
          <path d="M360.016 78.75c155.312.004 281.218 125.922 281.218 281.25 0 51.672-13.96 100.07-38.273 141.68l4.57-10.121c27.832-61.797-17.406-131.727-85.183-131.676l-111.93.086c-27.824.023-50.402-22.535-50.402-50.36V197.477c-.004-67.805-70.012-112.993-131.793-85.067l-8.996 4.074c41.406-23.992 89.492-37.734 140.789-37.734Z" fill="url(#thesvg-ppt-e)"/>
          <path d="M360.016 78.75c155.312.004 281.218 125.922 281.218 281.25 0 51.672-13.96 100.07-38.273 141.68l4.57-10.121c27.832-61.797-17.406-131.727-85.183-131.676l-111.93.086c-27.824.023-50.402-22.535-50.402-50.36V197.477c-.004-67.805-70.012-112.993-131.793-85.067l-8.996 4.074c41.406-23.992 89.492-37.734 140.789-37.734Z" fill="url(#thesvg-ppt-f)"/>
          <path d="M360.016 78.75c155.312.004 281.218 125.922 281.218 281.25 0 51.672-13.96 100.07-38.273 141.68l4.57-10.121c27.832-61.797-17.406-131.727-85.183-131.676l-111.93.086c-27.824.023-50.402-22.535-50.402-50.36V197.477c-.004-67.805-70.012-112.993-131.793-85.067l-8.996 4.074c41.406-23.992 89.492-37.734 140.789-37.734Z" fill="url(#thesvg-ppt-g)"/>
          <path d="M360.016 78.75c155.312.004 281.218 125.922 281.218 281.25 0 51.672-13.96 100.07-38.273 141.68l4.57-10.121c27.832-61.797-17.406-131.727-85.183-131.676l-111.93.086c-27.824.023-50.402-22.535-50.402-50.36V197.477c-.004-67.805-70.012-112.993-131.793-85.067l-8.996 4.074c41.406-23.992 89.492-37.734 140.789-37.734Z" fill="url(#thesvg-ppt-h)"/>
          <rect x="60" y="345" width="240" height="240" rx="48.75" fill="url(#thesvg-ppt-i)"/>
          <rect x="60" y="345" width="240" height="240" rx="48.75" fill="url(#thesvg-ppt-j)"/>
          <path d="M168.293 488.906v44.664h-30.875V396.426h47.7c17.077 0 30.077 3.73 39 11.191 8.987 7.457 13.48 18.52 13.48 33.184 0 15.113-5.036 26.906-15.106 35.387-10.004 8.48-23.453 12.718-40.34 12.718Zm0-68.761v45.043h12.906c7.645 0 13.543-2.004 17.684-6.024 4.14-4.016 6.215-9.785 6.215-17.309 0-6.949-2.043-12.304-6.121-16.07-4.016-3.762-9.782-5.64-17.301-5.64Z" fill="#fff"/>
        </svg>
      );

    // 5. Markdown 官方矢量 (https://thesvg.org/icons/markdown/default.svg)
    case "markdown":
      return (
        <svg
          viewBox="0 0 208 128"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={baseStyle}
          className={`shrink-0 ${className}`}
        >
          <rect width="208" height="128" rx="16" fill="#0F172A" />
          <path fill="none" stroke="#FFFFFF" strokeWidth="8" d="M15 10h178a8 8 0 0 1 8 8v92a8 8 0 0 1-8 8H15a8 8 0 0 1-8-8V18a8 8 0 0 1 8-8z"/>
          <path fill="#FFFFFF" d="M30 98V30h20l20 25 20-25h20v68H90V59L70 84 50 59v39H30zm125 0-30-33h20V30h20v35h20l-30 33z"/>
        </svg>
      );

    case "txt":
      return (
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={baseStyle}
          className={`shrink-0 ${className}`}
        >
          <path
            d="M10 6C10 4.89543 10.8954 4 12 4H30L40 14V42C40 43.1046 39.1046 44 38 44H12C10.8954 44 10 43.1046 10 42V6Z"
            fill="#FFFFFF"
            stroke="#DEE0E3"
            strokeWidth="1.5"
          />
          <path d="M30 4V12C30 13.1046 30.8954 14 32 14H40" fill="#F2F3F5" />
          <path d="M30 4L40 14H32C30.8954 14 30 13.1046 30 12V4Z" fill="#D0D3D6" opacity="0.5" />
          <rect x="16" y="20" width="16" height="2" rx="1" fill="#646A73" />
          <rect x="16" y="26" width="16" height="2" rx="1" fill="#8F959E" />
          <rect x="16" y="32" width="11" height="2" rx="1" fill="#8F959E" />
        </svg>
      );

    case "code":
      return (
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={baseStyle}
          className={`shrink-0 ${className}`}
        >
          <defs>
            <linearGradient id="thesvg-code-bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0284C7" />
              <stop offset="100%" stopColor="#0369A1" />
            </linearGradient>
            <filter id="thesvg-code-shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#082F49" floodOpacity="0.25" />
            </filter>
          </defs>
          <path
            d="M10 6C10 4.89543 10.8954 4 12 4H30L40 14V42C40 43.1046 39.1046 44 38 44H12C10.8954 44 10 43.1046 10 42V6Z"
            fill="#FFFFFF"
            stroke="#DEE0E3"
            strokeWidth="1.5"
          />
          <path d="M30 4V12C30 13.1046 30.8954 14 32 14H40" fill="#E0F2FE" />
          <path d="M30 4L40 14H32C30.8954 14 30 13.1046 30 12V4Z" fill="#0284C7" opacity="0.3" />
          <g filter="url(#thesvg-code-shadow)">
            <rect x="6" y="16" width="18" height="18" rx="3.5" fill="url(#thesvg-code-bg)" />
            <path
              d="M11 25L13.5 22.5L12.5 21.5L9 25L12.5 28.5L13.5 27.5L11 25ZM19 25L16.5 27.5L17.5 28.5L21 25L17.5 21.5L16.5 22.5L19 25ZM15.5 21L13.5 29H14.5L16.5 21H15.5Z"
              fill="#FFFFFF"
            />
          </g>
        </svg>
      );

    default:
      return (
        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={baseStyle}
          className={`shrink-0 ${className}`}
        >
          <path
            d="M10 6C10 4.89543 10.8954 4 12 4H30L40 14V42C40 43.1046 39.1046 44 38 44H12C10.8954 44 10 43.1046 10 42V6Z"
            fill="#FFFFFF"
            stroke="#DEE0E3"
            strokeWidth="1.5"
          />
          <path d="M30 4V12C30 13.1046 30.8954 14 32 14H40" fill="#F2F3F5" />
          <path d="M30 4L40 14H32C30.8954 14 30 13.1046 30 12V4Z" fill="#D0D3D6" opacity="0.4" />
          <rect x="16" y="20" width="16" height="2" rx="1" fill="#D0D3D6" />
          <rect x="16" y="26" width="16" height="2" rx="1" fill="#D0D3D6" />
          <rect x="16" y="32" width="10" height="2" rx="1" fill="#D0D3D6" />
        </svg>
      );
  }
};
