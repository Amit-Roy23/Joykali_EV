"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, HandCoins, Landmark, Loader2, Plus, Wallet, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees, rupeesShort } from "@/components/workflow";
import { AccountsTabs } from "@/components/accounts";

const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const STATUS: Record<string, { label: string; tone: "warning" | "info" | "success" | "destructive" | "secondary" }> = {
  PENDING: { label: "Waiting for approval", tone: "warning" },
  APPROVED: { label: "Approved — to pay", tone: "info" },
  PAID: { label: "Paid", tone: "success" },
  REJECTED: { label: "Rejected", tone: "destructive" },
  CANCELLED: { label: "Cancelled", tone: "secondary" },
};
const TABS: Array<[string, string]> = [
  ["PENDING", "Waiting for approval"],
  ["APPROVED", "To pay"],
  ["PAID", "Paid"],
  ["REJECTED,CANCELLED", "Rejected / cancelled"],
  ["", "All"],
];
const kindLabel = (fromKind?: string, toKind?: string) =>
  fromKind === "CASH" && toKind === "BANK" ? "Cash → Bank (deposit)" : fromKind === "BANK" && toKind === "CASH" ? "Bank → Cash in hand (withdrawal)" : fromKind === "BANK" && toKind === "BANK" ? "Bank → Bank" : "Cash → Cash";

/**
 * Payment and fund-transfer requests: raised with what the money is for → approved by the Admin,
 * Business Head or Managing Partner → paid by the cashier → everyone told.
 */
