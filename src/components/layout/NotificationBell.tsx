"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/components/ui/button";

const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
};

/** Bell with unread count; refreshes every minute and when the page changes. */
export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<{ list: any[]; unread: number }>({ list: [], unread: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const load = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((j) => j.success && setD(j.data))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load, pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const mark = async (ids?: string[]) => {
    const r = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).then((x) => x.json());
    if (r.success) setD(r.data);
  };
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="relative grid h-9 w-9 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100" aria-label={`Notifications${d.unread ? `, ${d.unread} unread` : ""}`}>
        <Bell className="h-5 w-5" />
        {d.unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">{d.unread > 99 ? "99+" : d.unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-2 top-16 z-50 max-h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {d.unread > 0 && (
              <button onClick={() => mark()} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
            {d.list.map((n) => (
              <li key={n._id}>
                <button
                  className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-slate-50", !n.read && "bg-brand-50/60")}
                  onClick={() => {
                    if (!n.read) mark([n._id]);
                    setOpen(false);
                    if (n.href) router.push(n.href);
                  }}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand-600")} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{n.title}</span>
                    {n.body && <span className="block text-xs text-slate-600">{n.body}</span>}
                    <span className="block text-[11px] text-slate-400">{ago(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
            {d.list.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
