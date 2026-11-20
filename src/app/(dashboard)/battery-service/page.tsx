"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BatteryCharging, CheckCircle2, Loader2, Plus, RefreshCcw, Search, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, dt, Notice, rupees } from "@/components/workflow";
import { WarehousePicker } from "@/components/warehousePicker";
import { SerialPicker } from "@/components/items";

const STATUS: Record<string, { label: string; tone: "warning" | "success" | "info" }> = {
  IN_REPAIR: { label: "In for repair", tone: "warning" },
  RETURNED: { label: "Repaired & returned", tone: "success" },
  REPLACED: { label: "Replaced", tone: "info" },
};

/**
 * Battery service: a customer's battery comes in for repair (held as "repair" stock, not ours),
 * then is handed back repaired, or replaced from stock — the old one becomes our defective stock.
 */
export default function BatteryServicePage() {
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [receive, setReceive] = useState(false);
  const [replaceJob, setReplaceJob] = useState<any | null>(null);
  const [returnJob, setReturnJob] = useState<any | null>(null);
  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    api<any[]>(`/api/battery-jobs?${p}`).then(setList).catch((e) => setErr(e.message));
  }, [q, status]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  const open = (list || []).filter((j) => j.status === "IN_REPAIR");
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Service"
        title="Battery service"
        description="Take in a customer's battery for repair, hand it back when repaired, or replace it from stock. A replaced battery comes into stock as defective, ready to send to the supplier under warranty or repair."
        actions={
          <Button onClick={() => setReceive(true)}>
            <Plus className="h-4 w-4" /> Receive a battery
          </Button>
        }
      />
      {msg && <Notice tone="success">{msg}</Notice>}
      {err && <Notice>{err}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="In for repair now" value={open.length} icon={BatteryCharging} tone={open.length ? "amber" : "slate"} />
        <StatCard label="Replaced" value={(list || []).filter((j) => j.status === "REPLACED").length} icon={RefreshCcw} tone="sky" />
        <StatCard label="Repaired & returned" value={(list || []).filter((j) => j.status === "RETURNED").length} icon={CheckCircle2} tone="emerald" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input aria-label="Search jobs" className="pl-8" placeholder="Job, customer, phone, serial, chassis" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Status" className="field h-9 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>
      {!list ? (
        <Skeleton className="h-48" />
      ) : list.length === 0 ? (
        <EmptyState icon={BatteryCharging} title="No battery jobs" description="When a customer brings a battery in, record it here." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((j) => (
                  <TableRow key={j._id}>
                    <TableCell>
                      <p className="font-mono text-xs font-semibold">{j.code}</p>
                      <p className="text-[11px] text-slate-500">
                        {dt(j.receivedAt)} · {j.warehouse?.name}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {j.customer.name}
                      <p className="text-[11px] text-slate-500">
                        {j.customer.phone}
                        {j.chassisNumber ? ` · ${j.chassisNumber}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs">
                      {j.item?.name}
                      {j.serialNo && <p className="font-mono text-[11px] text-slate-500">{j.serialNo}</p>}
                    </TableCell>
                    <TableCell className="max-w-[220px] text-xs text-slate-600">
                      {j.complaint}
                      {j.resolution && <p className="text-slate-500">→ {j.resolution}</p>}
                      {j.replacement && (
                        <p className="text-slate-500">
                          New: {j.replacement.item?.name} {j.replacement.serialNo ? `(${j.replacement.serialNo})` : ""} ·{" "}
                          {j.replacement.warranty ? "warranty" : `${rupees(j.replacement.charge)} + GST${j.replacement.partsSale ? ` · bill ${j.replacement.partsSale.saleCode}` : ""}`}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS[j.status].tone}>{STATUS[j.status].label}</Badge>
                    </TableCell>
                    <TableCell>
                      {j.status === "IN_REPAIR" && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => setReturnJob(j)}>
                            <Undo2 className="h-3.5 w-3.5" /> Return repaired
                          </Button>
                          <Button size="sm" onClick={() => setReplaceJob(j)}>
                            <RefreshCcw className="h-3.5 w-3.5" /> Replace
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <ReceiveModal
        open={receive}
        onClose={() => setReceive(false)}
        onDone={(m) => {
          setReceive(false);
          setMsg(m);
          load();
        }}
      />
      <ReplaceModal
        job={replaceJob}
        onClose={() => setReplaceJob(null)}
        onDone={(m) => {
          setReplaceJob(null);
          setMsg(m);
          load();
        }}
      />
      <ReturnModal
        job={returnJob}
        onClose={() => setReturnJob(null)}
        onDone={(m) => {
          setReturnJob(null);
          setMsg(m);
          load();
        }}
      />
    </div>
  );
}

function useBatteries(warehouseId?: string) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>(`/api/items?category=BATTERY&active=1${warehouseId ? `&warehouse=${warehouseId}` : ""}`)
      .then(setItems)
      .catch(() => setItems([]));
  }, [warehouseId]);
  return items;
}

interface ReplaceState {
  itemId: string;
  serialNo: string;
  warranty: boolean;
  chargeRupees: string;
  paymentMode: string;
  resolution: string;
}
const blankReplace = (): ReplaceState => ({ itemId: "", serialNo: "", warranty: true, chargeRupees: "", paymentMode: "CASH", resolution: "" });

function ReplaceFields({ r, setR, warehouseId }: { r: ReplaceState; setR: (r: ReplaceState) => void; warehouseId: string }) {
  const items = useBatteries(warehouseId);
  const it = items.find((i) => i._id === r.itemId);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="rp-item">New battery (from this warehouse)</Label>
        <select
          id="rp-item"
          className="field"
          value={r.itemId}
          onChange={(e) => {
            const x = items.find((i) => i._id === e.target.value);
            setR({ ...r, itemId: e.target.value, serialNo: "", chargeRupees: r.chargeRupees || (x ? String(x.sellingPrice / 100) : "") });
          }}
        >
          <option value="">— choose —</option>
          {items.map((i) => (
            <option key={i._id} value={i._id}>
              {i.name} · {i.stock.good} in stock
            </option>
          ))}
        </select>
      </div>
      {it?.serialTracked && (
        <div className="sm:col-span-2">
          <SerialPicker itemId={it._id} warehouseId={warehouseId} qty={1} value={r.serialNo ? [r.serialNo] : []} onChange={(v) => setR({ ...r, serialNo: v[v.length - 1] || "" })} />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
        <input type="checkbox" checked={r.warranty} onChange={(e) => setR({ ...r, warranty: e.target.checked })} />
        Under warranty (no charge to the customer)
      </label>
      {!r.warranty && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="rp-charge">Charge before GST (₹)</Label>
            <Input id="rp-charge" inputMode="decimal" value={r.chargeRupees} onChange={(e) => setR({ ...r, chargeRupees: e.target.value })} />
            {it && <p className="text-[11px] text-slate-500">GST {it.gstRate}% is added on the bill</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-mode">Payment</Label>
            <select id="rp-mode" className="field" value={r.paymentMode} onChange={(e) => setR({ ...r, paymentMode: e.target.value })}>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="BANK">Bank / card</option>
              <option value="CREDIT">Pay later</option>
            </select>
          </div>
        </>
      )}
    </div>
  );
}

function ReceiveModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const [warehouseId, setWarehouseId] = useState("");
  const batteries = useBatteries();
  const [f, setF] = useState({ name: "", phone: "", chassisNumber: "", itemId: "", serialNo: "", complaint: "" });
  const [replaceNow, setReplaceNow] = useState(false);
  const [r, setR] = useState<ReplaceState>(blankReplace());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setF({ name: "", phone: "", chassisNumber: "", itemId: "", serialNo: "", complaint: "" });
      setReplaceNow(false);
      setR(blankReplace());
      setErr(null);
    }
  }, [open]);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const j = await api<any>("/api/battery-jobs", {
        method: "POST",
        json: {
          customer: { name: f.name, phone: f.phone },
          chassisNumber: f.chassisNumber,
          itemId: f.itemId,
          serialNo: f.serialNo,
          warehouseId,
          complaint: f.complaint,
          replaceNow: replaceNow ? { ...r, chargeRupees: Number(r.chargeRupees || 0) } : null,
        },
      });
      onDone(`${j.code}: ${replaceNow ? "battery replaced" : "battery received for repair"}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={onClose} maxWidth="2xl" title="Receive a battery" description="The customer's battery is held as 'repair' stock until it is returned or replaced.">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rb-name">Customer name</Label>
          <Input id="rb-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rb-phone">Mobile</Label>
          <Input id="rb-phone" inputMode="numeric" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rb-chassis">Vehicle chassis no. (optional)</Label>
          <Input id="rb-chassis" value={f.chassisNumber} onChange={(e) => setF({ ...f, chassisNumber: e.target.value.toUpperCase() })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rb-wh">Received at</Label>
          <WarehousePicker id="rb-wh" value={warehouseId} onChange={setWarehouseId} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rb-item">Battery type</Label>
          <select id="rb-item" className="field" value={f.itemId} onChange={(e) => setF({ ...f, itemId: e.target.value })}>
            <option value="">— choose —</option>
            {batteries.map((i) => (
              <option key={i._id} value={i._id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rb-serial">Battery serial no.</Label>
          <Input id="rb-serial" value={f.serialNo} onChange={(e) => setF({ ...f, serialNo: e.target.value.toUpperCase() })} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rb-complaint">Problem</Label>
          <Input id="rb-complaint" value={f.complaint} onChange={(e) => setF({ ...f, complaint: e.target.value })} placeholder="e.g. not charging beyond 60%" />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 sm:col-span-2">
          <input type="checkbox" checked={replaceNow} onChange={(e) => setReplaceNow(e.target.checked)} />
          Replace it now with a battery from stock
        </label>
      </div>
      {replaceNow && warehouseId && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <ReplaceFields r={r} setR={setR} warehouseId={warehouseId} />
        </div>
      )}
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

function ReplaceModal({ job, onClose, onDone }: { job: any; onClose: () => void; onDone: (m: string) => void }) {
  const [r, setR] = useState<ReplaceState>(blankReplace());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (job) {
      setR({ ...blankReplace(), itemId: "" });
      setErr(null);
    }
  }, [job]);
  if (!job) return null;
  return (
    <Modal isOpen={!!job} onClose={onClose} title={`Replace battery — ${job.code}`} description={`${job.customer.name} · old battery ${job.item?.name} ${job.serialNo || ""} goes into defective stock`}>
      <ReplaceFields r={r} setR={setR} warehouseId={String(job.warehouse?._id || job.warehouse)} />
      <div className="mt-3 space-y-1.5">
        <Label htmlFor="rp-res">Note</Label>
        <Input id="rp-res" value={r.resolution} onChange={(e) => setR({ ...r, resolution: e.target.value })} />
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy || !r.itemId}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await api(`/api/battery-jobs/${job._id}`, { method: "POST", json: { action: "replace", ...r, chargeRupees: Number(r.chargeRupees || 0) } });
              onDone(`${job.code}: battery replaced${r.warranty ? " under warranty" : " — bill made"}`);
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Replace
        </Button>
      </div>
    </Modal>
  );
}

function ReturnModal({ job, onClose, onDone }: { job: any; onClose: () => void; onDone: (m: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!job) return null;
  return (
    <Modal isOpen={!!job} onClose={onClose} title={`Return repaired battery — ${job.code}`} description={`${job.customer.name} · ${job.item?.name} ${job.serialNo || ""}`}>
      <div className="space-y-1.5">
        <Label htmlFor="rt-note">What was done</Label>
        <Input id="rt-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. cell balancing, BMS reset" />
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={busy}
          className={cn()}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await api(`/api/battery-jobs/${job._id}`, { method: "POST", json: { action: "return", resolution: note } });
              onDone(`${job.code}: returned to the customer`);
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Returned
        </Button>
      </div>
    </Modal>
  );
}
