"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PageHeader, Skeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, CreditMeter, Notice, rupees } from "@/components/workflow";

const CAT: Record<string, string> = { "2W": "Two-wheeler", "3W": "Three-wheeler", "4W": "Four-wheeler", E_RICKSHAW: "E-Rickshaw", LOADER: "Cargo loader" };

export default function NewOrderPage() {
  const router = useRouter();
  const { user } = useSession();
  const isDistributor = user?.role === "DISTRIBUTOR";
  const [partyType, setPartyType] = useState<"DEALER" | "DISTRIBUTOR">(isDistributor ? "DISTRIBUTOR" : "DEALER");
  const [partyId, setPartyId] = useState("");
  const [opts, setOpts] = useState<any>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-select from ?partyType=&partyId= (e.g. "Order more stock" on a dealer page).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("partyType");
    if (t === "DEALER" || t === "DISTRIBUTOR") setPartyType(t);
    if (sp.get("partyId")) setPartyId(sp.get("partyId")!);
  }, []);

  const load = useCallback(() => {
    const q = new URLSearchParams({ partyType, ...(partyId ? { partyId } : {}) });
    api<any>(`/api/orders/options?${q}`)
      .then((o) => {
        setOpts(o);
        if (o.lockedParty && o.partyId) setPartyId(o.partyId);
      })
      .catch((e) => setError(e.message));
  }, [partyType, partyId]);
  useEffect(load, [load]);

  const parties = partyType === "DEALER" ? opts?.dealers || [] : opts?.distributors || [];
  const lines = (opts?.models || []).filter((m: any) => (qty[m._id] || 0) > 0);
  const totals = useMemo(() => {
    let taxable = 0;
    let gst = 0;
    for (const m of lines) {
      const t = (qty[m._id] || 0) * m.unitPrice;
      taxable += t;
      gst += Math.round((t * m.gstRate) / 100);
    }
    return { taxable, gst, total: taxable + gst, units: lines.reduce((s: number, m: any) => s + qty[m._id], 0) };
  }, [lines, qty]);
  const credit = opts?.credit;
  const overLimit = credit && totals.total > credit.available;
  const blocked = !partyId || totals.units === 0 || overLimit || credit?.onHold;

  const setQ = (id: string, v: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(500, Math.floor(v || 0))) }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const order = await api<any>("/api/orders", {
        method: "POST",
        json: { partyType, partyId, notes, lines: lines.map((m: any) => ({ modelId: m._id, quantity: qty[m._id] })) },
      });
      router.push(`/orders/${order._id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up pb-24 lg:pb-0">
      <PageHeader
        backHref="/orders"
        eyebrow={isDistributor ? "Distributor portal" : "Channel"}
        title={isDistributor ? "Place an order" : "New dealer / distributor order"}
        description="Prices are channel prices (ex-GST). The order needs Business Head and Managing Partner approval before the warehouse ships it."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-4">
          {!isDistributor && (
            <Card>
              <CardHeader>
                <CardTitle>Who is the order for?</CardTitle>
                <CardDescription>Dealers receive stock on consignment (delivery challan); distributors buy on a tax invoice.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="inline-flex rounded-xl bg-slate-100 p-1">
                  {(["DEALER", "DISTRIBUTOR"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setPartyType(t);
                        setPartyId("");
                      }}
                      className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition", partyType === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
                    >
                      {t === "DEALER" ? "Dealer" : "Distributor"}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label>{partyType === "DEALER" ? "Dealer" : "Distributor"}</Label>
                  <select className="field" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                    <option value="">Choose…</option>
                    {parties.map((p: any) => (
                      <option key={p._id} value={p._id}>
                        {p.name} · {p.code} · {p.city}
                        {p.status === "ON_HOLD" ? " (on hold)" : ""}
                      </option>
                    ))}
                  </select>
                  {opts && parties.length === 0 && <p className="text-xs text-slate-500">No {partyType === "DEALER" ? "dealers" : "distributors"} are assigned to you.</p>}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Vehicles</CardTitle>
              <CardDescription>Warehouse availability is live; you can order more than is in stock — it ships as stock arrives.</CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-3">
              {!opts ? (
                <Skeleton className="mx-2 h-48" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {opts.models.map((m: any) => {
                    const q = qty[m._id] || 0;
                    return (
                      <li key={m._id} className={cn("flex flex-wrap items-center gap-3 rounded-xl px-2 py-3", q > 0 && "bg-brand-50/50")}>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">{m.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {m.variant} · {CAT[m.category] || m.category} ·{" "}
                            <span className={m.available > 0 ? "text-emerald-700" : "text-amber-700"}>{m.available} in warehouse</span>
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-900 tabular">{rupees(m.unitPrice)}</p>
                          <p className="text-[11px] text-slate-500">+ {m.gstRate}% GST</p>
                        </div>
                        <div className="flex items-center rounded-xl border border-slate-200 bg-white">
                          <button className="grid h-9 w-9 place-items-center text-slate-500 disabled:opacity-30" disabled={q === 0} onClick={() => setQ(m._id, q - 1)} aria-label="Less">
                            <Minus className="h-4 w-4" />
                          </button>
                          <input
                            className="h-9 w-12 border-x border-slate-200 text-center text-sm font-semibold tabular focus:outline-none"
                            inputMode="numeric"
                            value={q || ""}
                            placeholder="0"
                            onChange={(e) => setQ(m._id, Number(e.target.value.replace(/\D/g, "")))}
                            aria-label={`${m.name} quantity`}
                          />
                          <button className="grid h-9 w-9 place-items-center text-slate-500" onClick={() => setQ(m._id, q + 1)} aria-label="More">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 sm:pt-5">
              <Label>Note for the approvers (optional)</Label>
              <textarea className="field mt-1.5 h-20 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. festival demand, new showroom" />
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card className="p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Order value</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">{totals.units} vehicle(s), taxable</dt><dd className="tabular">{rupees(totals.taxable)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">GST</dt><dd className="tabular">{rupees(totals.gst)}</dd></div>
            </dl>
            <div className="mt-2 flex items-end justify-between border-t border-slate-100 pt-2">
              <span className="text-xs uppercase tracking-wider text-slate-500">Total</span>
              <span className="font-display text-2xl font-bold text-slate-900 tabular">{rupees(totals.total)}</span>
            </div>
          </Card>
          {credit && (
            <Card className="p-4 sm:p-5">
              <CreditMeter credit={credit} />
            </Card>
          )}
          {overLimit && <Notice>This order is {rupees(totals.total - credit.available)} over the available credit. Reduce it, clear dues, or ask for a higher limit.</Notice>}
          {error && <Notice>{error}</Notice>}
          <Button size="lg" className="hidden w-full lg:flex" disabled={!!blocked || busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for approval
          </Button>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{totals.units} vehicle(s)</p>
            <p className="font-display text-lg font-bold text-slate-900 tabular">{rupees(totals.total)}</p>
          </div>
          <Button disabled={!!blocked || busy} onClick={submit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
