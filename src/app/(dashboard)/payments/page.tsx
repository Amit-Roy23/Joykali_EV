"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Download, Paperclip, Plus, X } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees, rupeesShort } from "@/components/workflow";
import { PAY_MODES, ReceiptForm, today } from "@/components/payments";

const monthStart = () => `${today().slice(0, 7)}-01`;

/** Payments from dealers and distributors: what came in, how, into which account, and whether the bank shows it. */
export default function PaymentsPage() {
  const { can } = useSession();
  const manage = can("ledger.manage");
  const [tab, setTab] = useState<"received" | "advices" | "bank">("received");
  const [f, setF] = useState({ from: monthStart(), to: today(), mode: "", account: "", cleared: "" });
  const [reg, setReg] = useState<any>(null);
  const [advices, setAdvices] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const load = useCallback(() => {
    const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any);
    api<any>(`/api/payments/receipts?${q}`).then(setReg).catch((e) => setErr(e.message));
    api<any[]>("/api/payments/advices?status=SUBMITTED,VERIFIED,REJECTED").then(setAdvices).catch(() => {});
  }, [f]);
  useEffect(load, [load]);
  const seesAccounts = can("accounts.view");
  useEffect(() => {
    if (seesAccounts) api<any>("/api/accounts/meta").then((m) => setAccounts(m.accounts)).catch(() => {});
  }, [seesAccounts]);
  const open = advices.filter((a) => a.status === "SUBMITTED");
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Channel & dispatch"
        title="Dealer payments"
        description="Money received from dealers and distributors: how much, how it was paid (NEFT, RTGS, IMPS, UPI, cheque, cash), the UTR or cheque number and the account it went into — and whether the bank statement shows it."
        actions={
          manage && (
            <Button onClick={() => setForm(true)}>
              <Plus className="h-4 w-4" /> Record payment
            </Button>
          )
        }
      />
      {err && <Notice>{err}</Notice>}
      {msg && <Notice tone="success">{msg}</Notice>}
      {!reg ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Received in period" value={rupeesShort(reg.total)} sub={`${reg.rows.length} receipt(s)`} tone="emerald" />
            <StatCard label="Not yet seen in bank" value={rupeesShort(reg.uncleared)} sub="tick when it shows on the statement" tone={reg.uncleared ? "amber" : "slate"} />
            <StatCard label="Reported by partners" value={open.length} sub="waiting for Accounts to confirm" tone={open.length ? "sky" : "slate"} />
            <StatCard label="By mode" value={Object.keys(reg.byMode).length} sub={Object.entries(reg.byMode).map(([k, v]: any) => `${k} ${rupeesShort(v)}`).join(" · ") || "—"} tone="brand" />
          </div>
          <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1">
            {(
              [
                ["received", "Payments received"],
                ["advices", `Reported by partners${open.length ? ` (${open.length})` : ""}`],
                ...(can("accounts.view") ? ([["bank", "Bank matching"]] as const) : []),
              ] as Array<[typeof tab, string]>
            ).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === k ? "bg-ink-900 text-white" : "text-slate-600")}>
                {l}
              </button>
            ))}
          </div>
          {tab === "received" && <Received reg={reg} f={f} setF={setF} accounts={accounts} />}
          {tab === "advices" && <Advices list={advices} manage={manage} accounts={accounts} onDone={(m) => { setMsg(m); load(); }} />}
          {tab === "bank" && <BankMatching accounts={accounts.filter((a) => a.kind === "BANK")} manage={manage || can("accounts.manage")} onDone={load} />}
        </>
      )}
      <ReceiptForm open={form} onClose={() => setForm(false)} onSaved={() => { setMsg("Payment recorded and the partner's account updated."); load(); }} />
    </div>
  );
}

