"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Download, FileText, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar, EmptyState, PageHeader, RoleBadge, Skeleton } from "@/components/ui/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { cn } from "@/components/ui/button";

const monthLabel = (run: any) =>
  run ? new Date(Date.UTC(run.year, run.month - 1, 15)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) : "—";

export default function PayslipsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [tab, setTab] = useState<"mine" | "team">("mine");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/payslips").then((r) => r.json()), fetch("/api/auth/me").then((r) => r.json())])
      .then(([p, m]) => {
        if (!p.success) throw new Error(p.error);
        setRows(p.data);
        setMe(String((m.data?.user ?? m.data)?._id ?? (m.data?.user ?? m.data)?.userId ?? ""));
      })
      .catch((e) => setError(e.message || "Failed to load payslips"));
  }, []);

  const mine = useMemo(() => (rows || []).filter((r) => String(r.employee?._id) === me), [rows, me]);
  const others = useMemo(() => (rows || []).filter((r) => String(r.employee?._id) !== me), [rows, me]);
  const hasTeam = others.length > 0;
  const list = (tab === "mine" ? mine : others).filter((r) =>
    !q
      ? true
      : `${r.employee?.name} ${r.employee?.employeeCode} ${r.payslipCode} ${monthLabel(r.payrollRun)}`.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Earnings"
        title="Payslips"
        description="Monthly payslips with salary, incentives and statutory deductions. Released once payroll is approved."
      />

      {hasTeam && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            {(["mine", "team"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
                  tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                )}
              >
                {t === "mine" ? `Mine (${mine.length})` : `Team (${others.length})`}
              </button>
            ))}
          </div>
          {tab === "team" && (
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code or month" className="pl-9" />
            </div>
          )}
        </div>
      )}

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

      {!rows && !error && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {rows && tab === "mine" && (
        mine.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {mine.map((p) => (
              <Card key={p._id} className="group p-4 transition hover:shadow-lift sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-base font-semibold text-slate-900">{monthLabel(p.payrollRun)}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">{p.payslipCode}</p>
                  </div>
                  <StatusBadge status={p.payrollRun?.status} />
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Net pay</p>
                <p className="font-display text-3xl font-bold tracking-tight text-slate-900 tabular">{formatINR(p.netPay)}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center text-[11px]">
                  <div>
                    <p className="text-slate-500">Gross</p>
                    <p className="font-semibold text-slate-900 tabular">{formatINR(p.grossPay, false)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Incentive</p>
                    <p className="font-semibold text-emerald-700 tabular">{formatINR(p.earnings?.incentives || 0, false)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Paid days</p>
                    <p className="font-semibold text-slate-900 tabular">{p.paidDays}/{p.workingDays}</p>
                  </div>
                </div>
                <a
                  href={`/api/payslips/${p._id}/pdf`}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-800"
                >
                  <Download className="h-4 w-4 text-volt-300" /> Download PDF
                </a>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState icon={FileText} title="No payslips released yet" description="Your payslip appears here as soon as the month's payroll is approved." />
          </Card>
        )
      )}

      {rows && tab === "team" && (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((p) => (
                <TableRow key={p._id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.employee?.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{p.employee?.name}</p>
                        <div className="flex items-center gap-1.5">
                          <RoleBadge role={p.employee?.role} short />
                          <span className="font-mono text-[11px] text-slate-500">{p.employee?.employeeCode}</span>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{monthLabel(p.payrollRun)}</TableCell>
                  <TableCell className="text-right">{formatINR(p.grossPay, false)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatINR(p.netPay, false)}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.payrollRun?.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <a href={`/api/payslips/${p._id}/pdf`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                      <Download className="h-3.5 w-3.5" /> PDF
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {list.length === 0 && <EmptyState title="No matching payslips" />}
        </Card>
      )}
    </div>
  );
}
