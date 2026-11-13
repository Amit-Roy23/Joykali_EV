"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Loader2, MapPin, PlusCircle, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { api, CreditMeter, Notice, rupees } from "@/components/workflow";

const EMPTY = { name: "", ownerName: "", phone: "", email: "", address: "", city: "", pincode: "", gstin: "", state: "West Bengal", creditDays: "30", requestedCreditLimit: "", loginPassword: "" };

export default function DistributorsPage() {
  const { can } = useSession();
  const [list, setList] = useState<any[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<any>(null);

  const load = useCallback(() => {
    api<any[]>(`/api/distributors${search ? `?search=${encodeURIComponent(search)}` : ""}`)
      .then(setList)
      .catch((e) => setError(e.message));
  }, [search]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const save = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const r = await api<any>("/api/distributors", {
        method: "POST",
        json: {
          ...form,
          creditDays: Number(form.creditDays || 30),
          requestedCreditLimit: Number(form.requestedCreditLimit || 0),
          login: form.loginPassword ? { email: form.email, password: form.loginPassword } : undefined,
        },
      });
      setCreated(r);
      setOpen(false);
      setForm(EMPTY);
      load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const F = (k: keyof typeof EMPTY, label: string, props: any = {}) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: props.upper ? e.target.value.toUpperCase() : e.target.value })} {...props} upper={undefined} />
    </div>
  );

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Channel"
        title="Distributors"
        description="Distributors buy vehicles on tax invoices within an approved credit limit, place orders on their portal and confirm deliveries with a GRN."
        actions={
          can("distributor.manage") && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <PlusCircle className="h-4 w-4" /> Onboard distributor
            </Button>
          )
        }
      />
      {created && (
        <Notice tone="success" className="mb-4">
          {created.distributor.name} onboarded as <b>{created.distributor.distributorCode}</b>.
          {created.login && <> Portal login: {created.login.email} (must change password on first login).</>} An opening credit limit, if requested, now awaits Business Head and Managing Partner approval.
        </Notice>
      )}
      {error && <Notice className="mb-4">{error}</Notice>}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code or city" className="pl-9" />
      </div>
      {!list ? (
        <Skeleton className="h-64" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="No distributors yet" />
        </Card>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => (
            <li key={d._id}>
              <Link href={`/distributors/${d._id}`} className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-lift sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-md bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-volt-300">{d.distributorCode}</span>
                    <p className="mt-2 truncate font-display text-base font-semibold text-slate-900">{d.name}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" /> {d.city}, {d.state} · GSTIN {d.gstin}
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
                <div className="mt-4">
                  <CreditMeter credit={d.credit} compact />
                </div>
                {d.pendingCredit && <p className="mt-2 text-xs font-semibold text-amber-700">Limit change to {rupees(d.pendingCredit.toLimit)} awaiting approval</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Onboard a distributor" description="The credit limit starts at ₹0; any requested limit needs Business Head + Managing Partner approval." maxWidth="2xl">
        <div className="grid gap-3 sm:grid-cols-2">
          {F("name", "Business name")}
          {F("ownerName", "Owner / contact person")}
          {F("phone", "Mobile", { inputMode: "numeric", maxLength: 10 })}
          {F("email", "Email (also the portal login)")}
          {F("gstin", "GSTIN", { upper: true, maxLength: 15 })}
          {F("pincode", "Pincode", { inputMode: "numeric", maxLength: 6 })}
          <div className="sm:col-span-2">{F("address", "Address")}</div>
          {F("city", "City")}
          {F("state", "State")}
          {F("requestedCreditLimit", "Requested credit limit (₹)", { inputMode: "numeric" })}
          {F("creditDays", "Credit days", { inputMode: "numeric" })}
          <div className="sm:col-span-2">{F("loginPassword", "Portal password (leave blank to skip the login)", { type: "password" })}</div>
        </div>
        <p className="mt-2 text-xs text-slate-500">The GST state code is taken from the GSTIN: invoices to another state carry IGST, within West Bengal CGST + SGST.</p>
        {formError && <Notice className="mt-3">{formError}</Notice>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Onboard
          </Button>
        </div>
      </Modal>
    </div>
  );
}
