"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { HandCoins, Plus, ReceiptText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { api, dt, Notice, rupees, rupeesShort } from "@/components/workflow";

/** Everything I sold: to my dealers / sub dealers and to retail customers. */
export default function PartnerSalesPage() {
  const [list, setList] = useState<any[] | null>(null);
  const [kind, setKind] = useState<"all" | "channel" | "retail">("all");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<any[]>("/api/network/sales?side=seller").then(setList).catch((e) => setError(e.message));
  }, []);
  const shown = (list || []).filter((s) => kind === "all" || (kind === "retail" ? s.buyerKind === "CUSTOMER" : s.buyerKind !== "CUSTOMER"));
  const live = (list || []).filter((s) => s.status !== "CANCELLED");
  const retail = live.filter((s) => s.buyerKind === "CUSTOMER");
  const channel = live.filter((s) => s.buyerKind !== "CUSTOMER");
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="My business"
        title="My sales"
        description="Your invoices to your own network and your retail bills. Download any invoice as a PDF."
        actions={
          <Link href="/partner/sell">
            <Button size="sm">
              <Plus className="h-4 w-4" /> Sell
            </Button>
          </Link>
        }
      />
      {error && <Notice className="mb-4">{error}</Notice>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="To my network" value={channel.reduce((s, x) => s + x.lines.length, 0)} sub={rupeesShort(channel.reduce((s, x) => s + x.totalValue, 0))} icon={HandCoins} tone="amber" />
        <StatCard label="To customers" value={retail.reduce((s, x) => s + x.lines.length, 0)} sub={rupeesShort(retail.reduce((s, x) => s + x.totalValue, 0))} icon={ReceiptText} tone="emerald" />
        <StatCard label="Awaiting receipt" value={channel.filter((s) => s.status === "IN_TRANSIT").length} sub="buyer has not confirmed" icon={HandCoins} tone="sky" className="col-span-2 lg:col-span-1" />
      </div>
      <div className="mb-3 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {(["all", "channel", "retail"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", kind === k ? "bg-ink-900 text-white" : "text-slate-600")}>
            {k === "all" ? "All" : k === "channel" ? "Network" : "Retail"}
          </button>
        ))}
      </div>
      {!list ? (
        <Skeleton className="h-48" />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={ReceiptText} title="No sales yet" />
        </Card>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((s) => (
            <li key={s._id}>
              <Link href={`/partner/sales/${s._id}`} className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-lift">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-brand-700">{s.invoiceNo || s.saleCode}</p>
                    <p className="mt-1 truncate font-semibold text-slate-900">{s.buyerName}</p>
                    <p className="text-xs text-slate-500">
                      {s.buyerKind === "CUSTOMER" ? "Retail" : s.buyerKind === "DEALER" ? "Dealer" : "Distributor"} · {s.lines.length} vehicle(s) · {dt(s.saleDate)}
                    </p>
                  </div>
                  <StatusBadge status={s.status} label={s.status === "COMPLETED" ? "BILLED" : undefined} />
                </div>
                <p className="mt-3 font-display text-lg font-bold tabular">{rupees(s.totalValue)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
