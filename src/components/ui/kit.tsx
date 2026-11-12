import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Inbox } from "lucide-react";
import { cn } from "./button";

/* ------------------------------------------------------------------ */
/* Page header: title + description + actions, wraps cleanly on phones */
/* ------------------------------------------------------------------ */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  backHref,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-col gap-4 sm:mb-6 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-brand-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        )}
        {eyebrow && (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</div>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KPI tile                                                             */
/* ------------------------------------------------------------------ */
const toneMap = {
  brand: "bg-brand-50 text-brand-600 ring-brand-100",
  volt: "bg-volt-100 text-volt-700 ring-volt-200",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
  sky: "bg-sky-50 text-sky-600 ring-sky-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;
export type Tone = keyof typeof toneMap;

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "brand",
  trend,
  className,
  children,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  trend?: { value: number; label?: string } | null;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:shadow-lift sm:p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 truncate font-display text-[22px] font-bold leading-none tracking-tight text-slate-900 tabular sm:text-2xl">
            {value}
          </p>
        </div>
        {Icon && (
          <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1", toneMap[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {(sub || trend) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {trend && <TrendPill value={trend.value} />}
          {sub && <span className="truncate">{sub}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function TrendPill({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular",
        up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
      )}
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(0)}%
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Charge bar — the signature "battery" progress motif                 */
/* ------------------------------------------------------------------ */
export function ChargeBar({
  value,
  max = 100,
  segments = 10,
  tone = "volt",
  animated = true,
  className,
  label,
}: {
  value: number;
  max?: number;
  segments?: number;
  tone?: "volt" | "brand" | "emerald" | "amber";
  animated?: boolean;
  className?: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = {
    volt: "bg-gradient-to-r from-volt-400 to-volt-300",
    brand: "bg-gradient-to-r from-brand-600 to-brand-400",
    emerald: "bg-gradient-to-r from-emerald-500 to-emerald-400",
    amber: "bg-gradient-to-r from-amber-500 to-amber-400",
  }[tone];
  return (
    <div className={cn("flex items-center gap-1", className)} aria-label={label} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="relative h-3.5 flex-1 overflow-hidden rounded-[5px] border border-slate-300/70 bg-slate-100 p-[2px]">
        <div
          className={cn("relative h-full rounded-[3px] transition-[width] duration-700 ease-out", fill)}
          style={{ width: `${pct}%` }}
        >
          {animated && pct > 0 && pct < 100 && (
            <div className="charge-stripes absolute inset-0 animate-charge rounded-[3px] opacity-60" />
          )}
        </div>
        {/* segment ticks */}
        <div className="pointer-events-none absolute inset-[2px] flex">
          {Array.from({ length: segments }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-white/70 last:border-r-0" />
          ))}
        </div>
      </div>
      <div className="h-2 w-1 rounded-r-sm bg-slate-300" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar with deterministic colour                                     */
/* ------------------------------------------------------------------ */
const avatarTones = [
  "bg-brand-100 text-brand-800",
  "bg-volt-100 text-volt-800",
  "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
  "bg-emerald-100 text-emerald-800",
  "bg-violet-100 text-violet-800",
];
export function initials(name?: string) {
  return (name || "?")
    .replace(/^(Md\.|Sk\.)\s*/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
export function Avatar({ name, size = "md", className }: { name?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const n = name || "?";
  const tone = avatarTones[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % avatarTones.length];
  const dims = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" }[size];
  return (
    <div className={cn("grid shrink-0 place-items-center rounded-full font-bold", dims, tone, className)}>
      {initials(n)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Role pill                                                            */
/* ------------------------------------------------------------------ */
export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  MANAGING_PARTNER: "Managing Partner",
  BUSINESS_HEAD: "Business Head",
  ASM: "Area Sales Manager",
  FEC: "Field Executive",
};
export const ROLE_SHORT: Record<string, string> = {
  ADMIN: "Admin",
  MANAGING_PARTNER: "MP",
  BUSINESS_HEAD: "BH",
  ASM: "ASM",
  FEC: "FEC",
};
const roleTone: Record<string, string> = {
  ADMIN: "bg-ink-900 text-volt-300 ring-ink-700",
  MANAGING_PARTNER: "bg-brand-700 text-white ring-brand-800",
  BUSINESS_HEAD: "bg-brand-100 text-brand-800 ring-brand-200",
  ASM: "bg-sky-50 text-sky-800 ring-sky-200",
  FEC: "bg-volt-100 text-volt-800 ring-volt-200",
};
export function RoleBadge({ role, short, className }: { role?: string; short?: boolean; className?: string }) {
  if (!role) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset",
        roleTone[role] || "bg-slate-100 text-slate-700 ring-slate-200",
        className
      )}
    >
      {short ? ROLE_SHORT[role] || role : ROLE_LABEL[role] || role}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Empty / loading states                                               */
/* ------------------------------------------------------------------ */
export function EmptyState({
  title = "Nothing here yet",
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-brand-100">
        <Icon className="h-6 w-6" />
      </div>
      <p className="font-display text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-slate-200/70", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

/* Compact label/value list used on detail pages and mobile cards. */
export function DataRow({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2 text-sm", className)}>
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 text-right font-medium text-slate-900">{value}</span>
    </div>
  );
}
