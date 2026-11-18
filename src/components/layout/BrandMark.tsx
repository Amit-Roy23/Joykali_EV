import React from "react";
import { cn } from "@/components/ui/button";

/**
 * Joykali symbol: a "J" drawn as a charging cable whose head is a plug with two lime pins
 * and a lightning bolt cut into it — Joykali + EV charging in one shape.
 * Full logo files (light, white, stacked, mono, PNG) live in /public/brand.
 */
export function BrandLogo({ className, tile = true }: { className?: string; tile?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-9 w-9", className)} aria-hidden="true">
      <defs>
        <linearGradient id="jk-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0D47A1" />
          <stop offset="1" stopColor="#1976C0" />
        </linearGradient>
      </defs>
      {tile && <rect width="64" height="64" rx="15" fill="url(#jk-tile)" />}
      <g transform="translate(4,3)">
        <path d="M37 23 V37 a10 10 0 0 1 -20 0 V35.5" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
        <rect x="30" y="14" width="14" height="11" rx="3.5" fill="#fff" />
        <rect x="32.6" y="6.5" width="3.2" height="9" rx="1.6" fill="#C6F432" />
        <rect x="38.2" y="6.5" width="3.2" height="9" rx="1.6" fill="#C6F432" />
        <path d="M38.6 15.4 L34.4 20.5 H37 L35.5 24 L39.9 18.6 H37.3 Z" fill={tile ? "url(#jk-tile)" : "#0D47A1"} />
      </g>
    </svg>
  );
}

/** Full logo: symbol + JOYKALI wordmark + EV MOBILITY. `dark` = on the blue sidebar / hero. */
export function BrandMark({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === "dark" ? "/brand/joykali-logo-white.svg" : "/brand/joykali-logo.svg"}
      alt="Joykali EV Mobility"
      className={cn("h-9 w-auto select-none", className)}
      draggable={false}
    />
  );
}
