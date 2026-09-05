import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-8 w-full rounded-[6px] border border-[#DEE0E3] bg-white px-3 py-1 text-[14px] text-[#1F2329] placeholder:text-[#8F959E] transition-all hover:border-[#4080FF] focus:border-[#165DFF] focus:outline-none focus:ring-2 focus:ring-[#165DFF]/20 disabled:cursor-not-allowed disabled:bg-[#F5F6F7] disabled:text-[#C9CDD4] leading-[22px]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
