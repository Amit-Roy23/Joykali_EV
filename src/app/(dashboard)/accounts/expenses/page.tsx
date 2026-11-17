"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Paperclip, Plus, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, Notice, rupees, rupeesShort } from "@/components/workflow";
import { Field } from "@/components/network";
import { AccountsTabs, istToday, monthStart, PayModal } from "@/components/accounts";

const STATUS_BADGE: Record<string, [string, string]> = {
  PENDING_APPROVAL: ["PENDING_APPROVAL", "WITH BH / MP"],
  APPROVED: ["APPROVED", "TO PAY"],
  PAID: ["PAID", "PAID"],
  REJECTED: ["REJECTED", "REJECTED"],
  CANCELLED: ["CANCELLED", "CANCELLED"],
};

export default function ExpensesPage() {
  const { can, user } = useSession();
  const [meta, setMeta] = useState<any>(null);
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [pay, setPay] = useState<any | null>(null);
  const [filter, setFilter] = useState({ status: "", category: "", from: monthStart(), to: istToday() });
  const load = useCallback(() => {
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as any);
    api<any[]>(`/api/accounts/expenses?${q}`).then(setList).catch((e) => setErr(e.message));
  }, [filter]);
  useEffect(() => {
    api<any>("/api/accounts/meta").then(setMeta).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  const byHead = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of (list || []).filter((x) => ["APPROVED", "PAID"].includes(x.status))) m.set(e.category, (m.get(e.category) || 0) + e.total);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  if (!meta || !list) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const sum = (s: string[]) => list.filter((e) => s.includes(e.status)).reduce((t, e) => t + e.total, 0);
  const cancel = async (e: any) => {
    const reason = prompt(`Cancel ${e.code}? Reason:`);
    if (!reason) return;
    try {
      await api(`/api/accounts/expenses/${e._id}`, { method: "POST", json: { action: "cancel", reason } });
      load();
    } catch (x: any) {
      setErr(x.message);
    }
  };
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Accounts"
        title="Company expenses"
        description={`Rent, power, fuel, repairs and every other running cost, with the bill attached. Bills of ₹${(meta.expenseApprovalPaise / 100).toLocaleString("en-IN")} or more need the Business Head and then the Managing Partner before Accounts pays.`}
        actions={
          <Button onClick={() => setForm(true)}>
            <Plus className="h-4 w-4" /> Expense
          </Button>
        }
      />
      {can("accounts.view") && <AccountsTabs />}
      {err && <Notice>{err}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Booked (approved + paid)" value={rupeesShort(sum(["APPROVED", "PAID"]))} tone="brand" />
        <StatCard label="Paid" value={rupeesShort(sum(["PAID"]))} tone="emerald" />
        <StatCard label="Approved, to pay" value={rupeesShort(sum(["APPROVED"]))} tone="amber" />
        <StatCard label="With BH / MP" value={rupeesShort(sum(["PENDING_APPROVAL"]))} sub={can("approvals.sign") ? "sign in Approvals" : undefined} tone="sky" />
      </div>
      {byHead.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {byHead.map(([h, v]) => (
            <span key={h} className="rounded-full bg-white px-2.5 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
              {h}: {rupees(v)}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-500">
          From
          <Input id="ex-from" type="date" className="mt-1 h-9 w-40" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          To
          <Input id="ex-to" type="date" className="mt-1 h-9 w-40" value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
        </label>
        <select id="ex-status" className="field h-9 w-40" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_BADGE).map(([k, [, l]]) => (
            <option key={k} value={k}>
              {l.toLowerCase()}
            </option>
          ))}
        </select>
        <select id="ex-cat" className="field h-9 w-52" value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}>
          <option value="">All heads</option>
          {meta.expenseCategories.map((c: string) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {list.map((e) => (
            <li key={e._id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {e.category} · {rupees(e.total)}
                  {e.gstAmount ? <span className="font-normal text-slate-500"> (GST {rupees(e.gstAmount)}{e.gstInput ? ", input credit" : ""})</span> : null}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {e.code} · {e.date} · {e.description}
                  {e.vendor ? ` · ${e.vendor}` : ""}
                  {e.billNo ? ` · bill ${e.billNo}` : ""} · {e.costCentre} · by {e.createdByName}
                  {e.payment ? ` · paid ${e.payment.date} by ${e.payment.byName}` : ""}
                  {e.rejectReason ? ` · ${e.rejectReason}` : ""}
                </p>
              </div>
              {e.bill && (
                <a className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700" href={`/api/files/${e.bill}`} target="_blank" rel="noreferrer">
                  <Paperclip className="h-3.5 w-3.5" /> Bill
                </a>
              )}
              <StatusBadge status={STATUS_BADGE[e.status][0]} label={STATUS_BADGE[e.status][1]} />
              {e.status === "PENDING_APPROVAL" && can("approvals.sign") && (
                <Link href="/approvals" className="text-xs font-semibold text-brand-700">
                  Approve →
                </Link>
              )}
              {e.status === "APPROVED" && meta.canManage && (
                <Button size="sm" onClick={() => setPay(e)}>
                  <Wallet className="h-4 w-4" /> Pay
                </Button>
              )}
              {["PENDING_APPROVAL", "APPROVED"].includes(e.status) && (meta.canManage || String(e.createdBy) === String(user?.userId)) && (
                <button className="text-xs font-semibold text-rose-600" onClick={() => cancel(e)}>
                  Cancel
                </button>
              )}
            </li>
          ))}
          {list.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No expenses for this filter.</li>}
        </ul>
      </Card>
      {form && <ExpenseForm meta={meta} onClose={() => setForm(false)} onSaved={load} />}
      <PayModal
        open={!!pay}
        title={pay ? `Pay ${pay.code}` : ""}
        description={pay ? `${pay.category} · ${pay.description}` : ""}
        amount={pay?.total || 0}
        onClose={() => setPay(null)}
        onPay={async (v) => {
          await api("/api/accounts/payouts", { method: "POST", json: { kind: "expense", id: pay._id, ...v } });
          load();
        }}
      />
    </div>
  );
}

function ExpenseForm({ meta, onClose, onSaved }: { meta: any; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<any>({ date: istToday(), category: "", description: "", vendor: "", billNo: "", amount: "", gst: "", gstInput: false, costCentre: "Head office", payAccount: "", payReference: "" });
  const [bill, setBill] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const total = (Number(v.amount) || 0) + (Number(v.gst) || 0);
  const needsApproval = total * 100 >= meta.expenseApprovalPaise;
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const f = new FormData();
      Object.entries(v).forEach(([k, x]) => f.append(k, String(x)));
      if (needsApproval) f.set("payAccount", "");
      if (bill) f.append("bill", bill);
      const res = await fetch("/api/accounts/expenses", { method: "POST", body: f });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title="Record an expense" description="Attach the bill for anything of ₹2,000 or more." maxWidth="xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bill date">
          <Input id="e-date" type="date" max={istToday()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </Field>
        <Field label="Expense head">
          <select id="e-cat" className="field" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
            <option value="">Choose…</option>
            {meta.expenseCategories.map((c: string) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="What for" className="sm:col-span-2">
          <Input id="e-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="e.g. Warehouse rent for November" />
        </Field>
        <Field label="Vendor / paid to">
          <Input id="e-vendor" value={v.vendor} onChange={(e) => setV({ ...v, vendor: e.target.value })} />
        </Field>
        <Field label="Bill no.">
          <Input id="e-bill" value={v.billNo} onChange={(e) => setV({ ...v, billNo: e.target.value })} />
        </Field>
        <Field label="Amount before GST (₹)">
          <Input id="e-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value.replace(/[^\d.]/g, "") })} />
        </Field>
        <Field label="GST on bill (₹)">
          <Input id="e-gst" inputMode="decimal" value={v.gst} onChange={(e) => setV({ ...v, gst: e.target.value.replace(/[^\d.]/g, "") })} />
        </Field>
        <Field label="Cost centre">
          <select id="e-cc" className="field" value={v.costCentre} onChange={(e) => setV({ ...v, costCentre: e.target.value })}>
            {meta.costCentres.map((c: string) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Bill (PDF / photo)">
          <Input id="e-file" type="file" accept="application/pdf,image/*" onChange={(e) => setBill(e.target.files?.[0] || null)} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={v.gstInput} onChange={(e) => setV({ ...v, gstInput: e.target.checked })} /> GST input credit can be claimed on this bill (company GSTIN on it)
        </label>
        {meta.canManage && !needsApproval && (
          <>
            <Field label="Paid now from (optional)">
              <select id="e-pay" className="field" value={v.payAccount} onChange={(e) => setV({ ...v, payAccount: e.target.value })}>
                <option value="">Not paid yet</option>
                {meta.accounts.map((a: any) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            {v.payAccount && (
              <Field label="Payment reference">
                <Input id="e-payref" value={v.payReference} onChange={(e) => setV({ ...v, payReference: e.target.value })} />
              </Field>
            )}
          </>
        )}
      </div>
      <p className="mt-3 text-sm">
        Total <span className="font-semibold">₹{total.toLocaleString("en-IN")}</span>
        {needsApproval ? " · goes to the Business Head and the Managing Partner for approval" : ""}
      </p>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save expense
        </Button>
      </div>
    </Modal>
  );
}
