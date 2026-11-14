"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftRight, PackageCheck, Search, Send, Store, Wallet } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader, PageSkeleton, StatCard } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees, rupeesShort } from "@/components/workflow";

const MODE: Record<string, string> = { CASH: "Cash", UPI: "UPI", BANK: "Bank", FINANCE: "Finance" };
const todayIst = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/** Showroom: day closing (bills and collections by mode), floor stock, branch transfers in and out. */
export default function OutletDetail() {
  const { id } = useParams<{ id: string }>();
  const { can, user } = useSession();
  const [date, setDate] = useState(todayIst());
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [send, setSend] = useState<null | "TO_OUTLET" | "TO_WAREHOUSE">(null);
  const [pool, setPool] = useState<any[]>([]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<any>(`/api/outlets/${id}?date=${date}`).then(setD).catch((e) => setError(e.message));
  }, [id, date]);
  useEffect(load, [load]);

  const openSend = async (dir: "TO_OUTLET" | "TO_WAREHOUSE") => {
    setSend(dir);
    setPick(new Set());
    setQ("");
    if (dir === "TO_OUTLET") {
      const res = await fetch(`/api/vehicles?status=IN_STOCK&limit=100`).then((r) => r.json());
      setPool(res.data || []);
    } else setPool(d.stock);
  };
  const doSend = async () => {
    setBusy(true);
    setError(null);
    try {
      const t = await api<any>("/api/outlets/transfers", { method: "POST", json: { outletId: id, direction: send, vehicleIds: [...pick] } });
      setSend(null);
      setNotice(`${t.transferCode}: ${t.vehicles.length} vehicle(s) ${send === "TO_OUTLET" ? `sent to ${d.outlet.name}` : "sent back to the warehouse"}. The receiving side must confirm.`);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const receive = async (tid: string) => {
    setError(null);
    try {
      await api(`/api/outlets/transfers/${tid}`, { method: "POST" });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!d) return error ? <Notice>{error}</Notice> : <PageSkeleton />;
  const collected = Object.values(d.collected || {}).reduce((s: number, v: any) => s + v, 0) as number;
  const shownPool = pool.filter((v) => !q || v.chassisNumber.includes(q.toUpperCase()) || (v.model?.name || "").toLowerCase().includes(q.toLowerCase()));
  const pendingIn = d.transfers.filter((t: any) => t.status === "IN_TRANSIT");
  const canReceive = (t: any) => (t.direction === "TO_OUTLET" ? user?.role === "OUTLET" || can("outlet.manage") : can("outlet.manage"));
  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        backHref={can("outlet.manage") ? "/outlets" : undefined}
        eyebrow={<span className="font-mono">{d.outlet.outletCode}</span>}
        title={d.outlet.name}
        description={`${d.outlet.address}, ${d.outlet.city}${d.outlet.phone ? ` · ${d.outlet.phone}` : ""}`}
        actions={
          <>
            {can("outlet.manage") && (
              <Button size="sm" onClick={() => openSend("TO_OUTLET")}>
                <Send className="h-4 w-4" /> Send stock
              </Button>
            )}
            {(can("outlet.manage") || user?.role === "OUTLET") && d.stock.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => openSend("TO_WAREHOUSE")}>
                <ArrowLeftRight className="h-4 w-4" /> Return to warehouse
              </Button>
            )}
          </>
        }
      />
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice>{error}</Notice>}
      {pendingIn.length > 0 && (
        <Card className="overflow-hidden border-sky-200">
          <CardHeader>
            <CardTitle>Transfers on the way</CardTitle>
            <CardDescription>Check the chassis numbers on arrival, then confirm. The sender cannot confirm their own transfer.</CardDescription>
          </CardHeader>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {pendingIn.map((t: any) => (
              <li key={t._id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <b className="font-mono">{t.transferCode}</b> · {t.direction === "TO_OUTLET" ? "from warehouse" : "back to warehouse"} · by {t.createdByName}, {dt(t.createdAt, true)}
                  <p className="truncate font-mono text-xs text-slate-500">{t.vehicles.map((v: any) => v.chassisNumber).join(", ")}</p>
                </div>
                {canReceive(t) && (
                  <Button size="sm" onClick={() => receive(t._id)}>
                    <PackageCheck className="h-4 w-4" /> Confirm receipt
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-slate-900">Day closing</h2>
        <Input id="day" type="date" className="h-9 w-44" value={date} max={todayIst()} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bills" value={d.sales.length} sub={rupeesShort(d.billed)} icon={Store} tone="emerald" />
        <StatCard label="Collected" value={rupeesShort(collected)} sub="all modes" icon={Wallet} tone="brand" />
        {["CASH", "UPI"].map((m) => (
          <StatCard key={m} label={MODE[m]} value={rupees(d.collected?.[m] || 0)} sub={m === "CASH" ? "count the drawer against this" : "match with the UPI app"} tone="slate" />
        ))}
      </div>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Bills on {dt(`${date}T12:00:00+05:30`)}</CardTitle>
        </CardHeader>
        {d.sales.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">No bills on this day.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {d.sales.map((s: any) => (
              <li key={s._id}>
                <Link href={`/sales/${s._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className="min-w-0 text-sm">
                    <b>{s.customer?.name}</b> · {s.saleCode}
                    <span className="block truncate text-xs text-slate-500">
                      {s.vehicle?.model?.name} · {s.vehicle?.chassisNumber} · by {s.soldBy?.name} · {String(s.paymentMode).toLowerCase()}
                    </span>
                  </span>
                  <span className="font-semibold tabular">{rupees(s.totalAmount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>On the floor ({d.stock.length})</CardTitle>
        </CardHeader>
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">
          {d.stock.map((v: any) => (
            <li key={v._id} className="bg-white px-5 py-3">
              <p className="font-mono text-sm font-semibold">{v.chassisNumber}</p>
              <p className="text-xs text-slate-500">
                {v.model?.name} {v.model?.variant} · {v.color} · {rupees(v.model?.sellingPrice)}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Staff</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
          {d.staff.map((u: any) => (
            <li key={u._id} className="flex justify-between px-5 py-2.5">
              <span>
                {u.name} <span className="text-xs text-slate-500">{u.employeeCode}</span>
              </span>
              <StatusBadge status={u.status} />
            </li>
          ))}
        </ul>
      </Card>

      <Modal isOpen={!!send} onClose={() => setSend(null)} maxWidth="2xl" title={send === "TO_OUTLET" ? `Send stock to ${d.outlet.name}` : "Return stock to the warehouse"} description="Branch transfer within the company — a transfer note is issued, no invoice.">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input id="pool-q" className="pl-9" placeholder="Chassis or model" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
          {shownPool.map((v) => (
            <li key={v._id} className={cn("flex items-center gap-3 px-3 py-2", pick.has(v._id) && "bg-brand-50")}>
              <input
                id={`tp-${v._id}`}
                type="checkbox"
                className="h-4 w-4 accent-brand-600"
                checked={pick.has(v._id)}
                onChange={() => {
                  const s = new Set(pick);
                  if (s.has(v._id)) s.delete(v._id);
                  else s.add(v._id);
                  setPick(s);
                }}
              />
              <label htmlFor={`tp-${v._id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                <span className="font-mono font-semibold">{v.chassisNumber}</span>
                <span className="block truncate text-xs text-slate-500">
                  {v.model?.name} {v.model?.variant} · {v.color}
                </span>
              </label>
            </li>
          ))}
          {shownPool.length === 0 && <li className="p-4 text-center text-sm text-slate-500">No vehicles available.</li>}
        </ul>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-sm text-slate-600">{pick.size} selected</span>
          <Button disabled={busy || pick.size === 0} onClick={doSend}>
            <Send className="h-4 w-4" /> Send {pick.size || ""}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
