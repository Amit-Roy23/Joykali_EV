"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees } from "@/components/workflow";

const FILTERS = [
  { id: "", label: "All" },
  { id: "PENDING_APPROVAL", label: "Awaiting approval" },
  { id: "APPROVED", label: "Approved" },
  { id: "PARTIALLY_DISPATCHED", label: "Part on DO" },
  { id: "COMPLETED", label: "Fully on DO" },
  { id: "REJECTED", label: "Rejected" },
];

export default function OrdersPage() {
  const { can, user } = useSession();
  const [orders, setOrders] = useState<any[] | null>(null);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = new URLSearchParams({ ...(status && { status }), ...(search && { search }) });
      api<any[]>(`/api/orders?${q}`)
        .then(setOrders)
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [status, search]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={user?.role === "DISTRIBUTOR" ? "Distributor portal" : "Channel"}
        title={user?.role === "DISTRIBUTOR" ? "My orders" : "Orders"}
        description="Every order is approved by the Business Head and then the Managing Partner before the warehouse ships it."
        actions={
          can("order.create") && (
            <Link href="/orders/new">
              <Button size="sm">
                <Plus className="h-4 w-4" /> {user?.role === "DISTRIBUTOR" ? "Place an order" : "New order"}
              </Button>
            </Link>
          )
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order no. or party" className="pl-9" />
        </div>
        <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                status === f.id ? "border-ink-900 bg-ink-900 text-white" : "border-slate-200 bg-white text-slate-600"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {error && <Notice className="mb-4">{error}</Notice>}
      {!orders ? (
        <Skeleton className="h-64" />
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title="No orders" description="Orders placed for dealers and distributors appear here." />
        </Card>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {orders.map((o) => (
              <li key={o._id}>
                <Link href={`/orders/${o._id}`} className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{o.partyName}</p>
                      <p className="font-mono text-[11px] text-slate-500">{o.orderCode}</p>
                    </div>
                    <p className="shrink-0 font-display font-bold tabular">{rupees(o.totalValue)}</p>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{o.units} vehicles · {dt(o.createdAt)}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  {o.waitingFor && <p className="mt-1 text-[11px] font-semibold text-amber-700">Waiting for {o.waitingFor}</p>}
                </Link>
              </li>
            ))}
          </ul>
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead className="text-right">Vehicles</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Placed by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o._id} className="cursor-pointer" onClick={() => (window.location.href = `/orders/${o._id}`)}>
                    <TableCell>
                      <Link href={`/orders/${o._id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{o.orderCode}</Link>
                      <p className="text-[11px] text-slate-500">{dt(o.createdAt)}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold text-slate-900">{o.partyName}</p>
                      <p className="text-[11px] text-slate-500">{o.partyType === "DEALER" ? "Dealer" : "Distributor"} · {o.partyCode}</p>
                    </TableCell>
                    <TableCell className="text-right tabular">{o.scheduled}/{o.units}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">{rupees(o.totalValue)}</TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                      {o.waitingFor && <p className="mt-0.5 text-[11px] font-semibold text-amber-700">→ {o.waitingFor}</p>}
                    </TableCell>
                    <TableCell className="text-slate-600">{o.placedByName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
