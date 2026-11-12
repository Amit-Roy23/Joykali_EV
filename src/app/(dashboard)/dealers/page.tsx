"use client";
import { useSession } from "@/components/layout/session";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Store, PlusCircle, Search, Eye, MapPin, Truck, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { ChargeBar, EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";

export default function DealersListPage() {
  const { can } = useSession();
  const [dealers, setDealers] = useState<any[]>([]);
  const [asms, setAsms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    ownerName: "",
    phone: "",
    email: "",
    address: "",
    city: "Barasat",
    state: "West Bengal",
    gstin: "",
    assignedASM: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchDealers = () => {
    setLoading(true);
    fetch(`/api/dealers?search=${search}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setDealers(res.data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDealers();
    fetch("/api/employees?role=ASM")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setAsms(res.data);
      });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/dealers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to register dealer");
        setSubmitting(false);
        return;
      }
      setIsModalOpen(false);
      setSubmitting(false);
      fetchDealers();
    } catch (err: any) {
      alert(err.message);
      setSubmitting(false);
    }
  };

  const totalStock = dealers.reduce((n, d) => n + (d.stockCount || 0), 0);
  const totalSold = dealers.reduce((n, d) => n + (d.soldCount || 0), 0);
  const maxStock = Math.max(1, ...dealers.map((d) => d.stockCount || 0));

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Network"
        title="Dealer network"
        description={`${dealers.length} dealers · ${totalStock} vehicles on dealer floors · ${totalSold} delivered through dealers`}
        actions={
          can("dealer.manage") && (
            <Button size="sm" onClick={() => setIsModalOpen(true)}>
              <PlusCircle className="h-4 w-4" /> Onboard dealer
            </Button>
          )
        }
      />

      <form
        className="relative mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          fetchDealers();
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search dealer, code, owner or city — press Enter" className="pl-9" />
      </form>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : dealers.length === 0 ? (
        <Card>
          <EmptyState icon={Store} title="No dealers found" description="Try another search, or onboard a new dealer." />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {dealers.map((d) => (
            <Link
              key={d._id}
              href={`/dealers/${d._id}`}
              className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift sm:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex rounded-md bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-volt-300">{d.dealerCode}</span>
                  <p className="mt-2 truncate font-display text-base font-semibold text-slate-900">{d.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500">
                    <MapPin className="h-3 w-3 shrink-0" /> {d.city}, {d.state}
                  </p>
                </div>
                <StatusBadge status={d.status} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <Truck className="h-3 w-3" /> On floor
                  </p>
                  <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular">{d.stockCount}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <ShoppingCart className="h-3 w-3" /> Delivered
                  </p>
                  <p className="mt-1 font-display text-xl font-bold text-slate-900 tabular">{d.soldCount}</p>
                </div>
              </div>
              <ChargeBar value={d.stockCount || 0} max={maxStock} segments={8} tone="brand" animated={false} className="mt-3" label="Stock level" />

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
                <div className="min-w-0">
                  <p className="text-slate-500">Owner</p>
                  <p className="truncate font-medium text-slate-800">{d.ownerName}</p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="text-slate-500">Area manager</p>
                  <p className="truncate font-medium text-slate-800">{d.assignedASM?.name || "Unassigned"}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Onboard New Dealership"
        description="Register a new franchise dealership and assign an Area Sales Manager"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dealership Business Name *</Label>
              <Input
                required
                placeholder="e.g. Green Wheels EV Barasat"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Owner / Proprietor Name *</Label>
              <Input
                required
                placeholder="e.g. Rajesh Ghosh"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone Number *</Label>
              <Input
                required
                placeholder="9876543210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                required
                placeholder="dealer@gmail.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>GSTIN *</Label>
              <Input
                required
                placeholder="19ABCDE1234F1Z5"
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                className="mt-1 font-mono uppercase"
              />
            </div>
            <div>
              <Label>City *</Label>
              <Input
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>State *</Label>
              <Input
                required
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Showroom Address *</Label>
            <Input
              required
              placeholder="Full showroom street address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Assigned Area Sales Manager (ASM)</Label>
            <select
              className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-500"
              value={form.assignedASM}
              onChange={(e) => setForm({ ...form, assignedASM: e.target.value })}
            >
              <option value="">-- Optional: Assign ASM --</option>
              {asms.map((asm) => (
                <option key={asm._id} value={asm._id}>
                  {asm.name} ({asm.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-brand-600 hover:bg-brand-500 text-white"
            >
              {submitting ? "Onboarding..." : "Register Dealership"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

