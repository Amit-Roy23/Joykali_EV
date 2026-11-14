"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BadgeCheck, BookOpen, Download, FileUp, IndianRupee, Landmark, Loader2, ShieldAlert, X } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, dt, Notice, rupees } from "@/components/workflow";

export type PartyType = "DEALER" | "DISTRIBUTOR";

export const TIER_LABEL: Record<string, string> = {
  SUPER_DISTRIBUTOR: "Super distributor",
  DISTRIBUTOR: "Distributor",
  DEALER: "Dealer",
  SUB_DEALER: "Sub dealer",
  OUTLET: "Company outlet",
};
const TIER_TONE: Record<string, string> = {
  SUPER_DISTRIBUTOR: "bg-orange-50 text-orange-800 ring-orange-200",
  DISTRIBUTOR: "bg-amber-50 text-amber-800 ring-amber-200",
  DEALER: "bg-lime-50 text-lime-800 ring-lime-200",
  SUB_DEALER: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  OUTLET: "bg-teal-50 text-teal-800 ring-teal-200",
};
export function TierBadge({ tier, className }: { tier?: string; className?: string }) {
  if (!tier) return null;
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset", TIER_TONE[tier] || "bg-slate-100 text-slate-700 ring-slate-200", className)}>
      {TIER_LABEL[tier] || tier}
    </span>
  );
}

