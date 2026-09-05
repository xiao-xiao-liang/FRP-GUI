import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-medium leading-normal transition-colors select-none",
  {
    variants: {
      variant: {
        default: "bg-[#E8F3FF] text-[#3370FF] border-[#B3D4FF]",
        secondary: "bg-[#F2F3F5] text-[#646A75] border-[#E5E6EB]",
        success: "bg-[#E6F7ED] text-[#00B42A] border-[#98E4B5]",
        warning: "bg-[#FFF7E8] text-[#FF7D00] border-[#FFD8A8]",
        destructive: "bg-[#FFECEC] text-[#F53F3F] border-[#FFB4B4]",
        purple: "bg-[#F2E9FE] text-[#8D55ED] border-[#D3BDF8]",
        outline: "text-[#1F2329] border-[#D0D3D6] bg-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
