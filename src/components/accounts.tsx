"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { api, Notice, rupees } from "@/components/workflow";
import { Field } from "@/components/network";

export const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export function fyStart(day = istToday()) {
  const y = Number(day.slice(0, 4));
  return `${Number(day.slice(5, 7)) < 4 ? y - 1 : y}-04-01`;
}
export function monthStart(day = istToday()) {
  return `${day.slice(0, 7)}-01`;
}
export function lastMonth(day = istToday()) {
  const [y, m] = day.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const p = `${py}-${String(pm).padStart(2, "0")}`;
  return { from: `${p}-01`, to: `${p}-${last}` };
}

const TABS = [
  { href: "/accounts", label: "Overview", perm: "accounts.view" },
  { href: "/accounts/books", label: "Cash & bank books", perm: "accounts.view" },
  { href: "/accounts/pnl", label: "Profit & loss", perm: "accounts.view" },
  { href: "/accounts/expenses", label: "Expenses", perm: "expense.create" },
  { href: "/accounts/outstanding", label: "Outstanding", perm: "accounts.view" },
  { href: "/accounts/budget", label: "Budget vs actual", perm: "accounts.view" },
];

export function AccountsTabs() {
  const path = usePathname();
  const { can } = useSession();
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {TABS.filter((t) => can(t.perm) || can("accounts.view")).map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold",
            path === t.href ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/** From–to with quick presets. */
export function RangePicker({ from, to, onChange }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void }) {
  const t = istToday();
  const presets: Array<[string, { from: string; to: string }]> = [
    ["This month", { from: monthStart(t), to: t }],
    ["Last month", lastMonth(t)],
    ["FY to date", { from: fyStart(t), to: t }],
  ];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-semibold text-slate-500">
        From
        <Input id="rg-from" type="date" className="mt-1 h-9 w-40" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })} />
      </label>
      <label className="text-xs font-semibold text-slate-500">
        To
        <Input id="rg-to" type="date" className="mt-1 h-9 w-40" value={to} min={from} max={t} onChange={(e) => onChange({ from, to: e.target.value })} />
      </label>
      <div className="flex gap-1">
        {presets.map(([label, r]) => (
          <button
            key={label}
            onClick={() => onChange(r)}
            className={cn("h-9 rounded-lg px-2.5 text-xs font-semibold ring-1 ring-slate-200", r.from === from && r.to === to ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-600")}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Choose the cash / bank account, date and reference for a payment. */
export function PayModal({
  open,
  title,
  description,
  amount,
  partial,
  onClose,
  onPay,
}: {
  open: boolean;
  title: string;
  description?: string;
  amount: number;
  partial?: boolean;
  onClose: () => void;
  onPay: (v: { accountId: string; date: string; reference: string; amountRupees?: number }) => Promise<void>;
}) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [v, setV] = useState({ accountId: "", date: istToday(), reference: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setV({ accountId: "", date: istToday(), reference: "", amount: String(amount / 100) });
    api<any>("/api/accounts/money-accounts")
      .then((list) => {
        const act = list.filter((a: any) => a.status === "ACTIVE");
        setAccounts(act);
        setV((x) => ({ ...x, accountId: (act.find((a: any) => a.kind === "BANK" && a.isDefault) || act[0])?._id || "" }));
      })
      .catch((e) => setErr(e.message));
  }, [open, amount]);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onPay({ accountId: v.accountId, date: v.date, reference: v.reference, ...(partial ? { amountRupees: Number(v.amount) } : {}) });
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title={title} description={description}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Paid from" className="sm:col-span-2">
          <select id="pay-acc" className="field" value={v.accountId} onChange={(e) => setV({ ...v, accountId: e.target.value })}>
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name} · balance {rupees(a.balance)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Payment date">
          <Input id="pay-date" type="date" max={istToday()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </Field>
        {partial ? (
          <Field label="Amount (₹)">
            <Input id="pay-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
        ) : (
          <Field label="Amount">
            <p className="py-2 text-sm font-semibold">{rupees(amount)}</p>
          </Field>
        )}
        <Field label="Cheque / UTR / reference" className="sm:col-span-2">
          <Input id="pay-ref" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
        </Field>
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || !v.accountId} onClick={go}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Record payment
        </Button>
      </div>
    </Modal>
  );
}

/** Signed rupee amount with red for negatives. */
export function Amt({ v, bold, className }: { v: number; bold?: boolean; className?: string }) {
  return <span className={cn("tabular", v < 0 && "text-rose-600", bold && "font-bold", className)}>{v < 0 ? `(${rupees(-v)})` : rupees(v)}</span>;
}
