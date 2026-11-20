"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/kit";
import { api, Notice, rupees } from "@/components/workflow";
import { WarehousePicker } from "@/components/warehousePicker";
import { emptyLine, LineDraft, LinesEditor, lineTotals, useItemsAt } from "@/components/items";

const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/** Counter sale of spare parts, accessories, batteries and chargers. */
export default function NewPartsSalePage() {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState("");
  const items = useItemsAt(warehouseId);
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [c, setC] = useState({ name: "", phone: "", address: "", gstin: "" });
  const [saleDate, setSaleDate] = useState(today());
  const [mode, setMode] = useState("CASH");
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const [chassis, setChassis] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const t = lineTotals(lines, items);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const s = await api<any>("/api/parts-sales", {
        method: "POST",
        json: {
          saleDate,
          customer: c,
          warehouseId,
          lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId, qty: Number(l.qty), rateRupees: l.rateRupees === "" ? undefined : Number(l.rateRupees), discountRupees: Number(l.discountRupees || 0), serials: l.serials })),
          paymentMode: mode,
          amountReceivedRupees: mode === "CREDIT" ? 0 : received === "" ? undefined : Number(received),
          reference,
          chassisNumber: chassis,
          notes,
        },
      });
      router.push(`/parts-sales?done=${encodeURIComponent(s.saleCode)}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader backHref="/parts-sales" eyebrow="Sales" title="Parts & accessories sale" description="Bill spare parts, accessories, batteries or chargers from a warehouse. Rates come from the item master and can be changed on this bill." />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Customer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ps-name">Name</Label>
            <Input id="ps-name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-phone">Mobile</Label>
            <Input id="ps-phone" inputMode="numeric" maxLength={10} value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ps-addr">Address</Label>
            <Input id="ps-addr" value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-gstin">GSTIN (business customers)</Label>
            <Input id="ps-gstin" maxLength={15} value={c.gstin} onChange={(e) => setC({ ...c, gstin: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-chassis">Vehicle chassis no. (optional)</Label>
            <Input id="ps-chassis" value={chassis} onChange={(e) => setChassis(e.target.value.toUpperCase())} />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-sm">Items</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Label htmlFor="ps-wh">From warehouse</Label>
            <WarehousePicker id="ps-wh" className="field h-9 w-auto" value={warehouseId} onChange={(v) => { setWarehouseId(v); setLines(lines.map((l) => ({ ...l, serials: [] }))); }} />
          </div>
        </CardHeader>
        <CardContent>
          <LinesEditor lines={lines} setLines={setLines} warehouseId={warehouseId} items={items} />
          <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Taxable value</span>
              <span className="tabular">{rupees(t.taxable)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST</span>
              <span className="tabular">{rupees(t.gst)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
              <span>Total</span>
              <span className="tabular">{rupees(t.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Payment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="ps-date">Bill date</Label>
            <Input id="ps-date" type="date" max={today()} value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-mode">Mode</Label>
            <select id="ps-mode" className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK">Bank / card</option>
              <option value="CREDIT">On credit (pay later)</option>
            </select>
          </div>
          {mode !== "CREDIT" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ps-recv">Received now (₹)</Label>
                <Input id="ps-recv" inputMode="decimal" placeholder={String(t.total / 100)} value={received} onChange={(e) => setReceived(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ps-ref">UTR / reference</Label>
                <Input id="ps-ref" value={reference} onChange={(e) => setReference(e.target.value)} />
              </div>
            </>
          )}
          <div className="space-y-1.5 sm:col-span-4">
            <Label htmlFor="ps-notes">Note</Label>
            <Input id="ps-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>
      {err && <Notice>{err}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/parts-sales")}>
          Cancel
        </Button>
        <Button disabled={busy || !warehouseId || !lines.some((l) => l.itemId)} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save & make invoice
        </Button>
      </div>
    </div>
  );
}

