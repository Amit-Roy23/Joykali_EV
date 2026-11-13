"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  Check,
  ClipboardCheck,
  FileJson,
  FileText,
  Loader2,
  Lock,
  PackageCheck,
  ScanLine,
  Send,
  Trash2,
  Truck,
  Wand2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { DataRow, PageHeader, PageSkeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, ReasonModal, rupees } from "@/components/workflow";

const STEPS = [
  { s: "CREATED", label: "DO created" },
  { s: "SUBMITTED", label: "Submitted" },
  { s: "LOADING", label: "Loading" },
  { s: "LOADED", label: "Loaded" },
  { s: "DISPATCHED", label: "Dispatched" },
  { s: "DELIVERED", label: "Received" },
];
const ORDER = ["CREATED", "SUBMITTED", "LOADING", "LOADED", "DISPATCHED", "DELIVERED"];
const CHECKS = [
  { k: "physicalInspection", label: "Physical inspection — no scratches, dents or missing parts" },
  { k: "chassisVerified", label: "Chassis numbers on the vehicles match this DO" },
  { k: "batteryChargerKeys", label: "Battery, charger, keys and toolkit loaded with each vehicle" },
  { k: "securedForTransit", label: "Vehicles strapped and secured for transit" },
] as const;

export default function DeliveryOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const load = useCallback(() => {
    api<any>(`/api/delivery-orders/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(action);
    setActionError(null);
    try {
      await api(`/api/delivery-orders/${id}`, { method: "POST", json: { action, ...payload } });
      load();
      return true;
    } catch (e: any) {
      setActionError(e.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <PageSkeleton />;
  const d = data.deliveryOrder;
  const can = data.can;
  const stepIndex = ORDER.indexOf(d.status === "DELIVERED_WITH_ISSUES" ? "DELIVERED" : d.status);
  const units = d.lines.reduce((s: number, l: any) => s + l.quantity, 0);
  const cancellable = can.manage && ["CREATED", "SUBMITTED", "LOADING", "LOADED"].includes(d.status);

  return (
    <div className="animate-fade-up">
      <PageHeader
        backHref="/dispatch"
        eyebrow={`${d.partyType === "DEALER" ? "Dealer consignment" : "Distributor sale"} · order ${d.orderCode}`}
        title={d.doCode}
        description={`${d.partySnapshot.name} (${d.partySnapshot.code}), ${d.partySnapshot.city} · ${units} vehicle(s)`}
        actions={
          <>
            <StatusBadge status={d.status} />
            {d.document?.number && (
              <a href={`/api/delivery-orders/${d._id}/document`}>
                <Button size="sm" variant="outline">
                  <FileText className="h-4 w-4" /> {d.document.kind === "TAX_INVOICE" ? "Tax invoice" : "Delivery challan"}
                </Button>
              </a>
            )}
            {cancellable && (
              <Button size="sm" variant="outline" className="text-rose-600" onClick={() => setCancelOpen(true)}>
                <Ban className="h-4 w-4" /> Cancel DO
              </Button>
            )}
          </>
        }
      />

      {/* Stepper */}
      {d.status !== "CANCELLED" ? (
        <ol className="scroll-thin mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white p-2 shadow-card">
          {STEPS.map((st, i) => (
            <li
              key={st.s}
              className={cn(
                "flex min-w-[110px] flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold",
                i < stepIndex && "text-emerald-700",
                i === stepIndex && "bg-ink-900 text-white",
                i > stepIndex && "text-slate-400"
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]",
                  i < stepIndex ? "bg-emerald-100" : i === stepIndex ? "bg-volt-300 text-ink-900" : "bg-slate-100"
                )}
              >
                {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {st.label}
            </li>
          ))}
        </ol>
      ) : (
        <Notice tone="warning" className="mb-4">This delivery order was cancelled. Reserved vehicles went back to warehouse stock and the quantities returned to the order.</Notice>
      )}

      {actionError && <Notice className="mb-4">{actionError}</Notice>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-4">
          {d.status === "CREATED" && (
            <StepCard icon={Send} title="Submit the warehouse DO" description="Submitting freezes the quantities and releases the DO to the loading bay.">
              <LinesTable d={d} />
              {can.manage ? (
                <Button className="mt-4" disabled={!!busy} onClick={() => act("submit")}>
                  {busy === "submit" && <Loader2 className="h-4 w-4 animate-spin" />} Submit DO for loading
                </Button>
              ) : (
                <WaitNote>Waiting for the warehouse to submit this DO.</WaitNote>
              )}
            </StepCard>
          )}

          {d.status === "SUBMITTED" && (
            <StepCard icon={Truck} title="Assign transport & driver" description="Only vehicles whose RC, insurance, fitness, permit, road tax and PUC are all valid can be used.">
              <LinesTable d={d} />
              {can.manage ? <StartLoading fleet={data.fleet} units={units} busy={busy} onStart={(p) => act("start-loading", p)} /> : <WaitNote>Waiting for the warehouse to start loading.</WaitNote>}
            </StepCard>
          )}

          {d.status === "LOADING" && <Loading d={d} canManage={can.manage} busy={busy} act={act} />}

          {d.status === "LOADED" && (
            <Loaded d={d} canManage={can.manage} busy={busy} act={act} readiness={data.readiness} userId={user?.userId} separate={data.settings.separateDispatcher} />
          )}

          {d.status === "DISPATCHED" &&
            (can.grn ? (
              <GrnForm d={d} busy={busy} act={act} />
            ) : (
              <StepCard icon={Truck} title="In transit" description={`Dispatched ${dt(d.dispatch?.at, true)} by ${d.dispatch?.byName}.`}>
                <WaitNote>Waiting for {d.partySnapshot.name} to record the goods receipt (GRN).</WaitNote>
              </StepCard>
            ))}

          {["DELIVERED", "DELIVERED_WITH_ISSUES"].includes(d.status) && d.grn && (
            <StepCard icon={PackageCheck} title={`Goods receipt ${d.grn.grnNo}`} description={`Recorded by ${d.grn.receivedByName} · ${dt(d.grn.at, true)}`}>
              <ul className="divide-y divide-slate-100">
                {d.grn.items.map((i: any) => (
                  <li key={i.chassisNumber} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="font-mono text-xs">{i.chassisNumber}</span>
                    <span className="flex items-center gap-2">
                      {i.remarks && <span className="text-xs text-slate-500">{i.remarks}</span>}
                      <StatusBadge status={i.condition === "RECEIVED" ? "DELIVERED" : i.condition === "DAMAGED" ? "RETURNED" : "MISSING"} />
                    </span>
                  </li>
                ))}
              </ul>
              {d.grn.remarks && <p className="mt-2 text-sm text-slate-600">“{d.grn.remarks}”</p>}
              {d.grn.creditNoteNo && (
                <Notice tone="info" className="mt-3">
                  Credit note {d.grn.creditNoteNo} for {rupees(d.grn.creditNoteValue)} was posted to the distributor&apos;s account for the short vehicles.
                </Notice>
              )}
            </StepCard>
          )}

          {d.vehicles.length > 0 && !(d.status === "LOADING" || (d.status === "DISPATCHED" && can.grn)) && (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Vehicles on this DO</CardTitle>
              </CardHeader>
              <CardContent className="px-2 sm:px-3">
                <VehicleList vehicles={d.vehicles} />
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          {d.loading && (
            <Card className="p-4 sm:p-5">
              <p className="mb-1 font-display text-[15px] font-semibold">Transport</p>
              <DataRow label="Vehicle" value={d.loading.registrationNo} />
              <DataRow label="Driver" value={d.loading.driverName} />
              <DataRow label="Mobile" value={d.loading.driverPhone} />
              <DataRow label="Licence" value={<span className="font-mono text-xs">{d.loading.driverLicence}</span>} />
              {d.loading.loadedByName && <DataRow label="Loaded by" value={d.loading.loadedByName} />}
              {d.dispatch && <DataRow label="Dispatched by" value={d.dispatch.byName} />}
            </Card>
          )}
          {d.document?.number && (
            <Card className="p-4 sm:p-5">
              <p className="mb-1 font-display text-[15px] font-semibold">{d.document.kind === "TAX_INVOICE" ? "Tax invoice" : "Delivery challan"}</p>
              <DataRow label="Number" value={<span className="font-mono text-xs">{d.document.number}</span>} />
              <DataRow label="Taxable" value={rupees(d.document.taxableValue)} />
              {d.document.interState ? (
                <DataRow label="IGST" value={rupees(d.document.igst)} />
              ) : (
                <>
                  <DataRow label="CGST" value={rupees(d.document.cgst)} />
                  <DataRow label="SGST" value={rupees(d.document.sgst)} />
                </>
              )}
              <DataRow label="Total" value={<b>{rupees(d.document.totalValue)}</b>} />
              <DataRow
                label="E-way bill"
                value={d.ewayBill?.ewbNo ? <span className="font-mono text-xs">{d.ewayBill.ewbNo}</span> : d.ewayBill?.required ? <span className="text-amber-700">pending</span> : "not required"}
              />
              {d.ewayBill?.validUpto && <DataRow label="Valid until" value={dt(d.ewayBill.validUpto, true)} />}
            </Card>
          )}
          <Card className="p-4 sm:p-5">
            <p className="mb-2 font-display text-[15px] font-semibold">Timeline</p>
            <ol className="space-y-3">
              {[...d.timeline].reverse().map((t: any, i: number) => (
                <li key={i} className="relative pl-5">
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-brand-500" />
                  <p className="text-xs font-semibold text-slate-900">{t.status.replace(/_/g, " ")}</p>
                  <p className="text-[11px] text-slate-500">
                    {t.byName} · {dt(t.at, true)}
                  </p>
                  {t.note && <p className="text-[11px] text-slate-600">{t.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>

      <ReasonModal
        open={cancelOpen}
        title="Cancel this delivery order"
        description="Reserved vehicles return to warehouse stock and the quantities go back to the order. A generated invoice/challan number is voided."
        confirmLabel="Cancel DO"
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          const ok = await act("cancel", { reason });
          if (!ok) throw new Error("Could not cancel");
          setCancelOpen(false);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
function StepCard({ icon: Icon, title, description, children }: { icon: any; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="border-brand-200">
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function WaitNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">{children}</p>;
}

function LinesTable({ d }: { d: any }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {d.lines.map((l: any) => (
        <li key={l.model} className="flex items-center justify-between px-3 py-2 text-sm">
          <span className="font-medium text-slate-800">{l.modelName}</span>
          <span className="font-semibold tabular">× {l.quantity}</span>
        </li>
      ))}
    </ul>
  );
}

function VehicleList({ vehicles, onRemove, busy }: { vehicles: any[]; onRemove?: (id: string) => void; busy?: string | null }) {
  return (
    <ul className="divide-y divide-slate-100">
      {vehicles.map((v) => (
        <li key={v.vehicle} className="flex items-center gap-3 px-2 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-xs font-semibold text-slate-900">{v.chassisNumber}</p>
            <p className="truncate text-[11px] text-slate-500">
              {v.modelName} · {v.color} · battery {v.batteryNumber}
            </p>
          </div>
          {onRemove && (
            <button className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" disabled={!!busy} onClick={() => onRemove(String(v.vehicle))} aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------- Submitted → Loading */
function StartLoading({ fleet, units, busy, onStart }: { fleet: any[]; units: number; busy: string | null; onStart: (p: any) => void }) {
  const [form, setForm] = useState({ fleetVehicleId: "", driverName: "", driverPhone: "", driverLicence: "" });
  const chosen = fleet.find((f) => String(f._id) === form.fleetVehicleId);
  const valid = chosen && !chosen.locked && chosen.capacityUnits >= units && form.driverName.trim() && /^[6-9]\d{9}$/.test(form.driverPhone) && form.driverLicence.trim().length >= 8;
  return (
    <div className="mt-4 space-y-4">
      <div>
        <Label>Transport vehicle</Label>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {fleet.map((f) => {
            const tooSmall = f.capacityUnits < units;
            const disabled = f.locked || tooSmall;
            return (
              <button
                key={f._id}
                type="button"
                disabled={disabled}
                onClick={() => setForm({ ...form, fleetVehicleId: String(f._id) })}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  form.fleetVehicleId === String(f._id) ? "border-brand-500 bg-brand-50 ring-4 ring-brand-500/10" : "border-slate-200",
                  disabled && "cursor-not-allowed bg-slate-50 opacity-70"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-bold">{f.registrationNo}</span>
                  {f.locked ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600"><Lock className="h-3 w-3" /> Locked</span> : <span className="text-[11px] text-slate-500">{f.capacityUnits} units</span>}
                </div>
                <p className="truncate text-xs text-slate-500">{f.makeModel}</p>
                {f.locked && <p className="mt-1 text-[11px] text-rose-600">{f.reasons.join("; ")}</p>}
                {!f.locked && tooSmall && <p className="mt-1 text-[11px] text-amber-700">Too small for {units} vehicles</p>}
              </button>
            );
          })}
        </div>
        {fleet.length === 0 && <p className="text-sm text-slate-500">No transport vehicles registered. Add them under Transport Fleet.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Driver name</Label>
          <Input value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Driver mobile</Label>
          <Input inputMode="numeric" maxLength={10} value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value.replace(/\D/g, "") })} />
        </div>
        <div className="space-y-1.5">
          <Label>Driving licence no.</Label>
          <Input value={form.driverLicence} onChange={(e) => setForm({ ...form, driverLicence: e.target.value.toUpperCase() })} />
        </div>
      </div>
      <Button disabled={!valid || !!busy} onClick={() => onStart(form)}>
        {busy === "start-loading" && <Loader2 className="h-4 w-4 animate-spin" />} Start loading
      </Button>
    </div>
  );
}

/* ------------------------------------------------------- Loading */
function Loading({ d, canManage, busy, act }: { d: any; canManage: boolean; busy: string | null; act: (a: string, p?: any) => Promise<boolean> }) {
  const [chassis, setChassis] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const input = useRef<HTMLInputElement>(null);
  const picked = (model: string) => d.vehicles.filter((v: any) => String(v.model) === String(model)).length;
  const complete = d.lines.every((l: any) => picked(l.model) === l.quantity);
  return (
    <StepCard icon={ScanLine} title="Pick & load" description="Scan or type each chassis. Only free warehouse stock of the right model is accepted, and it is reserved for this DO immediately.">
      <ul className="space-y-2">
        {d.lines.map((l: any) => {
          const n = picked(l.model);
          return (
            <li key={l.model}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">{l.modelName}</span>
                <span className={cn("font-semibold tabular", n === l.quantity ? "text-emerald-700" : "text-slate-700")}>
                  {n}/{l.quantity}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${(n / l.quantity) * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>

      {canManage && !complete && (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act("pick", { chassisNumber: chassis })) setChassis("");
            input.current?.focus();
          }}
        >
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input ref={input} value={chassis} onChange={(e) => setChassis(e.target.value.toUpperCase())} placeholder="Scan / type chassis number" className="pl-9 font-mono" autoFocus />
          </div>
          <Button type="submit" disabled={!chassis.trim() || !!busy}>
            {busy === "pick" && <Loader2 className="h-4 w-4 animate-spin" />} Add
          </Button>
          <Button type="button" variant="outline" disabled={!!busy} onClick={() => act("auto-pick")}>
            {busy === "auto-pick" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Auto-pick oldest stock
          </Button>
        </form>
      )}

      {d.vehicles.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200">
          <VehicleList vehicles={d.vehicles} onRemove={canManage ? (vid) => act("unpick", { vehicleId: vid }) : undefined} busy={busy} />
        </div>
      )}

      {canManage && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ClipboardCheck className="h-4 w-4 text-brand-600" /> Loading checklist
          </p>
          <div className="space-y-2">
            {CHECKS.map((c) => (
              <label key={c.k} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 p-2.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={!!checks[c.k]} onChange={(e) => setChecks({ ...checks, [c.k]: e.target.checked })} />
                {c.label}
              </label>
            ))}
          </div>
          <Button className="mt-4" disabled={!complete || CHECKS.some((c) => !checks[c.k]) || !!busy} onClick={() => act("complete-loading", { checklist: checks })}>
            {busy === "complete-loading" && <Loader2 className="h-4 w-4 animate-spin" />} Complete loading
          </Button>
          {!complete && <p className="mt-2 text-xs text-slate-500">Pick every vehicle to complete loading.</p>}
        </div>
      )}
    </StepCard>
  );
}

/* -------------------------------------------------------- Loaded */
function Loaded({
  d,
  canManage,
  busy,
  act,
  readiness,
  userId,
  separate,
}: {
  d: any;
  canManage: boolean;
  busy: string | null;
  act: (a: string, p?: any) => Promise<boolean>;
  readiness: any;
  userId?: string;
  separate: boolean;
}) {
  const [km, setKm] = useState<string>(d.ewayBill?.distanceKm ? String(d.ewayBill.distanceKm) : "");
  const [ewb, setEwb] = useState("");
  const [ewbDate, setEwbDate] = useState("");
  const isLoader = separate && d.loading?.loadedBy && String(d.loading.loadedBy) === String(userId);
  const docName = d.partyType === "DISTRIBUTOR" ? "tax invoice" : "delivery challan";
  return (
    <StepCard icon={Send} title="Documents & dispatch" description="The gate pass is issued only when the paperwork is complete and the truck's documents are still valid.">
      <ol className="space-y-4">
        <li className="rounded-xl border border-slate-200 p-3.5">
          <p className="text-sm font-semibold text-slate-900">1. Generate the {docName}</p>
          {d.document?.number ? (
            <p className="mt-1 text-sm text-emerald-700">
              ✓ {d.document.number} · {rupees(d.document.totalValue)} ·{" "}
              <a className="font-semibold underline" href={`/api/delivery-orders/${d._id}/document`}>
                Download PDF
              </a>
            </p>
          ) : canManage ? (
            <Button size="sm" className="mt-2" disabled={!!busy} onClick={() => act("generate-document")}>
              {busy === "generate-document" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Generate {docName}
            </Button>
          ) : null}
        </li>
        <li className="rounded-xl border border-slate-200 p-3.5">
          <p className="text-sm font-semibold text-slate-900">2. E-way bill {d.ewayBill?.required === false && d.document ? "(not required for this value)" : ""}</p>
          {d.ewayBill?.ewbNo ? (
            <p className="mt-1 text-sm text-emerald-700">
              ✓ EWB {d.ewayBill.ewbNo} · {d.ewayBill.distanceKm} km · valid until {dt(d.ewayBill.validUpto, true)}
            </p>
          ) : canManage && d.document?.number ? (
            <div className="mt-2 space-y-3">
              <p className="text-xs text-slate-500">
                Enter the road distance and download the JSON, upload it on the NIC e-way bill portal (ewaybillgst.gov.in → Generate Bulk), then record the 12-digit EWB number it returns.
              </p>
              <div className="grid gap-2 sm:grid-cols-[120px_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label>Distance (km)</Label>
                  <Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ""))} />
                </div>
                <a
                  className={cn(!km && "pointer-events-none opacity-50")}
                  href={km ? `/api/delivery-orders/${d._id}/ewaybill?distanceKm=${km}` : undefined}
                >
                  <Button variant="outline" size="sm" type="button">
                    <FileJson className="h-4 w-4" /> Download e-way bill JSON
                  </Button>
                </a>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label>EWB number (12 digits)</Label>
                  <Input inputMode="numeric" maxLength={12} value={ewb} onChange={(e) => setEwb(e.target.value.replace(/\D/g, ""))} className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label>Generated at</Label>
                  <Input type="datetime-local" value={ewbDate} onChange={(e) => setEwbDate(e.target.value)} />
                </div>
                <Button
                  size="sm"
                  disabled={!km || ewb.length !== 12 || !!busy}
                  onClick={() => act("eway-bill", { distanceKm: Number(km), ewbNo: ewb, ewbDate: ewbDate ? new Date(ewbDate).toISOString() : undefined })}
                >
                  {busy === "eway-bill" && <Loader2 className="h-4 w-4 animate-spin" />} Save EWB
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Available after the {docName} is generated.</p>
          )}
        </li>
        <li className="rounded-xl border border-slate-200 p-3.5">
          <p className="text-sm font-semibold text-slate-900">3. Dispatch (gate-out)</p>
          {readiness.blockers.length > 0 && (
            <ul className="mt-2 space-y-1">
              {readiness.blockers.map((b: string) => (
                <li key={b} className="flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {b}
                </li>
              ))}
            </ul>
          )}
          {isLoader && <p className="mt-2 text-xs text-slate-600">You completed the loading, so another authorised person must dispatch it (segregation of duties).</p>}
          {canManage && (
            <Button className="mt-3" variant="ink" disabled={readiness.blockers.length > 0 || isLoader || !!busy} onClick={() => act("dispatch")}>
              {busy === "dispatch" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4 text-volt-300" />} Dispatch now
            </Button>
          )}
        </li>
      </ol>
    </StepCard>
  );
}

/* ----------------------------------------------------------- GRN */
function GrnForm({ d, busy, act }: { d: any; busy: string | null; act: (a: string, p?: any) => Promise<boolean> }) {
  const [items, setItems] = useState<Record<string, { condition: string; remarks: string }>>(
    Object.fromEntries(d.vehicles.map((v: any) => [String(v.vehicle), { condition: "RECEIVED", remarks: "" }]))
  );
  const [remarks, setRemarks] = useState("");
  const missingRemark = Object.values(items).some((i) => i.condition !== "RECEIVED" && !i.remarks.trim());
  return (
    <StepCard icon={PackageCheck} title="Record goods receipt (GRN)" description={`Dispatched ${dt(d.dispatch?.at, true)} on ${d.loading?.registrationNo}. Check each vehicle against its chassis number.`}>
      <ul className="space-y-2">
        {d.vehicles.map((v: any) => {
          const it = items[String(v.vehicle)];
          return (
            <li key={v.vehicle} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs font-semibold">{v.chassisNumber}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {v.modelName} · {v.color}
                  </p>
                </div>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
                  {(["RECEIVED", "DAMAGED", "SHORT"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setItems({ ...items, [String(v.vehicle)]: { ...it, condition: c } })}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[11px] font-semibold transition",
                        it.condition === c
                          ? c === "RECEIVED"
                            ? "bg-emerald-600 text-white"
                            : c === "DAMAGED"
                            ? "bg-amber-500 text-white"
                            : "bg-rose-600 text-white"
                          : "text-slate-600"
                      )}
                    >
                      {c === "RECEIVED" ? "Received" : c === "DAMAGED" ? "Damaged" : "Short"}
                    </button>
                  ))}
                </div>
              </div>
              {it.condition !== "RECEIVED" && (
                <Input
                  className="mt-2"
                  placeholder={it.condition === "DAMAGED" ? "Describe the damage" : "What is missing?"}
                  value={it.remarks}
                  onChange={(e) => setItems({ ...items, [String(v.vehicle)]: { ...it, remarks: e.target.value } })}
                />
              )}
            </li>
          );
        })}
      </ul>
      <Label className="mt-4 block">General remarks (optional)</Label>
      <textarea className="field mt-1.5 h-20 py-2" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      <p className="mt-2 text-xs text-slate-500">
        {d.partyType === "DISTRIBUTOR" ? "Vehicles marked short are credited back to your account automatically." : "Received vehicles are added to the dealer's floor stock."}
      </p>
      <Button
        className="mt-3"
        disabled={missingRemark || !!busy}
        onClick={() =>
          act("grn", {
            remarks,
            items: Object.entries(items).map(([vehicleId, i]) => ({ vehicleId, condition: i.condition, remarks: i.remarks })),
          })
        }
      >
        {busy === "grn" && <Loader2 className="h-4 w-4 animate-spin" />} Confirm receipt
      </Button>
    </StepCard>
  );
}
