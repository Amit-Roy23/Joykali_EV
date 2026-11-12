import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 disabled:pointer-events-none disabled:opacity-50 gap-2 cursor-pointer active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        default:
          "bg-brand-600 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-700 hover:shadow-lift",
        volt: "bg-volt-300 text-ink-900 shadow-sm hover:bg-volt-200 hover:shadow-glow",
        ink: "bg-ink-900 text-white hover:bg-ink-800 shadow-sm",
        destructive: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
        outline:
          "border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-brand-200 hover:bg-brand-50/60 hover:text-brand-800",
        secondary: "bg-brand-50 text-brand-800 hover:bg-brand-100 border border-brand-100",
        ghost: "text-slate-700 hover:bg-slate-100",
        link: "text-brand-700 underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
);
Button.displayName = "Button";

export { buttonVariants };
