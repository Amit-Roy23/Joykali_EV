"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api, Notice } from "@/components/workflow";
import { Field } from "@/components/network";

export const PAY_MODES: Array<[string, string]> = [
  ["NEFT", "NEFT"],
  ["RTGS", "RTGS"],
  ["IMPS", "IMPS"],
  ["UPI", "UPI"],
  ["CHEQUE", "Cheque"],
  ["CASH", "Cash"],
];
export const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/**
 * Record money received from a dealer / distributor. With `party` fixed (party page) or a party
 * picker (Payments page). The bank account list follows the mode: cash → cash account, else bank.
 */
export function ReceiptForm({ open, onClose, onSaved, party }: { open: boolean; onClose: () => void; onSaved: () => void; party?: { type: "DEALER" | "DISTRIBUTOR"; id: string; name: string } }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [parties, setParties] = useState<Array<{ type: string; id: string; name: string }>>([]);
  const [v, setV] = useState<any>({ party: "", amount: "", mode: "NEFT", utr: "", payerBank: "", date: today(), accountId: "", narration: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setV({ party: party ? `${party.type}:${party.id}` : "", amount: "", mode: "NEFT", utr: "", payerBank: "", date: today(), accountId: "", narration: "" });
    api<any>("/api/accounts/meta").then((m) => setAccounts(m.accounts)).catch(() => {});
    if (!party)
      api<any>("/api/payments/parties").then(setParties).catch(() => {});
  }, [open, party]);
  const fit = accounts.filter((a) => (v.mode === "CASH" ? a.kind === "CASH" : a.kind === "BANK"));
  useEffect(() => {
    if (fit.length && !fit.some((a) => a._id === v.accountId)) setV((x: any) => ({ ...x, accountId: (fit.find((a) => a.isDefault) || fit[0])._id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.mode, accounts]);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const [type, id] = (v.party || "").split(":");
      if (!type || !id) throw new Error("Choose the dealer or distributor");
      await api(`/api/ledger/${type === "DEALER" ? "dealer" : "distributor"}/${id}`, {
        method: "POST",
        json: { amount: Number(v.amount), mode: v.mode, reference: v.utr, payerBank: v.payerBank, date: v.date, accountId: v.accountId, narration: v.narration },
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title={party?.name ? `Payment received from ${party.name}` : "Record a payment received"} description="Reduces the partner's outstanding and frees credit. The same UTR / cheque cannot be entered twice." maxWidth="xl">
      <div className="grid gap-3 sm:grid-cols-2">
        {!party && (
          <Field label="From" className="sm:col-span-2">
            <select id="rc-party" className="field" value={v.party} onChange={(e) => setV({ ...v, party: e.target.value })}>
              <option value="">Choose dealer / distributor…</option>
              {parties.map((p) => (
                <option key={`${p.type}:${p.id}`} value={`${p.type}:${p.id}`}>
                  {p.name} ({p.type === "DEALER" ? "dealer" : "distributor"})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Amount (₹)">
          <Input id="rc-amt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value.replace(/[^\d.]/g, "") })} />
        </Field>
        <Field label="Paid by">
          <select id="rc-mode" className="field" value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}>
            {PAY_MODES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {v.mode !== "CASH" && (
          <>
            <Field label={v.mode === "CHEQUE" ? "Cheque no. (6 digits)" : "UTR / transaction ref."}>
              <Input id="rc-utr" value={v.utr} onChange={(e) => setV({ ...v, utr: e.target.value.toUpperCase().replace(/\s/g, "") })} />
            </Field>
            <Field label="Payer's bank">
              <Input id="rc-bank" value={v.payerBank} onChange={(e) => setV({ ...v, payerBank: e.target.value })} placeholder="e.g. SBI Bardhaman" />
            </Field>
          </>
        )}
        <Field label="Date received">
          <Input id="rc-date" type="date" max={today()} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
        </Field>
        <Field label="Into account">
          <select id="rc-acc" className="field" value={v.accountId} onChange={(e) => setV({ ...v, accountId: e.target.value })}>
            {fit.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Narration (optional)" className="sm:col-span-2">
          <Input id="rc-nar" value={v.narration} onChange={(e) => setV({ ...v, narration: e.target.value })} placeholder="e.g. against JKI/2026-27/0001" />
        </Field>
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || !Number(v.amount)} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Record payment
        </Button>
      </div>
    </Modal>
  );
}
