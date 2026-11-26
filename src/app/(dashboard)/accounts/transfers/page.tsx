"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, Landmark, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, Notice, rupees, rupeesShort } from "@/components/workflow";
import { AccountsTabs, RangePicker, fyStart } from "@/components/accounts";

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const DIRS: Array<[string, string]> = [
  ["", "All"],
  ["Bank → Bank", "Bank → Bank"],
  ["Bank → Cash", "Bank → Cash in hand"],
  ["Cash → Bank", "Cash → Bank"],
];
const STATUS: Record<string, { label: string; tone: any }> = {
  PENDING: { label: "Waiting for approval", tone: "warning" },
  APPROVED: { label: "Approved — to do", tone: "info" },
  DONE: { label: "Done", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "secondary" },
};

/** Every movement of money between bank accounts and cash in hand — with who asked, approved and did it. */
export default function TransfersPage() {
  const [range, setRange] = useState({ from: fyStart(), to: istToday() });
  const [dir, setDir] = useState("");
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    const p = new URLSearchParams({ from: range.from, to: range.to });
    if (dir) p.set("direction", dir);
    api<any>(`/api/accounts/transfers?${p}`).then(setD).catch((e) => setErr(e.message));
  }, [range, dir]);
  useEffect(load, [load]);
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Accounts"
        title="Bank & cash transfers"
        description="Bank to bank, bank to cash in hand (withdrawals) and cash to bank (deposits). A new transfer is asked for, approved by the Admin / Business Head, then done by the cashier — it then appears in both books."
        actions={
          <Link href="/accounts/requests">
            <Button>
              <Plus className="h-4 w-4" /> New transfer
            </Button>
          </Link>
        }
      />
      <AccountsTabs />
      {err && <Notice>{err}</Notice>}
      {!d ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Bank → Bank" value={rupeesShort(d.totals.bankToBank)} icon={Landmark} tone="sky" />
            <StatCard label="Bank → Cash (withdrawn)" value={rupeesShort(d.totals.bankToCash)} icon={Banknote} tone="amber" />
            <StatCard label="Cash → Bank (deposited)" value={rupeesShort(d.totals.cashToBank)} icon={Landmark} tone="emerald" />
            <StatCard label="Waiting (approval / cashier)" value={d.totals.waiting} tone={d.totals.waiting ? "amber" : "slate"} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <RangePicker from={range.from} to={range.to} onChange={setRange} />
            <div className="flex gap-1">
              {DIRS.map(([k, label]) => (
                <button key={label} onClick={() => setDir(k)} className={cn("h-9 rounded-lg px-3 text-xs font-semibold ring-1 ring-slate-200", dir === k ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {d.rows.length === 0 ? (
            <EmptyState icon={Landmark} title="No transfers" description="No money moved between bank and cash in this period." />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>From → To</TableHead>
                      <TableHead>What for</TableHead>
                      <TableHead>Asked / approved / done by</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.rows.map((r: any) => (
                      <TableRow key={r.kind + r.id} className={cn(r.status === "CANCELLED" && "opacity-60")}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {r.date}
                          <p className="font-mono text-[11px] text-slate-500">{r.code}</p>
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="font-semibold">{r.from}</span> <ArrowRight className="inline h-3 w-3" /> <span className="font-semibold">{r.to}</span>
                          <p className="text-[11px] text-brand-700">{r.direction}</p>
                        </TableCell>
                        <TableCell className="max-w-[280px] text-xs text-slate-600">
                          {r.purpose}
                          {r.reference && <p className="text-[11px] text-slate-500">Ref {r.reference}</p>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {r.requestedBy || "—"}
                          {r.approvedBy && <p className="text-[11px]">✓ {r.approvedBy}</p>}
                          {r.doneBy && <p className="text-[11px] text-emerald-700">done by {r.doneBy}</p>}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular">{rupees(r.amount)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS[r.status]?.tone}>{STATUS[r.status]?.label || r.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
