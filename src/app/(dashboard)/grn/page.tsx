"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, PackageCheck, Search, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees } from "@/components/workflow";

const PARTNER = ["SUPER_DISTRIBUTOR", "DISTRIBUTOR", "DEALER", "SUB_DEALER"];
const STATUS: Record<string, [string, string]> = {
  IN_TRANSIT: ["IN_TRANSIT", "ON THE ROAD"],
  RECEIVED: ["DELIVERED", "RECEIVED"],
  RECEIVED_WITH_ISSUES: ["DELIVERED_WITH_ISSUES", "RECEIVED · ISSUES"],
};

/** Goods receipt notes: what is on the road waiting for the receiver, and every receipt recorded. */
export default function GrnPage() {
  const { user } = useSession();
  const partner = PARTNER.includes(user?.role);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "received">("pending");
  const [q, setQ] = useState("");
  useEffect(() => {
    api<any>("/api/grn")
      .then((r) => {
        setD(r);
        if (!r.pending.length) setTab("received");
      })
      .catch((e) => setErr(e.message));
  }, []);
  const rows = useMemo(() => {
    const list = d ? (tab === "pending" ? d.pending : d.received) : [];
    const s = q.trim().toLowerCase();
    return s ? list.filter((r: any) => [r.document, r.grnNo, r.from, r.to, r.truck].some((x) => (x || "").toLowerCase().includes(s))) : list;
  }, [d, tab, q]);
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow={partner ? "My business" : "Channel & dispatch"}
        title="Goods receipt (GRN)"
        description={
          partner
            ? "Shipments coming to you: when the truck arrives, check every chassis and record the GRN — anything short or damaged is credited back. Your receipts and what your own buyers received are listed below."
            : "Every shipment after dispatch: what is still on the road and every goods receipt the dealers and distributors recorded, with shortages and credit notes."
        }
      />
      {err && <Notice>{err}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="On the road" value={d.summary.pending} sub={`${d.summary.pendingUnits} vehicle(s)`} icon={Truck} tone="sky" />
        <StatCard label="On the road > 3 days" value={d.summary.overdue} tone={d.summary.overdue ? "amber" : "slate"} />
        <StatCard label="Received this month" value={d.summary.receivedThisMonth} icon={PackageCheck} tone="emerald" />
        <StatCard label="Received with issues" value={d.summary.withIssues} sub="short or damaged" tone={d.summary.withIssues ? "rose" : "slate"} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ["pending", `To receive (${d.pending.length})`],
              ["received", `Received (${d.received.length})`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === k ? "bg-ink-900 text-white" : "text-slate-600")}>
              {l}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input id="grn-q" className="pl-9" placeholder="Invoice, GRN, party, truck" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {rows.map((r: any) => {
            const mineToReceive = partner && r.direction === "IN" && r.status === "IN_TRANSIT";
            return (
              <li key={`${r.kind}${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                    <span className="font-mono">{r.document}</span>
                    {partner && <Badge variant={r.direction === "IN" ? "info" : "secondary"}>{r.direction === "IN" ? "Coming to me" : "Sent by me"}</Badge>}
                    {r.grnNo && <span className="font-mono text-xs text-emerald-700">{r.grnNo}</span>}
                  </p>
                  <p className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
                    {r.from} <ArrowRight className="h-3 w-3" /> {r.to} · {r.units} vehicle(s) · {rupees(r.value)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Dispatched {dt(r.dispatchedAt)}
                    {r.truck ? ` · ${r.truck}` : ""}
                    {r.driver ? ` · ${r.driver}` : ""}
                    {r.status === "IN_TRANSIT" ? ` · ${r.daysOnRoad} day(s) on the road` : ` · received ${dt(r.receivedAt, true)} by ${r.receivedBy}`}
                    {r.short ? ` · ${r.short} short` : ""}
                    {r.damaged ? ` · ${r.damaged} damaged` : ""}
                    {r.creditNote ? ` · credit note ${r.creditNote}` : ""}
                    {r.remarks ? ` · ${r.remarks}` : ""}
                  </p>
                </div>
                {r.status === "IN_TRANSIT" && r.daysOnRoad > 3 && <Badge variant="warning">late</Badge>}
                <StatusBadge status={STATUS[r.status][0]} label={STATUS[r.status][1]} />
                {r.pdf && (
                  <a href={r.pdf} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                    <Download className="h-3.5 w-3.5" /> GRN
                  </a>
                )}
                <Link href={r.href} className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold", mineToReceive ? "bg-sky-600 text-white" : "text-brand-700 ring-1 ring-slate-200")}>
                  {mineToReceive ? "Record GRN" : "Open"}
                </Link>
              </li>
            );
          })}
          {rows.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">{tab === "pending" ? "Nothing on the road right now." : "No receipts yet."}</li>}
        </ul>
      </Card>
    </div>
  );
}
