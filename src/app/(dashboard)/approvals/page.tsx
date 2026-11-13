"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, Loader2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { Label } from "@/components/ui/input";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees } from "@/components/workflow";

const KIND_TONE: Record<string, "default" | "info" | "volt" | "warning" | "success"> = {
  order: "info",
  scheme: "volt",
  payroll: "default",
  credit: "warning",
  salary: "success",
};

export default function ApprovalsPage() {
  const { user } = useSession();
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [modal, setModal] = useState<null | { item: any; decision: "APPROVED" | "REJECTED" }>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    api<any[]>("/api/approvals")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const mine = (items || []).filter((i) => i.canSign);
  const shown = tab === "mine" && user?.role !== "ADMIN" ? mine : items || [];

  const sign = async () => {
    if (!modal) return;
    setBusy(true);
    setModalError(null);
    try {
      const r = await api<any>(`/api/approvals/${modal.item.kind}/${modal.item.id}`, {
        method: "POST",
        json: { decision: modal.decision, note },
      });
      setFlash(
        modal.decision === "REJECTED"
          ? `Rejected: ${modal.item.title}`
          : r.status === "APPROVED"
          ? `Approved and in effect: ${modal.item.title}`
          : `Approved — sent to the Managing Partner: ${modal.item.title}`
      );
      setModal(null);
      setNote("");
      load();
    } catch (e: any) {
      setModalError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Two-signature control"
        title="Approvals"
        description="Orders, incentive schemes, payroll, credit limits and salary revisions take effect only after the Business Head and then the Managing Partner approve."
      />

      {user?.role !== "ADMIN" && (
        <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
          {(["mine", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition", tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
            >
              {t === "mine" ? `Waiting for me (${mine.length})` : `Everything pending (${items?.length ?? 0})`}
            </button>
          ))}
        </div>
      )}
      {user?.role === "ADMIN" && <Notice tone="info" className="mb-4">Admins can see every pending approval but cannot sign.</Notice>}
      {flash && <Notice tone="success" className="mb-4">{flash}</Notice>}
      {error && <Notice className="mb-4">{error}</Notice>}

      {!items ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={BadgeCheck} title={tab === "mine" ? "Nothing waiting for you" : "Nothing pending"} description="New requests appear here as soon as they are raised." />
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {shown.map((i) => (
            <li key={`${i.kind}-${i.id}`} className={cn("rounded-2xl border bg-white p-4 shadow-card sm:p-5", i.canSign ? "border-amber-200" : "border-slate-200/80")}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={KIND_TONE[i.kind] || "default"}>{i.kindLabel}</Badge>
                    <span className="text-[11px] text-slate-500">raised {dt(i.submittedAt)}</span>
                    {i.waitingFor && (
                      <span className={cn("text-[11px] font-semibold", i.canSign ? "text-amber-700" : "text-slate-500")}>
                        · waiting for {i.canSign ? "you" : i.waitingFor}
                      </span>
                    )}
                  </div>
                  <Link href={i.href} className="mt-1.5 block truncate font-display text-base font-semibold text-slate-900 hover:text-brand-700">
                    {i.title}
                  </Link>
                  <p className="truncate text-sm text-slate-500">{i.subtitle}</p>
                  {i.signatures?.length > 0 && (
                    <p className="mt-1 text-xs text-emerald-700">
                      ✓ {i.signatures.map((s: any) => `${s.level === "BUSINESS_HEAD" ? "BH" : "MP"} ${s.byName}`).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 md:justify-end">
                  {i.amount != null && <p className="font-display text-lg font-bold text-slate-900 tabular">{rupees(i.amount)}</p>}
                  {i.canSign ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setModal({ item: i, decision: "APPROVED" })}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-rose-600" onClick={() => setModal({ item: i, decision: "REJECTED" })}>
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  ) : (
                    <Link href={i.href} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                      Open <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal?.decision === "APPROVED" ? "Approve" : "Reject"} description={modal?.item.title} maxWidth="md">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {modal?.decision === "REJECTED"
              ? "Rejecting ends the request."
              : user?.role === "BUSINESS_HEAD"
              ? "Your approval sends it to the Managing Partner for the final signature."
              : "This is the final signature — it takes effect immediately."}
          </p>
          <Label>{modal?.decision === "REJECTED" ? "Reason (required)" : "Note (optional)"}</Label>
          <textarea className="field h-24 py-2" value={note} onChange={(e) => setNote(e.target.value)} />
          {modalError && <Notice>{modalError}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button variant={modal?.decision === "REJECTED" ? "destructive" : "default"} disabled={busy || (modal?.decision === "REJECTED" && !note.trim())} onClick={sign}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {modal?.decision === "APPROVED" ? "Approve" : "Reject"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
