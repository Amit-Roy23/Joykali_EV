"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Ban, Loader2, Truck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader, PageSkeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/components/layout/session";
import { ApprovalPanel, api, CreditMeter, dt, Notice, ReasonModal, rupees } from "@/components/workflow";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { can, user } = useSession();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [doOpen, setDoOpen] = useState(false);
  const [doQty, setDoQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [doError, setDoError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<any>(`/api/orders/${id}`)
      .then((d) => {
        setData(d);
        const q: Record<string, number> = {};
        d.order.lines.forEach((l: any) => (q[l.model] = l.quantity - (l.dispatchedQty || 0)));
        setDoQty(q);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <PageSkeleton />;
  const o = data.order;
  const remaining = o.lines.reduce((s: number, l: any) => s + l.quantity - (l.dispatchedQty || 0), 0);
  const canRaiseDO = can("dispatch.manage") && ["APPROVED", "PARTIALLY_DISPATCHED"].includes(o.status) && remaining > 0;
  const canCancel =
    !["CANCELLED", "REJECTED", "COMPLETED"].includes(o.status) &&
    (user?.role === "DISTRIBUTOR" ? o.status === "PENDING_APPROVAL" : ["ASM", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"].includes(user?.role));

  const raiseDO = async () => {
    setBusy(true);
    setDoError(null);
    try {
      const d = await api<any>("/api/delivery-orders", {
        method: "POST",
        json: { orderId: o._id, lines: o.lines.map((l: any) => ({ modelId: l.model, quantity: doQty[l.model] || 0 })) },
      });
      router.push(`/dispatch/${d._id}`);
    } catch (e: any) {
      setDoError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        backHref="/orders"
        eyebrow={`${o.partyType === "DEALER" ? "Dealer" : "Distributor"} order · ${dt(o.createdAt, true)}`}
        title={o.orderCode}
        description={`${o.partyName} (${o.partyCode}) · placed by ${o.placedByName}`}
        actions={
          <>
            <StatusBadge status={o.status} />
            {canRaiseDO && (
              <Button size="sm" onClick={() => setDoOpen(true)}>
                <Truck className="h-4 w-4" /> Raise delivery order
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="outline" className="text-rose-600" onClick={() => setCancelOpen(true)}>
                <Ban className="h-4 w-4" /> {o.lines.some((l: any) => l.dispatchedQty > 0) ? "Cancel balance" : "Cancel order"}
              </Button>
            )}
          </>
        }
      />
      {o.cancelledReason && <Notice tone="warning" className="mb-4">Cancelled: {o.cancelledReason}</Notice>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Vehicles ordered</CardTitle>
              <CardDescription>Channel price ex-GST · “On DOs” counts units already scheduled on warehouse delivery orders</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">On DOs</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.lines.map((l: any) => (
                  <TableRow key={l.model}>
                    <TableCell className="font-semibold text-slate-900">{l.modelName}</TableCell>
                    <TableCell className="text-right">{l.quantity}</TableCell>
                    <TableCell className="text-right">{l.dispatchedQty || 0}</TableCell>
                    <TableCell className="text-right">{rupees(l.unitPrice)}</TableCell>
                    <TableCell className="text-right">{l.gstRate}%</TableCell>
                    <TableCell className="text-right font-semibold">{rupees(l.quantity * l.unitPrice * (1 + l.gstRate / 100))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 border-t border-slate-100 px-5 py-3 text-sm">
              <span className="text-slate-500">Taxable <b className="text-slate-900">{rupees(o.taxableValue)}</b></span>
              <span className="text-slate-500">GST <b className="text-slate-900">{rupees(o.gstValue)}</b></span>
              <span className="text-slate-500">Total <b className="font-display text-base text-slate-900">{rupees(o.totalValue)}</b></span>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery orders</CardTitle>
              <CardDescription>Warehouse loading, dispatch and receipt for this order</CardDescription>
            </CardHeader>
            <CardContent>
              {data.deliveryOrders.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {["APPROVED", "PARTIALLY_DISPATCHED"].includes(o.status) ? "Approved — waiting for the warehouse to raise a delivery order." : "None yet."}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.deliveryOrders.map((d: any) => (
                    <li key={d._id}>
                      <Link href={`/dispatch/${d._id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                        <div>
                          <p className="font-mono text-sm font-semibold">{d.doCode}</p>
                          <p className="text-xs text-slate-500">
                            {d.lines.reduce((s: number, l: any) => s + l.quantity, 0)} vehicles{d.document?.number ? ` · ${d.document.number}` : ""} · {dt(d.createdAt)}
                          </p>
                        </div>
                        <StatusBadge status={d.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {o.notes && (
            <Card className="p-4 text-sm text-slate-700 sm:p-5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Note</p>
              {o.notes}
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <ApprovalPanel kind="order" id={o._id} approvals={o.approvals} active={o.status === "PENDING_APPROVAL"} onDone={load} title="Order approval" />
          <Card className="p-4 sm:p-5">
            <p className="mb-2 font-display text-[15px] font-semibold">Credit position now</p>
            <CreditMeter credit={data.credit} />
            <p className="mt-3 text-[11px] text-slate-500">
              At order time: available {rupees(o.creditCheck.availableBefore)} of {rupees(o.creditCheck.limit)}. Credit is re-checked at final approval and at dispatch.
            </p>
          </Card>
        </aside>
      </div>

      <ReasonModal
        open={cancelOpen}
        title={o.lines.some((l: any) => l.dispatchedQty > 0) ? "Cancel the undelivered balance" : "Cancel this order"}
        description="Units already on delivery orders are not affected."
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          await api(`/api/orders/${o._id}`, { method: "PATCH", json: { action: "cancel", reason } });
          setCancelOpen(false);
          load();
        }}
      />

      <Modal isOpen={doOpen} onClose={() => setDoOpen(false)} title="Raise a warehouse delivery order" description="Choose how many of each model to ship now. The rest stays open on the order." maxWidth="lg">
        <div className="space-y-3">
          {o.lines.map((l: any) => {
            const max = l.quantity - (l.dispatchedQty || 0);
            return (
              <div key={l.model} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{l.modelName}</p>
                  <p className="text-xs text-slate-500">{max} left to ship</p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={max}
                  className="field w-24 text-center"
                  value={doQty[l.model] ?? 0}
                  onChange={(e) => setDoQty({ ...doQty, [l.model]: Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))) })}
                />
              </div>
            );
          })}
          {doError && <Notice>{doError}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDoOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || Object.values(doQty).every((v) => !v)} onClick={raiseDO}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create DO
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
