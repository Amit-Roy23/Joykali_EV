"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BatteryCharging, BatteryWarning, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice } from "@/components/workflow";
import { WarehousePicker } from "@/components/warehousePicker";
import { SerialPicker } from "@/components/items";

export const REMOVAL_REASONS: Record<string, string> = {
  CUSTOMER_NO_BATTERY: "Customer buying the vehicle without battery",
  FAULTY: "Battery faulty / weak — for check, repair or warranty claim",
  NEEDED_ELSEWHERE: "Battery needed for another vehicle or a battery sale",
  DISPLAY: "Showroom display vehicle (battery kept separately)",
  STORAGE: "Long storage / safety — battery stored separately",
  OTHER: "Other",
};

/** Battery status of one vehicle, with "take out" (reason required) and "refit", and its history. */
export function BatteryPanel({ vehicle, onChanged }: { vehicle: any; onChanged: () => void }) {
  const { can } = useSession();
  const [hist, setHist] = useState<any[] | null>(null);
  const [mode, setMode] = useState<"remove" | "refit" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    api<any[]>(`/api/vehicles/${vehicle._id}/battery`).then(setHist).catch(() => setHist([]));
  }, [vehicle._id]);
  useEffect(load, [load]);
  const canAct = can("inventory.manage") || can("warehouse.transfer");
  const open = (hist || []).find((h) => h.status === "REMOVED");
  const inStock = ["IN_STOCK", "AT_OUTLET"].includes(vehicle.status);
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {vehicle.batteryRemoved ? <BatteryWarning className="h-4 w-4 text-amber-600" /> : <BatteryCharging className="h-4 w-4 text-emerald-600" />}
          Battery {vehicle.batteryRemoved ? <Badge variant="warning">taken out</Badge> : <Badge variant="success">fitted</Badge>}
          <span className="font-mono text-xs text-slate-500">{vehicle.batteryNumber}</span>
        </CardTitle>
        {canAct && (
          <div className="flex gap-2">
            {!vehicle.batteryRemoved && inStock && (
              <Button size="sm" variant="outline" onClick={() => setMode("remove")}>
                Take out battery
              </Button>
            )}
            {vehicle.batteryRemoved && vehicle.status !== "SOLD" && (
              <Button size="sm" onClick={() => setMode("refit")}>
                Refit battery
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {msg && <Notice tone="success">{msg}</Notice>}
        {open && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <p className="font-semibold">{REMOVAL_REASONS[open.reason]}</p>
            <p>{open.notes}</p>
            <p className="mt-1 text-xs">
              Taken out {dt(open.removedAt, true)} by {open.removedByName} · battery {open.serialNo || "—"} kept at {open.warehouse?.name} ({open.condition === "GOOD" ? "sellable stock" : "defective stock"})
              {open.saleCode ? ` · sale ${open.saleCode}` : ""}
            </p>
          </div>
        )}
        {hist && hist.filter((h) => h !== open).length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-xs">
            {hist
              .filter((h) => h !== open)
              .map((h) => (
                <li key={h._id} className="px-3 py-2">
                  <b>{dt(h.removedAt)}</b> taken out by {h.removedByName} — {REMOVAL_REASONS[h.reason]}: {h.notes}
                  {h.refit && (
                    <span className="block text-slate-500">
                      Refitted {dt(h.refit.at)} by {h.refit.byName}
                      {h.refit.serialNo ? ` · battery ${h.refit.serialNo}` : ""}
                      {h.refit.notes ? ` — ${h.refit.notes}` : ""}
                    </span>
                  )}
                </li>
              ))}
          </ul>
        )}
        {hist && hist.length === 0 && <p className="text-xs text-slate-500">The battery has never been taken out of this vehicle.</p>}
      </CardContent>
      <BatteryActionModal
        mode={mode}
        vehicle={vehicle}
        removal={open}
        onClose={() => setMode(null)}
        onDone={(m) => {
          setMode(null);
          setMsg(m);
          load();
          onChanged();
        }}
      />
    </Card>
  );
}

