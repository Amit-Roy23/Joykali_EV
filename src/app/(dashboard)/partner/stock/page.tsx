"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Boxes, PackageCheck, Search, Truck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { api, dt, Notice, rupees } from "@/components/workflow";

/** What I own (serial by serial), what sits with me on consignment, and what is on its way to me. */
export default function PartnerStockPage() {
  const [stock, setStock] = useState<any>(null);
  const [incoming, setIncoming] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<any>("/api/network/stock").then(setStock).catch((e) => setError(e.message));
    Promise.all([api<any[]>("/api/network/sales?side=buyer").catch(() => []), api<any[]>("/api/delivery-orders").catch(() => [])]).then(([sales, dos]) =>
      setIncoming([
        ...sales.filter((s: any) => s.status === "IN_TRANSIT").map((s: any) => ({ id: s._id, code: s.invoiceNo || s.saleCode, from: s.sellerName, units: s.lines.length, at: s.saleDate, href: `/partner/sales/${s._id}` })),
        ...dos.filter((d: any) => d.status === "DISPATCHED").map((d: any) => ({ id: d._id, code: d.document?.number || d.doCode, from: "Joykali EV warehouse", units: d.units, at: d.dispatch?.at || d.updatedAt, href: `/dispatch/${d._id}`, truck: d.loading?.registrationNo })),
      ])
    );
  }, []);

  const all = useMemo(() => [...(stock?.owned || []).map((v: any) => ({ ...v, kind: "owned" })), ...(stock?.consignment || []).map((v: any) => ({ ...v, kind: "consignment" }))], [stock]);
  const shown = all.filter((v) => !q || v.chassisNumber.includes(q.toUpperCase()) || (v.model?.name || "").toLowerCase().includes(q.toLowerCase()));
  const byModel = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of stock?.owned || []) m.set(v.model?.name || "?", (m.get(v.model?.name || "?") || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [stock]);

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader eyebrow="My business" title="Stock & deliveries" description="Every vehicle you hold, by chassis number. When a shipment arrives, open it and confirm the goods receipt — report any vehicle that did not arrive." />
      {error && <Notice>{error}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Owned" value={stock ? stock.owned.length : "–"} sub="ready to sell" icon={Boxes} tone="brand" />
        <StatCard label="Consignment" value={stock ? stock.consignment.length : "–"} sub="company stock with you" icon={Boxes} tone="slate" />
        <StatCard label="Arriving" value={incoming ? incoming.length : "–"} sub="confirm on arrival" icon={Truck} tone="sky" />
        <StatCard label="Models" value={byModel.length} sub={byModel[0] ? `most: ${byModel[0][0]}` : "—"} icon={PackageCheck} tone="emerald" />
      </div>

      {incoming && incoming.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Arriving — confirm receipt</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {incoming.map((s) => (
              <li key={s.id}>
                <Link href={s.href} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className="min-w-0 text-sm">
                    <b className="font-mono">{s.code}</b>
                    <span className="block text-xs text-slate-500">
                      {s.units} vehicle(s) from {s.from}
                      {s.truck ? ` · truck ${s.truck}` : ""} · sent {dt(s.at)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">Receive</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Vehicles in hand</CardTitle>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input id="stock-q" className="pl-9" placeholder="Chassis or model" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        {!stock ? (
          <Skeleton className="mx-5 mb-5 h-40" />
        ) : shown.length === 0 ? (
          <EmptyState icon={Boxes} title="No vehicles in hand" description="Buy stock from your supplier to get started." />
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((v) => (
              <li key={v._id} className="bg-white px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-slate-900">{v.chassisNumber}</p>
                    <p className="truncate text-xs text-slate-500">
                      {v.model?.name} {v.model?.variant} · {v.color} · MRP {rupees(v.model?.sellingPrice)}
                    </p>
                  </div>
                  {v.kind === "consignment" ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">consignment</span> : <StatusBadge status="IN_STOCK" label="IN HAND" />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
