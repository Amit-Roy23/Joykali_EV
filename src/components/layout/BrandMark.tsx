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
 * Full logo. `dark` (default) = on the blue sidebar / login hero: the logo sits on a white card so
 * its blue letters stay readable. `light` = straight on a white page.
 */
export function BrandMark({ tone = "dark", className }: { tone?: "dark" | "light"; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src="/brand/joykali-logo.png" alt="Joykali EV Mobility" className="h-full w-auto select-none object-contain" draggable={false} />;
  if (tone === "light") return <span className={cn("inline-flex h-12", className)}>{img}</span>;
  return <span className={cn("inline-flex h-16 items-center rounded-2xl bg-white px-3 py-1.5 shadow-lg shadow-black/10 ring-1 ring-white/60", className)}>{img}</span>;
}
