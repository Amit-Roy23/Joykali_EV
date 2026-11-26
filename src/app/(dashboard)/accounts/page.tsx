"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, Landmark, Plus, Wallet } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, Notice, rupees, rupeesShort } from "@/components/workflow";
import { QuickFormModal } from "@/components/network";
import { AccountsTabs, Amt, PayModal } from "@/components/accounts";

const KIND_LABEL: Record<string, string> = { expense: "Expense", payroll: "Salaries", advance: "Advance / loan", settlement: "Full & final", purchase: "Supplier", request: "Request", transfer: "Transfer" };

export default function AccountsOverviewPage() {
  const { can } = useSession();
  const manage = can("accounts.manage");
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pay, setPay] = useState<any | null>(null);
  const [acc, setAcc] = useState<any | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    api<any>("/api/accounts/overview").then(setD).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const cash = d.balances.filter((a: any) => a.kind === "CASH").reduce((s: number, a: any) => s + a.balance, 0);
  const bank = d.balances.filter((a: any) => a.kind === "BANK").reduce((s: number, a: any) => s + a.balance, 0);
  const due = d.payouts.reduce((s: number, p: any) => s + p.amount, 0);
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Accounts"
        title="Accounts"
        description="Cash and bank balances built from every receipt and payment in the system, what is approved and waiting to be paid, and this month's profit."
        actions={
          manage && (
            <Button variant="outline" onClick={() => setAcc({})}>
              <Plus className="h-4 w-4" /> Cash / bank account
            </Button>
          )
        }
      />
      <AccountsTabs />
      {err && <Notice>{err}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cash in hand" value={rupeesShort(cash)} tone="emerald" />
        <StatCard label="In bank" value={rupeesShort(bank)} tone="sky" />
        <StatCard label="Approved, to pay" value={rupeesShort(due)} sub={`${d.payouts.length} item(s)${d.pendingApproval ? ` · ${d.pendingApproval} expense(s) with BH/MP` : ""}`} tone="amber" />
        <StatCard
          label={`Net ${d.pnlMonth.netProfit >= 0 ? "profit" : "loss"} this month`}
          value={rupeesShort(d.pnlMonth.netProfit)}
          sub={`on sales of ${rupeesShort(d.pnlMonth.totalRevenue)}${d.pnlMonth.provisional ? " · provisional" : ""}`}
          tone={d.pnlMonth.netProfit >= 0 ? "brand" : "rose"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Cash & bank accounts</CardTitle>
            <CardDescription>Open an account to see its book with running balance.</CardDescription>
          </CardHeader>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {d.balances.map((a: any) => (
              <li key={a._id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600">{a.kind === "CASH" ? <Banknote className="h-4 w-4" /> : <Landmark className="h-4 w-4" />}</span>
                <Link href={`/accounts/books?account=${a._id}`} className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {a.name} {a.isDefault && <Badge variant="secondary">default</Badge>} {a.status !== "ACTIVE" && <Badge variant="destructive">closed</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {a.kind === "BANK" ? `${a.bankName || ""} ${a.accountNo ? `· …${String(a.accountNo).slice(-4)}` : ""}` : "Cash"} · from {a.openingDate}
                  </p>
                </Link>
                <Amt v={a.balance} bold />
                {manage && (
                  <button className="text-xs font-semibold text-brand-700" onClick={() => setAcc(a)}>
                    Edit
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Payments desk</CardTitle>
            <CardDescription>Approved and waiting to be paid. Paying here posts to the cash or bank book.</CardDescription>
          </CardHeader>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {d.payouts.map((p: any) => (
              <li key={`${p.kind}${p.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <Badge variant="secondary" className="mr-1.5">
                      {KIND_LABEL[p.kind]}
                    </Badge>
                    {p.title}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {p.subtitle} · since {p.since}
                  </p>
                </div>
                <span className="font-semibold tabular">{rupees(p.amount)}</span>
                {manage &&
                  (p.kind === "transfer" ? (
                    <Link href="/accounts/requests">
                      <Button size="sm">
                        <Wallet className="h-4 w-4" /> Do transfer
                      </Button>
                    </Link>
                  ) : (
                    <Button size="sm" onClick={() => setPay(p)}>
                      <Wallet className="h-4 w-4" /> Pay
                    </Button>
                  ))}
              </li>
            ))}
            {d.payouts.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Nothing waiting to be paid.</li>}
          </ul>
        </Card>
      </div>

      <PayModal
        open={!!pay}
        title={pay ? `Pay · ${pay.title}` : ""}
        description={pay?.subtitle}
        amount={pay?.amount || 0}
        partial={pay?.kind === "purchase"}
        onClose={() => setPay(null)}
        onPay={async (v) => {
          await api("/api/accounts/payouts", { method: "POST", json: { kind: pay.kind, id: pay.id, ...v } });
          setNotice(`Paid: ${pay.title}`);
          load();
        }}
      />
      <QuickFormModal
        open={!!acc}
        onClose={() => setAcc(null)}
        title={acc?._id ? `Edit ${acc.name}` : "New cash / bank account"}
        description="The opening balance is the balance at the start of the opening date. Receipts recorded only as 'cash' or 'UPI/bank' go to the default account of that kind."
        submitLabel="Save"
        fields={[
          { key: "name", label: "Name", initial: acc?.name || "" },
          { key: "kind", label: "Type", options: acc?._id ? [[acc.kind, acc.kind === "CASH" ? "Cash" : "Bank"]] : [["BANK", "Bank"], ["CASH", "Cash"]] },
          { key: "bankName", label: "Bank name", initial: acc?.bankName || "" },
          { key: "accountNo", label: "Account number", initial: acc?.accountNo || "" },
          { key: "ifsc", label: "IFSC", initial: acc?.ifsc || "" },
          { key: "openingRupees", label: "Opening balance (₹)", numeric: true, initial: acc?._id ? String((acc.openingBalance || 0) / 100) : "0" },
          { key: "openingDate", label: "Opening date", type: "date", initial: acc?.openingDate || "" },
          { key: "isDefault", label: "Default for its type", options: [["no", acc?.isDefault ? "Yes (keep)" : "No"], ["yes", "Yes"]] },
        ]}
        onSubmit={async (v) => {
          await api(acc?._id ? `/api/accounts/money-accounts/${acc._id}` : "/api/accounts/money-accounts", {
            method: acc?._id ? "PATCH" : "POST",
            json: { ...v, openingRupees: Number(v.openingRupees || 0), isDefault: v.isDefault === "yes" },
          });
          load();
        }}
      />
    </div>
  );
}