export default function PaymentRequestsPage() {
  const { can } = useSession();
  const [d, setD] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [tab, setTab] = useState("PENDING");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState<"PAYMENT" | "TRANSFER" | null>(null);
  const [act, setAct] = useState<{ kind: "approve" | "reject" | "pay" | "cancel"; r: any } | null>(null);
  const load = useCallback(() => {
    api<any>("/api/accounts/requests").then(setD).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => {
    load();
    api<any>("/api/accounts/meta").then(setMeta).catch(() => {});
  }, [load]);
  useEffect(() => {
    // open the tab that needs this person first
    if (d && tab === "PENDING" && !d.canApprove && d.canPay && d.list.some((r: any) => r.status === "APPROVED")) setTab("APPROVED");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);
  const list: any[] = useMemo(() => (d ? d.list.filter((r: any) => !tab || tab.split(",").includes(r.status)) : []), [d, tab]);
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const count = (st: string) => d.list.filter((r: any) => st.split(",").includes(r.status)).length;
  const sum = (st: string) => d.list.filter((r: any) => r.status === st).reduce((s: number, r: any) => s + r.amount, 0);
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Accounts"
        title="Payment requests"
        description="Any money going out — or moving between bank and cash — is asked for first with what it is for. The Admin, Business Head or Managing Partner approves, the cashier pays from cash or bank, and everyone is told."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setForm("TRANSFER")}>
              <Landmark className="h-4 w-4" /> Fund transfer
            </Button>
            <Button onClick={() => setForm("PAYMENT")}>
              <Plus className="h-4 w-4" /> {d.canApprove ? "Payment instruction" : "Request a payment"}
            </Button>
          </div>
        }
      />
      {can("accounts.view") && <AccountsTabs />}
      {msg && <Notice tone="success">{msg}</Notice>}
      {err && <Notice>{err}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Waiting for approval" value={count("PENDING")} sub={rupeesShort(sum("PENDING"))} icon={HandCoins} tone={count("PENDING") ? "amber" : "slate"} />
        <StatCard label="Approved — cashier to pay" value={count("APPROVED")} sub={rupeesShort(sum("APPROVED"))} icon={Wallet} tone={count("APPROVED") ? "sky" : "slate"} />
        <StatCard label="Paid" value={count("PAID")} sub={rupeesShort(sum("PAID"))} icon={Check} tone="emerald" />
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {TABS.map(([k, label]) => (
          <button key={label} onClick={() => setTab(k)} className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold", tab === k ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>
            {label}
            {k && ` (${count(k)})`}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={HandCoins} title="Nothing here" description="Requests appear here as they are raised, approved and paid." />
      ) : (
        <div className="space-y-2">
          {list.map((r) => {
            const mine = String(r.requestedBy) === String(d.me);
            return (
              <Card key={r._id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{r.code}</span>
                      <Badge variant={r.type === "TRANSFER" ? "secondary" : "default"}>{r.type === "TRANSFER" ? r.direction : r.head}</Badge>
                      <Badge variant={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    </div>
                    <p className="mt-1 font-semibold text-slate-900">{r.purpose}</p>
                    <p className="text-xs text-slate-500">
                      {r.type === "TRANSFER" ? (
                        <>
                          {r.account?.name} <ArrowRight className="inline h-3 w-3" /> {r.toAccount?.name}
                        </>
                      ) : (
                        <>
                          {r.payee ? `To ${r.payee}` : "No payee given"}
                          {r.account ? ` · suggested from ${r.account.name}` : ""}
                          {r.preferredMode ? ` · ${r.preferredMode}` : ""}
                        </>
                      )}
                      {r.neededBy ? ` · needed by ${r.neededBy}` : ""}
                    </p>
                    <ol className="mt-2 space-y-0.5 text-xs text-slate-600">
                      <li>
                        ① Asked by <b>{r.requestedByName}</b> on {dt(r.createdAt, true)}
                      </li>
                      {r.decision && (
                        <li className={r.status === "REJECTED" ? "text-rose-700" : ""}>
                          ② {r.status === "REJECTED" ? "Rejected" : "Approved"} by <b>{r.decision.byName}</b> on {dt(r.decision.at, true)}
                          {r.decision.note ? ` — “${r.decision.note}”` : ""}
                        </li>
                      )}
                      {r.payment && (
                        <li className="text-emerald-700">
                          ③ {r.type === "TRANSFER" ? "Transferred" : "Paid"} by <b>{r.payment.byName}</b> from {r.payment.accountName} on {r.payment.date}
                          {r.payment.reference ? ` · ref ${r.payment.reference}` : ""}
                        </li>
                      )}
                      {r.cancelReason && <li className="text-slate-500">Cancelled: {r.cancelReason}</li>}
                    </ol>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-bold tabular">{rupees(r.amount)}</p>
                    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                      {r.status === "PENDING" && d.canApprove && !mine && (
                        <>
                          <Button size="sm" onClick={() => setAct({ kind: "approve", r })}>
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setAct({ kind: "reject", r })}>
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </>
                      )}
                      {r.status === "APPROVED" && d.canPay && (
                        <Button size="sm" onClick={() => setAct({ kind: "pay", r })}>
                          <Wallet className="h-3.5 w-3.5" /> {r.type === "TRANSFER" ? "Do transfer" : "Pay"}
                        </Button>
                      )}
                      {["PENDING", "APPROVED"].includes(r.status) && (mine || d.canApprove) && (
                        <Button size="sm" variant="ghost" onClick={() => setAct({ kind: "cancel", r })}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {form && meta && (
        <RequestForm
          type={form}
          meta={meta}
          approver={d.canApprove}
          onClose={() => setForm(null)}
          onDone={(r) => {
            setForm(null);
            setMsg(r.status === "APPROVED" ? `${r.code} is approved — the cashier has been told to pay it.` : `${r.code} sent to the Admin / Business Head for approval.`);
            setTab(r.status);
            load();
          }}
        />
      )}
      {act && (
        <ActionModal
          act={act}
          accounts={meta?.accounts || []}
          onClose={() => setAct(null)}
          onDone={(m) => {
            setAct(null);
            setMsg(m);
            load();
          }}
        />
      )}
    </div>
  );
}

function RequestForm({ type, meta, approver, onClose, onDone }: { type: "PAYMENT" | "TRANSFER"; meta: any; approver: boolean; onClose: () => void; onDone: (r: any) => void }) {
  const accounts: any[] = meta.accounts || [];
  const bank = accounts.find((a) => a.kind === "BANK" && a.isDefault) || accounts.find((a) => a.kind === "BANK");
  const cash = accounts.find((a) => a.kind === "CASH");
  const [f, setF] = useState<any>({
    amountRupees: "",
    purpose: "",
    head: "",
    payee: "",
    accountId: type === "TRANSFER" ? bank?._id || "" : "",
    toAccountId: type === "TRANSFER" ? cash?._id || "" : "",
    preferredMode: "",
    neededBy: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const from = accounts.find((a) => a._id === f.accountId);
  const to = accounts.find((a) => a._id === f.toAccountId);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<any>("/api/accounts/requests", { method: "POST", json: { ...f, type, amountRupees: Number(f.amountRupees) } });
      onDone(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={type === "TRANSFER" ? "Fund transfer" : approver ? "Payment instruction" : "Request a payment"}
      description={approver ? "You are an approver, so this is approved at once and goes to the cashier to pay." : "It goes to the Admin / Business Head for approval, then to the cashier."}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {type === "TRANSFER" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="rq-from">From</Label>
              <select id="rq-from" className="field" value={f.accountId} onChange={set("accountId")}>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-to">To</Label>
              <select id="rq-to" className="field" value={f.toAccountId} onChange={set("toAccountId")}>
                {accounts
                  .filter((a) => a._id !== f.accountId)
                  .map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
            {from && to && <p className="text-xs font-semibold text-brand-700 sm:col-span-2">{kindLabel(from.kind, to.kind)}</p>}
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="rq-head">Kind of payment</Label>
              <select id="rq-head" className="field" value={f.head} onChange={set("head")}>
                <option value="">Choose…</option>
                {(meta.voucherHeads?.PAYMENT || []).map((h: string) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-payee">Pay to (person / firm)</Label>
              <Input id="rq-payee" value={f.payee} onChange={set("payee")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-acc">Pay from (suggested)</Label>
              <select id="rq-acc" className="field" value={f.accountId} onChange={set("accountId")}>
                <option value="">Cashier decides</option>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-mode">Mode</Label>
              <select id="rq-mode" className="field" value={f.preferredMode} onChange={set("preferredMode")}>
                <option value="">Any</option>
                {["Cash", "UPI", "NEFT / RTGS", "Cheque"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="rq-amt">Amount (₹)</Label>
          <Input id="rq-amt" inputMode="decimal" value={f.amountRupees} onChange={(e) => setF({ ...f, amountRupees: e.target.value.replace(/[^\d.]/g, "") })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rq-by">Needed by (optional)</Label>
          <Input id="rq-by" type="date" min={istToday()} value={f.neededBy} onChange={set("neededBy")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="rq-purpose">What is the money for?</Label>
          <Input id="rq-purpose" value={f.purpose} onChange={set("purpose")} placeholder={type === "TRANSFER" ? "e.g. Cash for showroom change and petty expenses" : "e.g. Advance to the painter for showroom signboard"} />
        </div>
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || !f.amountRupees || f.purpose.trim().length < 3} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {approver ? "Send to cashier" : "Send for approval"}
        </Button>
      </div>
    </Modal>
  );
}

function ActionModal({ act, accounts, onClose, onDone }: { act: { kind: "approve" | "reject" | "pay" | "cancel"; r: any }; accounts: any[]; onClose: () => void; onDone: (m: string) => void }) {
  const r = act.r;
  const [v, setV] = useState<any>({ note: "", accountId: r.account?._id || (accounts.find((a) => a.kind === "BANK" && a.isDefault) || accounts[0])?._id || "", date: istToday(), reference: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const titles = { approve: `Approve ${r.code}`, reject: `Reject ${r.code}`, pay: r.type === "TRANSFER" ? `Do transfer ${r.code}` : `Pay ${r.code}`, cancel: `Cancel ${r.code}` };
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body =
        act.kind === "pay"
          ? { action: "pay", accountId: v.accountId, date: v.date, reference: v.reference }
          : act.kind === "cancel"
            ? { action: "cancel", reason: v.note }
            : { action: act.kind, note: v.note };
      await api(`/api/accounts/requests/${r._id}`, { method: "POST", json: body });
      onDone(
        act.kind === "approve"
          ? `${r.code} approved — the cashier has been told.`
          : act.kind === "reject"
            ? `${r.code} rejected — the requester has been told.`
            : act.kind === "pay"
              ? `${r.code} ${r.type === "TRANSFER" ? "transferred" : "paid"} — posted to the books; Admin, Business Head and the requester have been told.`
              : `${r.code} cancelled.`
      );
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={titles[act.kind]} description={`${rupees(r.amount)} — ${r.purpose}`}>
      {act.kind === "pay" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {r.type === "TRANSFER" ? (
            <p className="text-sm sm:col-span-2">
              <b>{r.account?.name}</b> <ArrowRight className="inline h-3.5 w-3.5" /> <b>{r.toAccount?.name}</b> ({r.direction})
            </p>
          ) : (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pr-acc">Pay from</Label>
              <select id="pr-acc" className="field" value={v.accountId} onChange={(e) => setV({ ...v, accountId: e.target.value })}>
                {accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pr-date">Date</Label>
            <Input id="pr-date" type="date" max={istToday()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-ref">Cheque / UTR / slip no.</Label>
            <Input id="pr-ref" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="pr-note">{act.kind === "approve" ? "Note (optional)" : "Reason"}</Label>
          <Input id="pr-note" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
        </div>
      )}
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button disabled={busy || ((act.kind === "reject" || act.kind === "cancel") && !v.note.trim())} onClick={go}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {act.kind === "approve" ? "Approve" : act.kind === "reject" ? "Reject" : act.kind === "pay" ? (r.type === "TRANSFER" ? "Transfer done" : "Record payment") : "Cancel request"}
        </Button>
      </div>
    </Modal>
  );
}
