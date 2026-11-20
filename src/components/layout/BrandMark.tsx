import React from "react";
import { cn } from "@/components/ui/button";

/**
 * Joykali EV Mobility logo (blue "Joykali", red "EV", green scooter and leaves).
 * Files: /public/brand/joykali-logo.png (web), joykali-logo-hd.png (print), joykali-icon-512.png (square).
 */

/** Square app icon (logo on a white tile) — for small spots like the phone header. */
export function BrandLogo({ className }: { className?: string; tile?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/joykali-icon-512.png"
      alt="Joykali EV Mobility"
      className={cn("h-9 w-9 select-none rounded-xl bg-white object-contain shadow-sm ring-1 ring-slate-200", className)}
      draggable={false}
    />
  );
}

/**
 * Full logo. `dark` (default) = the version for the blue sidebar / login hero: white "Joykali" and
 * "Mobility", red "EV", bright green scooter — sits straight on the blue, no box. `light` = the
 * original colours, for white backgrounds.
 */
export function BrandMark({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === "dark" ? "/brand/joykali-logo-dark.png" : "/brand/joykali-logo.png"}
      alt="Joykali EV Mobility"
      className={cn("h-14 w-auto select-none object-contain", className)}
      draggable={false}
    />
  );
}
