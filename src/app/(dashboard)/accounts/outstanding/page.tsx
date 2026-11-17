"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/button";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { api, Notice, rupees, rupeesShort } from "@/components/workflow";
import { AccountsTabs } from "@/components/accounts";

function AgeTable({ rows, buckets, totals, total, name, href }: { rows: any[]; buckets: string[]; totals: any; total: number; name: (r: any) => React.ReactNode; href?: (r: any) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Party</th>
            {buckets.map((b) => (
              <th key={b} className="px-3 py-2 text-right">
                {b} days
              </th>
            ))}
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2">{href ? <Link href={href(r)} className="font-medium text-brand-700">{name(r)}</Link> : name(r)}</td>
              {buckets.map((b) => (
                <td key={b} className={cn("px-3 py-2 text-right tabular", b === "90+" && r.buckets[b] > 0 && "font-semibold text-rose-600", b === "61-90" && r.buckets[b] > 0 && "text-amber-700")}>
                  {r.buckets[b] ? rupees(r.buckets[b]) : "—"}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-semibold tabular">{rupees(r.total)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="px-3 py-3 text-slate-500" colSpan={buckets.length + 2}>
                Nothing outstanding.
              </td>
            </tr>
          )}
          {rows.length > 0 && (
            <tr className="bg-slate-50 font-semibold">
              <td className="px-3 py-2">Total</td>
              {buckets.map((b) => (
                <td key={b} className="px-3 py-2 text-right tabular">
                  {rupees(totals[b])}
                </td>
              ))}
              <td className="px-3 py-2 text-right tabular">{rupees(total)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Who owes the company (with ageing) and whom the company owes. */
export default function OutstandingPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<any>("/api/accounts/outstanding").then(setD).catch((e) => setErr(e.message));
  }, []);
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const overdue90 = d.receivableTotals["90+"] + d.receivableTotals["61-90"];
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader eyebrow="Accounts" title="Outstanding" description={`As of ${d.asOf}. Payments are set against the oldest bills first, so the age shown is the age of the bills still unpaid.`} />
      <AccountsTabs />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Receivable from partners" value={rupeesShort(d.receivableTotal)} sub={`${d.receivables.length} partner(s)`} tone="brand" />
        <StatCard label="Over 60 days" value={rupeesShort(overdue90)} tone={overdue90 ? "rose" : "slate"} />
        <StatCard label="Payable to suppliers" value={rupeesShort(d.payableTotal)} tone="amber" />
        <StatCard label="Other approved payments" value={rupeesShort(d.otherPayableTotal)} sub="salaries, expenses, advances" tone="sky" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Receivables — dealers and distributors</CardTitle>
          <CardDescription>Company account of each partner: invoices less payments and credit notes.</CardDescription>
        </CardHeader>
        <AgeTable
          rows={d.receivables}
          buckets={d.buckets}
          totals={d.receivableTotals}
          total={d.receivableTotal}
          name={(r) => `${r.name}${r.code ? ` (${r.code})` : ""} · ${r.partyType === "DEALER" ? "dealer" : "distributor"} · ${r.creditDays} d credit`}
          href={(r) => (r.partyType === "DEALER" ? `/dealers/${r.party}` : `/distributors/${r.party}`)}
        />
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Payables — suppliers</CardTitle>
          <CardDescription>Unpaid purchase invoices. Pay them from the Accounts payments desk.</CardDescription>
        </CardHeader>
        <AgeTable rows={d.payables} buckets={d.buckets} totals={d.payableTotals} total={d.payableTotal} name={(r) => `${r.name} · ${r.invoices} invoice(s)`} />
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Other approved payments</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {d.otherPayables.map((p: any) => (
            <li key={`${p.kind}${p.id}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {p.title} <span className="text-xs text-slate-500">· {p.subtitle}</span>
              </span>
              <span className="font-semibold tabular">{rupees(p.amount)}</span>
            </li>
          ))}
          {d.otherPayables.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">None.</li>}
        </ul>
      </Card>
    </div>
  );
}
