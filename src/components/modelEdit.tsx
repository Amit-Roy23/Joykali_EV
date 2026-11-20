"use client";

import React, { useEffect, useState } from "react";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { api, Notice, rupees } from "@/components/workflow";
import { RateHistory } from "@/components/items";

const R = (p?: number | null) => (p ? String(p / 100) : "");
const FALLBACK: Record<string, number> = { superDistributorRupees: 0.85, distributorRupees: 0.88, dealerRupees: 0.92, subDealerRupees: 0.95 };

/** Edit a vehicle model and change its rates; every rate change is kept with who, when and why. */
export function ModelEditModal({ model, onClose, onSaved }: { model: any; onClose: () => void; onSaved: () => void }) {
  const { can } = useSession();
  const [f, setF] = useState<any>({});
  const [full, setFull] = useState<any>(null);
  const [batteries, setBatteries] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!model) return;
    setErr(null);
    api<any>(`/api/vehicles/models/${model._id}`).then((m) => {
      setFull(m);
      setF({
        variant: m.variant,
        batteryType: m.batteryType,
        rangeKm: String(m.rangeKm),
        isActive: m.isActive !== false,
        batteryItem: m.batteryItem?._id || m.batteryItem || "",
        sellingRupees: R(m.sellingPrice),
        purchaseRupees: R(m.purchasePrice),
        superDistributorRupees: R(m.superDistributorPrice),
        distributorRupees: R(m.distributorPrice),
        dealerRupees: R(m.dealerPrice),
        subDealerRupees: R(m.subDealerPrice),
        gstRate: m.gstRate,
        hsnCode: m.hsnCode,
        rateNote: "",
      });
    });
    api<any[]>("/api/items?category=BATTERY").then(setBatteries).catch(() => {});
  }, [model]);
  if (!model) return null;
  const canPrice = can("price.manage");
  const canEdit = can("inventory.manage");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const auto = (k: string) => (Number(f.sellingRupees) ? `auto ${rupees(Math.round(Number(f.sellingRupees) * FALLBACK[k] * 100))}` : "auto");
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/vehicles/models/${model._id}`, { method: "PUT", json: { ...f, rangeKm: Number(f.rangeKm), gstRate: Number(f.gstRate) } });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const Fld = ({ k, label, hint, disabled }: { k: string; label: string; hint?: string; disabled?: boolean }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`me-${k}`}>{label}</Label>
      <Input id={`me-${k}`} inputMode="decimal" disabled={disabled} value={f[k] ?? ""} onChange={set(k)} placeholder={hint} />
    </div>
  );
  return (
    <Modal isOpen={!!model} onClose={onClose} maxWidth="2xl" title={`${model.name} ${model.variant}`} description="Rates are before GST. New rates apply to new sales, dealer orders and purchases; invoices already made keep their prices.">
      {!full ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Rates{!canPrice ? " — view only" : ""}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {Fld({ k: "sellingRupees", label: "Ex-showroom (customer) ₹", disabled: !canPrice })}
              {Fld({ k: "purchaseRupees", label: "Purchase rate ₹", disabled: !canPrice })}
              {Fld({ k: "superDistributorRupees", label: "Super distributor ₹", hint: auto("superDistributorRupees"), disabled: !canPrice })}
              {Fld({ k: "distributorRupees", label: "Distributor ₹", hint: auto("distributorRupees"), disabled: !canPrice })}
              {Fld({ k: "dealerRupees", label: "Dealer ₹", hint: auto("dealerRupees"), disabled: !canPrice })}
              {Fld({ k: "subDealerRupees", label: "Sub-dealer ₹", hint: auto("subDealerRupees"), disabled: !canPrice })}
              <div className="space-y-1.5">
                <Label htmlFor="me-gst">GST %</Label>
                <select id="me-gst" className="field" disabled={!canPrice} value={f.gstRate} onChange={set("gstRate")}>
                  {[0, 5, 12, 18, 28].map((g) => (
                    <option key={g} value={g}>
                      {g}%
                    </option>
                  ))}
                </select>
              </div>
              {Fld({ k: "hsnCode", label: "HSN code", disabled: !canPrice })}
              {canPrice && Fld({ k: "rateNote", label: "Reason for the change" })}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Leave a channel price empty to use the automatic margin off the ex-showroom price.</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="me-variant">Variant</Label>
              <Input id="me-variant" disabled={!canEdit} value={f.variant || ""} onChange={set("variant")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="me-bt">Battery</Label>
              <Input id="me-bt" disabled={!canEdit} value={f.batteryType || ""} onChange={set("batteryType")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="me-range">Range (km)</Label>
              <Input id="me-range" disabled={!canEdit} inputMode="numeric" value={f.rangeKm || ""} onChange={set("rangeKm")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="me-bitem">Battery item (goes into stock when sold without battery)</Label>
              <select id="me-bitem" className="field" disabled={!canEdit} value={f.batteryItem || ""} onChange={set("batteryItem")}>
                <option value="">— not set —</option>
                {batteries.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end text-sm text-slate-700">
              <input type="checkbox" disabled={!canEdit} checked={!!f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <History className="h-3.5 w-3.5" /> Rate history
            </p>
            <RateHistory rows={full.rateHistory || []} />
          </div>
        </>
      )}
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button disabled={busy || !full} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </Button>
      </div>
    </Modal>
  );
}
