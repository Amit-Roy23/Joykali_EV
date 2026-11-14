"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  Bike,
  CalendarClock,
  CheckCircle2,
  FileText,
  Gauge,
  PackageCheck,
  Plus,
  Sparkles,
  Store,
  Trophy,
  Users,
  Warehouse,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChargeBar, PageSkeleton, StatCard, TrendPill } from "@/components/ui/kit";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/components/ui/button";
import { formatINR } from "@/lib/money";
import { OutletDashboard, PartnerDashboard } from "@/components/dashboards/partner";
import {
  Leaderboard,
  MonthlyBars,
  RankedBars,
  RecentSales,
  formatRupees,
  formatRupeesShort,
} from "@/components/dashboard/widgets";

const CATEGORY_LABEL: Record<string, string> = {
  "2W": "Two-wheelers",
  "3W": "Three-wheelers (L5)",
  "4W": "Four-wheelers",
  E_RICKSHAW: "E-Rickshaws",
  LOADER: "Cargo loaders",
};

/** Very compact axis ticks: ₹75L, ₹1.2Cr. */
const axisRupees = (v: number) =>
  v >= 1e7 ? `₹${+(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${Math.round(v / 1e5)}L` : v >= 1e3 ? `₹${Math.round(v / 1e3)}K` : `₹${v}`;

function monthName(period?: string) {
  if (!period) return "";
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/dashboard").then((r) => r.json()), fetch("/api/auth/me").then((r) => r.json())])
      .then(([d, m]) => {
        if (!d.success) throw new Error(d.error || "Failed to load dashboard");
        setData(d.data);
        setMe(m.data?.user ?? m.data);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error)
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        <AlertTriangle className="h-5 w-5" /> {error}
      </div>
    );
  if (!data) return <PageSkeleton />;

  const firstName = (me?.name || "").replace(/^(Md\.|Sk\.)\s*/, "").split(" ")[0];
  const header = (
    <div className="mb-5 flex flex-col gap-1 sm:mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">{monthName(data.period)}</p>
      <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-[28px]">
        {greeting()}{firstName ? `, ${firstName}` : ""}
      </h1>
    </div>
  );

  if (data.role === "PARTNER") return <PartnerDashboard data={data} header={header} />;
  if (data.role === "OUTLET") return <OutletDashboard data={data} header={header} />;
  if (data.role === "FEC") return <FecDashboard data={data} header={header} />;
  if (data.role === "ASM") return <AsmDashboard data={data} header={header} />;
  return <ExecutiveDashboard data={data} header={header} />;
}

