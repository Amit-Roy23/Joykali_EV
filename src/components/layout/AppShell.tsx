"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Menu, Plus, Receipt, ShieldOff, Trophy, Warehouse } from "lucide-react";
import { cn } from "@/components/ui/button";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { canSee, routeFor } from "./nav";
import { SessionProvider } from "./session";

export function AppShell({
  user,
  permissions,
  children,
}: {
  user: any;
  permissions: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  const route = routeFor(pathname);
  const allowed = !route || canSee(route, user?.role, permissions);

  return (
    <SessionProvider user={user} permissions={permissions}>
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar user={user} permissions={permissions} open={drawer} onClose={() => setDrawer(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} permissions={permissions} onMenu={() => setDrawer(true)} />
        <main id="main" className="scroll-thin flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-10">
            {allowed ? children : <NoAccess />}
          </div>
        </main>
      </div>
      <MobileTabBar user={user} permissions={permissions} onMenu={() => setDrawer(true)} />
    </div>
    </SessionProvider>
  );
}

function NoAccess() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500 ring-1 ring-rose-100">
        <ShieldOff className="h-7 w-7" />
      </div>
      <h1 className="font-display text-xl font-bold text-slate-900">This area is outside your access</h1>
      <p className="mt-2 text-sm text-slate-500">
        Your role doesn&apos;t include permission for this page. If you need it, ask an Admin to update your role
        permissions.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Back to dashboard
      </Link>
    </div>
  );
}

/** Thumb-friendly bottom navigation for phones and small tablets. */
function MobileTabBar({ user, permissions, onMenu }: { user: any; permissions: string[]; onMenu: () => void }) {
  const pathname = usePathname();
  const can = (p?: string) => canSee({ permission: p }, user?.role, permissions);

  const tabs = [
    { href: "/", label: "Home", icon: LayoutDashboard, show: true },
    { href: "/sales", label: "Sales", icon: Receipt, show: can("sales.view.own") },
    can("sales.create")
      ? { href: "/incentives/my-incentives", label: "Earnings", icon: Trophy, show: true }
      : { href: "/inventory", label: "Stock", icon: Warehouse, show: can("inventory.view") },
  ].filter((t) => t.show);

  const isOn = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const sellFab = can("sales.create");

  const Tab = ({ href, label, icon: Icon }: { href: string; label: string; icon: any }) => (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition-colors",
        isOn(href) ? "text-brand-700" : "text-slate-500"
      )}
    >
      <Icon className={cn("h-[22px] w-[22px]", isOn(href) && "text-brand-600")} />
      {label}
    </Link>
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      aria-label="Quick navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch px-2">
        {tabs.slice(0, 2).map((t) => (
          <Tab key={t.href} {...t} />
        ))}
        {sellFab && (
          <div className="flex flex-1 justify-center">
            <Link
              href="/sales/new"
              aria-label="Record a sale"
              className="-mt-5 grid h-14 w-14 place-items-center rounded-2xl bg-ink-900 text-volt-300 shadow-lg shadow-ink-900/30 ring-4 ring-white transition active:scale-95"
            >
              <Plus className="h-7 w-7" />
            </Link>
          </div>
        )}
        {tabs.slice(2).map((t) => (
          <Tab key={t.href} {...t} />
        ))}
        <button
          onClick={onMenu}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold text-slate-500"
        >
          <Menu className="h-[22px] w-[22px]" />
          More
        </button>
      </div>
    </nav>
  );
}
