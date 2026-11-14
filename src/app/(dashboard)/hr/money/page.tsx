"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, Notice, rupees, rupeesShort } from "@/components/workflow";

/** Team advances, loans and expense claims. Managers check claims; BH + MP sign both in Approvals. */
export default function HrMoneyPage() {
  const { user, can } = useSession();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"claims" | "advances">("claims");
  const load = useCallback(() => {
    api<any>("/api/hr/advances").then(setD).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const others = (x: any) => String(x.employee) !== String(user?.userId);
  const toCheck = d.claims.filter((c: any) => c.status === "SUBMITTED" && others(c));
  const active = d.advances.filter((a: any) => a.status === "ACTIVE");
  const verify = async (id: string, decision: "VERIFIED" | "REJECTED") => {
    setErr(null);
    try {
      await api(`/api/hr/claims/${id}`, { method: "POST", json: { decision, reason: reason[id] } });
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="People"
        title="Advances & claims"
        description="Claims: the reporting manager or HR checks the bill, then the Business Head and the Managing Partner approve; approved amounts are paid with the next salary. Advances and loans need both approvals and are recovered from salary automatically."
        actions={can("approvals.sign") && <Link href="/approvals" className="text-sm font-semibold text-brand-700">Open approvals →</Link>}
      />
      {err && <Notice>{err}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Claims to check" value={toCheck.length} tone="amber" />
        <StatCard label="With BH / MP" value={d.claims.filter((c: any) => c.status === "VERIFIED").length} tone="sky" />
        <StatCard label="Approved, unpaid" value={rupeesShort(d.claims.filter((c: any) => c.status === "APPROVED").reduce((s: number, c: any) => s + c.amount, 0))} sub="goes into next payroll" tone="emerald" />
        <StatCard label="Loans outstanding" value={rupeesShort(active.reduce((s: number, a: any) => s + a.balance, 0))} sub={`${active.length} active`} tone="brand" />
      </div>
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {(["claims", "advances"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === t ? "bg-ink-900 text-white" : "text-slate-600")}>
            {t === "claims" ? "Expense claims" : "Advances & loans"}
          </button>
        ))}
      </div>
      {tab === "claims" ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {d.claims.map((c: any) => (
              <li key={c._id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {c.employeeName} · {rupees(c.amount)} · {c.category.toLowerCase().replace("_", " ")}
                    {c.kmTravelled ? ` · ${c.kmTravelled} km` : ""}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {c.code} · {c.date} · {c.description}
                    {c.verifiedByName ? ` · checked by ${c.verifiedByName}` : ""}
                    {c.rejectReason ? ` · ${c.rejectReason}` : ""}
                  </p>
                </div>
                {c.bill && (
                  <a className="text-xs font-semibold text-brand-700" href={`/api/files/${c.bill}`} target="_blank" rel="noreferrer">
                    Bill
                  </a>
                )}
                <StatusBadge status={c.status === "VERIFIED" ? "UNDER_REVIEW" : c.status} label={c.status === "VERIFIED" ? "WITH BH / MP" : undefined} />
                {c.status === "SUBMITTED" && others(c) && (
                  <span className="flex w-full items-center gap-2 sm:w-auto">
                    <Input id={`cr-${c._id}`} className="h-9 sm:w-40" placeholder="Reason to reject" value={reason[c._id] || ""} onChange={(e) => setReason({ ...reason, [c._id]: e.target.value })} />
                    <Button size="sm" variant="outline" onClick={() => verify(c._id, "REJECTED")}>
                      <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={() => verify(c._id, "VERIFIED")}>
                      <Check className="h-4 w-4" /> Checked
                    </Button>
                  </span>
                )}
              </li>
            ))}
            {d.claims.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No claims.</li>}
          </ul>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Advances & loans</CardTitle>
            <CardDescription>Instalments are deducted in payroll and booked when the payroll is locked.</CardDescription>
          </CardHeader>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {d.advances.map((a: any) => (
              <li key={a._id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {a.employeeName} · {a.kind === "LOAN" ? "Loan" : "Advance"} {rupees(a.amount)}
                    {a.kind === "LOAN" ? ` · ${rupees(a.emi)} × ${a.tenureMonths}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {a.code} · balance {rupees(a.balance)}
                    {a.startPeriod ? ` · recovering from ${a.startPeriod}` : ""} · {a.recoveries.length} instalment(s) recovered · {a.reason}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
            {d.advances.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">None.</li>}
          </ul>
        </Card>
      )}
    </div>
  );
}
