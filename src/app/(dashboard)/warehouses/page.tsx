"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Download, Loader2, Pencil, Plus, Settings2, Truck, Warehouse as WarehouseIcon } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees, rupeesShort } from "@/components/workflow";
import { Field } from "@/components/network";

const T_STATUS: Record<string, string> = { IN_TRANSIT: "IN_TRANSIT", RECEIVED: "DELIVERED", RECEIVED_SHORT: "DELIVERED_WITH_ISSUES", CANCELLED: "CANCELLED" };

/** Warehouses: stock by location, value, ageing and low-stock alerts; warehouse → warehouse transfers. */
export default function WarehousesPage() {
  const { can } = useSession();
  const [d, setD] = useState<any>(null);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<"stock" | "transfers">("stock");
  const [edit, setEdit] = useState<any | null>(null);
  const [minFor, setMinFor] = useState<any | null>(null);
  const [newT, setNewT] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    api<any>("/api/warehouses").then(setD).catch((e) => setErr(e.message));
    api<any[]>("/api/warehouse-transfers").then(setTransfers).catch(() => {});
  }, []);
  useEffect(load, [load]);
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const ws: any[] = d.warehouses;
  const onRoad = transfers.filter((t) => t.status === "IN_TRANSIT");
  const low = ws.reduce((s, w) => s + w.lowStock.length, 0);
  const mine = (id: string) => d.canManage || d.mine.includes(String(id));
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Stock"
        title="Warehouses"
        description="Company stock by warehouse, valued at purchase cost. Move stock between warehouses on a delivery challan; the receiving warehouse checks every chassis before it becomes sellable there."
        actions={
          <div className="flex flex-wrap gap-2">
            {d.canManage && (
              <Button variant="outline" onClick={() => setEdit({})}>
                <Plus className="h-4 w-4" /> Warehouse
              </Button>
            )}
            {d.canTransfer && ws.length > 1 && (
              <Button onClick={() => setNewT(true)}>
                <Truck className="h-4 w-4" /> New transfer
              </Button>
            )}
          </div>
        }
      />
      {err && <Notice>{err}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Warehouses" value={ws.filter((w) => w.status === "ACTIVE").length} tone="brand" />
        <StatCard label="Units in warehouses" value={ws.reduce((s, w) => s + w.units, 0)} sub={`${ws.reduce((s, w) => s + w.free, 0)} free to sell`} tone="emerald" />
        <StatCard label="Stock value (cost)" value={rupeesShort(ws.reduce((s, w) => s + w.value, 0))} tone="sky" />
        <StatCard label="On the road / low stock" value={`${onRoad.length} / ${low}`} sub="transfers · model alerts" tone={low ? "amber" : "slate"} />
      </div>
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {(["stock", "transfers"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === t ? "bg-ink-900 text-white" : "text-slate-600")}>
            {t === "stock" ? "Stock by warehouse" : `Transfers${onRoad.length ? ` (${onRoad.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab === "stock" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {ws.map((w) => (
            <Card key={w._id} className={cn("overflow-hidden", w.status !== "ACTIVE" && "opacity-60")}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    <WarehouseIcon className="h-4 w-4 text-brand-600" /> {w.name}
                    {w.isMain && <Badge variant="default">Main</Badge>}
                    {w.status !== "ACTIVE" && <Badge variant="secondary">Closed</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {w.code} · {w.city} · State {w.stateCode}
                    {w.manager ? ` · In charge: ${w.manager.name}` : ""}
                  </CardDescription>
                </div>
                <div className="flex gap-1">
                  {mine(w._id) && d.canTransfer && (
                    <Button size="sm" variant="ghost" onClick={() => setMinFor(w)} title="Minimum stock levels">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  )}
                  {d.canManage && (
                    <Button size="sm" variant="ghost" onClick={() => setEdit(w)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <div className="grid grid-cols-3 gap-px border-y border-slate-100 bg-slate-100 text-center text-sm">
                <div className="bg-white p-2">
                  <p className="text-lg font-bold tabular">{w.free}</p>
                  <p className="text-[11px] text-slate-500">free</p>
                </div>
                <div className="bg-white p-2">
                  <p className="text-lg font-bold tabular">{w.units - w.free}</p>
                  <p className="text-[11px] text-slate-500">on a DO</p>
                </div>
                <div className="bg-white p-2">
                  <p className="text-lg font-bold tabular">{rupeesShort(w.value)}</p>
                  <p className="text-[11px] text-slate-500">value at cost</p>
                </div>
              </div>
              <div className="space-y-3 p-4">
                {w.lowStock.length > 0 && (
                  <Notice tone="warning">
                    Low stock: {w.lowStock.map((l: any) => `${l.model} ${l.free}/${l.min}`).join(" · ")}
                  </Notice>
                )}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="text-slate-500">Age in stock:</span>
                  {Object.entries(w.ageing).map(([k, v]: any) => (
                    <span key={k} className={cn("rounded-full px-2 py-0.5 font-semibold", k === "90+" && v ? "bg-rose-100 text-rose-700" : k === "61-90" && v ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>
                      {k} d: {v}
                    </span>
                  ))}
                </div>
                {(w.inbound.units > 0 || w.outbound.units > 0) && (
                  <p className="text-xs text-slate-600">
                    {w.inbound.units > 0 && `${w.inbound.units} unit(s) coming in · `}
                    {w.outbound.units > 0 && `${w.outbound.units} unit(s) going out`}
                  </p>
                )}
                {w.stock.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase text-slate-400">
                          <th className="py-1 font-semibold">Model</th>
                          <th className="py-1 text-right font-semibold">Free</th>
                          <th className="py-1 text-right font-semibold">On DO</th>
                          <th className="py-1 text-right font-semibold">Oldest</th>
                          <th className="py-1 text-right font-semibold">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {w.stock.map((r: any) => (
                          <tr key={r.modelId}>
                            <td className="py-1.5">{r.model}</td>
                            <td className="py-1.5 text-right tabular font-semibold">{r.free}</td>
                            <td className="py-1.5 text-right tabular">{r.reserved}</td>
                            <td className={cn("py-1.5 text-right tabular", r.oldestDays > 90 && "font-semibold text-rose-600")}>{r.oldestDays} d</td>
                            <td className="py-1.5 text-right tabular">{rupeesShort(r.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No stock here.</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {transfers.map((t) => (
              <li key={t._id}>
                <button className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left text-sm hover:bg-slate-50" onClick={() => setOpen(t._id)}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                      {t.fromName} <ArrowRight className="h-3.5 w-3.5 text-slate-400" /> {t.toName}
                      {t.interState && <Badge variant="warning">Inter-state</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t.transferCode} · {t.vehicles.length} unit(s) · {rupees(t.totalValue)} · {dt(t.createdAt)} · by {t.createdByName}
                      {t.receivedByName ? ` · received by ${t.receivedByName}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={T_STATUS[t.status]} label={t.status.replace(/_/g, " ")} />
                </button>
              </li>
            ))}
            {transfers.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No transfers yet.</li>}
          </ul>
        </Card>
      )}

      {edit && <WarehouseForm w={edit} onClose={() => setEdit(null)} onSaved={load} />}
      {minFor && <MinStockForm w={minFor} onClose={() => setMinFor(null)} onSaved={load} />}
      {newT && <NewTransfer ws={ws.filter((w) => w.status === "ACTIVE")} mine={mine} onClose={() => setNewT(false)} onSaved={() => { load(); setTab("transfers"); }} />}
      {open && <TransferDetail id={open} onClose={() => setOpen(null)} onChanged={load} />}
      {!can("warehouse.view") && null}
    </div>
  );
}

function WarehouseForm({ w, onClose, onSaved }: { w: any; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<any>({
    name: w.name || "",
    address: w.address || "",
    city: w.city || "",
    state: w.state || "West Bengal",
    stateCode: w.stateCode || "19",
    pincode: w.pincode || "",
    phone: w.phone || "",
    managerId: w.manager?._id || "",
    isMain: !!w.isMain,
    status: w.status || "ACTIVE",
  });
  const [staff, setStaff] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<any>("/api/employees?limit=100&status=ACTIVE")
      .then((r) => setStaff((Array.isArray(r) ? r : r.items || r.employees || []).filter((u: any) => ["STORE_MANAGER", "ASM", "BUSINESS_HEAD"].includes(u.role))))
      .catch(() => {});
  }, []);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(w._id ? `/api/warehouses/${w._id}` : "/api/warehouses", { method: w._id ? "PATCH" : "POST", json: { ...v, managerId: v.managerId || null } });
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const f = (k: string, label: string, cls = "") => (
    <Field label={label} className={cls}>
      <Input id={`wh-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </Field>
  );
  return (
    <Modal isOpen onClose={onClose} title={w._id ? `Edit ${w.name}` : "New warehouse"} description="The state code decides whether a transfer is inter-state (needs a tax invoice) or a plain challan.">
      <div className="grid gap-3 sm:grid-cols-2">
        {f("name", "Name", "sm:col-span-2")}
        {f("address", "Address", "sm:col-span-2")}
        {f("city", "City")}
        {f("pincode", "PIN code")}
        {f("state", "State")}
        {f("stateCode", "GST state code")}
        {f("phone", "Phone")}
        <Field label="In charge">
          <select id="wh-manager" className="field" value={v.managerId} onChange={(e) => setV({ ...v, managerId: e.target.value })}>
            <option value="">— none —</option>
            {staff.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name} ({u.role.replace("_", " ").toLowerCase()})
              </option>
            ))}
          </select>
        </Field>
        {w._id && (
          <Field label="Status">
            <select id="wh-status" className="field" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Closed</option>
            </select>
          </Field>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={v.isMain} onChange={(e) => setV({ ...v, isMain: e.target.checked })} disabled={w.isMain} /> Main warehouse (default for purchases and delivery orders)
        </label>
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </Button>
      </div>
    </Modal>
  );
}

function MinStockForm({ w, onClose, onSaved }: { w: any; onClose: () => void; onSaved: () => void }) {
  const [models, setModels] = useState<any[]>([]);
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries((w.minStock || []).map((m: any) => [String(m.model), String(m.qty)])));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<any>("/api/vehicles/models")
      .then((r) => setModels(Array.isArray(r) ? r : r.items || []))
      .catch((e) => setErr(e.message));
  }, []);
  const save = async () => {
    try {
      await api(`/api/warehouses/${w._id}/min-stock`, { method: "PUT", json: { rows: Object.entries(v).map(([modelId, qty]) => ({ modelId, qty: Number(qty) || 0 })) } });
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={`Minimum stock · ${w.name}`} description="When free units of a model fall below this level the warehouse shows a low-stock alert. Leave blank for no alert.">
      <div className="max-h-[55vh] space-y-2 overflow-y-auto">
        {models.map((m) => (
          <div key={m._id} className="flex items-center gap-3 text-sm">
            <span className="flex-1">
              {m.name} {m.variant}
            </span>
            <Input id={`min-${m._id}`} className="h-9 w-24" inputMode="numeric" value={v[m._id] || ""} onChange={(e) => setV({ ...v, [m._id]: e.target.value.replace(/\D/g, "") })} />
          </div>
        ))}
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>Save levels</Button>
      </div>
    </Modal>
  );
}

function NewTransfer({ ws, mine, onClose, onSaved }: { ws: any[]; mine: (id: string) => boolean; onClose: () => void; onSaved: () => void }) {
  const sources = ws.filter((w) => mine(w._id) && w.free > 0);
  const [from, setFrom] = useState(sources[0]?._id || "");
  const [to, setTo] = useState("");
  const [units, setUnits] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [tp, setTp] = useState<any>({ vehicleNo: "", driverName: "", driverPhone: "", ewayBillNo: "", invoiceNo: "" });
  const [remarks, setRemarks] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPicked(new Set());
    if (from) api<any[]>(`/api/warehouses/${from}/free`).then(setUnits).catch((e) => setErr(e.message));
  }, [from]);
  const fromW = ws.find((w) => w._id === from);
  const toW = ws.find((w) => w._id === to);
  const inter = fromW && toW && fromW.stateCode !== toW.stateCode;
  const byModel = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const u of units) {
      const k = `${u.model?.name || ""} ${u.model?.variant || ""}`.trim();
      m.set(k, [...(m.get(k) || []), u]);
    }
    return [...m.entries()];
  }, [units]);
  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
  };
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/warehouse-transfers", { method: "POST", json: { fromId: from, toId: to, vehicleIds: [...picked], transport: tp, remarks } });
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title="Warehouse to warehouse transfer" description="Stock leaves the source at once and shows as in transit until the receiving warehouse confirms it." maxWidth="2xl">
      {sources.length === 0 ? (
        <Notice tone="info">None of your warehouses has free stock to send.</Notice>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From">
              <select id="wt-from" className="field" value={from} onChange={(e) => setFrom(e.target.value)}>
                {sources.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name} ({w.free} free)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="To">
              <select id="wt-to" className="field" value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Choose…</option>
                {ws
                  .filter((w) => w._id !== from)
                  .map((w) => (
                    <option key={w._id} value={w._id}>
                      {w.name} · {w.city}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">
              Vehicles <span className="font-normal text-slate-500">(oldest first · {picked.size} picked)</span>
            </p>
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-xl border border-slate-200 p-3">
              {byModel.map(([model, list]) => (
                <div key={model}>
                  <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>
                      {model} · {list.length} free
                    </span>
                    <button
                      className="text-brand-700"
                      onClick={() => {
                        const n = new Set(picked);
                        const all = list.every((u) => n.has(u._id));
                        list.forEach((u) => (all ? n.delete(u._id) : n.add(u._id)));
                        setPicked(n);
                      }}
                    >
                      {list.every((u) => picked.has(u._id)) ? "Clear" : "All"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((u) => (
                      <button
                        key={u._id}
                        onClick={() => toggle(u._id)}
                        className={cn("rounded-lg border px-2 py-1 font-mono text-[11px]", picked.has(u._id) ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600")}
                      >
                        {u.chassisNumber}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {units.length === 0 && <p className="text-sm text-slate-500">No free units.</p>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Carrying vehicle no.">
              <Input id="wt-veh" value={tp.vehicleNo} onChange={(e) => setTp({ ...tp, vehicleNo: e.target.value })} placeholder="WB 23 A 1234" />
            </Field>
            <Field label="Driver name">
              <Input id="wt-drv" value={tp.driverName} onChange={(e) => setTp({ ...tp, driverName: e.target.value })} />
            </Field>
            <Field label="Driver phone">
              <Input id="wt-ph" value={tp.driverPhone} onChange={(e) => setTp({ ...tp, driverPhone: e.target.value })} />
            </Field>
            <Field label="E-way bill no. (12 digits)">
              <Input id="wt-ewb" inputMode="numeric" value={tp.ewayBillNo} onChange={(e) => setTp({ ...tp, ewayBillNo: e.target.value.replace(/\D/g, "").slice(0, 12) })} />
            </Field>
            {inter && (
              <Field label="Branch-transfer tax invoice no." className="sm:col-span-2">
                <Input id="wt-inv" value={tp.invoiceNo} onChange={(e) => setTp({ ...tp, invoiceNo: e.target.value })} />
              </Field>
            )}
            <Field label="Remarks" className="sm:col-span-2">
              <Input id="wt-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          </div>
          {inter && <Notice tone="warning">The two warehouses are in different states: this is a taxable branch transfer and needs a GST tax invoice.</Notice>}
          <p className="text-xs text-slate-500">An e-way bill is required when the value at cost is at or above the limit in Company Settings (₹50,000 by default) — almost always for vehicles.</p>
        </div>
      )}
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || !to || picked.size === 0} onClick={save}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Dispatch {picked.size || ""} unit(s)
        </Button>
      </div>
    </Modal>
  );
}

function TransferDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [t, setT] = useState<any>(null);
  const [marks, setMarks] = useState<Record<string, { short: boolean; remarks: string }>>({});
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<any>(`/api/warehouse-transfers/${id}`).then(setT).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(load, [load]);
  const act = async (json: any) => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/warehouse-transfers/${id}`, { method: "POST", json });
      onChanged();
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={t ? t.transferCode : "Transfer"} description={t ? `${t.fromName} → ${t.toName}` : undefined} maxWidth="2xl">
      {!t ? (
        err ? <Notice>{err}</Notice> : <Skeleton className="h-40" />
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={T_STATUS[t.status]} label={t.status.replace(/_/g, " ")} />
            {t.interState && <Badge variant="warning">Inter-state · invoice {t.transport?.invoiceNo}</Badge>}
            <a href={`/api/warehouse-transfers/${id}/challan`} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
              <Download className="h-3.5 w-3.5" /> Challan PDF
            </a>
          </div>
          <p className="text-slate-600">
            {t.transport?.vehicleNo} · {t.transport?.driverName} {t.transport?.driverPhone} · E-way bill {t.transport?.ewayBillNo || "—"} · value {rupees(t.totalValue)}
          </p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {t.vehicles.map((v: any) => {
              const m = marks[v.vehicle] || { short: false, remarks: "" };
              return (
                <li key={v.vehicle} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="font-mono text-xs">{v.chassisNumber}</span>
                  <span className="flex-1 text-xs text-slate-500">{v.modelName}</span>
                  {v.condition && <StatusBadge status={v.condition === "SHORT" ? "MISSING" : "DELIVERED"} label={v.condition} />}
                  {t.canReceive && (
                    <span className="flex w-full items-center gap-2 sm:w-auto">
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={m.short} onChange={(e) => setMarks({ ...marks, [v.vehicle]: { ...m, short: e.target.checked } })} /> Short
                      </label>
                      {m.short && <Input id={`sh-${v.vehicle}`} className="h-8 sm:w-44" placeholder="What happened?" value={m.remarks} onChange={(e) => setMarks({ ...marks, [v.vehicle]: { ...m, remarks: e.target.value } })} />}
                    </span>
                  )}
                  {v.remarks && <span className="w-full text-xs text-rose-600">{v.remarks}</span>}
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-500">
            Sent by {t.createdByName} on {dt(t.createdAt, true)}
            {t.receivedByName ? ` · received by ${t.receivedByName} on ${dt(t.receivedAt, true)}` : ""}
            {t.remarks ? ` · ${t.remarks}` : ""}
          </p>
          {err && <Notice>{err}</Notice>}
          <div className="modal-actions flex flex-wrap justify-end gap-2">
            {t.canCancel && (
              <span className="flex items-center gap-2">
                <Input id="wt-cancel" className="h-9 w-44" placeholder="Reason to cancel" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button variant="outline" disabled={busy} onClick={() => act({ action: "cancel", reason })}>
                  Call back
                </Button>
              </span>
            )}
            {t.canReceive && (
              <Button
                disabled={busy}
                onClick={() =>
                  act({
                    action: "receive",
                    items: t.vehicles.map((v: any) => ({ vehicleId: v.vehicle, condition: marks[v.vehicle]?.short ? "SHORT" : "RECEIVED", remarks: marks[v.vehicle]?.remarks })),
                  })
                }
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm receipt
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
