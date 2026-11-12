"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/components/ui/button";
import { Avatar, RoleBadge } from "@/components/ui/kit";
import { NAV_GROUPS, canSee, isActive } from "./nav";
import { BrandMark } from "./BrandMark";

interface SidebarProps {
  user: any;
  permissions?: string[];
  /** Mobile drawer state; ignored on desktop where the sidebar is always shown. */
  open?: boolean;
  onClose?: () => void;
}

function NavContent({ user, permissions = [], onNavigate }: { user: any; permissions: string[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <nav className="scroll-thin flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Main">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => canSee(i, user?.role, permissions));
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.href, pathname);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-white/[0.08] text-white"
                          : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-100"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-volt-300 shadow-[0_0_12px_rgba(205,242,100,0.8)]" />
                      )}
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 transition-colors",
                          active ? "text-volt-300" : "text-slate-500 group-hover:text-slate-300"
                        )}
                      />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/[0.06]">
          <Avatar name={user?.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">{user?.name}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <RoleBadge role={user?.role} short />
              <span className="truncate font-mono text-[10px] text-slate-500">{user?.employeeCode}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export function Sidebar({ user, permissions = [], open = false, onClose }: SidebarProps) {
  return (
    <>
      {/* Desktop rail */}
      <aside className="surface-ink hidden h-dvh w-[264px] shrink-0 flex-col border-r border-white/[0.06] lg:flex">
        <div className="flex h-16 items-center px-5">
          <BrandMark />
        </div>
        <NavContent user={user} permissions={permissions} />
      </aside>

      {/* Mobile / tablet drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={onClose} />
          <aside className="surface-ink absolute inset-y-0 left-0 flex w-[84%] max-w-[300px] animate-slide-in flex-col shadow-2xl">
            <div className="flex h-16 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
              <BrandMark />
              <button
                onClick={onClose}
                aria-label="Close menu"
                className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavContent user={user} permissions={permissions} onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
