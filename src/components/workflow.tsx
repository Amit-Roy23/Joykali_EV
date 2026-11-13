"use client";

import React, { useState } from "react";
import { Check, CircleDashed, Loader2, ShieldCheck, X } from "lucide-react";
import { Button, cn } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Label } from "@/components/ui/input";
import { useSession } from "@/components/layout/session";

/* ------------------------------------------------------------------ */
/* Tiny fetch helper: JSON in/out, throws the server's message.        */
/* ------------------------------------------------------------------ */
export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json", ...(init?.headers || {}) } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw new Error(data.error || `Request failed (${res.status})`);
  return data.data as T;
}

export const rupees = (paise: number | undefined | null) =>
  `₹${Math.round((paise || 0) / 100).toLocaleString("en-IN")}`;
export const rupeesShort = (paise: number | undefined | null) => {
  const r = (paise || 0) / 100;
  const a = Math.abs(r);
  const s = r < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)}K`;
  return `${s}₹${Math.round(a)}`;
};
export const dt = (d?: string | Date | null, withTime = false) =>
  d
    ? new Date(d).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
        timeZone: "Asia/Kolkata",
      })
    : "—";

/* ------------------------------------------------------------------ */
/* Inline error / notice banners                                       */
/* ------------------------------------------------------------------ */
export function Notice({ tone = "error", children, className }: { tone?: "error" | "success" | "info" | "warning"; children: React.ReactNode; className?: string }) {
  const t = {
    error: "border-rose-200 bg-rose-50 text-rose-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    info: "border-brand-200 bg-brand-50 text-brand-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-3.5 py-2.5 text-sm", t, className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Business Head → Managing Partner approval chain                      */
/* ------------------------------------------------------------------ */
const CHAIN = [
  { level: "BUSINESS_HEAD", label: "Business Head" },
  { level: "MANAGING_PARTNER", label: "Managing Partner" },
] as const;

export function ApprovalPanel({
  kind,
  id,
  approvals,
  active,
  onDone,
  title = "Approvals",
  note,
}: {
  kind: "order" | "scheme" | "payroll" | "credit" | "salary";
  id: string;
  approvals: any[] | undefined;
  /** Whether the record is still awaiting signatures. */
  active: boolean;
  onDone: () => void;
  title?: string;
  note?: React.ReactNode;
}) {
  const { user } = useSession();
  const [modal, setModal] = useState<null | "APPROVED" | "REJECTED">(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sigs = approvals || [];
  const rejected = sigs.find((s) => s.decision === "REJECTED");
  const nextLevel = rejected ? null : CHAIN.find((c) => !sigs.some((s) => s.level === c.level && s.decision === "APPROVED"))?.level;
  const myTurn = active && !!nextLevel && user?.role === nextLevel;

  const submit = async () => {
    if (!modal) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/approvals/${kind}/${id}`, { method: "POST", json: { decision: modal, note: text } });
      setModal(null);
      setText("");
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-brand-600" />
        <p className="font-display text-[15px] font-semibold text-slate-900">{title}</p>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">Needs the Business Head, then the Managing Partner. Admin cannot approve.</p>
      <ol className="mt-4 space-y-3">
        {CHAIN.map((c, i) => {
          const s = sigs.find((x) => x.level === c.level);
          const isNext = active && nextLevel === c.level;
          return (
            <li key={c.level} className="flex items-start gap-3">
              <div
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ring-1",
                  s?.decision === "APPROVED" && "bg-emerald-50 text-emerald-600 ring-emerald-200",
                  s?.decision === "REJECTED" && "bg-rose-50 text-rose-600 ring-rose-200",
                  !s && isNext && "bg-amber-50 text-amber-600 ring-amber-200",
                  !s && !isNext && "bg-slate-50 text-slate-400 ring-slate-200"
                )}
              >
                {s?.decision === "APPROVED" ? <Check className="h-4 w-4" /> : s?.decision === "REJECTED" ? <X className="h-4 w-4" /> : isNext ? <CircleDashed className="h-4 w-4 animate-spin [animation-duration:3s]" /> : i + 1}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{c.label}</p>
                {s ? (
                  <p className="text-xs text-slate-500">
                    {s.decision === "APPROVED" ? "Approved" : "Rejected"} by {s.byName} · {dt(s.at, true)}
                    {s.note && <span className="block text-slate-600">“{s.note}”</span>}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">{isNext ? "Waiting for signature" : active ? "After the Business Head" : "—"}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {note && <div className="mt-3 text-xs text-slate-500">{note}</div>}
      {myTurn && (
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={() => setModal("APPROVED")}>
            <Check className="h-4 w-4" /> Approve
          </Button>
          <Button variant="outline" className="flex-1 text-rose-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700" onClick={() => setModal("REJECTED")}>
            <X className="h-4 w-4" /> Reject
          </Button>
        </div>
      )}
      {active && user?.role === "ADMIN" && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Admins can view but not sign approvals.</p>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === "APPROVED" ? "Approve" : "Reject"} maxWidth="md">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            {modal === "APPROVED"
              ? user?.role === "BUSINESS_HEAD"
                ? "Your approval sends this to the Managing Partner for final sign-off."
                : "This is the final approval — it takes effect immediately."
              : "Rejecting ends this request. The reason is shown to the requester."}
          </p>
          <div className="space-y-1.5">
            <Label>{modal === "REJECTED" ? "Reason (required)" : "Note (optional)"}</Label>
            <textarea
              className="field h-24 py-2"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={modal === "REJECTED" ? "Why is this rejected?" : "Anything to record with your approval"}
            />
          </div>
          {error && <Notice>{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(null)}>
              Cancel
            </Button>
            <Button
              variant={modal === "REJECTED" ? "destructive" : "default"}
              disabled={busy || (modal === "REJECTED" && !text.trim())}
              onClick={submit}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {modal === "APPROVED" ? "Approve" : "Reject"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Credit position meter                                                */
/* ------------------------------------------------------------------ */
export function CreditMeter({ credit, compact = false }: { credit: any; compact?: boolean }) {
  if (!credit) return null;
  const limit = credit.limit || 0;
  const used = Math.max(0, credit.exposure || 0);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : used > 0 ? 100 : 0;
  const tone = credit.onHold || credit.available < 0 ? "bg-rose-500" : pct > 85 ? "bg-amber-500" : "bg-brand-600";
  const parts = [
    { k: "Unpaid invoices", v: Math.max(0, credit.ledgerBalance || 0) },
    { k: "Open orders", v: credit.openOrders },
    { k: "On delivery orders", v: credit.pipeline },
    ...(credit.partyType === "DEALER" ? [{ k: "Consignment stock", v: credit.consignment }] : []),
  ];
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Available credit</p>
          <p className={cn("font-display text-2xl font-bold tabular", credit.available < 0 ? "text-rose-600" : "text-slate-900")}>
            {rupeesShort(credit.available)}
          </p>
        </div>
        <p className="text-right text-xs text-slate-500">
          of {rupeesShort(limit)} limit
          <br />
          {credit.creditDays} credit days
        </p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn("h-full rounded-full transition-[width] duration-700", tone)} style={{ width: `${pct}%` }} />
      </div>
      {credit.onHold && (
        <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700">Credit hold — {credit.holdReason}</p>
      )}
      {!compact && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {parts.map((p) => (
            <div key={p.k} className="flex justify-between gap-2">
              <dt className="text-slate-500">{p.k}</dt>
              <dd className="font-semibold text-slate-800 tabular">{rupeesShort(p.v)}</dd>
            </div>
          ))}
          {credit.overdue > 0 && (
            <div className="col-span-2 flex justify-between gap-2 text-rose-600">
              <dt>Overdue</dt>
              <dd className="font-semibold tabular">{rupeesShort(credit.overdue)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ask-for-a-reason modal (cancel order / DO, put on hold …)           */
/* ------------------------------------------------------------------ */
export function ReasonModal({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = true,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal isOpen={open} onClose={onClose} title={title} description={description} maxWidth="md">
      <div className="space-y-3">
        <textarea className="field h-24 py-2" value={text} onChange={(e) => setText(e.target.value)} placeholder="Reason" />
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy || !text.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm(text.trim());
                setText("");
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
