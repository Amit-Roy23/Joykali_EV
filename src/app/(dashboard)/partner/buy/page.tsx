"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, ShoppingCart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, PageSkeleton } from "@/components/ui/kit";
import { api, CreditMeter, Notice, rupees } from "@/components/workflow";
import { TierBadge } from "@/components/network";

const CAT: Record<string, string> = { "2W": "2-wheeler", "3W": "3-wheeler", "4W": "4-wheeler", E_RICKSHAW: "E-rickshaw", LOADER: "Loader" };

/** Catalogue at my buying price, my supplier's live stock, and an order basket checked against my credit. */
export default function BuyStockPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState("ALL");

  useEffect(() => {
    api<any>("/api/network/catalogue")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const lines = useMemo(() => (data?.models || []).filter((m: any) => (qty[m._id] || 0) > 0), [data, qty]);
  const total = lines.reduce((s: number, m: any) => {
    const t = m.unitPrice * qty[m._id];
    return s + t + Math.round((t * m.gstRate) / 100);
  }, 0);
  const available = data?.credit ? data.credit.available : 0;
  const over = total > available;

  const place = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = { lines: lines.map((m: any) => ({ modelId: m._id, quantity: qty[m._id] })), notes };
      if (!data.supplier) {
        const o = await api<any>("/api/orders", { method: "POST", json: { ...payload, partyType: data.me.type, partyId: data.me.id } });
        router.push(`/orders/${o._id}`);
      } else {
        const o = await api<any>("/api/network/orders", { method: "POST", json: payload });
        router.push(`/partner/orders/${o._id}`);
      }
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!data) return error ? <Notice>{error}</Notice> : <PageSkeleton />;
  const cats = ["ALL", ...new Set<string>(data.models.map((m: any) => m.category))];
  const shown = data.models.filter((m: any) => cat === "ALL" || m.category === cat);

  return (
    <div className="animate-fade-up pb-28 lg:pb-0">
      <PageHeader
        eyebrow={<span className="inline-flex items-center gap-2">Buy stock <TierBadge tier={data.me.tier} /></span>}
        title={`Order from ${data.supplier ? data.supplier.name : "Joykali EV"}`}
        description={
          data.supplier
            ? `Prices are your ${data.me.tier.toLowerCase().replace("_", " ")} buying price (ex-GST). ${data.supplier.name} accepts the order against the credit limit they gave you, then ships from their stock.`
            : "Prices are your buying price (ex-GST). Orders need the Business Head and then the Managing Partner to approve before the warehouse ships."
        }
      />
      {data.me.status !== "ACTIVE" && <Notice tone="warning" className="mb-4">Your account is {data.me.status.toLowerCase()} — ordering opens once the company has verified your KYC.</Notice>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold", cat === c ? "border-ink-900 bg-ink-900 text-white" : "border-slate-200 bg-white text-slate-600")}>
                {c === "ALL" ? "All models" : CAT[c] || c}
              </button>
            ))}
          </div>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            {shown.map((m: any) => {
              const q = qty[m._id] || 0;
              return (
                <li key={m._id} className={cn("rounded-2xl border bg-white p-4 shadow-card", q ? "border-brand-300" : "border-slate-200/80")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{m.name}</p>
                      <p className="text-xs text-slate-500">
                        {m.variant} · {CAT[m.category] || m.category} · {m.rangeKm} km · {m.batteryType}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", m.available > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                      {m.available > 0 ? `${m.available} in stock` : "out of stock"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-bold tabular text-slate-900">{rupees(m.unitPrice)}</p>
                      <p className="text-[11px] text-slate-500">
                        + {m.gstRate}% GST · MRP {rupees(m.mrp)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" aria-label="Less" onClick={() => setQty({ ...qty, [m._id]: Math.max(0, q - 1) })}>
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        id={`q-${m._id}`}
                        aria-label={`Quantity of ${m.name}`}
                        inputMode="numeric"
                        className="h-9 w-14 text-center"
                        value={q || ""}
                        onChange={(e) => setQty({ ...qty, [m._id]: Math.min(200, Number(e.target.value.replace(/\D/g, "")) || 0) })}
                      />
                      <Button size="icon" variant="outline" aria-label="More" onClick={() => setQty({ ...qty, [m._id]: Math.min(200, q + 1) })}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Your credit</p>
            <div className="mt-2">{data.credit ? <CreditMeter credit={data.credit} compact /> : <p className="text-sm text-slate-500">No credit limit yet.</p>}</div>
            <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm">
              {lines.map((m: any) => (
                <div key={m._id} className="flex justify-between gap-2">
                  <span className="truncate text-slate-600">
                    {qty[m._id]} × {m.name}
                  </span>
                  <span className="tabular">{rupees(m.unitPrice * qty[m._id])}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
                <span>Total incl. GST</span>
                <span className="tabular">{rupees(total)}</span>
              </div>
            </div>
            <Input id="order-notes" className="mt-3" placeholder="Note for the supplier (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {over && lines.length > 0 && <Notice tone="warning" className="mt-3">This order is more than your available credit ({rupees(Math.max(0, available))}). Pay your dues or reduce the quantity.</Notice>}
            {error && <Notice className="mt-3">{error}</Notice>}
            <Button className="mt-3 w-full" disabled={busy || !lines.length || over || data.me.status !== "ACTIVE"} onClick={place}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />} Place order
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
