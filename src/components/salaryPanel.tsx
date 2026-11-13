"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Calculator, Loader2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { ApprovalPanel, api, dt, Notice, rupees } from "@/components/workflow";

const monthLabel = (d: string | Date) =>
  new Date(d).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

function Breakup({ b }: { b: any }) {
  const rows: Array<[string, number, string?]> = [
    ["Basic", b.basic],
    ["HRA", b.hra],
    ["Conveyance", b.conveyance],
    ["Special allowance", b.otherAllowances],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Earnings / month</p>
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between text-xs">
            <span className="text-slate-500">{k}</span>
            <span className="tabular">{rupees(v)}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-sm font-semibold">
          <span>Gross</span>
          <span className="tabular">{rupees(b.gross)}</span>
        </div>
      </div>
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Employee deductions</p>
        {[
          ["PF (12%, ₹15k ceiling)", b.employee.pf],
          ["ESI (0.75%)", b.employee.esi],
          ["Professional tax (WB)", b.employee.professionalTax],
        ].map(([k, v]) => (
          <div key={k as string} className="flex justify-between text-xs">
            <span className="text-slate-500">{k}</span>
            <span className="tabular">{rupees(v as number)}</span>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-sm font-semibold text-emerald-700">
          <span>Take-home</span>
          <span className="tabular">{rupees(b.netTakeHome)}</span>
        </div>
      </div>
      <div className="rounded-xl bg-ink-900 p-3 text-white">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cost to company</p>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Employer PF</span>
          <span className="tabular">{rupees(b.employer.pf)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Employer ESI (3.25%)</span>
          <span className="tabular">{rupees(b.employer.esi)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-white/10 pt-1 text-sm font-semibold">
          <span>Monthly CTC</span>
          <span className="tabular">{rupees(b.monthlyCtc)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold text-volt-300">
          <span>Annual CTC</span>
          <span className="tabular">{rupees(b.annualCtc)}</span>
        </div>
      </div>
    </div>
  );
}

export function SalaryPanel({ employeeId, isSelf }: { employeeId: string; isSelf: boolean }) {
  const { can } = useSession();
  const [history, setHistory] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api<any[]>(`/api/employees/${employeeId}/salary`)
      .then(setHistory)
      .catch((e) => setError(e.message));
  }, [employeeId]);
  useEffect(load, [load]);

  if (error) return <Notice>{error}</Notice>;
  if (!history) return <Skeleton className="h-48" />;
  const current = history.find((h) => h.isActive) || history.find((h) => ["APPROVED", "SUPERSEDED"].includes(h.status));
  const pending = history.find((h) => h.status === "PENDING_APPROVAL");
  const scheduled = history.filter((h) => h.status === "APPROVED" && !h.isActive && new Date(h.effectiveFrom) > new Date());

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Salary structure</CardTitle>
            <CardDescription>
              {current ? `In force since ${monthLabel(current.effectiveFrom)} · calculated automatically from gross` : "No approved salary yet — payroll skips this employee until one is approved."}
            </CardDescription>
          </div>
          {can("salary.manage") && !isSelf && !pending && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <TrendingUp className="h-4 w-4" /> Revise salary
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {current ? <Breakup b={current.breakup} /> : <p className="text-sm text-slate-500">—</p>}
          {current && (
            <p className="mt-3 text-xs text-slate-500">
              PAN {current.pan} · {current.bankDetails?.bankName} A/C {current.bankDetails?.accountNo} (IFSC {current.bankDetails?.ifsc})
            </p>
          )}
          {scheduled.map((s) => (
            <Notice key={s._id} tone="info" className="mt-3">
              Approved revision to {rupees(s.gross)}/month takes effect from {monthLabel(s.effectiveFrom)}.
            </Notice>
          ))}
        </CardContent>
      </Card>

      {pending && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle>Proposed revision — from {monthLabel(pending.effectiveFrom)}</CardTitle>
              <CardDescription>
                {pending.reason} · proposed by {pending.proposedBy?.name} on {dt(pending.createdAt)}
                {current && ` · ${pending.gross >= current.gross ? "+" : ""}${(((pending.gross - current.gross) / current.gross) * 100).toFixed(1)}% on gross`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Breakup b={pending.breakup} />
            </CardContent>
          </Card>
          <ApprovalPanel kind="salary" id={pending._id} approvals={pending.approvals} active onDone={load} title="Revision approval" />
        </div>
      )}

      {history.filter((h) => h !== current && h !== pending && !scheduled.includes(h)).length > 0 && (
        <Card className="p-4 sm:p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Salary history</p>
          <ul className="space-y-1.5 text-sm">
            {history
              .filter((h) => h !== current && h !== pending && !scheduled.includes(h))
              .map((h) => (
                <li key={h._id} className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">
                    {rupees(h.gross)}/month from {monthLabel(h.effectiveFrom)}
                    {h.reason && <span className="text-xs text-slate-400"> · {h.reason}</span>}
                  </span>
                  <StatusBadge status={h.status} />
                </li>
              ))}
          </ul>
        </Card>
      )}

      {open && <ReviseModal employeeId={employeeId} current={current} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function ReviseModal({ employeeId, current, onClose, onSaved }: { employeeId: string; current: any; onClose: () => void; onSaved: () => void }) {
  const now = new Date(Date.now() + 330 * 60000);
  const nextMonth = `${now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()}-${String(((now.getUTCMonth() + 1) % 12) + 1).padStart(2, "0")}`;
  const [mode, setMode] = useState<"GROSS" | "CTC">("GROSS");
  const [amount, setAmount] = useState(current ? String(Math.round(current.gross / 100)) : "");
  const [flags, setFlags] = useState(current?.fixedDeductions || { pf: true, esi: true, professionalTax: true });
  const [effectiveMonth, setEffectiveMonth] = useState(nextMonth);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number(amount)) return setPreview(null);
    const t = setTimeout(() => {
      api<any>("/api/salary/preview", { method: "POST", json: { mode, amount: Number(amount), flags } })
        .then((p) => setPreview(p.breakup))
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [mode, amount, flags]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/employees/${employeeId}/salary`, { method: "POST", json: { mode, amount: Number(amount), flags, effectiveMonth, reason } });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Revise salary" description="Enter a monthly gross or an annual CTC — the components, deductions and CTC are calculated automatically. Takes effect after Business Head and Managing Partner approval." maxWidth="4xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr]">
          <div className="space-y-1.5">
            <Label>Enter as</Label>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {(["GROSS", "CTC"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", mode === m ? "bg-white shadow-sm" : "text-slate-500")}>
                  {m === "GROSS" ? "Monthly gross" : "Annual CTC"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{mode === "GROSS" ? "Gross per month (₹)" : "Annual CTC (₹)"}</Label>
            <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="space-y-1.5">
            <Label>Effective from</Label>
            <Input type="month" value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(
            [
              ["pf", "Provident Fund"],
              ["esi", "ESI (applies only up to ₹21,000 gross)"],
              ["professionalTax", "Professional tax"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!flags[k]} onChange={(e) => setFlags({ ...flags, [k]: e.target.checked })} />
              {l}
            </label>
          ))}
        </div>
        {preview ? (
          <>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
              <Calculator className="h-3.5 w-3.5" /> Automatic breakup
              {current && ` · ${preview.gross >= current.gross ? "+" : ""}${rupees(preview.gross - current.gross)} on gross vs current`}
            </p>
            <Breakup b={preview} />
          </>
        ) : (
          <p className="text-sm text-slate-500">Enter an amount to see the breakup.</p>
        )}
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. annual appraisal, promotion" />
        </div>
        {error && <Notice>{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !preview || !reason.trim()} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send for approval
          </Button>
        </div>
      </div>
    </Modal>
  );
}
