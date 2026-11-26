"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ArrowRight, Banknote, Landmark, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { useSession } from "@/components/layout/session";
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
  const { can, user } = useSession();
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState<null | { row: any; action: "approve" | "reject" | "pay" }>(null);
  const [ok, setOk] = useState<string | null>(null);
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
          (can("expense.create") || can("accounts.manage") || can("payment.approve")) && (
            <Button onClick={() => setOpen(true)} id="new-transfer">
              <Plus className="h-4 w-4" /> New transfer
            </Button>
          )
        }
      />
      <AccountsTabs />
      {err && <Notice>{err}</Notice>}
      {ok && <Notice tone="success">{ok}</Notice>}
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
                      <TableHead />
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
                        <TableCell className="whitespace-nowrap text-right">
                          {r.kind === "REQUEST" && r.status === "PENDING" && can("payment.approve") && r.requestedById !== user?.userId && (
                            <>
                              <Button size="sm" onClick={() => setAct({ row: r, action: "approve" })}>
                                Approve
                              </Button>{" "}
                              <Button size="sm" variant="ghost" onClick={() => setAct({ row: r, action: "reject" })}>
                                Reject
                              </Button>
                            </>
                          )}
                          {r.kind === "REQUEST" && r.status === "APPROVED" && can("accounts.manage") && (
                            <Button size="sm" onClick={() => setAct({ row: r, action: "pay" })}>
                              Do transfer
                            </Button>
                          )}
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
      {open && (
        <TransferForm
          onClose={() => setOpen(false)}
          onDone={(m) => {
            setOpen(false);
            setOk(m);
            load();
          }}
        />
      )}
      {act && (
        <ActModal
          {...act}
          onClose={() => setAct(null)}
          onDone={(m) => {
            setAct(null);
            setOk(m);
            load();
          }}
        />
      )}
    </div>
  );
}

const KINDS: Array<{ key: string; from: "BANK" | "CASH"; to: "BANK" | "CASH"; label: string; hint: string; purpose: string }> = [
  { key: "B2C", from: "BANK", to: "CASH", label: "Bank → Cash in hand", hint: "Cash withdrawn from the bank for the cash box", purpose: "Cash withdrawn for petty cash / daily payments" },
  { key: "C2B", from: "CASH", to: "BANK", label: "Cash → Bank", hint: "Cash from the cash box deposited in the bank", purpose: "Cash collected from sales deposited in bank" },
  { key: "B2B", from: "BANK", to: "BANK", label: "Bank → Bank", hint: "From one company bank account to another", purpose: "Funds moved between company accounts" },
  { key: "C2C", from: "CASH", to: "CASH", label: "Cash → Cash", hint: "Between two cash boxes (e.g. showroom to head office)", purpose: "Cash moved between cash boxes" },
];

