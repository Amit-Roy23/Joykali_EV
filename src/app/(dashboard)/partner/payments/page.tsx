"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Loader2, Paperclip, Send } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { api, dt, Notice, rupees, rupeesShort } from "@/components/workflow";
import { Field } from "@/components/network";
import { PAY_MODES, today } from "@/components/payments";

/** Partner: tell the company about a payment, follow its confirmation, download receipts. */
export default function PartnerPaymentsPage() {
  const [advices, setAdvices] = useState<any[] | null>(null);
  const [reg, setReg] = useState<any>(null);
  const [credit, setCredit] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [v, setV] = useState<any>({ amount: "", date: today(), mode: "NEFT", utr: "", payerBank: "", note: "" });
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [paysCompany, setPaysCompany] = useState(true);
  const load = useCallback(() => {
    api<any[]>("/api/payments/advices").then(setAdvices).catch((e) => setErr(e.message));
    api<any>("/api/payments/receipts?from=2000-01-01").then(setReg).catch(() => setReg({ rows: [], total: 0 }));
    api<any>("/api/dashboard")
      .then((d) => {
        setCredit(d.credit);
        setPaysCompany(!!d.buysFromCompany);
      })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  const send = async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const f = new FormData();
      Object.entries(v).forEach(([k, x]) => f.append(k, String(x)));
      if (proof) f.append("proof", proof);
      const r = await fetch("/api/payments/advices", { method: "POST", body: f }).then((x) => x.json());
      if (!r.success) throw new Error(r.error);
      setMsg(`Sent as ${r.data.code}. Accounts will check the bank and confirm; you will get a notification with the receipt.`);
      setV({ amount: "", date: today(), mode: "NEFT", utr: "", payerBank: "", note: "" });
      setProof(null);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const withdraw = async (id: string) => {
    try {
      await api(`/api/payments/advices/${id}`, { method: "POST", json: { action: "withdraw" } });
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  if (!advices) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="My business"
        title="Payments"
        description="Paid the company? Tell us here with the UTR or cheque number and a screenshot. Accounts matches it with the bank and confirms — the receipt then appears below and your outstanding goes down."
        actions={
          <Link href="/account" className="text-sm font-semibold text-brand-700">
            My account statement →
          </Link>
        }
      />
      {err && <Notice>{err}</Notice>}
      {msg && <Notice tone="success">{msg}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Outstanding" value={credit ? rupeesShort(credit.ledgerBalance) : "—"} sub={credit?.overdue ? `${rupees(credit.overdue)} overdue` : undefined} tone={credit?.overdue ? "rose" : "brand"} />
        <StatCard label="Waiting for confirmation" value={advices.filter((a) => a.status === "SUBMITTED").length} tone="sky" />
        <StatCard label="Paid (confirmed)" value={rupeesShort(reg?.total || 0)} sub={`${reg?.rows?.length || 0} receipt(s)`} tone="emerald" />
        <StatCard label="Credit available" value={credit ? rupeesShort(Math.max(0, credit.available)) : "—"} tone="slate" />
      </div>
      {paysCompany ? (
        <Card>
          <CardHeader>
            <CardTitle>Report a payment</CardTitle>
            <CardDescription>Use the UTR shown in your bank or UPI app. The same UTR cannot be reported twice.</CardDescription>
          </CardHeader>
          <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
            <Field label="Amount paid (₹)">
              <Input id="pa-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value.replace(/[^\d.]/g, "") })} />
            </Field>
            <Field label="Paid on">
              <Input id="pa-date" type="date" max={today()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
            <Field label="Paid by">
              <select id="pa-mode" className="field" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}>
                {PAY_MODES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            {v.mode !== "CASH" && (
              <>
                <Field label={v.mode === "CHEQUE" ? "Cheque no." : "UTR / UPI ref."}>
                  <Input id="pa-utr" value={v.utr} onChange={(e) => setV({ ...v, utr: e.target.value.toUpperCase().replace(/\s/g, "") })} />
                </Field>
                <Field label="From your bank">
                  <Input id="pa-bank" value={v.payerBank} onChange={(e) => setV({ ...v, payerBank: e.target.value })} placeholder="e.g. SBI Bardhaman" />
                </Field>
                <Field label="Screenshot / slip">
                  <Input id="pa-proof" type="file" accept="image/*,application/pdf" onChange={(e) => setProof(e.target.files?.[0] || null)} />
                </Field>
              </>
            )}
            <Field label="Note (optional)" className="sm:col-span-2">
              <Input id="pa-note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} placeholder="e.g. against invoice JKI/2026-27/0001" />
            </Field>
            <div className="flex items-end">
              <Button className="w-full" disabled={busy || !Number(v.amount)} onClick={send}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send to Accounts
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Notice tone="info">You buy from a distributor, so you pay them directly and they record it. Your statement is under My Account.</Notice>
      )}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Reported payments</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {advices.map((a) => (
            <li key={a._id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {rupees(a.amount)} · {a.mode} <span className="font-mono text-xs">{a.utr}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {a.code} · paid {a.date}
                  {a.receiptNo ? ` · receipt ${a.receiptNo}` : ""}
                  {a.rejectReason ? ` · not accepted: ${a.rejectReason}` : ""}
                </p>
              </div>
              {a.proof && (
                <a href={`/api/files/${a.proof}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                  <Paperclip className="h-3.5 w-3.5" /> Proof
                </a>
              )}
              <StatusBadge status={a.status === "SUBMITTED" ? "PENDING_APPROVAL" : a.status === "VERIFIED" ? "APPROVED" : "REJECTED"} label={a.status === "SUBMITTED" ? "WITH ACCOUNTS" : a.status === "VERIFIED" ? "CONFIRMED" : a.status} />
              {a.status === "SUBMITTED" && (
                <button className="text-xs font-semibold text-rose-600" onClick={() => withdraw(a._id)}>
                  Withdraw
                </button>
              )}
            </li>
          ))}
          {advices.length === 0 && <li className="px-4 py-4 text-sm text-slate-500">Nothing reported yet.</li>}
        </ul>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Receipts</CardTitle>
          <CardDescription>Payments the company has received from you.</CardDescription>
        </CardHeader>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {(reg?.rows || []).map((r: any) => (
            <li key={r._id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <b className="font-mono">{r.reference}</b> · {dt(r.date)} · <Badge variant="secondary">{r.modeLabel}</Badge> <span className="font-mono text-xs">{r.utr || ""}</span>
              </span>
              <span className="font-semibold tabular">{rupees(r.credit)}</span>
              <a href={`/api/payments/receipt/${r._id}/pdf`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                <Download className="h-3.5 w-3.5" /> Receipt
              </a>
            </li>
          ))}
          {!reg?.rows?.length && <li className="px-4 py-4 text-sm text-slate-500">No receipts yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
