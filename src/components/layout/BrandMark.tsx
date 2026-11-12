import React from "react";
import { cn } from "@/components/ui/button";

/** Joykali logo: a bolt inside a charging ring. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("h-9 w-9", className)} aria-hidden="true">
      <defs>
        <linearGradient id="jk-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#cdf264" />
          <stop offset="1" stopColor="#8285f8" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="12" fill="#17153a" stroke="url(#jk-ring)" strokeWidth="1.5" />
      <path d="M22.5 8 12 22.2h7.1L17.6 32 28 17.6h-7.2L22.5 8Z" fill="#cdf264" />
    </svg>
  );
}

export function BrandMark({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandLogo />
      <div className="leading-tight">
        <p className={cn("font-display text-[15px] font-bold tracking-tight", tone === "dark" ? "text-white" : "text-ink-900")}>
          Joykali<span className="text-volt-400"> EV</span>
        </p>
        <p className={cn("text-[10px] font-medium tracking-wide", tone === "dark" ? "text-slate-400" : "text-slate-500")}>
          Mobility · Business Suite
        </p>
      </div>
    </div>
  );
}
