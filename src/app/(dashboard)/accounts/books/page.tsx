"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader, Skeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, Notice, rupees } from "@/components/workflow";
import { Field } from "@/components/network";
import { AccountsTabs, Amt, istToday, monthStart, RangePicker } from "@/components/accounts";

export default function BooksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Books />
    </Suspense>
  );
}

function Books() {
  const sp = useSearchParams();
  const { can } = useSession();
  const [meta, setMeta] = useState<any>(null);
  const [account, setAccount] = useState(sp.get("account") || "");
  const [range, setRange] = useState({ from: monthStart(), to: istToday() });
  const [book, setBook] = useState<any>(null);
  const [view, setView] = useState<"lines" | "days" | "vouchers">("lines");
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newV, setNewV] = useState(false);
  useEffect(() => {
    api<any>("/api/accounts/meta")
      .then((m) => {
        setMeta(m);
        setAccount((a) => a || (m.accounts.find((x: any) => x.kind === "CASH" && x.isDefault) || m.accounts[0])?._id || "");
      })
      .catch((e) => setErr(e.message));
  }, []);
  const load = useCallback(() => {
    if (!account) return;
    setErr(null);
    api<any>(`/api/accounts/book?account=${account}&from=${range.from}&to=${range.to}`).then(setBook).catch((e) => setErr(e.message));
    api<any[]>(`/api/accounts/vouchers?from=${range.from}&to=${range.to}`).then(setVouchers).catch(() => {});
  }, [account, range]);
  useEffect(load, [load]);
  const cancelV = async (v: any) => {
    const reason = prompt(`Cancel ${v.code}? Reason:`);
    if (!reason) return;
    try {
      await api(`/api/accounts/vouchers/${v._id}`, { method: "POST", json: { reason } });
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  if (!meta) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const acc = meta.accounts.find((a: any) => a._id === account);
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Accounts"
        title={acc?.kind === "BANK" ? "Bank book" : "Cash book"}
        description="Every receipt and payment of the account — retail sales, partner payments, deposits, supplier payments, expenses, salaries, advances and vouchers — with opening, running and closing balance."
        actions={
          <div className="flex flex-wrap gap-2">
            {meta.canManage && (
              <Button onClick={() => setNewV(true)}>
                <Plus className="h-4 w-4" /> Voucher
              </Button>
            )}
            {book && (
              <a href={`/api/accounts/book?account=${account}&from=${range.from}&to=${range.to}&format=xlsx`}>
                <Button variant="outline">
                  <Download className="h-4 w-4" /> Excel
                </Button>
              </a>
            )}
          </div>
        }
      />
      <AccountsTabs />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-500">
          Account
          <select id="bk-acc" className="field mt-1 h-9 w-56" value={account} onChange={(e) => setAccount(e.target.value)}>
            {meta.accounts.map((a: any) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <RangePicker from={range.from} to={range.to} onChange={setRange} />
      </div>
      {err && <Notice>{err}</Notice>}
      {!book ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-slate-200 text-sm ring-1 ring-slate-200 sm:grid-cols-4">
            {[
              ["Opening", book.opening],
              ["Receipts", book.inflow],
              ["Payments", -book.outflow],
              ["Closing", book.closing],
            ].map(([l, v]: any) => (
              <div key={l} className="bg-white p-3">
                <p className="text-xs text-slate-500">{l}</p>
                <p className="text-lg font-bold">
                  <Amt v={v} />
                </p>
              </div>
            ))}
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            {(
              [
                ["lines", "Entries"],
                ["days", "Day-wise"],
                ["vouchers", "Vouchers"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", view === k ? "bg-ink-900 text-white" : "text-slate-600")}>
                {l}
              </button>
            ))}
          </div>
          <Card className="overflow-x-auto">
            {view === "lines" && (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Particulars</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2 text-right">Receipts</th>
                    <th className="px-3 py-2 text-right">Payments</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50/60 font-semibold">
                    <td className="px-3 py-2">{book.from}</td>
                    <td className="px-3 py-2" colSpan={4}>
                      Opening balance
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Amt v={book.opening} />
                    </td>
                  </tr>
                  {book.lines.map((l: any, i: number) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap px-3 py-2">{l.date}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{l.source}</p>
                        <p className="text-xs text-slate-500">
                          {l.party}
                          {l.party && l.narration ? " · " : ""}
                          {l.narration}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{l.reference}</td>
                      <td className="px-3 py-2 text-right tabular text-emerald-700">{l.inflow ? rupees(l.inflow) : ""}</td>
                      <td className="px-3 py-2 text-right tabular text-rose-700">{l.outflow ? rupees(l.outflow) : ""}</td>
                      <td className="px-3 py-2 text-right">
                        <Amt v={l.balance} />
                      </td>
                    </tr>
                  ))}
                  {book.lines.length === 0 && (
                    <tr>
                      <td className="px-3 py-3 text-slate-500" colSpan={6}>
                        No entries in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {view === "days" && (
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Opening</th>
                    <th className="px-3 py-2 text-right">Receipts</th>
                    <th className="px-3 py-2 text-right">Payments</th>
                    <th className="px-3 py-2 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {book.days.map((d: any) => (
                    <tr key={d.date}>
                      <td className="px-3 py-2">{d.date}</td>
                      <td className="px-3 py-2 text-right"><Amt v={d.opening} /></td>
                      <td className="px-3 py-2 text-right tabular">{rupees(d.inflow)}</td>
                      <td className="px-3 py-2 text-right tabular">{rupees(d.outflow)}</td>
                      <td className="px-3 py-2 text-right font-semibold"><Amt v={d.closing} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {view === "vouchers" && (
              <ul className="divide-y divide-slate-100">
                {vouchers.map((v) => (
                  <li key={v._id} className={cn("flex flex-wrap items-center gap-2 px-4 py-3 text-sm", v.status === "CANCELLED" && "opacity-50")}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {v.code} · {v.type === "CONTRA" ? `${v.account?.name} → ${v.toAccount?.name}` : `${v.type === "RECEIPT" ? "Receipt into" : "Payment from"} ${v.account?.name}`} · {v.head}
                      </p>
                      <p className="text-xs text-slate-500">
                        {v.date} · {v.narration} · by {v.createdByName}
                        {v.status === "CANCELLED" ? ` · cancelled: ${v.cancelReason}` : ""}
                      </p>
                    </div>
                    <span className="font-semibold tabular">{rupees(v.amount)}</span>
                    {meta.canManage && v.status === "POSTED" && (
                      <button className="text-xs font-semibold text-rose-600" onClick={() => cancelV(v)}>
                        Cancel
                      </button>
                    )}
                  </li>
                ))}
                {vouchers.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No vouchers in this period.</li>}
              </ul>
            )}
          </Card>
        </>
      )}
      {newV && <VoucherForm meta={meta} onClose={() => setNewV(false)} onSaved={load} />}
      {!can("accounts.view") && null}
    </div>
  );
}

function VoucherForm({ meta, onClose, onSaved }: { meta: any; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<any>({ type: "PAYMENT", date: istToday(), accountId: meta.accounts[0]?._id || "", toAccountId: "", amountRupees: "", head: "", narration: "", reference: "" });
  const [err, setErr] = useState<string | null>(null);
  const heads: string[] = meta.voucherHeads[v.type] || [];
  const save = async () => {
    setErr(null);
    try {
      await api("/api/accounts/vouchers", { method: "POST", json: { ...v, amountRupees: Number(v.amountRupees) } });
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title="New voucher" description="Receipt: money in that is not from a sale or partner (interest, capital, scrap). Payment: money out not covered by an expense bill. Contra: cash deposited in or withdrawn from a bank.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <select id="v-type" className="field" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value, head: "" })}>
            <option value="PAYMENT">Payment</option>
            <option value="RECEIPT">Receipt</option>
            <option value="CONTRA">Contra (between accounts)</option>
          </select>
        </Field>
        <Field label="Date">
          <Input id="v-date" type="date" max={istToday()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </Field>
        <Field label={v.type === "CONTRA" ? "From account" : v.type === "RECEIPT" ? "Into account" : "From account"}>
          <select id="v-acc" className="field" value={v.accountId} onChange={(e) => setV({ ...v, accountId: e.target.value })}>
            {meta.accounts.map((a: any) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        {v.type === "CONTRA" ? (
          <Field label="To account">
            <select id="v-to" className="field" value={v.toAccountId} onChange={(e) => setV({ ...v, toAccountId: e.target.value })}>
              <option value="">Choose…</option>
              {meta.accounts
                .filter((a: any) => a._id !== v.accountId)
                .map((a: any) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
        ) : (
          <Field label="Amount (₹)">
            <Input id="v-amt" inputMode="decimal" value={v.amountRupees} onChange={(e) => setV({ ...v, amountRupees: e.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
        )}
        {v.type === "CONTRA" && (
          <Field label="Amount (₹)">
            <Input id="v-amt2" inputMode="decimal" value={v.amountRupees} onChange={(e) => setV({ ...v, amountRupees: e.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
        )}
        <Field label="Account head">
          <select id="v-head" className="field" value={v.head} onChange={(e) => setV({ ...v, head: e.target.value })}>
            <option value="">Choose…</option>
            {heads.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Narration" className="sm:col-span-2">
          <Input id="v-nar" value={v.narration} onChange={(e) => setV({ ...v, narration: e.target.value })} />
        </Field>
        <Field label="Party / cheque / UTR (optional)" className="sm:col-span-2">
          <Input id="v-ref" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
        </Field>
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>Post voucher</Button>
      </div>
    </Modal>
  );
}
