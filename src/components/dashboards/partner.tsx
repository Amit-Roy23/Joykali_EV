"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Boxes, GitFork, HandCoins, PackageCheck, ShieldAlert, ShoppingCart, Store, Target, Truck, Wallet } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/kit";
import { StatusBadge } from "@/components/ui/badge";
import { Button, cn } from "@/components/ui/button";
import { CreditMeter, dt, Notice, rupees, rupeesShort } from "@/components/workflow";
import { TierBadge } from "@/components/network";

const LEDGER_LABEL: Record<string, string> = { OPENING: "Opening", INVOICE: "Invoice", PAYMENT: "Payment", CREDIT_NOTE: "Credit note", ADJUSTMENT: "Adjustment" };

/** Home for every channel partner: super distributor, distributor, dealer, sub dealer. */
export function PartnerDashboard({ data, header }: { data: any; header: React.ReactNode }) {
  if (!data.me) {
    return (
      <div className="animate-fade-up">
        {header}
        <Card className="p-6 text-sm text-slate-600">Your login is not linked to a partner account. Please contact Joykali.</Card>
      </div>
    );
  }
  const { me, credit, kyc, month, network, target } = data;
  const pct = target?.units ? Math.min(100, Math.round((target.achieved / target.units) * 100)) : 0;
  return (
    <div className="animate-fade-up space-y-5">
      {header}
      <div className="flex flex-col gap-3 rounded-2xl bg-ink-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={me.tier} />
            <span className="font-mono text-xs text-volt-300">{me.code}</span>
            {me.status !== "ACTIVE" && <StatusBadge status={me.status} />}
          </div>
          <p className="mt-2 truncate font-display text-xl font-bold">{me.name}</p>
          <p className="text-sm text-slate-300">
            {me.city} · buys from <b className="text-white">{data.supplier.name}</b>
          </p>
        </div>
        <Link href="/partner/buy">
          <Button className="w-full bg-volt-300 text-ink-900 hover:bg-volt-200 sm:w-auto">
            <ShoppingCart className="h-4 w-4" /> Buy stock
          </Button>
        </Link>
      </div>

      {me.status === "PENDING" && (
        <Notice tone="warning">
          Your account is waiting for KYC verification. Upload your GST certificate, PAN and the signed agreement under My Account; ordering opens once the company verifies them.
        </Notice>
      )}
      {kyc && !kyc.complete && me.status === "ACTIVE" && (
        <Notice tone="info">
          KYC incomplete: {kyc.missing.length} document(s) still needed. <Link className="font-semibold underline" href="/account">Upload now</Link>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Stock I own" value={data.stock.owned} sub={data.stock.consignment ? `+${data.stock.consignment} on consignment` : "ready to sell"} icon={Boxes} tone="brand" />
        <StatCard label="Arriving" value={data.incoming.length} sub="shipments in transit" icon={Truck} tone="sky" />
        <StatCard label="Sold this month" value={month.retailUnits + month.channelUnits} sub={`${rupeesShort(month.retailValue + month.channelValue)} billed`} icon={HandCoins} tone="emerald" />
        {network.children > 0 || data.me.tier !== "SUB_DEALER" ? (
          <StatCard label="My network" value={network.children} sub={network.pendingOrders ? `${network.pendingOrders} orders to handle` : `${rupeesShort(network.receivable)} receivable`} icon={GitFork} tone="amber" />
        ) : (
          <StatCard label="Dues" value={rupeesShort(credit?.ledgerBalance || 0)} sub="to my supplier" icon={Wallet} tone="amber" />
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Credit from {data.supplier.name}</CardTitle>
            <CardDescription>{data.buysFromCompany ? "Approved by the company's Business Head and Managing Partner" : "Set by your supplier"}</CardDescription>
          </CardHeader>
          <div className="px-5 pb-5">{credit ? <CreditMeter credit={credit} /> : <p className="text-sm text-slate-500">No credit set yet.</p>}</div>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>This month&apos;s target</CardTitle>
              <CardDescription>{target ? `${target.achieved} of ${target.units} units bought` : "No target set for this month"}</CardDescription>
            </div>
            <Target className="h-5 w-5 text-brand-600" />
          </CardHeader>
          <div className="px-5 pb-5">
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-brand-500")} style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {target?.commissionPerUnit
                ? pct >= 100
                  ? `Target met: commission ${rupees(target.commissionPerUnit * target.achieved)} earned`
                  : `Reach ${target.units} units to earn ${rupees(target.commissionPerUnit)} per unit`
                : `${rupeesShort(data.achieved.value)} purchased this month`}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Arriving shipments</CardTitle>
            <Link href="/partner/stock" className="text-xs font-semibold text-brand-700">
              Receive <ArrowRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          {data.incoming.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500">Nothing on the way.</p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {data.incoming.map((s: any) => (
                <li key={s.id}>
                  <Link href={s.href} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{s.code}</span>
                      <span className="text-xs text-slate-500">
                        {s.units} vehicle(s) from {s.from}
                        {s.truck ? ` · ${s.truck}` : ""} · {dt(s.at)}
                      </span>
                    </span>
                    <PackageCheck className="h-5 w-5 shrink-0 text-sky-600" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>My recent orders</CardTitle>
            <Link href="/partner/orders" className="text-xs font-semibold text-brand-700">
              All <ArrowRight className="inline h-3 w-3" />
            </Link>
          </CardHeader>
          {data.myOrders.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {data.myOrders.map((o: any) => (
                <li key={o.id}>
                  <Link href={o.href} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs font-semibold text-brand-700">{o.code}</span>
                      <span className="text-xs text-slate-500">
                        {o.units} units · {rupees(o.total)} · {dt(o.at)}
                      </span>
                    </span>
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Latest account entries</CardTitle>
          <Link href="/account" className="text-xs font-semibold text-brand-700">
            Statement <ArrowRight className="inline h-3 w-3" />
          </Link>
        </CardHeader>
        {data.ledger.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">No entries yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {data.ledger.map((e: any) => (
              <li key={e._id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{LEDGER_LABEL[e.type] || e.type}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {e.reference} · {dt(e.date)}
                  </span>
                </span>
                <span className={cn("font-semibold tabular", e.credit ? "text-emerald-700" : "text-slate-900")}>{e.credit ? `−${rupees(e.credit)}` : rupees(e.debit)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Showroom counter home: today's bills and collections, stock on the floor, stock on its way. */
export function OutletDashboard({ data, header }: { data: any; header: React.ReactNode }) {
  if (!data.outlet) {
    return (
      <div className="animate-fade-up">
        {header}
        <Card className="p-6 text-sm text-slate-600">Your login is not linked to a showroom. Ask an admin to set your outlet.</Card>
      </div>
    );
  }
  const collected = Object.values(data.collected || {}).reduce((s: number, v: any) => s + v, 0) as number;
  return (
    <div className="animate-fade-up space-y-5">
      {header}
      <div className="flex flex-col gap-3 rounded-2xl bg-ink-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <TierBadge tier="OUTLET" />
          <p className="mt-2 truncate font-display text-xl font-bold">{data.outlet.name}</p>
          <p className="text-sm text-slate-300">
            {data.outlet.outletCode} · {data.outlet.city}
          </p>
        </div>
        <Link href="/sales/new">
          <Button className="w-full bg-volt-300 text-ink-900 hover:bg-volt-200 sm:w-auto">
            <HandCoins className="h-4 w-4" /> New counter bill
          </Button>
        </Link>
      </div>
      {data.incoming.length > 0 && (
        <Notice tone="info">
          {data.incoming.length} stock transfer(s) on the way from the warehouse.{" "}
          <Link className="font-semibold underline" href={`/outlets/${data.outlet._id}`}>
            Receive them
          </Link>
        </Notice>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bills today" value={data.sales.length} sub={rupeesShort(data.billed)} icon={HandCoins} tone="emerald" />
        <StatCard label="Collected today" value={rupeesShort(collected)} sub={Object.keys(data.collected || {}).join(" · ") || "no payments yet"} icon={Wallet} tone="brand" />
        <StatCard label="On the floor" value={data.stock.length} sub="vehicles in showroom" icon={Store} tone="sky" />
        <StatCard label="This month" value={data.trend?.at(-1)?.units ?? 0} sub="vehicles sold" icon={Target} tone="amber" />
      </div>
      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Today&apos;s bills</CardTitle>
          <Link href={`/outlets/${data.outlet._id}`} className="text-xs font-semibold text-brand-700">
            Day closing <ArrowRight className="inline h-3 w-3" />
          </Link>
        </CardHeader>
        {data.sales.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">No bills yet today.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {data.sales.map((s: any) => (
              <li key={s._id}>
                <Link href={`/sales/${s._id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{s.customer?.name}</span>
                    <span className="text-xs text-slate-500">
                      {s.saleCode} · {s.vehicle?.model?.name} · {s.vehicle?.chassisNumber}
                    </span>
                  </span>
                  <span className="font-semibold tabular">{rupees(s.totalAmount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
