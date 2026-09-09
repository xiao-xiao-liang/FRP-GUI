import React from 'react';
import { cn } from '../../lib/utils';

export interface FeishuSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  width?: number | string;
  height?: number | string;
  rounded?: string;
}

/**
 * 飞书 Universe 官方设计规范骨架屏 (FeishuSkeleton)
 * 具备 1.6s 优雅平滑线性流光微动效 (feishuShimmer)，低对比度浅灰背景，杜绝生硬刺眼感。
 */
export const FeishuSkeleton: React.FC<FeishuSkeletonProps> = ({
  className,
  width,
  height,
  rounded = 'rounded-[4px]',
  style,
  ...props
}) => {
  return (
    <div
      className={cn('feishu-skeleton shrink-0', rounded, className)}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  );
};
