"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BookOpen, IndianRupee, Loader2, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, Skeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/components/layout/session";
import { ApprovalPanel, api, CreditMeter, dt, Notice, rupees } from "@/components/workflow";

type PT = "dealer" | "distributor";

/* ------------------------------------------------------------------ */
/* Credit limit panel with change request (BH + MP approval)           */
/* ------------------------------------------------------------------ */
export function CreditPanel({ partyType, partyId }: { partyType: PT; partyId: string }) {
  const { can } = useSession();
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ toLimit: "", creditDays: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<any>(`/api/credit/${partyType}/${partyId}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [partyType, partyId]);
  useEffect(load, [load]);

  if (!data) return <Skeleton className="h-48" />;
  const pending = data.history.find((h: any) => h.status === "PENDING");
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/credit/${partyType}/${partyId}`, {
        method: "POST",
        json: { toLimit: Number(form.toLimit), creditDays: form.creditDays ? Number(form.creditDays) : undefined, reason: form.reason },
      });
      setOpen(false);
      setForm({ toLimit: "", creditDays: "", reason: "" });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="font-display text-[15px] font-semibold">Credit</p>
          {can("credit.request") && !pending && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Change limit
            </Button>
          )}
        </div>
        <CreditMeter credit={data.summary} />
      </Card>
      {pending && (
        <ApprovalPanel
          kind="credit"
          id={pending._id}
          approvals={pending.approvals}
          active
          onDone={load}
          title={`Limit change: ${rupees(pending.fromLimit)} → ${rupees(pending.toLimit)}`}
          note={<>Reason: {pending.reason}</>}
        />
      )}
      {data.history.filter((h: any) => h.status !== "PENDING").length > 0 && (
        <Card className="p-4 sm:p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Limit history</p>
          <ul className="space-y-2 text-xs">
            {data.history
              .filter((h: any) => h.status !== "PENDING")
              .map((h: any) => (
                <li key={h._id} className="flex items-start justify-between gap-2">
                  <span className="text-slate-600">
                    {rupees(h.fromLimit)} → <b className="text-slate-900">{rupees(h.toLimit)}</b>
                    <span className="block text-slate-400">
                      {h.reason} · {dt(h.appliedAt || h.createdAt)}
                    </span>
                  </span>
                  <StatusBadge status={h.status} />
                </li>
              ))}
          </ul>
        </Card>
      )}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Request a credit limit change" description="The new limit applies only after the Business Head and the Managing Partner approve." maxWidth="md">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Current limit {rupees(data.summary.limit)} · {data.summary.creditDays} credit days</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>New limit (₹)</Label>
              <Input inputMode="numeric" value={form.toLimit} onChange={(e) => setForm({ ...form, toLimit: e.target.value.replace(/\D/g, "") })} />
            </div>
            <div className="space-y-1.5">
              <Label>Credit days (optional)</Label>
              <Input inputMode="numeric" value={form.creditDays} onChange={(e) => setForm({ ...form, creditDays: e.target.value.replace(/\D/g, "") })} placeholder={String(data.summary.creditDays)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <textarea className="field h-20 py-2" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          {error && <Notice>{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !form.toLimit || !form.reason.trim()} onClick={submit}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send for approval
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Account ledger with payment recording                               */
/* ------------------------------------------------------------------ */
export function LedgerCard({ partyType, partyId, title = "Account ledger" }: { partyType: PT; partyId: string; title?: string }) {
  const { can } = useSession();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: "", mode: "BANK", reference: "", date: "", narration: "" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<any>(`/api/ledger/${partyType}/${partyId}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [partyType, partyId]);
  useEffect(load, [load]);

  const save = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await api(`/api/ledger/${partyType}/${partyId}`, { method: "POST", json: { ...form, amount: Number(form.amount) } });
      setOpen(false);
      setForm({ amount: "", mode: "BANK", reference: "", date: "", narration: "" });
      load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const TYPE_LABEL: Record<string, string> = { OPENING: "Opening", INVOICE: "Invoice", PAYMENT: "Payment", CREDIT_NOTE: "Credit note", ADJUSTMENT: "Adjustment" };
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {data ? (
              <>
                Outstanding <b className={cn(data.credit.ledgerBalance > 0 ? "text-slate-900" : "text-emerald-700")}>{rupees(data.credit.ledgerBalance)}</b>
                {data.credit.overdue > 0 && <span className="text-rose-600"> · {rupees(data.credit.overdue)} overdue</span>}
              </>
            ) : (
              "Invoices, payments and credit notes"
            )}
          </CardDescription>
        </div>
        {can("ledger.manage") && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <IndianRupee className="h-3.5 w-3.5" /> Record payment
          </Button>
        )}
      </CardHeader>
      {error && <Notice className="mx-5 mb-4">{error}</Notice>}
      {!data ? (
        <Skeleton className="mx-5 mb-5 h-32" />
      ) : data.entries.length === 0 ? (
        <EmptyState icon={BookOpen} title="No transactions yet" className="py-8" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.entries.map((e: any) => (
              <TableRow key={e._id}>
                <TableCell className="whitespace-nowrap text-slate-600">{dt(e.date)}</TableCell>
                <TableCell>
                  <p className="font-semibold text-slate-900">
                    {TYPE_LABEL[e.type] || e.type} <span className="font-mono text-xs font-normal text-slate-500">{e.reference}</span>
                  </p>
                  {e.narration && <p className="max-w-xs truncate text-[11px] text-slate-500">{e.narration}</p>}
                </TableCell>
                <TableCell className="text-right">{e.debit ? rupees(e.debit) : ""}</TableCell>
                <TableCell className="text-right text-emerald-700">{e.credit ? rupees(e.credit) : ""}</TableCell>
                <TableCell className="text-right font-semibold">{rupees(e.balance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Record a payment received" description="Reduces the outstanding balance and frees credit." maxWidth="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, "") })} />
            </div>
            <div className="space-y-1.5">
              <Label>Mode</Label>
              <select className="field" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="BANK">Bank transfer (NEFT/RTGS)</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CASH">Cash</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>UTR / cheque no.</Label>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Date received</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Narration</Label>
            <Input value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} placeholder="e.g. against JKI/2026-27/0001" />
          </div>
          {formError && <Notice>{formError}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !Number(form.amount)} onClick={save}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Record payment
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
