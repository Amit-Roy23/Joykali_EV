"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Loader2, MapPin, Search, Warehouse, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, RoleBadge, Skeleton } from "@/components/ui/kit";
import { cn } from "@/components/ui/button";
import { formatRupees } from "@/lib/money";

type PayMode = "CASH" | "UPI" | "BANK" | "FINANCE";
const PAY_MODES: Array<{ id: PayMode; label: string }> = [
  { id: "UPI", label: "UPI" },
  { id: "CASH", label: "Cash" },
  { id: "BANK", label: "Bank transfer" },
  { id: "FINANCE", label: "Finance / EMI" },
];
const CATEGORY_LABEL: Record<string, string> = { "2W": "2-Wheeler", "3W": "3-Wheeler", "4W": "4-Wheeler", E_RICKSHAW: "E-Rickshaw", LOADER: "Loader" };

function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

const num = (v: string) => (v === "" ? 0 : Math.max(0, Number(v)));

export default function NewSalePage() {
  const router = useRouter();
  const [opts, setOpts] = useState<{ vehicles: any[]; sellers: any[]; dealers: any[] } | null>(null);
  const [me, setMe] = useState<any>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", idProofType: "Aadhaar", idProofNumber: "" });
  const [modelFilter, setModelFilter] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [soldBy, setSoldBy] = useState("");
  const [dealerId, setDealerId] = useState("");
  const [price, setPrice] = useState({ exShowroom: 0, discount: 0, registration: 0, insurance: 0, accessories: 0 });
  const [paymentMode, setPaymentMode] = useState<PayMode>("UPI");
  const [financier, setFinancier] = useState({ financierName: "", loanAmount: 0, downPayment: 0, loanAccountNo: "" });
  const [paid, setPaid] = useState<string>("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/sales/available").then((r) => r.json()), fetch("/api/auth/me").then((r) => r.json())])
      .then(([o, m]) => {
        if (!o.success) throw new Error(o.error);
        setOpts(o.data);
        const user = m.data?.user;
        setMe(user);
        // Default attribution is always the person recording the sale.
        const self = o.data.sellers.find((s: any) => String(s._id) === String(user?._id));
        setSoldBy(self ? self._id : o.data.sellers[0]?._id || "");
      })
      .catch((e) => setLoadErr(e.message || "Could not load stock"));
  }, []);

  const vehicle = opts?.vehicles.find((v) => v._id === vehicleId);
  const models = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }>();
    for (const v of opts?.vehicles || []) {
      const id = v.model?._id;
      if (!id) continue;
      m.set(id, { id, name: v.model.name, count: (m.get(id)?.count || 0) + 1 });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [opts]);

  const list = (opts?.vehicles || []).filter(
    (v) =>
      (modelFilter === "ALL" || v.model?._id === modelFilter) &&
      (!q || `${v.chassisNumber} ${v.color} ${v.model?.name} ${v.currentLocationDealer?.name || ""}`.toLowerCase().includes(q.toLowerCase()))
  );

  const pick = (v: any) => {
    setVehicleId(v._id);
    const commercial = ["E_RICKSHAW", "LOADER", "3W"].includes(v.model?.category);
    setPrice((p) => ({ ...p, exShowroom: (v.model?.sellingPrice || 0) / 100, discount: 0, registration: commercial ? 4500 : 1200, insurance: commercial ? 8000 : 3500 }));
    setDealerId(v.currentLocationDealer?._id || "");
  };

  const gstRate = vehicle?.model?.gstRate ?? 5;
  const taxable = Math.max(0, price.exShowroom - price.discount);
  const gst = Math.round((taxable * gstRate) / 100);
  const total = taxable + gst + price.registration + price.insurance + price.accessories;
  const isSelfOnly = opts?.sellers.length === 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!vehicle) return setError("Pick the vehicle being delivered.");
    if (!/^[0-9]{10}$/.test(customer.phone)) return setError("Customer phone must be 10 digits.");
    if (price.discount > price.exShowroom) return setError("Discount cannot exceed the ex-showroom price.");
    setSaving(true);
    try {
      const payload: any = {
        saleDate: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), // IST calendar date
        customer,
        vehicleId,
        dealerId: dealerId || null,
        soldBy,
        priceBreakdown: { ...price, gst },
        paymentMode,
        initialPayment: { amount: paid === "" ? (paymentMode === "FINANCE" ? financier.downPayment : total) : Number(paid), reference: reference || undefined },
      };
      if (paymentMode === "FINANCE") payload.financierDetails = financier;
      const res = await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Could not record the sale");
      router.push(`/sales/${data.data._id}?created=1`);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  if (loadErr) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{loadErr}</div>;

  return (
    <form onSubmit={submit} className="animate-fade-up pb-24 lg:pb-0">
      <PageHeader
        backHref="/sales"
        eyebrow="New invoice"
        title="Record a sale"
        description="Delivering a vehicle generates the GST invoice, moves the stock and updates incentives instantly."
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-4">
          {/* 1. Vehicle */}
          <Card>
            <CardHeader>
              <CardTitle><span className="mr-2 text-brand-600">1</span>Choose the vehicle</CardTitle>
              <CardDescription>
                {opts ? `${opts.vehicles.length} vehicles available to you — warehouse${opts.dealers.length ? " and your dealer floor" : ""}` : "Loading stock…"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!opts ? (
                <Skeleton className="h-40" />
              ) : opts.vehicles.length === 0 ? (
                <EmptyState icon={Warehouse} title="No sellable stock" description="Ask your Business Head to allocate vehicles to your dealer." />
              ) : (
                <>
                  <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {[{ id: "ALL", name: "All models", count: opts.vehicles.length }, ...models].map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => setModelFilter(m.id)}
                        className={cn(
                          "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                          modelFilter === m.id ? "border-ink-900 bg-ink-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {m.name} <span className="opacity-60">{m.count}</span>
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chassis no., colour or dealer" className="pl-9" />
                  </div>
                  <div className="scroll-thin grid max-h-[340px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {list.map((v) => {
                      const on = v._id === vehicleId;
                      return (
                        <button
                          type="button"
                          key={v._id}
                          onClick={() => pick(v)}
                          className={cn(
                            "relative rounded-2xl border p-3 text-left transition",
                            on ? "border-brand-500 bg-brand-50/60 ring-4 ring-brand-500/10" : "border-slate-200 bg-white hover:border-brand-200"
                          )}
                        >
                          {on && (
                            <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                          <p className="pr-6 text-sm font-semibold text-slate-900">{v.model?.name}</p>
                          <p className="text-[11px] text-slate-500">{CATEGORY_LABEL[v.model?.category] || v.model?.category} · {v.color}</p>
                          <p className="mt-2 truncate font-mono text-[11px] text-slate-600">{v.chassisNumber}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] text-slate-500">
                              {v.currentLocationDealer ? <MapPin className="h-3 w-3 shrink-0" /> : <Warehouse className="h-3 w-3 shrink-0" />}
                              <span className="truncate">{v.currentLocationDealer ? v.currentLocationDealer.name : "Main warehouse"}</span>
                            </span>
                            <span className="shrink-0 text-xs font-bold text-slate-900 tabular">{formatRupees((v.model?.sellingPrice || 0) / 100)}</span>
                          </div>
                        </button>
                      );
                    })}
                    {list.length === 0 && <p className="col-span-full py-6 text-center text-sm text-slate-500">No vehicles match.</p>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* 2. Customer */}
          <Card>
            <CardHeader>
              <CardTitle><span className="mr-2 text-brand-600">2</span>Customer details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name *">
                <Input required minLength={2} value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="e.g. Anupam Ghosh" autoComplete="off" />
              </Field>
              <Field label="Mobile number *">
                <Input required inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value.replace(/\D/g, "") })} placeholder="10-digit mobile" />
              </Field>
              <Field label="Email">
                <Input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="optional" />
              </Field>
              <Field label="ID proof">
                <div className="flex gap-2">
                  <select className="field w-32 shrink-0" value={customer.idProofType} onChange={(e) => setCustomer({ ...customer, idProofType: e.target.value })}>
                    <option>Aadhaar</option>
                    <option>Voter ID</option>
                    <option>PAN</option>
                    <option>Driving Licence</option>
                  </select>
                  <Input value={customer.idProofNumber} onChange={(e) => setCustomer({ ...customer, idProofNumber: e.target.value })} placeholder="Number" />
                </div>
              </Field>
              <Field label="Address *" className="sm:col-span-2">
                <Input required minLength={5} value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="House, street, town, PIN" />
              </Field>
            </CardContent>
          </Card>

          {/* 3. Pricing */}
          <Card>
            <CardHeader>
              <CardTitle><span className="mr-2 text-brand-600">3</span>Pricing</CardTitle>
              <CardDescription>Ex-showroom fills in from the model. GST @ {gstRate}% is calculated automatically.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Ex-showroom (₹)">
                <Input type="number" min={0} inputMode="decimal" value={price.exShowroom || ""} onChange={(e) => setPrice({ ...price, exShowroom: num(e.target.value) })} />
              </Field>
              <Field label="Discount (₹)">
                <Input type="number" min={0} inputMode="decimal" value={price.discount || ""} onChange={(e) => setPrice({ ...price, discount: num(e.target.value) })} placeholder="0" />
              </Field>
              <Field label={`GST @ ${gstRate}% (₹)`}>
                <Input value={gst.toLocaleString("en-IN")} disabled />
              </Field>
              <Field label="RTO registration (₹)">
                <Input type="number" min={0} inputMode="decimal" value={price.registration || ""} onChange={(e) => setPrice({ ...price, registration: num(e.target.value) })} placeholder="0" />
              </Field>
              <Field label="Insurance (₹)">
                <Input type="number" min={0} inputMode="decimal" value={price.insurance || ""} onChange={(e) => setPrice({ ...price, insurance: num(e.target.value) })} placeholder="0" />
              </Field>
              <Field label="Accessories (₹)">
                <Input type="number" min={0} inputMode="decimal" value={price.accessories || ""} onChange={(e) => setPrice({ ...price, accessories: num(e.target.value) })} placeholder="0" />
              </Field>
            </CardContent>
          </Card>

          {/* 4. Payment & attribution */}
          <Card>
            <CardHeader>
              <CardTitle><span className="mr-2 text-brand-600">4</span>Payment &amp; attribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PAY_MODES.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setPaymentMode(m.id)}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
                      paymentMode === m.id ? "border-brand-500 bg-brand-50 text-brand-800 ring-4 ring-brand-500/10" : "border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {paymentMode === "FINANCE" && (
                <div className="grid gap-4 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
                  <Field label="Financier *">
                    <Input required value={financier.financierName} onChange={(e) => setFinancier({ ...financier, financierName: e.target.value })} placeholder="e.g. Bajaj Finance" />
                  </Field>
                  <Field label="Loan account no.">
                    <Input value={financier.loanAccountNo} onChange={(e) => setFinancier({ ...financier, loanAccountNo: e.target.value })} />
                  </Field>
                  <Field label="Loan amount (₹)">
                    <Input type="number" min={0} value={financier.loanAmount || ""} onChange={(e) => setFinancier({ ...financier, loanAmount: num(e.target.value) })} />
                  </Field>
                  <Field label="Down payment (₹)" hint={total ? `Balance to finance: ${formatRupees(Math.max(0, total - financier.downPayment))}` : undefined}>
                    <Input type="number" min={0} value={financier.downPayment || ""} onChange={(e) => setFinancier({ ...financier, downPayment: num(e.target.value) })} />
                  </Field>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Amount received now (₹)" hint={paid === "" ? "Defaults to the full amount (or down payment for finance)" : undefined}>
                  <Input type="number" min={0} value={paid} onChange={(e) => setPaid(e.target.value)} placeholder={formatRupees(paymentMode === "FINANCE" ? financier.downPayment : total)} />
                </Field>
                <Field label="Payment reference">
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / UPI ref (optional)" />
                </Field>
                <Field label="Salesperson credited" hint={isSelfOnly ? "Sales you record are credited to you." : "Incentives go to this person and their ASM."}>
                  {isSelfOnly ? (
                    <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm">
                      <span className="font-semibold text-slate-900">{opts?.sellers[0]?.name}</span>
                      <RoleBadge role={opts?.sellers[0]?.role} short />
                    </div>
                  ) : (
                    <select className="field" value={soldBy} onChange={(e) => setSoldBy(e.target.value)} required>
                      {opts?.sellers.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} · {s.employeeCode}
                          {String(s._id) === String(me?._id) ? " (you)" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Dealer" hint={vehicle?.currentLocationDealer ? "Set by where the vehicle is." : "Optional for warehouse sales."}>
                  <select className="field" value={dealerId} onChange={(e) => setDealerId(e.target.value)} disabled={!!vehicle?.currentLocationDealer}>
                    <option value="">Direct (warehouse)</option>
                    {vehicle?.currentLocationDealer && !opts?.dealers.some((d) => d._id === vehicle.currentLocationDealer._id) && (
                      <option value={vehicle.currentLocationDealer._id}>{vehicle.currentLocationDealer.name}</option>
                    )}
                    {opts?.dealers.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}, {d.city}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-4">
          <div className="surface-ink rounded-3xl p-5 text-white shadow-lift">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              <Zap className="h-3.5 w-3.5 text-volt-300" /> Invoice summary
            </p>
            {vehicle ? (
              <div className="mt-3">
                <p className="font-display text-lg font-semibold">{vehicle.model?.name}</p>
                <p className="text-xs text-slate-400">{vehicle.model?.variant} · {vehicle.color}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">{vehicle.chassisNumber}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">No vehicle selected yet.</p>
            )}
            <dl className="mt-4 space-y-1.5 border-t border-white/10 pt-4 text-sm">
              {[
                ["Ex-showroom", price.exShowroom],
                ["Discount", -price.discount],
                [`GST ${gstRate}%`, gst],
                ["Registration", price.registration],
                ["Insurance", price.insurance],
                ["Accessories", price.accessories],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between text-slate-300">
                  <dt>{k}</dt>
                  <dd className="tabular">{(v as number) < 0 ? `− ${formatRupees(-(v as number))}` : formatRupees(v as number)}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4">
              <span className="text-xs uppercase tracking-wider text-slate-400">On-road total</span>
              <span className="font-display text-3xl font-bold text-volt-300 tabular">{formatRupees(total)}</span>
            </div>
            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-500/15 p-3 text-xs text-rose-200 ring-1 ring-rose-400/30" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            )}
            <Button type="submit" variant="volt" size="lg" className="mt-5 hidden w-full lg:flex" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Confirm delivery &amp; invoice
            </Button>
          </div>
        </aside>
      </div>

      {/* Mobile sticky action bar (above the tab bar) */}
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        {error && (
          <p className="mx-auto mb-2 flex max-w-lg items-start gap-1.5 text-xs font-medium text-rose-600" role="alert">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">On-road total</p>
            <p className="font-display text-lg font-bold text-slate-900 tabular">{formatRupees(total)}</p>
          </div>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Confirm sale
          </Button>
        </div>
      </div>
    </form>
  );
}