/** Ask for a transfer: Admin / BH / MP's own request is approved at once and goes to the cashier. */
function TransferForm({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [meta, setMeta] = useState<any>(null);
  const [k, setK] = useState(KINDS[0]);
  const [f, setF] = useState({ accountId: "", toAccountId: "", amountRupees: "", purpose: KINDS[0].purpose, neededBy: istToday(), preferredMode: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<any>("/api/accounts/meta").then(setMeta).catch((e) => setError(e.message));
  }, []);
  const accs = (kind: string) => (meta?.accounts || []).filter((a: any) => a.kind === kind);
  useEffect(() => {
    if (!meta) return;
    const from = accs(k.from);
    const to = accs(k.to);
    const pick = (l: any[], not?: string) => (l.find((a) => a.isDefault && String(a._id) !== not) || l.find((a) => String(a._id) !== not))?._id || "";
    const a = pick(from);
    setF((x) => ({ ...x, accountId: a, toAccountId: pick(to, a), purpose: k.purpose }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, meta]);
  const fromAcc = (meta?.accounts || []).find((a: any) => a._id === f.accountId);
  const amt = Number(f.amountRupees) || 0;
  const short = fromAcc?.kind === "CASH" && fromAcc.balance != null && amt * 100 > fromAcc.balance;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<any>("/api/accounts/requests", { method: "POST", json: { type: "TRANSFER", ...f, amountRupees: amt } });
      onDone(r.status === "APPROVED" ? `${r.code}: approved — the cashier has been told to do the transfer.` : `${r.code}: sent to the Admin / Business Head for approval.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const sel = "h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm";
  return (
    <Modal isOpen onClose={onClose} title="New bank / cash transfer" maxWidth="xl">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KINDS.map((x) => (
          <button
            key={x.key}
            type="button"
            data-kind={x.key}
            onClick={() => setK(x)}
            className={cn("rounded-lg px-2 py-2 text-xs font-semibold ring-1", k.key === x.key ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-200")}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">{k.hint}</p>
      {!meta ? (
        <Skeleton className="mt-3 h-40" />
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>From</Label>
            <select id="tr-from" className={sel} value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })}>
              <option value="">Choose…</option>
              {accs(k.from).map((a: any) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                  {a.balance != null ? ` — ${rupees(a.balance)}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <select id="tr-to" className={sel} value={f.toAccountId} onChange={(e) => setF({ ...f, toAccountId: e.target.value })}>
              <option value="">Choose…</option>
              {accs(k.to)
                .filter((a: any) => a._id !== f.accountId)
                .map((a: any) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input id="tr-amount" type="number" min={1} value={f.amountRupees} onChange={(e) => setF({ ...f, amountRupees: e.target.value })} />
            {short && <p className="text-xs text-amber-700">More than the cash in {fromAcc.name} today ({rupees(fromAcc.balance)}).</p>}
          </div>
          <div className="space-y-1.5">
            <Label>To be done by</Label>
            <Input type="date" value={f.neededBy} onChange={(e) => setF({ ...f, neededBy: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>What for</Label>
            <Input id="tr-purpose" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>How (optional)</Label>
            <Input value={f.preferredMode} onChange={(e) => setF({ ...f, preferredMode: e.target.value })} placeholder="e.g. Cheque self-withdrawal, NEFT, deposit slip at branch" />
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">The Admin / Business Head approves it, then the cashier does it and both books are updated. If you are an approver, it goes straight to the cashier.</p>
      {error && <Notice className="mt-3">{error}</Notice>}
      <div className="modal-actions mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button id="tr-save" disabled={busy || !f.accountId || !f.toAccountId || amt <= 0} onClick={save}>
          Send
        </Button>
      </div>
    </Modal>
  );
}

function ActModal({ row, action, onClose, onDone }: { row: any; action: "approve" | "reject" | "pay"; onClose: () => void; onDone: (m: string) => void }) {
  const [note, setNote] = useState("");
  const [date, setDate] = useState(istToday());
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/accounts/requests/${row.id}`, { method: "POST", json: action === "pay" ? { action, date, reference } : { action, note } });
      onDone(action === "pay" ? `${row.code}: transfer done and posted in both books.` : action === "approve" ? `${row.code} approved — the cashier has been told.` : `${row.code} rejected.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={`${action === "pay" ? "Do transfer" : action === "approve" ? "Approve" : "Reject"} ${row.code}`}>
      <p className="text-sm">
        <b>{rupees(row.amount)}</b> · {row.from} → {row.to}
      </p>
      <p className="mb-3 text-xs text-slate-500">{row.purpose}</p>
      {action === "pay" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Date done</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Cheque / slip / UTR no.</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>{action === "reject" ? "Reason" : "Note (optional)"}</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
      {error && <Notice className="mt-3">{error}</Notice>}
      <div className="modal-actions mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button id="act-go" disabled={busy || (action === "reject" && !note.trim())} onClick={go}>
          {action === "pay" ? "Mark done" : action === "approve" ? "Approve" : "Reject"}
        </Button>
      </div>
    </Modal>
  );
}
