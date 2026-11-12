import * as React from "react";
import { cn } from "./button";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "outline"
  | "volt"
  | "info";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-brand-50 text-brand-700 ring-brand-600/15",
  secondary: "bg-slate-100 text-slate-700 ring-slate-500/15",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/20",
  destructive: "bg-rose-50 text-rose-700 ring-rose-600/20",
  outline: "bg-white text-slate-700 ring-slate-300",
  volt: "bg-volt-100 text-volt-800 ring-volt-600/25",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20",
};

export function Badge({
  className,
  variant = "default",
  dot,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: BadgeVariant; dot?: boolean }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {props.children}
    </div>
  );
}

/** Consistent status colouring across sales, payroll, schemes and stock. */
export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const s = (status || "").toUpperCase();
  const map: Record<string, BadgeVariant> = {
    DELIVERED: "success",
    PAID: "success",
    ACTIVE: "success",
    LOCKED: "default",
    APPROVED: "info",
    BOOKED: "info",
    IN_STOCK: "info",
    ALLOCATED_TO_DEALER: "volt",
    DRAFT: "warning",
    UNDER_REVIEW: "warning",
    PARTIAL: "warning",
    UNPAID: "destructive",
    CANCELLED: "destructive",
    INACTIVE: "secondary",
    EXPIRED: "secondary",
    ARCHIVED: "secondary",
    SOLD: "secondary",
    RETURNED: "warning",
  };
  const label = s === "ALLOCATED_TO_DEALER" ? "AT DEALER" : s.replace(/_/g, " ");
  return (
    <Badge variant={map[s] || "secondary"} dot className={className}>
      {label || "—"}
    </Badge>
  );
}
