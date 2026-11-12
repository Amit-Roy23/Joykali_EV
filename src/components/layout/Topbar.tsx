"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, KeyRound, LogOut, Menu, Plus } from "lucide-react";
import { Avatar, RoleBadge, ROLE_LABEL } from "@/components/ui/kit";
import { BrandLogo } from "./BrandMark";
import { routeFor } from "./nav";

export function Topbar({
  user,
  permissions,
  onMenu,
}: {
  user: any;
  permissions: string[];
  onMenu: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canSell = user?.role === "ADMIN" || permissions.includes("sales.create");
  const title = routeFor(pathname)?.title ?? "Joykali EV";

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-slate-200/70 bg-white/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="flex h-14 items-center gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
        <button
          onClick={onMenu}
          aria-label="Open menu"
          className="-ml-1.5 rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/" className="lg:hidden" aria-label="Dashboard">
          <BrandLogo className="h-8 w-8" />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold text-slate-900 sm:text-base">{title}</p>
          <p className="hidden truncate text-[11px] text-slate-500 sm:block">
            Joykali EV Mobility · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>

        {canSell && pathname !== "/sales/new" && (
          <Link
            href="/sales/new"
            className="hidden items-center gap-1.5 rounded-xl bg-ink-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-ink-800 sm:inline-flex"
          >
            <Plus className="h-4 w-4 text-volt-300" /> New Sale
          </Link>
        )}

        <div className="relative" ref={ref}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl p-1 pr-1.5 transition hover:bg-slate-100 sm:pr-2"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <Avatar name={user?.name} size="sm" className="sm:h-8 sm:w-8" />
            <div className="hidden text-left md:block">
              <p className="max-w-[160px] truncate text-xs font-semibold leading-tight text-slate-900">{user?.name}</p>
              <p className="text-[10px] leading-tight text-slate-500">{ROLE_LABEL[user?.role] ?? user?.role}</p>
            </div>
            <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-64 animate-fade-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            >
              <div className="border-b border-slate-100 p-4">
                <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
                <div className="mt-2 flex items-center gap-2">
                  <RoleBadge role={user?.role} />
                  <span className="font-mono text-[10px] text-slate-400">{user?.employeeCode}</span>
                </div>
              </div>
              <div className="p-1.5">
                <Link
                  href="/change-password"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  role="menuitem"
                >
                  <KeyRound className="h-4 w-4 text-slate-400" /> Change password
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                  role="menuitem"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