function BatteryActionModal({ mode, vehicle, removal, onClose, onDone }: { mode: "remove" | "refit" | null; vehicle: any; removal: any; onClose: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState<any>({});
  const [batteries, setBatteries] = useState<any[]>([]);
  const [serials, setSerials] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!mode) return;
    setErr(null);
    setSerials(removal?.serialNo ? [removal.serialNo] : []);
    setF({
      reason: "CUSTOMER_NO_BATTERY",
      notes: "",
      condition: "GOOD",
      warehouseId: String(removal?.warehouse?._id || vehicle.warehouse?._id || vehicle.warehouse || ""),
      itemId: String(removal?.item?._id || vehicle.model?.batteryItem || ""),
    });
    api<any[]>("/api/items?category=BATTERY&active=1").then(setBatteries).catch(() => {});
  }, [mode, vehicle, removal]);
  if (!mode) return null;
  const item = batteries.find((b) => b._id === f.itemId);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (mode === "remove") {
        await api(`/api/vehicles/${vehicle._id}/battery`, { method: "POST", json: { action: "remove", reason: f.reason, notes: f.notes, condition: f.condition, warehouseId: f.warehouseId, batteryItemId: f.itemId || undefined } });
        onDone(`Battery taken out of ${vehicle.chassisNumber} and put into ${f.condition === "GOOD" ? "battery stock" : "defective stock"}`);
      } else {
        await api(`/api/vehicles/${vehicle._id}/battery`, { method: "POST", json: { action: "refit", itemId: f.itemId, warehouseId: f.warehouseId, serialNo: serials[0], notes: f.notes } });
        onDone(`Battery ${serials[0] || ""} fitted to ${vehicle.chassisNumber}`);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={mode === "remove" ? `Take out battery — ${vehicle.chassisNumber}` : `Refit battery — ${vehicle.chassisNumber}`}
      description={mode === "remove" ? "The battery goes into warehouse stock and the reason is kept in the battery register." : "A battery from stock goes into the vehicle; the vehicle's battery number is updated."}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "remove" && (
          <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="br-reason">Why is the battery taken out?</Label>
              <select id="br-reason" className="field" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value, condition: e.target.value === "FAULTY" ? "DEFECTIVE" : f.condition })}>
                {Object.entries(REMOVAL_REASONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="br-notes">Explanation (required)</Label>
              <Input id="br-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Customer Ramesh Das has his own battery; booking JKS/…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-cond">Battery condition</Label>
              <select id="br-cond" className="field" value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })}>
                <option value="GOOD">Good — sellable</option>
                <option value="DEFECTIVE">Defective</option>
              </select>
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="br-item">Battery item</Label>
          <select id="br-item" className="field" value={f.itemId} onChange={(e) => setF({ ...f, itemId: e.target.value })}>
            <option value="">— model's battery —</option>
            {batteries.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="br-wh">{mode === "remove" ? "Keep it at" : "Take it from"}</Label>
          <WarehousePicker id="br-wh" value={f.warehouseId} onChange={(v) => setF({ ...f, warehouseId: v })} />
        </div>
        {mode === "refit" && item?.serialTracked && f.warehouseId && (
          <div className="sm:col-span-2">
            <SerialPicker itemId={item._id} warehouseId={f.warehouseId} qty={1} value={serials} onChange={(v) => setSerials(v.slice(-1))} />
          </div>
        )}
        {mode === "refit" && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="br-rnotes">Note</Label>
            <Input id="br-rnotes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </div>
        )}
      </div>
      {mode === "remove" && <p className="mt-2 text-xs text-slate-500">Battery {vehicle.batteryNumber} — sold on its own it is billed at 18% GST.</p>}
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || (mode === "remove" && f.notes.trim().length < 5)} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {mode === "remove" ? "Take out battery" : "Refit battery"}
        </Button>
      </div>
    </Modal>
  );
}
