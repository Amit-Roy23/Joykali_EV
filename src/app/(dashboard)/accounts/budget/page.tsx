"use client";

import React, { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, Notice, rupees, rupeesShort } from "@/components/workflow";
import { AccountsTabs, istToday } from "@/components/accounts";

function Var({ v }: { v: { budget: number; actual: number; diff: number; pct: number | null } }) {
  if (!v.budget) return <span className="text-xs text-slate-400">no budget</span>;
  const over = v.diff > 0;
  return (
    <span className={cn("text-xs font-semibold", over ? "text-rose-600" : "text-emerald-700")}>
      {over ? "▲" : "▼"} {rupees(Math.abs(v.diff))} ({v.pct}%)
    </span>
  );
}

function Bar({ budget, actual }: { budget: number; actual: number }) {
  if (!budget) return null;
  const pct = Math.min(100, Math.round((actual / budget) * 100));
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={cn("h-full rounded-full", actual > budget ? "bg-rose-500" : pct > 85 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function BudgetPage() {
  const { can } = useSession();
  const [period, setPeriod] = useState(istToday().slice(0, 7));
  const [d, setD] = useState<any>(null);
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setD(null);
    api<any>(`/api/accounts/budget?period=${period}`).then(setD).catch((e) => setErr(e.message));
  }, [period]);
  const save = async () => {
    setErr(null);
    try {
      setD(await api<any>("/api/accounts/budget", { method: "PUT", json: { period, rows: Object.entries(edit || {}).map(([head, v]) => ({ head, amountRupees: Number(v) || 0 })) } }));
      setEdit(null);
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Accounts"
        title="Budget vs actual"
        description="Monthly budget per expense head against what was actually booked — for the month, and for the financial year so far over the months that have a budget. Salaries include employer PF/ESI and incentives."
        actions={
          can("accounts.manage") &&
          d &&
          !edit && (
            <Button variant="outline" onClick={() => setEdit(Object.fromEntries(d.rows.map((r: any) => [r.head, r.month.budget ? String(r.month.budget / 100) : ""])))}>
              <Pencil className="h-4 w-4" /> Set budget for {period}
            </Button>
          )
        }
      />
      <AccountsTabs />
      <label className="text-xs font-semibold text-slate-500">
        Month
        <Input id="bg-month" type="month" className="mt-1 h-9 w-44" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
      </label>
      {err && <Notice>{err}</Notice>}
      {!d ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label={`Budget ${period}`} value={rupeesShort(d.totals.month.budget)} tone="brand" />
            <StatCard label="Actual" value={rupeesShort(d.totals.month.actual)} tone={d.totals.month.diff > 0 && d.totals.month.budget ? "rose" : "emerald"} />
            <StatCard label={`Budget FY ${d.fy} to date`} value={rupeesShort(d.totals.ytd.budget)} sub="budgeted months" tone="sky" />
            <StatCard label="Actual, same months" value={rupeesShort(d.totals.ytd.actual)} tone={d.totals.ytd.diff > 0 && d.totals.ytd.budget ? "rose" : "emerald"} />
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Head</th>
                  <th className="px-3 py-2 text-right">Budget</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                  <th className="px-3 py-2 text-right">FY budget*</th>
                  <th className="px-3 py-2 text-right">FY actual</th>
                  <th className="px-3 py-2 text-right">FY variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {d.rows.map((r: any) => (
                  <tr key={r.head}>
                    <td className="px-3 py-2">
                      {r.head}
                      <Bar budget={r.month.budget} actual={r.month.actual} />
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      {edit ? (
                        <Input id={`bg-${r.head}`} className="ml-auto h-8 w-28 text-right" inputMode="decimal" value={edit[r.head] || ""} onChange={(e) => setEdit({ ...edit, [r.head]: e.target.value.replace(/[^\d.]/g, "") })} />
                      ) : r.month.budget ? (
                        rupees(r.month.budget)
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{r.month.actual ? rupees(r.month.actual) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Var v={r.month} />
                    </td>
                    <td className="px-3 py-2 text-right tabular">{r.ytd.budget ? rupees(r.ytd.budget) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular" title={`All months this year: ${rupees(r.ytd.actualAll)}`}>
                      {r.ytd.budget ? rupees(r.ytd.actual) : r.ytd.actualAll ? <span className="text-slate-400">{rupees(r.ytd.actualAll)}</span> : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Var v={r.ytd} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="text-xs text-slate-500">* Financial-year columns cover only the months that have a budget for that head. Grey figures are this year's spend on heads with no budget.</p>
          {edit && (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button onClick={save}>Save budget</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
