"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Download, PackageCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { DataRow, PageHeader, PageSkeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, ReasonModal, rupees } from "@/components/workflow";

/** A partner's invoice: download, buyer confirms receipt (marking anything short), seller cancels while in transit. */
export default function PartnerSaleDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const [s, setS] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [short, setShort] = useState<Record<string, boolean>>({});
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState(false);

  const load = useCallback(() => {
    api<any>(`/api/network/sales/${id}`).then(setS).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    load();
    api<any>("/api/network/catalogue").then((c) => setMe(c.me)).catch(() => setMe(null));
  }, [load]);

  const receive = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/network/sales/${id}`, { method: "PATCH", json: { action: "receive", remarks, shortVehicleIds: Object.keys(short).filter((k) => short[k]) } });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!s) return error ? <Notice>{error}</Notice> : <PageSkeleton />;
  const iAmBuyer = (me && String(me.id) === String(s.buyer)) || (!me && can("network.manage"));
  const iAmSeller = me && String(me.id) === String(s.seller);
  const shortCount = Object.values(short).filter(Boolean).length;
  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        backHref={iAmSeller ? "/partner/sales" : "/partner/stock"}
        eyebrow={<span className="font-mono">{s.saleCode}</span>}
        title={`Invoice ${s.invoiceNo || s.saleCode}`}
        description={`${s.sellerName} → ${s.buyerName} · ${dt(s.saleDate)} · by ${s.createdByName}`}
        actions={
          <>
            <StatusBadge status={s.status} label={s.status === "COMPLETED" ? "BILLED" : undefined} />
            <a href={`/api/network/sales/${id}/invoice`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Invoice PDF
            </a>
            {iAmSeller && s.status === "IN_TRANSIT" && (
              <Button size="sm" variant="outline" onClick={() => setCancel(true)}>
                Cancel sale
              </Button>
            )}
          </>
        }
      />
      {error && <Notice>{error}</Notice>}
      {s.received && (
        <Notice tone="success">
          Received by {s.received.byName} on {dt(s.received.at, true)}
          {s.received.remarks ? ` — ${s.received.remarks}` : ""}
        </Notice>
      )}
      {s.cancelledReason && <Notice tone="warning">Cancelled: {s.cancelledReason}</Notice>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{iAmBuyer && s.status === "IN_TRANSIT" ? "Check each vehicle as it comes off the truck" : "Vehicles"}</CardTitle>
          </CardHeader>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {s.lines.map((l: any) => {
              const id2 = String(l.vehicle);
              return (
                <li key={id2} className={cn("flex items-center gap-3 px-5 py-3", short[id2] && "bg-rose-50")}>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold text-slate-900">{l.chassisNumber}</p>
                    <p className="text-xs text-slate-500">
                      {l.modelName} · battery {l.batteryNumber || "—"} · {rupees(l.unitPrice)} + {l.gstRate}% GST
                    </p>
                  </div>
                  {iAmBuyer && s.status === "IN_TRANSIT" && (
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-rose-700">
                      <input id={`short-${id2}`} type="checkbox" className="h-4 w-4 accent-rose-600" checked={!!short[id2]} onChange={(e) => setShort({ ...short, [id2]: e.target.checked })} /> Not received
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
          {iAmBuyer && s.status === "IN_TRANSIT" && (
            <div className="space-y-3 border-t border-slate-100 p-5">
              <div className="space-y-1.5">
                <Label>Remarks {shortCount ? "(required: explain the shortage)" : "(optional)"}</Label>
                <Input id="grn-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              </div>
              <Button disabled={busy} onClick={receive}>
                <PackageCheck className="h-4 w-4" /> Confirm receipt{shortCount ? ` (${shortCount} short)` : ""}
              </Button>
            </div>
          )}
        </Card>
        <Card className="p-5">
          <DataRow label="Taxable value" value={rupees(s.taxableValue)} />
          {s.igst ? <DataRow label="IGST" value={rupees(s.igst)} /> : (
            <>
              <DataRow label="CGST" value={rupees(s.cgst)} />
              <DataRow label="SGST" value={rupees(s.sgst)} />
            </>
          )}
          <DataRow label="Invoice total" value={<b>{rupees(s.totalValue)}</b>} />
          {s.buyerKind === "CUSTOMER" ? (
            <>
              <DataRow label="Customer" value={`${s.customer?.name} · ${s.customer?.phone}`} />
              <DataRow label="Received" value={`${rupees(s.amountReceived)} by ${String(s.paymentMode || "").toLowerCase()}`} />
              <DataRow label="Balance" value={rupees(s.totalValue - s.amountReceived)} />
            </>
          ) : (
            <>
              <DataRow label="Buyer GSTIN" value={s.buyerGstin || "—"} />
              <DataRow label="Seller GSTIN" value={s.sellerGstin || "—"} />
            </>
          )}
        </Card>
      </div>
      <ReasonModal
        open={cancel}
        onClose={() => setCancel(false)}
        title="Cancel this sale"
        description="The vehicles come back to your stock and the invoice is reversed with a credit note."
        onConfirm={async (reason: string) => {
          await api(`/api/network/sales/${id}`, { method: "PATCH", json: { action: "cancel", reason } });
          setCancel(false);
          load();
        }}
      />
    </div>
  );
}
