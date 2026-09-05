import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../../lib/utils";

export const TooltipProvider: React.FC<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>
> = ({
  disableHoverableContent = true,
  delayDuration = 120,
  skipDelayDuration = 0,
  children,
  ...props
}) => (
  <TooltipPrimitive.Provider
    disableHoverableContent={disableHoverableContent}
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
    {...props}
  >
    {children}
  </TooltipPrimitive.Provider>
);

export const Tooltip: React.FC<
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>
> = ({
  disableHoverableContent = true,
  delayDuration = 120,
  ...props
}) => (
  <TooltipPrimitive.Root
    disableHoverableContent={disableHoverableContent}
    delayDuration={delayDuration}
    {...props}
  />
);

export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, collisionPadding = 12, children, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      avoidCollisions={true}
      collisionPadding={collisionPadding}
      className={cn(
        "feishu-tooltip z-50 rounded-[6px] bg-[#1F2329] px-2.5 py-1 text-[12px] text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)] select-none leading-[18px] tracking-tight font-normal pointer-events-none",
        className
      )}
      {...props}
    >
      {children}
      <TooltipPrimitive.Arrow className="fill-[#1F2329]" width={8} height={5} />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/** 1:1 飞书开箱即用快捷 Tooltip 组件 */
export const FeishuTooltip: React.FC<{
  title: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  className?: string;
}> = ({ title, children, side = "top", align = "center", sideOffset = 6, className }) => {
  if (!title) return <>{children}</>;
  return (
    <TooltipProvider disableHoverableContent={true} delayDuration={120} skipDelayDuration={0}>
      <Tooltip disableHoverableContent={true}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} align={align} sideOffset={sideOffset} className={className}>
          {title}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
