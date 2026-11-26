"use client";

import React, { useEffect, useMemo, useState } from "react";
import { History, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api, dt, Notice, rupees } from "@/components/workflow";
import { WarehousePicker } from "@/components/warehousePicker";
import { useSession } from "@/components/layout/session";

export const CATEGORY_LABEL: Record<string, string> = { BATTERY: "Battery", CHARGER: "Charger", SPARE_PART: "Spare part", ACCESSORY: "Accessory" };
export const CATEGORY_HSN: Record<string, { hsn: string; gst: number }> = {
  BATTERY: { hsn: "850760", gst: 18 },
  CHARGER: { hsn: "850440", gst: 18 },
  SPARE_PART: { hsn: "871410", gst: 28 },
  ACCESSORY: { hsn: "650610", gst: 18 },
};
export const MOVE_LABEL: Record<string, string> = {
  PURCHASE: "Purchase",
  SALE: "Sale",
  SALE_CANCEL: "Sale cancelled",
  STOCK_IN: "Stock in",
  STOCK_OUT: "Stock out",
  TRANSFER_OUT: "Moved out",
  TRANSFER_IN: "Moved in",
  BATTERY_FROM_VEHICLE: "Battery off vehicle",
  BATTERY_TO_VEHICLE: "Battery refitted",
  REPAIR_IN: "Received for repair",
  REPAIR_RETURN: "Returned to customer",
  REPLACEMENT_OUT: "Warranty replacement",
  CONDITION_CHANGE: "Condition change",
  RETURN_TO_SUPPLIER: "Sent to supplier",
  SCRAP: "Scrapped",
};

