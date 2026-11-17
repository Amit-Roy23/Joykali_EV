"use client";

import React, { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { api, Notice, rupeesShort } from "@/components/workflow";
import { AccountsTabs, Amt, fyStart, istToday, RangePicker } from "@/components/accounts";

function Row({ label, v, note, strong, indent, className }: { label: string; v: number; note?: string; strong?: boolean; indent?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline gap-3 px-4 py-2 text-sm", strong && "bg-slate-50 font-semibold", className)}>
      <span className={cn("min-w-0 flex-1", indent && "pl-4")}>
        {label}
        {note && <span className="ml-2 text-xs font-normal text-slate-500">{note}</span>}
      </span>
      <Amt v={v} bold={strong} />
    </div>
  );
}

export default function PnlPage() {
  const [range, setRange] = useState({ from: fyStart(), to: istToday() });
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setP(null);
    setErr(null);
    api<any>(`/api/accounts/pnl?from=${range.from}&to=${range.to}`).then(setP).catch((e) => setErr(e.message));
  }, [range]);
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Accounts"
        title="Profit & loss"
        description="Accrual basis, before GST: sales when billed, each vehicle's purchase cost as cost of sales, salaries for every payroll month in the range, approved expenses by bill date."
        actions={
          <a href={`/api/accounts/pnl?from=${range.from}&to=${range.to}&format=xlsx`}>
            <Button variant="outline">
              <Download className="h-4 w-4" /> Excel
            </Button>
          </a>
        }
      />
      <AccountsTabs />
      <RangePicker from={range.from} to={range.to} onChange={setRange} />
      {err && <Notice>{err}</Notice>}
      {!p ? (
        !err && <Skeleton className="h-96" />
      ) : (
        <>
          {p.provisional && <Notice tone="warning">Provisional: a payroll month in this range is not locked yet, so salary figures can still change.</Notice>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Revenue" value={rupeesShort(p.totalRevenue)} sub={`${p.unitsSold} vehicle(s)`} tone="brand" />
            <StatCard label="Gross profit" value={rupeesShort(p.grossProfit)} sub={`${p.grossMarginPct}% margin`} tone="sky" />
            <StatCard label="Expenses" value={rupeesShort(p.totalExpenses)} tone="amber" />
            <StatCard label={p.netProfit >= 0 ? "Net profit" : "Net loss"} value={rupeesShort(p.netProfit)} sub={`${p.netMarginPct}% of revenue`} tone={p.netProfit >= 0 ? "emerald" : "rose"} />
          </div>
          <Card className="mx-auto max-w-3xl overflow-hidden">
            <CardHeader>
              <CardTitle>Profit and loss account</CardTitle>
              <CardDescription>
                {p.from} to {p.to}
              </CardDescription>
            </CardHeader>
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Revenue from operations</p>
              {p.revenue.map((l: any) => (
                <Row key={l.head} label={l.head} note={l.note} v={l.amount} indent />
              ))}
              <Row label="Total revenue" v={p.totalRevenue} strong />
              <Row label={`Less: cost of vehicles sold (${p.unitsSold} at purchase cost)`} v={-p.cogs} indent />
              <Row label={`Gross profit · ${p.grossMarginPct}%`} v={p.grossProfit} strong />
              {p.otherIncome.length > 0 && (
                <>
                  <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Other income</p>
                  {p.otherIncome.map((l: any) => (
                    <Row key={l.head} label={l.head} v={l.amount} indent />
                  ))}
                </>
              )}
              <p className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Expenses</p>
              {p.expenses.map((l: any) => (
                <Row key={l.head} label={l.head} note={l.note} v={-l.amount} indent />
              ))}
              {p.expenses.length === 0 && <p className="px-8 py-2 text-sm text-slate-500">No expenses in this period.</p>}
              <Row label="Total expenses" v={-p.totalExpenses} strong />
              <Row label={`Net ${p.netProfit >= 0 ? "profit" : "loss"} · ${p.netMarginPct}%`} v={p.netProfit} strong className={p.netProfit >= 0 ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"} />
            </div>
          </Card>
          <p className="mx-auto max-w-3xl text-xs text-slate-500">
            Registration and insurance collected from customers are passed on to the RTO and insurer and are not income. GST collected and paid is excluded; expenses with GST input credit are counted before GST. Showroom
            stock moves and warehouse transfers are not sales.
          </p>
        </>
      )}
    </div>
  );
}
