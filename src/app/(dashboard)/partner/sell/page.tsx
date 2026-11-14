"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HandCoins, Loader2, ScanLine, Store, User, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PageHeader, PageSkeleton } from "@/components/ui/kit";
import { api, Notice, rupees } from "@/components/workflow";
import { TierBadge } from "@/components/network";

function SellForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const orderId = sp.get("order");
  const [kids, setKids] = useState<any[] | null>(null);
  const [stock, setStock] = useState<any[] | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [mode, setMode] = useState<"network" | "customer">(orderId ? "network" : "customer");
  const [buyer, setBuyer] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({}); // vehicleId -> price (₹, "" = standard)
  const [scan, setScan] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", email: "" });
  const [pay, setPay] = useState({ paymentMode: "CASH", amountReceivedRupees: "", invoiceNo: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<any>("/api/network/partners").then((r) => setKids(r.children.filter((c: any) => c.status === "ACTIVE"))).catch(() => setKids([]));
    api<any>("/api/network/stock").then((r) => setStock(r.owned)).catch((e) => setError(e.message));
    if (orderId)
      api<any>(`/api/network/orders/${orderId}`)
        .then((r) => {
          setOrder(r.order);
          setBuyer(`${r.order.buyerType}:${r.order.buyer}`);
        })
        .catch((e) => setError(e.message));
  }, [orderId]);

  const needByModel = useMemo(() => {
    if (!order) return null;
    const m = new Map<string, number>();
    for (const l of order.lines) m.set(String(l.model), l.quantity - l.fulfilledQty);
    return m;
  }, [order]);
  const visible = (stock || []).filter((v) => !needByModel || (needByModel.get(String(v.model?._id)) || 0) > 0);
  const chosen = (stock || []).filter((v) => v._id in picked);
  const estTotal = chosen.reduce((s, v) => {
    const p = picked[v._id] ? Number(picked[v._id]) * 100 : mode === "customer" ? v.model?.sellingPrice || 0 : 0;
    return s + p;
  }, 0);

  const toggle = (id: string) => {
    const next = { ...picked };
    if (id in next) delete next[id];
    else next[id] = "";
    setPicked(next);
  };
  const onScan = (e: React.FormEvent) => {
    e.preventDefault();
    const v = (stock || []).find((x) => x.chassisNumber === scan.trim().toUpperCase());
    if (!v) setError(`${scan.trim().toUpperCase()} is not in your stock`);
    else {
      setError(null);
      setPicked({ ...picked, [v._id]: picked[v._id] ?? "" });
    }
    setScan("");
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const [bType, bId] = buyer.split(":");
      const sale = await api<any>("/api/network/sales", {
        method: "POST",
        json: {
          buyerKind: mode === "customer" ? "CUSTOMER" : bType,
          buyerId: mode === "customer" ? undefined : bId,
          orderId: orderId || undefined,
          customer: mode === "customer" ? customer : undefined,
          vehicles: Object.entries(picked).map(([vehicleId, price]) => ({ vehicleId, unitPriceRupees: price ? Number(price) : undefined })),
          invoiceNo: pay.invoiceNo || undefined,
          paymentMode: mode === "customer" ? pay.paymentMode : undefined,
          amountReceivedRupees: mode === "customer" ? Number(pay.amountReceivedRupees || 0) : undefined,
        },
      });
      router.push(`/partner/sales/${sale._id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!stock || !kids) return error ? <Notice>{error}</Notice> : <PageSkeleton />;
  const ready = chosen.length > 0 && (mode === "customer" ? customer.name && customer.phone && customer.address : !!buyer);

  return (
    <div className="animate-fade-up pb-28 lg:pb-0">
      <PageHeader
        backHref={orderId ? `/partner/orders/${orderId}` : undefined}
        eyebrow="My business"
        title={order ? `Supply ${order.orderCode} to ${order.buyerName}` : "Sell"}
        description="Pick vehicles from your own stock by chassis number. A sale to your dealer is posted to their account and travels until they confirm receipt; a sale to a customer marks the vehicle sold."
      />
      {!orderId && (
        <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1">
          <button onClick={() => setMode("customer")} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold", mode === "customer" ? "bg-ink-900 text-white" : "text-slate-600")}>
            <User className="h-4 w-4" /> To a customer
          </button>
          <button
            disabled={kids.length === 0}
            onClick={() => setMode("network")}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40", mode === "network" ? "bg-ink-900 text-white" : "text-slate-600")}
          >
            <Store className="h-4 w-4" /> To my network
          </button>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0 self-start p-4">
          <form onSubmit={onScan} className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input id="scan" className="pl-9 font-mono uppercase" placeholder="Scan or type a chassis number, then Enter" value={scan} onChange={(e) => setScan(e.target.value)} />
            </div>
            <Button type="submit" variant="outline">
              Add
            </Button>
          </form>
          {needByModel && (
            <p className="mb-2 text-xs text-slate-500">
              Showing only models still due on this order:{" "}
              {order.lines
                .filter((l: any) => l.quantity > l.fulfilledQty)
                .map((l: any) => `${l.quantity - l.fulfilledQty} × ${l.modelName}`)
                .join(", ")}
            </p>
          )}
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No matching vehicles in your stock.</p>
          ) : (
            <ul className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
              {visible.map((v) => {
                const on = v._id in picked;
                return (
                  <li key={v._id} className={cn("flex items-center gap-3 px-3 py-2.5", on && "bg-brand-50/60")}>
                    <input id={`pick-${v._id}`} type="checkbox" className="h-4 w-4 accent-brand-600" checked={on} onChange={() => toggle(v._id)} />
                    <label htmlFor={`pick-${v._id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block font-mono text-sm font-semibold text-slate-900">{v.chassisNumber}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {v.model?.name} {v.model?.variant} · {v.color} · MRP {rupees(v.model?.sellingPrice)}
                      </span>
                    </label>
                    {on && (
                      <Input
                        id={`price-${v._id}`}
                        aria-label="Price excluding GST"
                        inputMode="numeric"
                        className="h-9 w-28 text-right"
                        placeholder={mode === "customer" ? String(Math.round((v.model?.sellingPrice || 0) / 100)) : "standard"}
                        value={picked[v._id]}
                        onChange={(e) => setPicked({ ...picked, [v._id]: e.target.value.replace(/[^\d.]/g, "") })}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <Card className="space-y-3 p-4">
            {mode === "network" ? (
              <div className="space-y-1.5">
                <Label>Sell to</Label>
                <select id="buyer" className="field" value={buyer} disabled={!!orderId} onChange={(e) => setBuyer(e.target.value)}>
                  <option value="">Choose a partner…</option>
                  {kids.map((k) => (
                    <option key={k._id} value={`${k.partyType}:${k._id}`}>
                      {k.name} ({k.code}) — {k.tierLabel}
                    </option>
                  ))}
                </select>
                {buyer && (() => {
                  const k = kids.find((x) => `${x.partyType}:${x._id}` === buyer);
                  return k?.credit ? (
                    <p className="text-xs text-slate-500">
                      <TierBadge tier={k.tier} /> credit available <b>{rupees(k.credit.available)}</b>
                      {k.credit.onHold ? <span className="text-rose-600"> · on hold: {k.credit.holdReason}</span> : null}
                    </p>
                  ) : null;
                })()}
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Customer name</Label>
                  <Input id="c-name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Mobile</Label>
                  <Input id="c-phone" inputMode="numeric" maxLength={10} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value.replace(/\D/g, "") })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input id="c-address" value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Paid by</Label>
                    <select id="c-mode" className="field" value={pay.paymentMode} onChange={(e) => setPay({ ...pay, paymentMode: e.target.value })}>
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK">Bank</option>
                      <option value="FINANCE">Finance</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Received (₹)</Label>
                    <Input id="c-received" inputMode="numeric" value={pay.amountReceivedRupees} onChange={(e) => setPay({ ...pay, amountReceivedRupees: e.target.value.replace(/[^\d.]/g, "") })} />
                  </div>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>Your invoice no. (optional)</Label>
              <Input id="inv-no" value={pay.invoiceNo} onChange={(e) => setPay({ ...pay, invoiceNo: e.target.value })} placeholder="Auto-numbered if blank" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-slate-600">{chosen.length} vehicle(s)</span>
              {estTotal > 0 && <span className="font-semibold tabular">{rupees(estTotal)} + GST</span>}
            </div>
            <div className="mb-3 flex flex-wrap gap-1">
              {chosen.map((v) => (
                <button key={v._id} onClick={() => toggle(v._id)} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">
                  {v.chassisNumber} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
            {error && <Notice className="mb-3">{error}</Notice>}
            <Button className="w-full" disabled={busy || !ready} onClick={submit}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />} {mode === "customer" ? "Bill customer" : "Invoice & send"}
            </Button>
            <p className="mt-2 text-[11px] text-slate-500">GST is worked out from both GST state codes: CGST + SGST inside the state, IGST across states.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function SellPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SellForm />
    </Suspense>
  );
}
