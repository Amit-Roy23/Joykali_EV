"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileUp, Loader2, Lock, Paperclip, PauseCircle, PlayCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader, PageSkeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, ReasonModal } from "@/components/workflow";

const LABEL: Record<string, string> = {
  RC: "Registration certificate (RC)",
  INSURANCE: "Insurance policy",
  PUC: "Pollution under control (PUC)",
  FITNESS: "Fitness certificate",
  PERMIT: "Goods carriage permit",
  ROAD_TAX: "Road tax",
};
const STATE: Record<string, { label: string; cls: string }> = {
  VALID: { label: "Valid", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  EXPIRING: { label: "Expiring soon", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  EXPIRED: { label: "Expired", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  MISSING: { label: "Missing", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export default function FleetVehiclePage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<string | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);

  const load = useCallback(() => {
    api<any>(`/api/fleet/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <PageSkeleton />;
  const v = data.vehicle;
  const c = data.compliance;
  const manage = can("fleet.manage");

  const update = async (json: any) => {
    try {
      await api(`/api/fleet/${id}`, { method: "PUT", json });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        backHref="/fleet"
        eyebrow={`${v.makeModel} · ${v.fuel.toLowerCase()} · ${v.capacityUnits} units`}
        title={<span className="font-mono">{v.registrationNo}</span>}
        description={v.ownership === "HIRED" ? `Hired from ${v.transporterName || "transporter"}${v.transporterGstin ? ` (${v.transporterGstin})` : ""}` : "Company owned"}
        actions={
          manage && (
            <>
              {v.manualHold ? (
                <Button size="sm" variant="outline" onClick={() => update({ hold: null })}>
                  <PlayCircle className="h-4 w-4" /> Release hold
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setHoldOpen(true)}>
                  <PauseCircle className="h-4 w-4" /> Put on hold
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => update({ status: v.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })}>
                {v.status === "ACTIVE" ? "Deactivate" : "Activate"}
              </Button>
            </>
          )
        }
      />

      <div
        className={cn(
          "mb-4 flex items-start gap-3 rounded-2xl border p-4",
          c.locked ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
        )}
      >
        {c.locked ? <Lock className="mt-0.5 h-5 w-5 shrink-0" /> : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />}
        <div>
          <p className="font-semibold">{c.locked ? "Locked — cannot be loaded or dispatched" : "Cleared for dispatch"}</p>
          <p className="text-sm">{c.locked ? c.reasons.join(" · ") : c.expiringSoon.length ? `Renew soon: ${c.expiringSoon.map((e: any) => `${LABEL[e.type] || e.type} in ${e.daysLeft} day(s)`).join(", ")}` : "All required documents are valid."}</p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>The latest validity of each document counts. {v.fuel === "ELECTRIC" ? "Electric vehicles are exempt from PUC." : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {c.docs.map((d: any) => {
                const history = v.documents.filter((x: any) => x.type === d.type).sort((a: any, b: any) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
                const latest = history[0];
                return (
                  <li key={d.type} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {LABEL[d.type] || d.type} {!d.required && <span className="text-xs font-normal text-slate-400">(optional)</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {latest ? (
                            <>
                              No. <span className="font-mono">{latest.number}</span>
                              {latest.issuer ? ` · ${latest.issuer}` : ""} · valid until {latest.validUpto ? dt(latest.validUpto) : "lifetime"}
                            </>
                          ) : (
                            "Not uploaded"
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", STATE[d.state].cls)}>
                          {STATE[d.state].label}
                          {d.state === "EXPIRING" ? ` · ${d.daysLeft}d` : ""}
                        </span>
                        {latest?.file && (
                          <a href={`/api/files/${latest.file}`} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title={latest.fileName}>
                            <Paperclip className="h-4 w-4" />
                          </a>
                        )}
                        {manage && (
                          <Button size="sm" variant="outline" onClick={() => setDocType(d.type)}>
                            {latest ? <RefreshCw className="h-3.5 w-3.5" /> : <FileUp className="h-3.5 w-3.5" />} {latest ? "Renew" : "Upload"}
                          </Button>
                        )}
                      </div>
                    </div>
                    {history.length > 1 && (
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        History: {history.slice(1).map((h: any) => `${h.number} (till ${h.validUpto ? dt(h.validUpto) : "—"})`).join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        <Card className="p-4 sm:p-5">
          <p className="mb-2 font-display text-[15px] font-semibold">Recent trips</p>
          {data.trips.length === 0 ? (
            <p className="text-sm text-slate-500">No trips yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.trips.map((t: any) => (
                <li key={t._id}>
                  <Link href={`/dispatch/${t._id}`} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-semibold">{t.doCode}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        {t.partySnapshot?.name} · {t.loading?.driverName} · {dt(t.dispatch?.at || t.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={t.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {docType && <DocModal type={docType} vehicleId={id} onClose={() => setDocType(null)} onSaved={() => { setDocType(null); load(); }} />}
      <ReasonModal
        open={holdOpen}
        title="Put vehicle on hold"
        description="A held vehicle is locked (e.g. breakdown, accident, under repair) until the hold is released."
        confirmLabel="Put on hold"
        onClose={() => setHoldOpen(false)}
        onConfirm={async (reason) => {
          await api(`/api/fleet/${id}`, { method: "PUT", json: { hold: reason } });
          setHoldOpen(false);
          load();
        }}
      />
    </div>
  );
}

function DocModal({ type, vehicleId, onClose, onSaved }: { type: string; vehicleId: string; onClose: () => void; onSaved: () => void }) {
  const [number, setNumber] = useState("");
  const [validUpto, setValidUpto] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [issuer, setIssuer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("type", type);
    fd.set("number", number);
    fd.set("validUpto", validUpto);
    fd.set("issuedOn", issuedOn);
    fd.set("issuer", issuer);
    if (file) fd.set("file", file);
    try {
      const res = await fetch(`/api/fleet/${vehicleId}/documents`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Upload failed");
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={LABEL[type] || type} description="Upload the new or renewed document. The latest validity is used for the lock check." maxWidth="md">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Document / policy / certificate number</Label>
          <Input value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Issued on</Label>
            <Input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Valid until {type === "RC" ? "(blank = lifetime)" : ""}</Label>
            <Input type="date" value={validUpto} onChange={(e) => setValidUpto(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Issued by</Label>
          <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder={type === "INSURANCE" ? "Insurance company" : "RTO / testing centre"} />
        </div>
        <div className="space-y-1.5">
          <Label>Scan (PDF / JPG / PNG, max 2 MB)</Label>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || number.trim().length < 3 || (!validUpto && type !== "RC")} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save document
          </Button>
        </div>
      </div>
    </Modal>
  );
}