/* ================================================================== */
/* Executive: Business Head / Managing Partner / Admin                 */
/* ================================================================== */
function ExecutiveDashboard({ data, header }: { data: any; header: React.ReactNode }) {
  const k = data.kpis;
  return (
    <div className="animate-fade-up">
      {header}

      {/* Hero: this month's revenue */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-ink relative flex flex-col justify-between gap-6 overflow-hidden rounded-3xl p-5 text-white shadow-lift sm:p-6 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Revenue this month</p>
              <p className="mt-2 font-display text-4xl font-bold tracking-tight tabular sm:text-5xl">{formatRupeesShort(k.revenue)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                {k.revenueTrend != null && <TrendPill value={k.revenueTrend} />}
                <span>vs same days last month · {formatRupees(k.revenue)} invoiced</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center sm:gap-3">
              <div className="rounded-2xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10">
                <p className="font-display text-2xl font-bold tabular">{k.units}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Delivered</p>
              </div>
              <div className="rounded-2xl bg-volt-300/10 px-4 py-3 ring-1 ring-volt-300/25">
                <p className="font-display text-2xl font-bold text-volt-300 tabular">{k.projectedUnits}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-volt-200/70">Projected</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-y border-white/10 py-4 sm:gap-4">
            {[
              { k: "Avg. ticket", v: formatRupeesShort(k.avgTicket) },
              { k: "Financed", v: `${k.financeShare}%` },
              { k: "Cancelled", v: String(k.cancelled) },
            ].map((x) => (
              <div key={x.k}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{x.k}</p>
                <p className="mt-1 font-display text-lg font-semibold tabular sm:text-xl">{x.v}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
              <span>Month progress toward projection</span>
              <span className="tabular">{Math.round((k.units / Math.max(1, k.projectedUnits)) * 100)}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="charge-stripes h-full animate-charge rounded-full bg-gradient-to-r from-volt-400 to-volt-300"
                style={{ width: `${Math.min(100, (k.units / Math.max(1, k.projectedUnits)) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <ActionCenter actions={data.actions} />
      </div>

      {/* KPI row */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Warehouse stock" value={k.inStock} sub="units ready to allocate" icon={Warehouse} tone="sky" />
        <StatCard label="At dealers" value={k.atDealers} sub={`across ${k.dealers} active dealers`} icon={Store} tone="volt" />
        <StatCard label="Incentives accrued" value={formatRupeesShort(k.incentivesThisMonth)} sub="this month, all schemes" icon={Trophy} tone="amber" />
        <StatCard label="Team strength" value={k.employees} sub="active employees" icon={Users} tone="brand" />
      </div>

      {/* Trend + mix */}
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Revenue, last 6 months</CardTitle>
            <CardDescription>{k.sixMonthUnits} vehicles delivered in this window · invoice value incl. GST</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars data={data.trend} dataKey="revenue" label="Revenue" format={formatRupees} axisFormat={axisRupees} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What&apos;s selling</CardTitle>
            <CardDescription>Units by vehicle category, last 3 months</CardDescription>
          </CardHeader>
          <CardContent>
            <RankedBars
              rows={data.mix.map((m: any) => ({ key: m.category, label: CATEGORY_LABEL[m.category] || m.category, value: m.units }))}
              valueLabel={(v) => `${v} units`}
            />
          </CardContent>
        </Card>
      </div>

      {/* People + dealers + recent */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top performers</CardTitle>
            <CardDescription>Deliveries this month</CardDescription>
          </CardHeader>
          <CardContent>
            <Leaderboard rows={data.leaderboard} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Dealer performance</CardTitle>
              <CardDescription>Units sold this month</CardDescription>
            </div>
            <Link href="/dealers" className="text-xs font-semibold text-brand-700 hover:underline">
              Dealers
            </Link>
          </CardHeader>
          <CardContent>
            <RankedBars
              rows={data.dealerPerformance.map((d: any) => ({
                key: d.code,
                label: d.name,
                value: d.units,
                sub: `${d.city} · ${formatRupeesShort(d.revenue)}`,
              }))}
              valueLabel={(v) => `${v}`}
            />
          </CardContent>
        </Card>
        <RecentSales sales={data.recentSales} />
      </div>
    </div>
  );
}

function ActionCenter({ actions }: { actions: any[] }) {
  const toneIcon: Record<string, { icon: any; cls: string }> = {
    amber: { icon: CalendarClock, cls: "bg-amber-50 text-amber-600 ring-amber-100" },
    brand: { icon: PackageCheck, cls: "bg-brand-50 text-brand-600 ring-brand-100" },
    rose: { icon: AlertTriangle, cls: "bg-rose-50 text-rose-600 ring-rose-100" },
  };
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Needs your attention</CardTitle>
        <CardDescription>Approvals, payroll and stock alerts</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {actions?.length ? (
          <ul className="space-y-2">
            {actions.map((a, i) => {
              const t = toneIcon[a.tone] || toneIcon.brand;
              const Icon = t.icon;
              return (
                <li key={i}>
                  <Link href={a.href} className="group flex items-center gap-3 rounded-xl border border-slate-100 p-2.5 transition hover:border-brand-200 hover:bg-brand-50/40">
                    <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1", t.cls)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{a.label}</span>
                    <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="mt-2 text-sm font-semibold text-slate-800">All caught up</p>
            <p className="text-xs text-slate-500">No pending approvals or alerts.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/* Area Sales Manager                                                  */
/* ================================================================== */
function AsmDashboard({ data, header }: { data: any; header: React.ReactNode }) {
  const k = data.kpis;
  return (
    <div className="animate-fade-up">
      {header}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Team deliveries" value={k.units} trend={k.unitsTrend != null ? { value: k.unitsTrend } : null} sub="vs same days last month" icon={Bike} tone="brand" />
        <StatCard label="Team revenue" value={formatRupeesShort(k.revenue)} trend={k.revenueTrend != null ? { value: k.revenueTrend } : null} sub="vs same days last month" icon={BadgeIndianRupee} tone="emerald" />
        <StatCard label="My override earnings" value={formatRupees(k.incentive)} sub="this month, auto-calculated" icon={Trophy} tone="amber" />
        <StatCard label="Active sellers" value={`${k.active}/${k.teamSize}`} sub="FECs with a delivery this month" icon={Users} tone="volt">
          <ChargeBar value={k.active} max={Math.max(1, k.teamSize)} segments={Math.max(1, k.teamSize)} className="mt-3" tone="brand" animated={false} />
        </StatCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Team leaderboard</CardTitle>
            <CardDescription>Deliveries this month — everyone on your team</CardDescription>
          </CardHeader>
          <CardContent>
            <Leaderboard rows={data.leaderboard} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Team deliveries, last 6 months</CardTitle>
            <CardDescription>Units delivered by you and your FECs</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars data={data.trend} dataKey="units" label="Units" format={(v) => `${v}`} height={240} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My dealers</CardTitle>
            <CardDescription>Stock on the floor and sales this month</CardDescription>
          </CardHeader>
          <CardContent>
            {data.dealers.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.dealers.map((d: any) => (
                  <li key={d._id}>
                    <Link href={`/dealers/${d._id}`} className="block rounded-2xl border border-slate-200 p-3.5 transition hover:border-brand-200 hover:shadow-card">
                      <p className="truncate text-sm font-semibold text-slate-900">{d.name}</p>
                      <p className="text-xs text-slate-500">{d.city} · <span className="font-mono">{d.dealerCode}</span></p>
                      <div className="mt-3 flex gap-4 text-xs">
                        <span><b className="font-display text-base text-slate-900 tabular">{d.stock}</b> <span className="text-slate-500">in stock</span></span>
                        <span><b className="font-display text-base text-slate-900 tabular">{d.soldThisMonth}</b> <span className="text-slate-500">sold</span></span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No dealers assigned to you yet.</p>
            )}
          </CardContent>
        </Card>
        <RecentSales sales={data.recentSales} />
      </div>
    </div>
  );
}

/* ================================================================== */
/* Field Executive                                                     */
/* ================================================================== */
function FecDashboard({ data, header }: { data: any; header: React.ReactNode }) {
  const k = data.kpis;
  const m = data.milestone;
  return (
    <div className="animate-fade-up">
      {header}

      {/* Hero: earnings + charge bar to next milestone */}
      <div className="surface-ink relative overflow-hidden rounded-3xl p-5 text-white shadow-lift sm:p-7">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              <Zap className="h-3.5 w-3.5 text-volt-300" /> Incentive earned this month
            </p>
            <p className="mt-2 font-display text-5xl font-bold tracking-tight text-volt-300 tabular sm:text-6xl">{formatRupees(k.incentive)}</p>
            <p className="mt-2 text-sm text-slate-300">
              {k.units} deliver{k.units === 1 ? "y" : "ies"} · {formatRupeesShort(k.revenue)} sales value
              {k.rank && <> · #{k.rank.position} of {k.rank.of} in your team</>}
            </p>
          </div>
          <Link
            href="/sales/new"
            className="inline-flex items-center justify-center gap-2 self-start rounded-2xl bg-volt-300 px-5 py-3 text-sm font-bold text-ink-900 shadow-glow transition hover:bg-volt-200 md:self-auto"
          >
            <Plus className="h-4 w-4" /> Record a sale
          </Link>
        </div>

        <div className="mt-7 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10">
          {m ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">
                  {m.target - k.units} more to unlock <span className="text-volt-300">{m.reward}</span>
                </p>
                <p className="text-xs text-slate-400">{m.scheme}</p>
              </div>
              <ChargeBar value={k.units} max={m.target} segments={m.target} className="mt-3 [&>div:first-child]:border-white/15 [&>div:first-child]:bg-white/10 [&>div:last-child]:bg-white/20" />
              <p className="mt-2 text-xs text-slate-400 tabular">{k.units} / {m.target} units</p>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm font-semibold text-volt-300">
              <Sparkles className="h-4 w-4" /> Top tier reached on every active scheme — fully charged!
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>My deliveries, last 6 months</CardTitle>
            <CardDescription>{data.profile?.dealer ? `Based at ${data.profile.dealer}` : "Personal sales"}</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars data={data.trend} dataKey="units" label="Units" height={200} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>How this month adds up</CardTitle>
            <CardDescription>Updated automatically on every sale</CardDescription>
          </CardHeader>
          <CardContent>
            {k.incentiveBreakdown.length ? (
              <ul className="space-y-2.5">
                {k.incentiveBreakdown.map((b: any, i: number) => (
                  <li key={i} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{b.scheme}</p>
                      <p className="text-xs text-slate-500">{b.description}</p>
                    </div>
                    <p className={cn("shrink-0 text-sm font-bold tabular", b.amount > 0 ? "text-emerald-700" : "text-slate-400")}>
                      {formatRupees(b.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No active scheme has paid out yet this month.</p>
            )}
            <Link href="/incentives/my-incentives" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
              Full incentive details <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RecentSales sales={data.recentSales} showSeller={false} />
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>My payslips</CardTitle>
              <CardDescription>Download as PDF</CardDescription>
            </div>
            <Link href="/payslips" className="text-xs font-semibold text-brand-700 hover:underline">
              All payslips
            </Link>
          </CardHeader>
          <CardContent>
            {data.payslips.length ? (
              <ul className="space-y-2">
                {data.payslips.map((p: any) => (
                  <li key={p._id}>
                    <a
                      href={`/api/payslips/${p._id}/pdf`}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-brand-200 hover:bg-brand-50/40"
                    >
                      <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900">
                          {new Date(Date.UTC(p.payrollRun?.year, (p.payrollRun?.month || 1) - 1, 15)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
                        </p>
                        <p className="truncate font-mono text-[11px] text-slate-500">{p.payslipCode}</p>
                      </div>
                      <p className="text-sm font-bold text-slate-900 tabular">{formatINR(p.netPay, false)}</p>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                <Gauge className="h-5 w-5" /> Payslips appear here once payroll is run.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

