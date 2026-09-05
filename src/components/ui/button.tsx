import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-[6px] text-[14px] font-normal leading-[22px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3370FF] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default: "bg-[#3370FF] text-white hover:bg-[#2860E1] active:bg-[#1E52C9] shadow-xs",
        destructive: "bg-[#F53F3F] text-white hover:bg-[#D93030] shadow-xs",
        outline: "border border-[#D0D3D6] bg-white text-[#1F2329] hover:bg-[#F5F6F7] hover:text-[#1F2329]",
        secondary: "bg-[#F2F3F5] text-[#1F2329] hover:bg-[#E5E6EB]",
        ghost: "hover:bg-[rgba(31,35,41,0.05)] text-[#646A75] hover:text-[#1F2329]",
        link: "text-[#3370FF] underline-offset-4 hover:underline",
        success: "bg-[#00B42A] text-white hover:bg-[#009A24]",
        warning: "bg-[#FF7D00] text-white hover:bg-[#E06E00]",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 rounded-[4px] px-2.5 text-[13px]",
        lg: "h-9 rounded-[6px] px-4 text-[14px]",
        icon: "h-8 w-8 p-0",
        iconSm: "h-7 w-7 p-0 rounded-[4px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
