"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Container, Lock, PlusCircle, ShieldCheck, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { api, Notice } from "@/components/workflow";

const STATE_STYLE: Record<string, string> = {
  VALID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  EXPIRING: "bg-amber-50 text-amber-800 ring-amber-200",
  EXPIRED: "bg-rose-50 text-rose-700 ring-rose-200",
  MISSING: "bg-slate-100 text-slate-500 ring-slate-200",
};
const SHORT_DOC: Record<string, string> = { RC: "RC", INSURANCE: "Insurance", PUC: "PUC", FITNESS: "Fitness", PERMIT: "Permit", ROAD_TAX: "Road tax" };

export default function FleetPage() {
  const { can } = useSession();
  const [list, setList] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ registrationNo: "", vehicleType: "TRUCK", makeModel: "", fuel: "DIESEL", capacityUnits: "8", ownership: "OWNED", transporterName: "", transporterGstin: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<any[]>("/api/fleet")
      .then(setList)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const locked = (list || []).filter((f) => f.compliance.locked).length;
  const expiring = (list || []).filter((f) => !f.compliance.locked && f.compliance.expiringSoon.length).length;
  const onTrip = (list || []).filter((f) => f.trip).length;

  const add = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const f = await api<any>("/api/fleet", { method: "POST", json: { ...form, capacityUnits: Number(form.capacityUnits) } });
      window.location.href = `/fleet/${f._id}`;
    } catch (e: any) {
      setFormError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Logistics"
        title="Transport fleet"
        description="Trucks used to carry stock out of the warehouse. A vehicle with a missing or expired RC, insurance, fitness, permit, road tax or PUC is locked and cannot be loaded or dispatched."
        actions={
          can("fleet.manage") && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <PlusCircle className="h-4 w-4" /> Add vehicle
            </Button>
          )
        }
      />
      {error && <Notice className="mb-4">{error}</Notice>}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Vehicles" value={list?.length ?? "–"} icon={Truck} tone="brand" />
        <StatCard label="Locked" value={list ? locked : "–"} sub="papers missing / expired" icon={Lock} tone="rose" />
        <StatCard label="Expiring soon" value={list ? expiring : "–"} sub="renew before lock" icon={AlertTriangle} tone="amber" />
        <StatCard label="On a trip" value={list ? onTrip : "–"} sub="loading or in transit" icon={Container} tone="sky" />
      </div>

      {!list ? (
        <Skeleton className="h-64" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={Truck} title="No transport vehicles yet" description="Add trucks and upload their papers before you dispatch." />
        </Card>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((f) => {
            const c = f.compliance;
            return (
              <li key={f._id}>
                <Link
                  href={`/fleet/${f._id}`}
                  className={cn(
                    "block rounded-2xl border bg-white p-4 shadow-card transition hover:shadow-lift",
                    c.locked ? "border-rose-200" : c.expiringSoon.length ? "border-amber-200" : "border-slate-200/80"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-base font-bold text-slate-900">{f.registrationNo}</p>
                      <p className="truncate text-xs text-slate-500">
                        {f.makeModel} · {f.fuel.toLowerCase()} · {f.capacityUnits} units · {f.ownership === "HIRED" ? `hired (${f.transporterName || "transporter"})` : "own"}
                      </p>
                    </div>
                    {c.locked ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        <Lock className="h-3 w-3" /> LOCKED
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        <ShieldCheck className="h-3 w-3" /> CLEARED
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.docs
                      .filter((d: any) => d.required)
                      .map((d: any) => (
                        <span key={d.type} className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset", STATE_STYLE[d.state])}>
                          {SHORT_DOC[d.type] || d.type}
                          {d.state === "EXPIRING" ? ` · ${d.daysLeft}d` : d.state === "EXPIRED" ? " · expired" : d.state === "MISSING" ? " · missing" : ""}
                        </span>
                      ))}
                  </div>
                  {c.locked && <p className="mt-2 text-xs text-rose-600">{c.reasons.join("; ")}</p>}
                  {f.trip && (
                    <p className="mt-2 text-xs text-slate-600">
                      On {f.trip.doCode} → {f.trip.partySnapshot?.name} ({f.trip.status.toLowerCase()})
                    </p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Add transport vehicle" description="It stays locked until its documents are uploaded." maxWidth="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Registration no.</Label>
            <Input value={form.registrationNo} onChange={(e) => setForm({ ...form, registrationNo: e.target.value.toUpperCase() })} placeholder="WB25K4521" />
          </div>
          <div className="space-y-1.5">
            <Label>Make & model</Label>
            <Input value={form.makeModel} onChange={(e) => setForm({ ...form, makeModel: e.target.value })} placeholder="Tata LPT 1109" />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select className="field" value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
              <option value="TRUCK">Truck / car carrier</option>
              <option value="MINI_TRUCK">Mini truck</option>
              <option value="PICKUP">Pickup</option>
              <option value="CONTAINER">Container</option>
              <option value="EV_LOADER">EV loader</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Fuel</Label>
            <select className="field" value={form.fuel} onChange={(e) => setForm({ ...form, fuel: e.target.value })}>
              <option value="DIESEL">Diesel</option>
              <option value="CNG">CNG</option>
              <option value="PETROL">Petrol</option>
              <option value="ELECTRIC">Electric (no PUC needed)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Capacity (vehicles it carries)</Label>
            <Input inputMode="numeric" value={form.capacityUnits} onChange={(e) => setForm({ ...form, capacityUnits: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="space-y-1.5">
            <Label>Ownership</Label>
            <select className="field" value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value })}>
              <option value="OWNED">Company owned</option>
              <option value="HIRED">Hired from transporter</option>
            </select>
          </div>
          {form.ownership === "HIRED" && (
            <>
              <div className="space-y-1.5">
                <Label>Transporter name</Label>
                <Input value={form.transporterName} onChange={(e) => setForm({ ...form, transporterName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Transporter GSTIN / ID (for e-way bill)</Label>
                <Input value={form.transporterGstin} onChange={(e) => setForm({ ...form, transporterGstin: e.target.value.toUpperCase() })} />
              </div>
            </>
          )}
        </div>
        {formError && <Notice className="mt-3">{formError}</Notice>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !form.registrationNo || !form.makeModel} onClick={add}>
            Add vehicle
          </Button>
        </div>
      </Modal>
    </div>
  );
}
