"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees } from "@/components/workflow";

/** Orders I placed (with the company or my supplier) and orders my own network placed with me. */
export default function PartnerOrdersPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<"mine" | "network">("mine");
  const [mine, setMine] = useState<any[] | null>(null);
  const [network, setNetwork] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<any[]>("/api/orders").catch(() => []), api<any[]>("/api/network/orders?side=buyer"), api<any[]>("/api/network/orders?side=seller")])
      .then(([company, asBuyer, asSeller]) => {
        setMine(
          [
            ...company.map((o: any) => ({ id: o._id, code: o.orderCode, to: "Joykali EV", status: o.status, total: o.totalValue, units: o.lines.reduce((s: number, l: any) => s + l.quantity, 0), done: o.lines.reduce((s: number, l: any) => s + (l.dispatchedQty || 0), 0), at: o.createdAt, href: `/orders/${o._id}` })),
            ...asBuyer.map((o: any) => ({ id: o._id, code: o.orderCode, to: o.sellerName, status: o.status, total: o.totalValue, units: o.lines.reduce((s: number, l: any) => s + l.quantity, 0), done: o.lines.reduce((s: number, l: any) => s + (l.fulfilledQty || 0), 0), at: o.createdAt, href: `/partner/orders/${o._id}` })),
          ].sort((a, b) => +new Date(b.at) - +new Date(a.at))
        );
        setNetwork(asSeller.map((o: any) => ({ id: o._id, code: o.orderCode, to: o.buyerName, status: o.status, total: o.totalValue, units: o.lines.reduce((s: number, l: any) => s + l.quantity, 0), done: o.lines.reduce((s: number, l: any) => s + (l.fulfilledQty || 0), 0), at: o.createdAt, href: `/partner/orders/${o._id}` })));
      })
      .catch((e) => setError(e.message));
  }, []);

  const list = tab === "mine" ? mine : network;
  const waiting = (network || []).filter((o) => o.status === "PLACED").length;
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="My business"
        title="Orders"
        description="Orders you placed, and orders your dealers / sub dealers placed with you. Accept an order to reserve their credit, then supply it from your stock under Sell."
        actions={
          can("order.create") && (
            <Link href="/partner/buy">
              <Button size="sm">
                <Plus className="h-4 w-4" /> Buy stock
              </Button>
            </Link>
          )
        }
      />
      {error && <Notice className="mb-4">{error}</Notice>}
      <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {(["mine", "network"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === t ? "bg-ink-900 text-white" : "text-slate-600")}>
            {t === "mine" ? "I placed" : `From my network${waiting ? ` (${waiting} new)` : ""}`}
          </button>
        ))}
      </div>
      {!list ? (
        <Skeleton className="h-48" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title={tab === "mine" ? "No orders yet" : "No orders from your network yet"} />
        </Card>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {list.map((o) => (
            <li key={o.id}>
              <Link href={o.href} className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-lift">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-brand-700">{o.code}</p>
                    <p className="mt-1 truncate font-semibold text-slate-900">{tab === "mine" ? `To ${o.to}` : `From ${o.to}`}</p>
                    <p className="text-xs text-slate-500">
                      {o.done}/{o.units} supplied · {rupees(o.total)} · {dt(o.at)}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
