"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bike, Loader2, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/kit";
import { api, Notice, rupees } from "@/components/workflow";
import { CATEGORY_LABEL, SerialEntry, splitSerials } from "@/components/items";

interface VehicleRow {
  chassisNumber: string;
  motorNumber: string;
  batteryNumber: string;
  chargerNumber: string;
  color: string;
}
interface Line {
  kind: "VEHICLE" | "ITEM";
  ref: string; // model id or item id
  quantity: string;
  unitCost: string;
  gstRate: number;
  warehouseId: string;
  vehicles: VehicleRow[];
  serialText: string;
}
const blankVehicle = (): VehicleRow => ({ chassisNumber: "", motorNumber: "", batteryNumber: "", chargerNumber: "", color: "Glossy Black" });
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/**
 * Purchase entry: one supplier invoice, any number of lines — vehicles (chassis-wise) and/or
 * parts, accessories, batteries and chargers — each received into its own warehouse.
 */
export default function NewPurchasePage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[] | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<any[]>("/api/suppliers").then((s) => {
      setSuppliers(s);
      if (s.length) setSupplierId(s[0]._id);
    });
    api<any[]>("/api/vehicles/models?activeOnly=true").then(setModels).catch(() => {});
    api<any[]>("/api/items?active=1").then(setItems).catch(() => {});
    api<any>("/api/purchases/meta")
      .then((m) => {
        setWarehouses(m.warehouses);
        if (m.warehouses.length) setWarehouseId(m.warehouses[0]._id);
      })
      .catch((e) => {
        setWarehouses([]);
        setError(e.message);
      });
  }, []);

  const addLine = (kind: "VEHICLE" | "ITEM") => {
    const first = kind === "VEHICLE" ? models[0] : null;
    setLines([
      ...lines,
      {
        kind,
        ref: first?._id || "",
        quantity: "1",
        unitCost: first ? String((first.purchasePrice || 0) / 100) : "",
        gstRate: first?.gstRate ?? (kind === "VEHICLE" ? 5 : 18),
        warehouseId: "",
        vehicles: kind === "VEHICLE" ? [blankVehicle()] : [],
        serialText: "",
      },
    ]);
  };
  const upd = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setQty = (i: number, q: string) => {
    const n = Math.max(0, Number(q) || 0);
    const l = lines[i];
    const vehicles = l.kind === "VEHICLE" ? Array.from({ length: Math.min(n, 200) }, (_, k) => l.vehicles[k] || blankVehicle()) : [];
    upd(i, { quantity: q, vehicles });
  };

  const totals = useMemo(() => {
    let sub = 0;
    let gst = 0;
    for (const l of lines) {
      const base = Math.round(Number(l.unitCost || 0) * 100) * Number(l.quantity || 0);
      sub += base;
      gst += Math.round((base * l.gstRate) / 100);
    }
    return { sub, gst, total: sub + gst };
  }, [lines]);

  const submit = async () => {
    setError(null);
    if (!supplierId || !invoiceNumber.trim()) return setError("Choose the supplier and enter their invoice number");
    if (!lines.length) return setError("Add at least one line");
    for (const [i, l] of lines.entries()) {
      if (!l.ref) return setError(`Line ${i + 1}: choose the ${l.kind === "VEHICLE" ? "model" : "item"}`);
      if (!(Number(l.quantity) >= 1)) return setError(`Line ${i + 1}: enter the quantity`);
      if (l.kind === "VEHICLE") {
        const bad = l.vehicles.findIndex((v) => !v.chassisNumber || !v.motorNumber || !v.batteryNumber || !v.color);
        if (bad >= 0) return setError(`Line ${i + 1}, unit ${bad + 1}: fill chassis, motor, battery number and colour`);
      }
      const it = items.find((x) => x._id === l.ref);
      if (l.kind === "ITEM" && it?.serialTracked && splitSerials(l.serialText).length !== Number(l.quantity)) {
        return setError(`Line ${i + 1}: enter ${l.quantity} serial number(s) for ${it.name}`);
      }
    }
    setBusy(true);
    try {
      const p = await api<any>("/api/purchases", {
        method: "POST",
        json: {
          supplier: supplierId,
          invoiceNumber: invoiceNumber.trim(),
          invoiceDate,
          notes,
          warehouseId,
          lineItems: lines.map((l) => ({
            kind: l.kind,
            model: l.kind === "VEHICLE" ? l.ref : undefined,
            itemId: l.kind === "ITEM" ? l.ref : undefined,
            quantity: Number(l.quantity),
            unitCost: Number(l.unitCost || 0),
            gstRate: l.gstRate,
            warehouseId: l.warehouseId || undefined,
            vehicles: l.kind === "VEHICLE" ? l.vehicles.map((v) => ({ ...v, chargerNumber: v.chargerNumber || undefined })) : undefined,
            serials: l.kind === "ITEM" ? splitSerials(l.serialText) : undefined,
          })),
        },
      });
      router.push(`/purchases/${p._id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const whName = (id: string) => warehouses?.find((w) => w._id === id)?.name || "";
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        backHref="/purchases"
        eyebrow="Stock"
        title="Purchase entry"
        description="Enter the supplier's invoice once. Add vehicle lines (chassis-wise) and parts / accessory / battery lines; each line can go into a different warehouse."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Supplier invoice</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pu-supplier">Supplier</Label>
            <select id="pu-supplier" className="field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({s.gstin})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pu-inv">Supplier invoice no.</Label>
            <Input id="pu-inv" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())} placeholder="e.g. A00387" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pu-date">Invoice date</Label>
            <Input id="pu-date" type="date" max={today()} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pu-wh">Receive into warehouse (default for all lines)</Label>
            {warehouses && warehouses.length === 0 ? (
              <p className="text-sm text-rose-600">No warehouse you can receive into.</p>
            ) : (
              <select id="pu-wh" className="field" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {(warehouses || []).map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name} · {w.city}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pu-notes">Notes</Label>
            <Input id="pu-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e-way bill, transporter, cases…" />
          </div>
        </CardContent>
      </Card>

      {lines.map((l, i) => {
        const opts = l.kind === "VEHICLE" ? models : items;
        const it = l.kind === "ITEM" ? items.find((x) => x._id === l.ref) : null;
        const base = Math.round(Number(l.unitCost || 0) * 100) * Number(l.quantity || 0);
        return (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                {l.kind === "VEHICLE" ? <Bike className="h-4 w-4 text-brand-600" /> : <Wrench className="h-4 w-4 text-brand-600" />}
                Line {i + 1}: {l.kind === "VEHICLE" ? "Vehicles" : "Parts / accessories / battery / charger"}
              </CardTitle>
              <button type="button" aria-label={`Remove line ${i + 1}`} className="rounded p-1 text-red-500 hover:text-red-700" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_90px_130px_90px_minmax(0,1.3fr)]">
                <div className="space-y-1.5">
                  <Label>{l.kind === "VEHICLE" ? "Model" : "Item"}</Label>
                  <select
                    className="field"
                    aria-label={`Line ${i + 1} ${l.kind === "VEHICLE" ? "model" : "item"}`}
                    value={l.ref}
                    onChange={(e) => {
                      const x = opts.find((o: any) => o._id === e.target.value);
                      upd(i, { ref: e.target.value, unitCost: x ? String((x.purchasePrice || 0) / 100) : l.unitCost, gstRate: x?.gstRate ?? l.gstRate, serialText: "" });
                    }}
                  >
                    <option value="">— choose —</option>
                    {opts.map((o: any) => (
                      <option key={o._id} value={o._id}>
                        {l.kind === "VEHICLE" ? `${o.name} ${o.variant}` : `${o.name} · ${CATEGORY_LABEL[o.category]}${o.partNo ? ` · ${o.partNo}` : ""}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Qty</Label>
                  <Input aria-label={`Line ${i + 1} quantity`} inputMode="numeric" value={l.quantity} onChange={(e) => setQty(i, e.target.value.replace(/\D/g, ""))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Rate before GST (₹)</Label>
                  <Input aria-label={`Line ${i + 1} rate`} inputMode="decimal" value={l.unitCost} onChange={(e) => upd(i, { unitCost: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>GST %</Label>
                  <select className="field" aria-label={`Line ${i + 1} GST`} value={l.gstRate} onChange={(e) => upd(i, { gstRate: Number(e.target.value) })}>
                    {[0, 5, 12, 18, 28].map((g) => (
                      <option key={g} value={g}>
                        {g}%
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Warehouse</Label>
                  <select className="field" aria-label={`Line ${i + 1} warehouse`} value={l.warehouseId} onChange={(e) => upd(i, { warehouseId: e.target.value })}>
                    <option value="">Same as invoice ({whName(warehouseId)})</option>
                    {(warehouses || []).map((w) => (
                      <option key={w._id} value={w._id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Amount {rupees(base)} + GST {rupees(Math.round((base * l.gstRate) / 100))}
              </p>
              {l.kind === "VEHICLE" &&
                l.vehicles.map((v, k) => (
                  <div key={k} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-[40px_repeat(5,minmax(0,1fr))]">
                    <span className="self-center text-xs font-semibold text-slate-500">#{k + 1}</span>
                    {(["chassisNumber", "motorNumber", "batteryNumber", "chargerNumber", "color"] as const).map((f) => (
                      <Input
                        key={f}
                        aria-label={`Line ${i + 1} unit ${k + 1} ${f}`}
                        className="h-8 text-xs"
                        placeholder={{ chassisNumber: "Chassis no.", motorNumber: "Motor no.", batteryNumber: "Battery no.", chargerNumber: "Charger no. (opt.)", color: "Colour" }[f]}
                        value={v[f]}
                        onChange={(e) => upd(i, { vehicles: l.vehicles.map((x, j) => (j === k ? { ...x, [f]: f === "color" ? e.target.value : e.target.value.toUpperCase() } : x)) })}
                      />
                    ))}
                  </div>
                ))}
              {l.kind === "ITEM" && it?.serialTracked && (
                <div>
                  <Label>Serial numbers</Label>
                  <SerialEntry id={`pu-serials-${i}`} qty={Number(l.quantity) || 0} value={l.serialText} onChange={(v) => upd(i, { serialText: v })} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => addLine("VEHICLE")}>
          <Plus className="h-4 w-4" /> Vehicle line
        </Button>
        <Button type="button" variant="outline" onClick={() => addLine("ITEM")}>
          <Plus className="h-4 w-4" /> Parts / accessories / battery line
        </Button>
      </div>

      <Card>
        <CardContent className="ml-auto max-w-sm space-y-1 pt-5 text-sm">
          <div className="flex justify-between">
            <span>Taxable value</span>
            <span className="tabular">{rupees(totals.sub)}</span>
          </div>
          <div className="flex justify-between">
            <span>GST</span>
            <span className="tabular">{rupees(totals.gst)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold">
            <span>Invoice total</span>
            <span className="tabular">{rupees(totals.total)}</span>
          </div>
        </CardContent>
      </Card>

      {error && <Notice>{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/purchases")}>
          Cancel
        </Button>
        <Button disabled={busy || !lines.length || !warehouses?.length} onClick={submit}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save purchase & add to stock
        </Button>
      </div>
    </div>
  );
}