const UNITS = ["PCS", "SET", "PAIR", "NOS", "BOX", "LTR", "MTR", "KG"];
const RATE_LABEL: Record<string, string> = {
  purchasePrice: "Purchase rate",
  sellingPrice: "Selling rate",
  dealerPrice: "Dealer rate",
  distributorPrice: "Distributor rate",
  superDistributorPrice: "Super distributor rate",
  subDealerPrice: "Sub-dealer rate",
  gstRate: "GST %",
  hsnCode: "HSN",
};
const isMoney = (f: string) => /Price$/.test(f);

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Rate history list (item or vehicle model). */
export function RateHistory({ rows }: { rows: any[] }) {
  if (!rows?.length) return <p className="text-xs text-slate-500">No rate changes yet.</p>;
  return (
    <ul className="max-h-48 space-y-2 overflow-y-auto text-xs">
      {[...rows].reverse().map((h, i) => (
        <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="font-semibold text-slate-700">
            {dt(h.at, true)} · {h.byName || "—"}
          </p>
          {h.changes.map((c: any, k: number) => (
            <p key={k} className="text-slate-600">
              {RATE_LABEL[c.field] || c.field}: {isMoney(c.field) ? rupees(c.from) : c.from ?? "—"} → <b>{isMoney(c.field) ? rupees(c.to) : c.to ?? "—"}</b>
            </p>
          ))}
          {h.note && <p className="italic text-slate-500">“{h.note}”</p>}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Add / edit item                                                     */
/* ------------------------------------------------------------------ */
export function ItemFormModal({ open, item, onClose, onSaved }: { open: boolean; item?: any; onClose: () => void; onSaved: () => void }) {
  const { can } = useSession();
  const editing = !!item?._id;
  const blank = { name: "", category: "SPARE_PART", brand: "", partNo: "", unit: "PCS", hsnCode: "871410", gstRate: 28, purchaseRupees: "", sellingRupees: "", dealerRupees: "", serialTracked: false, minStock: "", description: "", isActive: true, compatibleModels: [] as string[], rateNote: "" };
  const [f, setF] = useState<any>(blank);
  const [models, setModels] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    api<any[]>("/api/vehicles/models?activeOnly=true").then(setModels).catch(() => {});
    if (item?._id) {
      setF({
        name: item.name,
        category: item.category,
        brand: item.brand || "",
        partNo: item.partNo || "",
        unit: item.unit || "PCS",
        hsnCode: item.hsnCode,
        gstRate: item.gstRate,
        purchaseRupees: String((item.purchasePrice || 0) / 100),
        sellingRupees: String((item.sellingPrice || 0) / 100),
        dealerRupees: item.dealerPrice ? String(item.dealerPrice / 100) : "",
        serialTracked: !!item.serialTracked,
        minStock: String(item.minStock || ""),
        description: item.description || "",
        isActive: item.isActive !== false,
        compatibleModels: (item.compatibleModels || []).map((m: any) => String(m._id || m)),
        rateNote: "",
      });
    } else setF(blank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);
  const canRates = !editing || can("price.manage");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = { ...f, gstRate: f.category === "BATTERY" ? 18 : Number(f.gstRate), purchaseRupees: Number(f.purchaseRupees || 0), sellingRupees: Number(f.sellingRupees || 0), dealerRupees: f.dealerRupees === "" ? null : Number(f.dealerRupees), minStock: Number(f.minStock || 0) };
      if (editing) await api(`/api/items/${item._id}`, { method: "PUT", json: body });
      else await api("/api/items", { method: "POST", json: body });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={onClose} maxWidth="2xl" title={editing ? `Edit ${item.code} — ${item.name}` : "Add an item"} description="Spare parts, accessories, batteries and chargers. Rates are before GST.">
      <div className="grid gap-3 sm:grid-cols-2">
        <F label="Item type">
          <select
            id="it-cat"
            className="field"
            value={f.category}
            disabled={editing}
            onChange={(e) => {
              const c = e.target.value;
              setF({ ...f, category: c, hsnCode: CATEGORY_HSN[c].hsn, gstRate: CATEGORY_HSN[c].gst, serialTracked: c === "BATTERY" || c === "CHARGER" });
            }}
          >
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </F>
        <F label="Item name">
          <Input id="it-name" value={f.name} onChange={set("name")} placeholder="e.g. Brake shoe set (front)" />
        </F>
        <F label="Brand">
          <Input id="it-brand" value={f.brand} onChange={set("brand")} />
        </F>
        <F label="Part no. / model no.">
          <Input id="it-part" value={f.partNo} onChange={(e) => setF({ ...f, partNo: e.target.value.toUpperCase() })} />
        </F>
        <F label="Unit">
          <select id="it-unit" className="field" value={f.unit} onChange={set("unit")}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </F>
        <F label="Minimum stock (alert below)">
          <Input id="it-min" inputMode="numeric" value={f.minStock} onChange={(e) => setF({ ...f, minStock: e.target.value.replace(/\D/g, "") })} />
        </F>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Rates (before GST){editing && !canRates ? " — you can view but not change rates" : ""}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <F label="Purchase rate (₹)">
              <Input id="it-buy" inputMode="decimal" disabled={!canRates} value={f.purchaseRupees} onChange={set("purchaseRupees")} />
            </F>
            <F label="Selling rate (₹)">
              <Input id="it-sell" inputMode="decimal" disabled={!canRates} value={f.sellingRupees} onChange={set("sellingRupees")} />
            </F>
            <F label="Dealer rate (₹, optional)">
              <Input id="it-dealer" inputMode="decimal" disabled={!canRates} value={f.dealerRupees} onChange={set("dealerRupees")} />
            </F>
            <F label="HSN code">
              <Input id="it-hsn" inputMode="numeric" disabled={!canRates} value={f.hsnCode} onChange={(e) => setF({ ...f, hsnCode: e.target.value.replace(/\D/g, "") })} />
            </F>
            <F label="GST %">
              <select id="it-gst" className="field" disabled={!canRates || f.category === "BATTERY"} value={f.category === "BATTERY" ? 18 : f.gstRate} onChange={set("gstRate")}>
                {[0, 5, 12, 18, 28].map((g) => (
                  <option key={g} value={g}>
                    {g}%
                  </option>
                ))}
              </select>
              {f.category === "BATTERY" && <p className="text-[11px] text-slate-500">Batteries are always billed at 18% GST.</p>}
            </F>
            {editing && canRates && (
              <F label="Reason for rate change">
                <Input id="it-note" value={f.rateNote} onChange={set("rateNote")} placeholder="e.g. supplier price increase" />
              </F>
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.serialTracked} onChange={(e) => setF({ ...f, serialTracked: e.target.checked })} />
          Track each unit by serial number
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} />
          Active (can be bought and sold)
        </label>
        <F label="Fits these models (optional)" className="sm:col-span-2">
          <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
            {models.map((m) => {
              const on = f.compatibleModels.includes(String(m._id));
              return (
                <button
                  type="button"
                  key={m._id}
                  onClick={() => setF({ ...f, compatibleModels: on ? f.compatibleModels.filter((x: string) => x !== String(m._id)) : [...f.compatibleModels, String(m._id)] })}
                  className={`rounded-lg border px-2 py-1 text-xs ${on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {m.name} {m.variant}
                </button>
              );
            })}
          </div>
        </F>
        <F label="Description" className="sm:col-span-2">
          <Input id="it-desc" value={f.description} onChange={set("description")} />
        </F>
      </div>
      {editing && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <History className="h-3.5 w-3.5" /> Rate history
          </p>
          <RateHistory rows={item.rateHistory || []} />
        </div>
      )}
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || !f.name.trim()} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Save changes" : "Add item"}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Serial picker: tick serials in stock at a warehouse                  */
/* ------------------------------------------------------------------ */
export function SerialPicker({ itemId, warehouseId, condition = "GOOD", qty, value, onChange }: { itemId: string; warehouseId: string; condition?: string; qty: number; value: string[]; onChange: (v: string[]) => void }) {
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => {
    if (!itemId || !warehouseId) return;
    setList(null);
    api<any[]>(`/api/items/serials?item=${itemId}&warehouse=${warehouseId}&condition=${condition}`)
      .then(setList)
      .catch(() => setList([]));
  }, [itemId, warehouseId, condition]);
  if (!list) return <p className="text-xs text-slate-400">Loading serial numbers…</p>;
  if (!list.length) return <p className="text-xs text-rose-600">No serial numbers of this item in stock here.</p>;
  return (
    <div>
      <p className="mb-1 text-[11px] text-slate-500">
        Tick {qty} serial number{qty === 1 ? "" : "s"} ({value.length} chosen)
      </p>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {list.map((s) => {
          const on = value.includes(s.serialNo);
          return (
            <button
              type="button"
              key={s.serialNo}
              onClick={() => onChange(on ? value.filter((x) => x !== s.serialNo) : value.length < qty ? [...value, s.serialNo] : [...value.slice(1), s.serialNo])}
              className={`rounded-md border px-2 py-0.5 font-mono text-[11px] ${on ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700"}`}
            >
              {s.serialNo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Free-text serials (one per line or comma separated) for stock coming in. */
export function SerialEntry({ qty, value, onChange, id = "serials" }: { qty: number; value: string; onChange: (v: string) => void; id?: string }) {
  const n = value.split(/[\s,]+/).filter(Boolean).length;
  return (
    <div>
      <textarea
        id={id}
        className="field min-h-[72px] font-mono text-xs"
        placeholder="Serial numbers — one per line or separated by commas"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <p className={`mt-0.5 text-[11px] ${n === qty ? "text-emerald-700" : "text-slate-500"}`}>
        {n} of {qty} entered
      </p>
    </div>
  );
}
export const splitSerials = (s: string) => s.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);

/* ------------------------------------------------------------------ */
/* Stock in / out / repaired / transfer                                */
/* ------------------------------------------------------------------ */
const IN_REASONS: Record<string, string> = {
  OPENING: "Opening stock",
  BATTERY_BACK: "Battery back in stock (vehicle sold without battery)",
  CUSTOMER_RETURN: "Customer returned goods",
  FOUND: "Found in stock count",
  OTHER: "Other",
};
const OUT_REASONS: Record<string, string> = {
  DAMAGED: "Damaged",
  INTERNAL_USE: "Used in workshop / service",
  SENT_TO_SUPPLIER: "Sent to supplier (warranty claim)",
  SCRAP: "Scrapped",
  LOST: "Lost / shortage in stock count",
  OTHER: "Other",
};
export function StockActionModal({ open, action, item, onClose, onDone }: { open: boolean; action: "in" | "out" | "repaired" | "transfer"; item: any; onClose: () => void; onDone: (msg: string) => void }) {
  const [warehouseId, setWarehouseId] = useState("");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState("1");
  const [condition, setCondition] = useState("GOOD");
  const [reason, setReason] = useState(action === "in" ? "OPENING" : "DAMAGED");
  const [serialText, setSerialText] = useState("");
  const [serialPick, setSerialPick] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [chassis, setChassis] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setQty("1");
      setSerialText("");
      setSerialPick([]);
      setNotes("");
      setChassis("");
      setErr(null);
      setCondition("GOOD");
      setReason(action === "in" ? (item?.category === "BATTERY" ? "BATTERY_BACK" : "OPENING") : "DAMAGED");
    }
  }, [open, action, item]);
  if (!item) return null;
  const n = Math.max(1, Number(qty) || 1);
  const pickCondition = action === "repaired" ? "DEFECTIVE" : action === "out" ? condition : "GOOD";
  const title = { in: "Stock in", out: "Stock out", repaired: "Repaired → good stock", transfer: "Move to another warehouse" }[action];
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const serials = item.serialTracked ? (action === "in" ? splitSerials(serialText) : serialPick) : [];
      const r = await api<any>("/api/items/stock", {
        method: "POST",
        json: { action, itemId: item._id, warehouseId, fromId: warehouseId, toId, qty: n, serials, condition, reason, notes, chassisNumber: chassis },
      });
      onDone(`${title}: ${n} × ${item.name} (${r.reference})`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title={`${title} — ${item.name}`} description={item.serialTracked ? "This item is tracked by serial number." : `Unit: ${item.unit}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <F label={action === "transfer" ? "From warehouse" : "Warehouse"}>
          <WarehousePicker id="sa-wh" value={warehouseId} onChange={setWarehouseId} />
        </F>
        {action === "transfer" && (
          <F label="To warehouse">
            <WarehousePicker id="sa-to" value={toId} onChange={setToId} />
          </F>
        )}
        <F label="Quantity">
          <Input id="sa-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
        </F>
        {(action === "in" || action === "out") && (
          <F label="Condition">
            <select id="sa-cond" className="field" value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="GOOD">Good (sellable)</option>
              <option value="DEFECTIVE">Defective</option>
            </select>
          </F>
        )}
        {(action === "in" || action === "out") && (
          <F label="Reason" className="sm:col-span-2">
            <select id="sa-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(action === "in" ? IN_REASONS : OUT_REASONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </F>
        )}
        {action === "in" && reason === "BATTERY_BACK" && (
          <F label="Vehicle chassis no. (optional)" className="sm:col-span-2">
            <Input id="sa-chassis" value={chassis} onChange={(e) => setChassis(e.target.value.toUpperCase())} />
          </F>
        )}
        {item.serialTracked && (
          <div className="sm:col-span-2">
            <Label>Serial numbers</Label>
            {action === "in" ? (
              <SerialEntry id="sa-serials" qty={n} value={serialText} onChange={setSerialText} />
            ) : warehouseId ? (
              <SerialPicker itemId={item._id} warehouseId={warehouseId} condition={pickCondition} qty={n} value={serialPick} onChange={setSerialPick} />
            ) : null}
          </div>
        )}
        <F label="Note" className="sm:col-span-2">
          <Input id="sa-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </F>
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || !warehouseId} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Invoice lines editor (parts sale, vehicle sale accessories)          */
/* ------------------------------------------------------------------ */
export interface LineDraft {
  itemId: string;
  qty: string;
  rateRupees: string;
  discountRupees: string;
  serials: string[];
}
export const emptyLine = (): LineDraft => ({ itemId: "", qty: "1", rateRupees: "", discountRupees: "", serials: [] });

export function lineTotals(lines: LineDraft[], items: any[]) {
  let taxable = 0;
  let gst = 0;
  for (const l of lines) {
    const it = items.find((i) => i._id === l.itemId);
    if (!it) continue;
    const t = Math.round((Number(l.rateRupees || 0) * Number(l.qty || 0) - Number(l.discountRupees || 0)) * 100);
    taxable += t;
    gst += Math.round((t * it.gstRate) / 100);
  }
  return { taxable, gst, total: taxable + gst };
}

/** Lines priced from the item master (rates editable), with stock and serial checks against one warehouse. */
export function LinesEditor({ lines, setLines, warehouseId, categories, items }: { lines: LineDraft[]; setLines: (l: LineDraft[]) => void; warehouseId: string; categories?: string[]; items: any[] }) {
  const list = useMemo(() => items.filter((i) => i.isActive && (!categories || categories.includes(i.category))), [items, categories]);
  const upd = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const it = list.find((x) => x._id === l.itemId);
        const have = it ? it.stockHere ?? it.stock?.good ?? 0 : 0;
        const amt = it ? Math.round((Number(l.rateRupees || 0) * Number(l.qty || 0) - Number(l.discountRupees || 0)) * 100) : 0;
        return (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_70px_100px_90px_auto]">
              <select
                aria-label={`Item ${i + 1}`}
                className="field"
                value={l.itemId}
                onChange={(e) => {
                  const x = list.find((y) => y._id === e.target.value);
                  upd(i, { itemId: e.target.value, rateRupees: x ? String(x.sellingPrice / 100) : "", serials: [] });
                }}
              >
                <option value="">— choose item —</option>
                {list.map((x) => (
                  <option key={x._id} value={x._id}>
                    {x.name} · {CATEGORY_LABEL[x.category]} · {x.stockHere ?? x.stock?.good ?? 0} {x.unit} in stock
                  </option>
                ))}
              </select>
              <Input aria-label="Quantity" inputMode="numeric" value={l.qty} onChange={(e) => upd(i, { qty: e.target.value.replace(/\D/g, "") })} placeholder="Qty" />
              <Input aria-label="Rate before GST" inputMode="decimal" value={l.rateRupees} onChange={(e) => upd(i, { rateRupees: e.target.value })} placeholder="Rate ₹" />
              <Input aria-label="Discount" inputMode="decimal" value={l.discountRupees} onChange={(e) => upd(i, { discountRupees: e.target.value })} placeholder="Disc ₹" />
              <button type="button" aria-label="Remove line" className="justify-self-end rounded p-2 text-red-500 hover:text-red-700" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {it && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span>HSN {it.hsnCode} · GST {it.gstRate}%</span>
                <span>Line: {rupees(amt)} + GST {rupees(Math.round((amt * it.gstRate) / 100))}</span>
                {Number(l.qty) > have && <span className="font-semibold text-rose-600">Only {have} in stock at this warehouse</span>}
                {Number(l.rateRupees) !== it.sellingPrice / 100 && <span className="text-amber-700">Rate changed from {rupees(it.sellingPrice)}</span>}
              </div>
            )}
            {it?.serialTracked && warehouseId && (
              <div className="mt-2">
                <SerialPicker itemId={it._id} warehouseId={warehouseId} qty={Math.max(1, Number(l.qty) || 1)} value={l.serials} onChange={(v) => upd(i, { serials: v })} />
              </div>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
        <Plus className="h-4 w-4" /> Add item
      </Button>
    </div>
  );
}

/** Items with stock at one warehouse (stockHere). */
export function useItemsAt(warehouseId: string) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>(`/api/items?active=1${warehouseId ? `&warehouse=${warehouseId}` : ""}`)
      .then((list) => setItems(list.map((i) => ({ ...i, stockHere: i.stock.good }))))
      .catch(() => setItems([]));
  }, [warehouseId]);
  return items;
}
