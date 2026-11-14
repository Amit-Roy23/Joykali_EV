"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, HandCoins, X } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { DataRow, PageHeader, PageSkeleton } from "@/components/ui/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, dt, Notice, ReasonModal, rupees } from "@/components/workflow";

/** A network order: the supplier accepts / rejects it and supplies it from stock; the buyer can withdraw it before acceptance. */
export default function NetworkOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "reject" | "cancel">(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<any>(`/api/network/orders/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    load();
    api<any>("/api/network/catalogue").then((c) => setMe(c.me)).catch(() => setMe(null));
  }, [load]);

  const act = async (action: string, note?: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/network/orders/${id}`, { method: "PATCH", json: { action, note } });
      setModal(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <Notice>{error}</Notice> : <PageSkeleton />;
  const o = data.order;
  const iAmSeller = me && String(me.id) === String(o.seller);
  const iAmBuyer = me && String(me.id) === String(o.buyer);
  const open = ["ACCEPTED", "PARTIALLY_FULFILLED"].includes(o.status);
  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        backHref="/partner/orders"
        eyebrow={<span className="font-mono">{o.orderCode}</span>}
        title={iAmSeller ? `Order from ${o.buyerName}` : `Order to ${o.sellerName}`}
        description={`Placed by ${o.placedByName} on ${dt(o.createdAt, true)}`}
        actions={
          <>
            <StatusBadge status={o.status} />
            {iAmSeller && o.status === "PLACED" && (
              <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setModal("reject")}>
                  <X className="h-4 w-4" /> Reject
                </Button>
                <Button size="sm" disabled={busy} onClick={() => act("accept")}>
                  <Check className="h-4 w-4" /> Accept
                </Button>
              </>
            )}
            {iAmSeller && open && (
              <>
                <Link href={`/partner/sell?order=${o._id}`}>
                  <Button size="sm">
                    <HandCoins className="h-4 w-4" /> Supply from stock
                  </Button>
                </Link>
                <Button size="sm" variant="outline" onClick={() => setModal("cancel")}>
                  Close balance
                </Button>
              </>
            )}
            {iAmBuyer && o.status === "PLACED" && (
              <Button size="sm" variant="outline" onClick={() => setModal("cancel")}>
                Withdraw
              </Button>
            )}
          </>
        }
      />
      {error && <Notice>{error}</Notice>}
      {o.decisionNote && <Notice tone="info">{o.decisionNote}{o.decidedByName ? ` — ${o.decidedByName}, ${dt(o.decidedAt, true)}` : ""}</Notice>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Supplied</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.lines.map((l: any) => (
                  <TableRow key={String(l.model)}>
                    <TableCell className="font-medium">{l.modelName}</TableCell>
                    <TableCell className="text-right tabular">{l.quantity}</TableCell>
                    <TableCell className="text-right tabular">{l.fulfilledQty}</TableCell>
                    <TableCell className="text-right tabular">{rupees(l.unitPrice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
        <Card className="p-5">
          <DataRow label="Taxable value" value={rupees(o.taxableValue)} />
          <DataRow label="GST" value={rupees(o.gstValue)} />
          <DataRow label="Total" value={<b>{rupees(o.totalValue)}</b>} />
          <DataRow label="Credit available when placed" value={rupees(o.creditCheck.availableBefore)} />
          {o.notes && <p className="mt-3 text-sm text-slate-600">Note: {o.notes}</p>}
        </Card>
      </div>
      {data.sales.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Shipments against this order</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {data.sales.map((s: any) => (
              <li key={s._id}>
                <Link href={`/partner/sales/${s._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className="min-w-0 text-sm">
                    <b>{s.invoiceNo || s.saleCode}</b>
                    <span className="block text-xs text-slate-500">
                      {s.lines.length} vehicle(s) · {rupees(s.totalValue)} · {dt(s.saleDate)}
                    </span>
                  </span>
                  <StatusBadge status={s.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <ReasonModal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal === "reject" ? "Reject this order" : iAmSeller ? "Close the unsupplied balance" : "Withdraw this order"}
        confirmLabel={modal === "reject" ? "Reject" : "Confirm"}
        onConfirm={async (reason: string) => {
          await api(`/api/network/orders/${id}`, { method: "PATCH", json: { action: modal === "reject" ? "reject" : "cancel", note: reason } });
          setModal(null);
          load();
        }}
      />
    </div>
  );
}