const DOC_LABEL: Record<string, string> = {
  GST: "GST certificate",
  PAN: "PAN card",
  AADHAAR: "Aadhaar",
  TRADE_LICENSE: "Trade licence",
  CANCELLED_CHEQUE: "Cancelled cheque",
  AGREEMENT: "Signed agreement",
  PHOTO: "Shop photo",
  OTHER: "Other",
};

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* KYC & agreement                                                      */
/* ------------------------------------------------------------------ */
export function KycPanel({ partyType, partyId, canUpload = true }: { partyType: PartyType; partyId: string; canUpload?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ docType: "GST", number: "", validTill: "" });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyFor, setVerifyFor] = useState<any>(null);
  const [remarks, setRemarks] = useState("");

  const load = useCallback(() => {
    api<any>(`/api/kyc/${partyType}/${partyId}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [partyType, partyId]);
  useEffect(load, [load]);

  const upload = async () => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("docType", form.docType);
      fd.set("number", form.number);
      fd.set("validTill", form.validTill);
      if (file) fd.set("file", file);
      const res = await fetch(`/api/kyc/${partyType}/${partyId}`, { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "Upload failed");
      setOpen(false);
      setForm({ docType: "GST", number: "", validTill: "" });
      setFile(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const decide = async (decision: "VERIFIED" | "REJECTED") => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/kyc/verify/${verifyFor._id}`, { method: "POST", json: { decision, remarks } });
      setVerifyFor(null);
      setRemarks("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle>KYC &amp; agreement</CardTitle>
          <CardDescription>
            {!data ? (
              "Documents verified by the company"
            ) : data.kyc.complete ? (
              <span className="font-semibold text-emerald-700">Complete: GST, PAN and agreement verified</span>
            ) : (
              <span className="text-amber-700">Still needed: {data.kyc.missing.map((m: string) => DOC_LABEL[m]).join(", ")}</span>
            )}
          </CardDescription>
        </div>
        {canUpload && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <FileUp className="h-3.5 w-3.5" /> Upload
          </Button>
        )}
      </CardHeader>
      {error && <Notice className="mx-5 mb-4">{error}</Notice>}
      {!data ? (
        <Skeleton className="mx-5 mb-5 h-24" />
      ) : data.docs.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No documents yet" description="Upload GST, PAN and the signed agreement to activate the account." className="py-8" />
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {data.docs.map((d: any) => (
            <li key={d._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{DOC_LABEL[d.docType] || d.docType}</p>
                <p className="truncate text-xs text-slate-500">
                  {d.number || "—"}
                  {d.validTill ? ` · valid till ${dt(d.validTill)}` : ""}
                  {d.remarks ? ` · ${d.remarks}` : ""}
                  {d.verifiedByName ? ` · ${d.status === "VERIFIED" ? "verified" : "checked"} by ${d.verifiedByName}` : ""}
                </p>
              </div>
              {d.file && (
                <a className="text-xs font-semibold text-brand-700 hover:underline" href={`/api/files/${d.file}`} target="_blank" rel="noreferrer">
                  View file
                </a>
              )}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset",
                  d.status === "VERIFIED" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : d.status === "REJECTED" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-800 ring-amber-200"
                )}
              >
                {d.status.toLowerCase()}
              </span>
              {data.canVerify && d.status === "PENDING" && (
                <Button size="sm" variant="outline" onClick={() => setVerifyFor(d)}>
                  <BadgeCheck className="h-3.5 w-3.5" /> Check
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Upload a document" description="PDF, JPG or PNG up to 2 MB. The company verifies it before it counts.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Document">
            <select id="kyc-type" className="field" value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
              {Object.entries(DOC_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Number (GSTIN, PAN…)">
            <Input id="kyc-number" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Valid till (if it expires)">
            <Input id="kyc-valid" type="date" value={form.validTill} onChange={(e) => setForm({ ...form, validTill: e.target.value })} />
          </Field>
          <Field label="File">
            <Input id="kyc-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={upload}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Upload
          </Button>
        </div>
      </Modal>

      <Modal isOpen={!!verifyFor} onClose={() => setVerifyFor(null)} title={`Check ${DOC_LABEL[verifyFor?.docType] || ""}`} description="Compare the number with the attached file. Someone other than the uploader must verify.">
        <Field label="Remarks (required to reject)">
          <Input id="kyc-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => decide("REJECTED")}>
            <X className="h-4 w-4" /> Reject
          </Button>
          <Button disabled={busy} onClick={() => decide("VERIFIED")}>
            <BadgeCheck className="h-4 w-4" /> Verify
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Security deposit                                                     */
/* ------------------------------------------------------------------ */
export function DepositPanel({ partyType, partyId, canRecord }: { partyType: PartyType; partyId: string; canRecord: boolean }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "RECEIVED", amountRupees: "", mode: "BANK", reference: "", narration: "" });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<any>(`/api/deposits/${partyType}/${partyId}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [partyType, partyId]);
  useEffect(load, [load]);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/deposits/${partyType}/${partyId}`, { method: "POST", json: { ...form, amountRupees: Number(form.amountRupees) } });
      setOpen(false);
      setForm({ type: "RECEIVED", amountRupees: "", mode: "BANK", reference: "", narration: "" });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Security deposit</CardTitle>
          <CardDescription>
            Held: <b className="text-slate-900">{data ? rupees(data.held) : "–"}</b>
          </CardDescription>
        </div>
        {canRecord && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Landmark className="h-3.5 w-3.5" /> Record
          </Button>
        )}
      </CardHeader>
      {error && <Notice className="mx-5 mb-4">{error}</Notice>}
      {data && data.entries.length > 0 && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
          {data.entries.map((e: any) => (
            <li key={e._id} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <span className="min-w-0">
                <span className="font-semibold text-slate-800">{e.type === "RECEIVED" ? "Received" : e.type === "REFUNDED" ? "Refunded" : "Adjusted against dues"}</span>
                <span className="block truncate text-xs text-slate-500">
                  {dt(e.date)} · {e.mode.toLowerCase()} {e.reference ? `· ${e.reference}` : ""}
                </span>
              </span>
              <span className={cn("font-semibold tabular", e.type === "RECEIVED" ? "text-emerald-700" : "text-slate-700")}>
                {e.type === "RECEIVED" ? "+" : "−"}
                {rupees(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Security deposit entry">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Entry">
            <select id="sd-type" className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="RECEIVED">Deposit received</option>
              <option value="REFUNDED">Refunded to partner</option>
              <option value="ADJUSTED">Adjust against dues</option>
            </select>
          </Field>
          <Field label="Amount (₹)">
            <Input id="sd-amount" inputMode="numeric" value={form.amountRupees} onChange={(e) => setForm({ ...form, amountRupees: e.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
          {form.type !== "ADJUSTED" && (
            <Field label="Mode">
              <select id="sd-mode" className="field" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="BANK">Bank transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="UPI">UPI</option>
                <option value="CASH">Cash</option>
              </select>
            </Field>
          )}
          <Field label="Reference (UTR / cheque no.)">
            <Input id="sd-ref" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Field label="Note" className="sm:col-span-2">
            <Input id="sd-note" value={form.narration} onChange={(e) => setForm({ ...form, narration: e.target.value })} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={busy || !form.amountRupees} onClick={save}>
            Save
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Account statement with Excel download                                */
/* ------------------------------------------------------------------ */
const TYPE_LABEL: Record<string, string> = { OPENING: "Opening", INVOICE: "Invoice", PAYMENT: "Payment", CREDIT_NOTE: "Credit note", ADJUSTMENT: "Adjustment" };
export function StatementCard({ partyType, partyId, title = "Account statement" }: { partyType?: PartyType; partyId?: string; title?: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState({ from: "", to: "" });
  const qs = new URLSearchParams({ ...(partyType && partyId ? { partyType, partyId } : {}), ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) });
  const q = qs.toString();
  useEffect(() => {
    api<any>(`/api/network/ledger?${q}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [q]);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 space-y-0 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {data ? (
              <>
                In the books of <b>{data.supplier}</b> · balance due <b className="text-slate-900">{rupees(data.closing)}</b>
              </>
            ) : (
              "Invoices, payments and credit notes"
            )}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input id="st-from" type="date" aria-label="From" className="h-9 w-[9.5rem]" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <Input id="st-to" type="date" aria-label="To" className="h-9 w-[9.5rem]" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          <a href={`/api/network/ledger?${q}${q ? "&" : ""}format=xlsx`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="h-4 w-4" /> Excel
          </a>
        </div>
      </CardHeader>
      {error && <Notice className="mx-5 mb-4">{error}</Notice>}
      {!data ? (
        <Skeleton className="mx-5 mb-5 h-32" />
      ) : data.rows.length === 0 ? (
        <EmptyState icon={BookOpen} title="No transactions in this period" className="py-8" />
      ) : (
        <div className="overflow-x-auto">
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
              {range.from && (
                <TableRow>
                  <TableCell colSpan={4} className="text-xs text-slate-500">
                    Opening balance
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular">{rupees(data.opening)}</TableCell>
                </TableRow>
              )}
              {[...data.rows].reverse().map((r: any) => (
                <TableRow key={r._id}>
                  <TableCell className="whitespace-nowrap text-xs">{dt(r.date)}</TableCell>
                  <TableCell>
                    <p className="text-sm font-medium text-slate-900">{TYPE_LABEL[r.type] || r.type}</p>
                    <p className="text-xs text-slate-500">
                      {r.reference}
                      {r.narration ? ` · ${r.narration}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular">{r.debit ? rupees(r.debit) : ""}</TableCell>
                  <TableCell className="text-right tabular text-emerald-700">{r.credit ? rupees(r.credit) : ""}</TableCell>
                  <TableCell className="text-right font-semibold tabular">{rupees(r.balance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Appoint a partner                                                    */
/* ------------------------------------------------------------------ */
const EMPTY_PARTNER = { tier: "", name: "", ownerName: "", phone: "", email: "", gstin: "", address: "", city: "", pincode: "", state: "West Bengal", creditLimitRupees: "", creditDays: "30", territory: "", password: "" };

export function AppointPartnerModal({
  open,
  onClose,
  tiers,
  parent,
  byPartner,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tiers: string[];
  parent?: { partyType: PartyType; id: string; name: string } | null;
  byPartner: boolean;
  onDone: (r: any) => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_PARTNER, tier: tiers[0] || "" });
  const [territories, setTerritories] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...EMPTY_PARTNER, tier: tiers.includes(f.tier) ? f.tier : tiers[0] || "" }));
      api<any[]>("/api/territories?flat=1").then(setTerritories).catch(() => setTerritories([]));
    }
  }, [open, tiers]);
  const wantKind = form.tier === "SUPER_DISTRIBUTOR" ? "DISTRICT" : "AREA";
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<any>("/api/network/partners", {
        method: "POST",
        json: {
          ...form,
          parentType: parent?.partyType,
          parentId: parent?.id,
          creditLimitRupees: Number(form.creditLimitRupees || 0),
          creditDays: Number(form.creditDays || 30),
          territories: form.territory ? [form.territory] : [],
          login: form.password ? { email: form.email, password: form.password } : null,
        },
      });
      onDone(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof EMPTY_PARTNER, upper = false) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: upper ? e.target.value.toUpperCase() : e.target.value });
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      maxWidth="2xl"
      title={parent ? `Appoint under ${parent.name}` : "Onboard a partner"}
      description={
        byPartner
          ? "The account starts as pending. It becomes active once the company has verified the GST, PAN and signed agreement."
          : parent
            ? "The credit limit you enter is set by the supplying partner; no company approval is needed."
            : "Company-supplied partners start at ₹0 credit; any limit you enter goes to the Business Head and Managing Partner."
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Partner type">
          <select id="ap-tier" className="field" value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value, territory: "" })}>
            {tiers.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={form.tier === "SUPER_DISTRIBUTOR" ? "District allocated" : "Area"}>
          <select id="ap-territory" className="field" value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })}>
            <option value="">— not allocated —</option>
            {territories
              .filter((t) => t.kind === wantKind)
              .map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} ({t.code})
                </option>
              ))}
          </select>
        </Field>
        <Field label="Business name">
          <Input id="ap-name" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Owner / contact person">
          <Input id="ap-owner" value={form.ownerName} onChange={set("ownerName")} />
        </Field>
        <Field label="Mobile">
          <Input id="ap-phone" inputMode="numeric" maxLength={10} value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="Email (also the login)">
          <Input id="ap-email" type="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="GSTIN">
          <Input id="ap-gstin" maxLength={15} value={form.gstin} onChange={set("gstin", true)} />
        </Field>
        <Field label="Pincode">
          <Input id="ap-pin" inputMode="numeric" maxLength={6} value={form.pincode} onChange={set("pincode")} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input id="ap-address" value={form.address} onChange={set("address")} />
        </Field>
        <Field label="City">
          <Input id="ap-city" value={form.city} onChange={set("city")} />
        </Field>
        <Field label="State">
          <Input id="ap-state" value={form.state} onChange={set("state")} />
        </Field>
        <Field label={parent || byPartner ? "Credit limit you give (₹)" : "Requested credit limit (₹)"}>
          <Input id="ap-credit" inputMode="numeric" value={form.creditLimitRupees} onChange={set("creditLimitRupees")} />
        </Field>
        <Field label="Credit days">
          <Input id="ap-days" inputMode="numeric" value={form.creditDays} onChange={set("creditDays")} />
        </Field>
        <Field label="Portal password (blank = no login yet)" className="sm:col-span-2">
          <Input id="ap-password" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
        </Field>
      </div>
      {error && <Notice className="mt-3">{error}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || !form.tier} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {byPartner ? "Appoint" : "Create"}
        </Button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Small action modals used on My network                                */
/* ------------------------------------------------------------------ */
export function QuickFormModal({
  open,
  onClose,
  title,
  description,
  fields,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  fields: Array<{ key: string; label: string; type?: string; options?: Array<[string, string]>; initial?: string; numeric?: boolean }>;
  submitLabel: string;
  onSubmit: (v: Record<string, string>) => Promise<void>;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setV(Object.fromEntries(fields.map((f) => [f.key, f.initial ?? (f.options ? f.options[0][0] : "")])));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(v);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title={title} description={description}>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            {f.options ? (
              <select id={`qf-${f.key}`} className="field" value={v[f.key] || ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                {f.options.map(([val, lab]) => (
                  <option key={val} value={val}>
                    {lab}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`qf-${f.key}`}
                type={f.type || "text"}
                inputMode={f.numeric ? "decimal" : undefined}
                value={v[f.key] || ""}
                onChange={(e) => setV({ ...v, [f.key]: f.numeric ? e.target.value.replace(/[^\d.]/g, "") : e.target.value })}
              />
            )}
          </Field>
        ))}
      </div>
      {error && <Notice className="mt-3">{error}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={go}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <IndianRupee className="h-4 w-4" />} {submitLabel}
        </Button>
      </div>
    </Modal>
  );
}
