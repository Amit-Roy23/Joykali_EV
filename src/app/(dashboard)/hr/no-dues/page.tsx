"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, FileCheck2, Info, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { api, dt, Notice } from "@/components/workflow";

const STATUS: Record<string, { label: string; tone: any }> = {
  OPEN: { label: "Being cleared by HR", tone: "warning" },
  PENDING_APPROVAL: { label: "Waiting for BH / MP", tone: "info" },
  ISSUED: { label: "Issued", tone: "success" },
  REJECTED: { label: "Rejected", tone: "destructive" },
  CANCELLED: { label: "Cancelled", tone: "secondary" },
};

/**
 * No dues certificate: HR opens it for someone leaving → the system checks what they still owe or hold →
 * HR ticks what was handed back → the Business Head or Managing Partner approves → PDF with a QR check.
 */
export default function NoDuesPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [decide, setDecide] = useState<null | { nd: any; action: "approve" | "reject" | "cancel" }>(null);
  const load = useCallback(() => {
    api<any>("/api/hr/no-dues").then(setD).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  const post = async (id: string, json: any, msg?: string) => {
    setErr(null);
    setOk(null);
    try {
      await api(`/api/hr/no-dues/${id}`, { method: "POST", json });
      if (msg) setOk(msg);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const open = async (employeeId: string) => {
    setErr(null);
    try {
      await api("/api/hr/no-dues", { method: "POST", json: { employeeId } });
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="People"
        title="No dues certificates"
        description="For an employee who is leaving. The system checks their settlement, loans, claims, cash, payment requests, areas and team; HR ticks what was handed back; the Business Head or the Managing Partner approves; then the certificate can be downloaded."
      />
      {err && <Notice>{err}</Notice>}
      {ok && <Notice tone="success">{ok}</Notice>}
      {!d ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          {d.canOpen && d.leaving.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Leaving — no certificate yet</p>
              <div className="divide-y divide-slate-100">
                {d.leaving.map((r: any) => (
                  <div key={r._id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="flex-1">
                      <b>{r.employeeName}</b> · last day {r.acceptedLwd} ·{" "}
                      <span className="text-slate-500">{r.status === "SETTLED" ? "settlement approved" : r.status === "SETTLEMENT_PENDING" ? "settlement waiting for approval" : "settlement not worked out yet"}</span>
                    </span>
                    {String(r.employee) !== d.me && (
                      <Button size="sm" onClick={() => open(String(r.employee))} data-open={r.employeeName}>
                        Start no dues
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
          {d.list.length === 0 ? (
            <Card>
              <EmptyState icon={FileCheck2} title="No certificates yet" description="Start one when someone's resignation has been accepted." />
            </Card>
          ) : (
            d.list.map((nd: any) => {
              const blocked = (nd.checks || []).filter((c: any) => c.level === "block" && !c.ok);
              const pendingItems = nd.items.filter((i: any) => i.status === "PENDING");
              const isMe = String(nd.employee) === d.me;
              return (
                <Card key={nd._id} className="space-y-3 p-4" data-nd={nd.employeeCode}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-semibold">{nd.employeeName}</p>
                      <p className="text-xs text-slate-500">
                        {nd.designation} · {nd.employeeCode} · last working day {nd.lastWorkingDay}
                        {nd.code && <> · certificate <span className="font-mono">{nd.code}</span></>}
                      </p>
                      {nd.remarks && <p className="mt-1 text-xs text-amber-700">{nd.remarks}</p>}
                    </div>
                    <Badge variant={STATUS[nd.status].tone}>{STATUS[nd.status].label}</Badge>
                  </div>

                  {nd.checks && (
                    <div className="rounded-lg ring-1 ring-slate-200">
                      <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">Checked by the system (live)</p>
                      {nd.checks.map((c: any) => (
                        <div key={c.key} className="flex items-start gap-2 border-b border-slate-50 px-3 py-1.5 text-sm last:border-0">
                          {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : c.level === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
                          <span className="flex-1">
                            {c.label}
                            <span className={cn("block text-xs", c.ok ? "text-slate-500" : c.level === "info" ? "text-slate-500" : "text-rose-700")}>{c.detail}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="rounded-lg ring-1 ring-slate-200">
                    <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">Handed back (HR ticks)</p>
                    {nd.items.map((i: any) => (
                      <div key={i.key} className="flex flex-wrap items-center gap-2 border-b border-slate-50 px-3 py-1.5 text-sm last:border-0">
                        <span className="flex-1">
                          {i.label}
                          {i.byName && i.status !== "PENDING" && (
                            <span className="block text-xs text-slate-500">
                              {i.status === "NA" ? "Not applicable" : "Cleared"} · {i.byName} · {dt(i.at)}
                            </span>
                          )}
                        </span>
                        {nd.status === "OPEN" && d.canOpen && !isMe ? (
                          <div className="flex gap-1">
                            {[
                              ["CLEARED", "Cleared"],
                              ["NA", "N/A"],
                              ["PENDING", "Pending"],
                            ].map(([k, l]) => (
                              <button
                                key={k}
                                data-item={`${i.key}-${k}`}
                                onClick={() => post(nd._id, { action: "tick", key: i.key, status: k })}
                                className={cn("h-7 rounded-md px-2 text-xs font-semibold ring-1", i.status === k ? (k === "PENDING" ? "bg-amber-100 text-amber-800 ring-amber-200" : "bg-emerald-600 text-white ring-emerald-600") : "bg-white text-slate-600 ring-slate-200")}
                              >
                                {l}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <Badge variant={i.status === "PENDING" ? "warning" : "success"}>{i.status === "PENDING" ? "Pending" : i.status === "NA" ? "N/A" : "Cleared"}</Badge>
                        )}
                      </div>
                    ))}
                  </div>

                  {nd.status === "ISSUED" && (
                    <p className="text-xs text-slate-600">
                      Approved by <b>{nd.decision?.byName}</b> ({nd.decision?.role === "MANAGING_PARTNER" ? "Managing Partner" : "Business Head"}) on {dt(nd.decision?.at)}
                      {nd.decision?.note ? ` — ${nd.decision.note}` : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap justify-end gap-2">
                    {nd.status === "OPEN" && d.canOpen && !isMe && (
                      <Button id={`submit-${nd.employeeCode}`} disabled={blocked.length > 0 || pendingItems.length > 0} onClick={() => post(nd._id, { action: "submit" }, "Sent to the Business Head / Managing Partner.")}>
                        Send for approval
                      </Button>
                    )}
                    {nd.status === "OPEN" && (blocked.length > 0 || pendingItems.length > 0) && d.canOpen && (
                      <span className="self-center text-xs text-slate-500">
                        {blocked.length ? `${blocked.length} check(s) not clear` : ""}
                        {blocked.length && pendingItems.length ? " · " : ""}
                        {pendingItems.length ? `${pendingItems.length} item(s) to tick` : ""}
                      </span>
                    )}
                    {nd.status === "PENDING_APPROVAL" && d.canDecide && !isMe && (
                      <>
                        <Button variant="outline" onClick={() => setDecide({ nd, action: "reject" })}>
                          Send back
                        </Button>
                        <Button id={`approve-${nd.employeeCode}`} onClick={() => setDecide({ nd, action: "approve" })}>
                          Approve & issue
                        </Button>
                      </>
                    )}
                    {["OPEN", "PENDING_APPROVAL"].includes(nd.status) && (d.canOpen || d.canDecide) && !isMe && (
                      <Button variant="ghost" onClick={() => setDecide({ nd, action: "cancel" })}>
                        Cancel
                      </Button>
                    )}
                    {nd.status === "ISSUED" && (
                      <a href={`/api/hr/no-dues/${nd._id}/pdf`} target="_blank" rel="noreferrer">
                        <Button id={`pdf-${nd.employeeCode}`}>
                          <Download className="h-4 w-4" /> Download certificate
                        </Button>
                      </a>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </>
      )}
      {decide && (
        <DecideModal
          {...decide}
          onClose={() => setDecide(null)}
          onDone={(m) => {
            setDecide(null);
            setOk(m);
            load();
          }}
        />
      )}
    </div>
  );
}

function DecideModal({ nd, action, onClose, onDone }: { nd: any; action: "approve" | "reject" | "cancel"; onClose: () => void; onDone: (m: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/hr/no-dues/${nd._id}`, { method: "POST", json: action === "cancel" ? { action, reason: note } : { action, note } });
      onDone(action === "approve" ? `No dues certificate issued for ${nd.employeeName}.` : action === "reject" ? "Sent back to HR." : "Cancelled.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const needNote = action !== "approve";
  return (
    <Modal isOpen onClose={onClose} title={`${action === "approve" ? "Approve & issue" : action === "reject" ? "Send back" : "Cancel"} — ${nd.employeeName}`}>
      {action === "approve" && <p className="mb-3 text-sm text-slate-600">The system checks are run again now. Once approved, the certificate gets its number and can be downloaded and verified by QR code.</p>}
      <Label>{needNote ? "Reason" : "Note (optional)"}</Label>
      <Input id="nd-note" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <Notice className="mt-3">{error}</Notice>}
      <div className="modal-actions mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Back
        </Button>
        <Button id="nd-go" disabled={busy || (needNote && !note.trim())} onClick={go}>
          {action === "approve" ? "Approve & issue" : action === "reject" ? "Send back" : "Cancel certificate"}
        </Button>
      </div>
    </Modal>
  );
}