function Received({ reg, f, setF, accounts }: { reg: any; f: any; setF: (x: any) => void; accounts: any[] }) {
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as any);
  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-500">
          From
          <Input id="pf-from" type="date" className="mt-1 h-9 w-40" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          To
          <Input id="pf-to" type="date" className="mt-1 h-9 w-40" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        </label>
        <select id="pf-mode" className="field h-9 w-32" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
          <option value="">All modes</option>
          {PAY_MODES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select id="pf-acc" className="field h-9 w-52" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}>
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a._id} value={a._id}>
              {a.name}
            </option>
          ))}
        </select>
        <select id="pf-clr" className="field h-9 w-44" value={f.cleared} onChange={(e) => setF({ ...f, cleared: e.target.value })}>
          <option value="">Bank: any</option>
          <option value="yes">Seen in bank</option>
          <option value="no">Not yet in bank</option>
        </select>
        <a href={`/api/payments/receipts?${q}&format=xlsx`} className="ml-auto">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4" /> Excel
          </Button>
        </a>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Receipt</th>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">Mode · reference</th>
              <th className="px-3 py-2">Into</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Bank</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reg.rows.map((r: any) => (
              <tr key={r._id}>
                <td className="whitespace-nowrap px-3 py-2">{dt(r.date)}</td>
                <td className="px-3 py-2">
                  <a href={`/api/payments/receipt/${r._id}/pdf`} className="font-mono text-xs font-semibold text-brand-700">
                    {r.reference}
                  </a>
                </td>
                <td className="px-3 py-2">
                  {r.partyName} <span className="text-xs text-slate-500">{r.partyCode}</span>
                </td>
                <td className="px-3 py-2">
                  <Badge variant="secondary">{r.modeLabel}</Badge> <span className="font-mono text-xs">{r.utr || ""}</span>
                  {r.payerBank && <span className="block text-xs text-slate-500">{r.payerBank}</span>}
                </td>
                <td className="px-3 py-2 text-xs">{r.account?.name || "—"}</td>
                <td className="px-3 py-2 text-right font-semibold tabular">{rupees(r.credit)}</td>
                <td className="px-3 py-2 text-xs">{r.cleared ? <span className="text-emerald-700">✓ {r.cleared.statementDate}</span> : <span className="text-amber-700">pending</span>}</td>
              </tr>
            ))}
            {reg.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                  No payments in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function Advices({ list, manage, accounts, onDone }: { list: any[]; manage: boolean; accounts: any[]; onDone: (m: string) => void }) {
  const [acc, setAcc] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const act = async (a: any, action: "verify" | "reject") => {
    setErr(null);
    try {
      const fit = accounts.filter((x) => (a.mode === "CASH" ? x.kind === "CASH" : x.kind === "BANK"));
      await api(`/api/payments/advices/${a._id}`, { method: "POST", json: { action, accountId: acc[a._id] || (fit.find((x) => x.isDefault) || fit[0])?._id, reason: reason[a._id] } });
      onDone(action === "verify" ? `${a.code} confirmed — receipt posted to ${a.partyName}.` : `${a.code} rejected; the partner is told why.`);
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Payments reported by partners</CardTitle>
        <CardDescription>Check each one against the bank statement. Confirming posts the receipt to the partner's account; rejecting tells them why.</CardDescription>
      </CardHeader>
      {err && <Notice className="mx-4 mb-3">{err}</Notice>}
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {list.map((a) => {
          const fit = accounts.filter((x) => (a.mode === "CASH" ? x.kind === "CASH" : x.kind === "BANK"));
          return (
            <li key={a._id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {a.partyName} · {rupees(a.amount)} · {a.mode} <span className="font-mono text-xs">{a.utr}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {a.code} · paid {a.date}
                  {a.payerBank ? ` · ${a.payerBank}` : ""} · reported by {a.submittedByName} {dt(a.createdAt, true)}
                  {a.note ? ` · ${a.note}` : ""}
                  {a.receiptNo ? ` · receipt ${a.receiptNo}` : ""}
                  {a.rejectReason ? ` · ${a.rejectReason}` : ""}
                  {a.decidedByName ? ` · by ${a.decidedByName}` : ""}
                </p>
              </div>
              {a.proof && (
                <a href={`/api/files/${a.proof}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">
                  <Paperclip className="h-3.5 w-3.5" /> Proof
                </a>
              )}
              <StatusBadge status={a.status === "SUBMITTED" ? "PENDING_APPROVAL" : a.status === "VERIFIED" ? "APPROVED" : "REJECTED"} label={a.status === "SUBMITTED" ? "TO CHECK" : a.status} />
              {manage && a.status === "SUBMITTED" && (
                <span className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <select id={`ad-acc-${a._id}`} className="field h-9 w-48" value={acc[a._id] || (fit.find((x) => x.isDefault) || fit[0])?._id || ""} onChange={(e) => setAcc({ ...acc, [a._id]: e.target.value })}>
                    {fit.map((x) => (
                      <option key={x._id} value={x._id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" onClick={() => act(a, "verify")}>
                    <Check className="h-4 w-4" /> In bank — confirm
                  </Button>
                  <Input id={`ad-r-${a._id}`} className="h-9 w-40" placeholder="Reason to reject" value={reason[a._id] || ""} onChange={(e) => setReason({ ...reason, [a._id]: e.target.value })} />
                  <Button size="sm" variant="outline" onClick={() => act(a, "reject")}>
                    <X className="h-4 w-4" />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="px-4 py-4 text-sm text-slate-500">Nothing reported.</li>}
      </ul>
    </Card>
  );
}

function BankMatching({ accounts, manage, onDone }: { accounts: any[]; manage: boolean; onDone: () => void }) {
  const [account, setAccount] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [r, setR] = useState<any>(null);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [stDate, setStDate] = useState(today());
  const [stBal, setStBal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!account && accounts.length) setAccount((accounts.find((a) => a.isDefault) || accounts[0])._id);
  }, [accounts, account]);
  const load = useCallback(() => {
    if (!account) return;
    setPick(new Set());
    api<any>(`/api/payments/reconciliation?account=${account}&asOf=${asOf}`).then(setR).catch((e) => setErr(e.message));
  }, [account, asOf]);
  useEffect(load, [load]);
  const mark = async () => {
    setErr(null);
    try {
      await api("/api/payments/clear", { method: "POST", json: { ids: [...pick], statementDate: stDate } });
      load();
      onDone();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const diff = stBal !== "" && r ? Math.round(Number(stBal) * 100) - r.expectedBank : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-500">
          Bank account
          <select id="bm-acc" className="field mt-1 h-9 w-60" value={account} onChange={(e) => setAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          As on
          <Input id="bm-asof" type="date" className="mt-1 h-9 w-40" max={today()} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Balance on the bank statement (₹)
          <Input id="bm-stbal" className="mt-1 h-9 w-44" inputMode="decimal" value={stBal} onChange={(e) => setStBal(e.target.value.replace(/[^\d.-]/g, ""))} />
        </label>
      </div>
      {err && <Notice>{err}</Notice>}
      {!r ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <Card className="grid grid-cols-1 gap-px overflow-hidden bg-slate-200 sm:grid-cols-4">
            {[
              ["Balance as per our books", r.bookBalance],
              ["Less: partner receipts not yet in bank", -r.notInBank],
              ["Bank statement should show", r.expectedBank],
              ["Difference vs statement", diff],
            ].map(([l, v]: any) => (
              <div key={l} className="bg-white p-3">
                <p className="text-xs text-slate-500">{l}</p>
                <p className={cn("text-lg font-bold tabular", v != null && v < 0 && "text-rose-600", l.startsWith("Difference") && v === 0 && "text-emerald-700")}>{v == null ? "enter balance" : rupees(v)}</p>
              </div>
            ))}
          </Card>
          {diff != null && diff !== 0 && <Notice tone="warning">The statement differs by {rupees(Math.abs(diff))}. Look for receipts not yet ticked, bank charges or interest not yet entered as vouchers, or a payment recorded on the wrong date.</Notice>}
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Receipts not yet seen in the bank</CardTitle>
                <CardDescription>Tick the ones that appear on the statement and give the statement date.</CardDescription>
              </div>
              {manage && (
                <div className="flex items-center gap-2">
                  <Input id="bm-stdate" type="date" className="h-9 w-40" max={today()} value={stDate} onChange={(e) => setStDate(e.target.value)} />
                  <Button size="sm" disabled={!pick.size} onClick={mark}>
                    <Check className="h-4 w-4" /> Seen in bank ({pick.size})
                  </Button>
                </div>
              )}
            </CardHeader>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {r.pending.map((e: any) => (
                <li key={e._id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  {manage && (
                    <input
                      type="checkbox"
                      checked={pick.has(e._id)}
                      onChange={() => {
                        const n = new Set(pick);
                        if (n.has(e._id)) n.delete(e._id);
                        else n.add(e._id);
                        setPick(n);
                      }}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-xs">{e.reference}</span> · {dt(e.date)} · {e.paymentMode} <span className="font-mono text-xs">{e.utr}</span>
                  </span>
                  <span className="font-semibold tabular">{rupees(e.credit)}</span>
                </li>
              ))}
              {r.pending.length === 0 && <li className="px-4 py-4 text-sm text-emerald-700">Every partner receipt into this account is matched with the bank.</li>}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
