"use client";

import React from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, EmptyState } from "@/components/ui/kit";
import { StatusBadge } from "@/components/ui/badge";
import { cn } from "@/components/ui/button";
import { formatINR, formatRupees, formatRupeesShort } from "@/lib/money";

const BRAND = "#5146e5";
const BRAND_SOFT = "#8285f8";

/* ---------------------------------------------------------------- */
/* Single-series monthly bar chart; current month emphasised.        */
/* ---------------------------------------------------------------- */
export function MonthlyBars({
  data,
  dataKey,
  format = (v: number) => String(v),
  axisFormat,
  height = 220,
  label,
}: {
  data: Array<Record<string, any>>;
  dataKey: string;
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  height?: number;
  label: string;
}) {
  const last = data.length - 1;
  return (
    <div style={{ height }} className="-ml-2 w-[calc(100%+0.5rem)]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="#e7e8f2" strokeDasharray="0" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: "#6b6f86", fontSize: 11 }} dy={6} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={52}
            tick={{ fill: "#8a8ea3", fontSize: 11 }}
            tickFormatter={axisFormat ?? format}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(81,70,229,0.06)", radius: 8 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                  <p className="font-semibold text-slate-900">{payload[0].payload.month}</p>
                  <p className="mt-0.5 text-slate-600">
                    {label}: <span className="font-semibold text-slate-900 tabular">{format(Number(payload[0].value))}</span>
                  </p>
                </div>
              ) : null
            }
          />
          <Bar dataKey={dataKey} radius={[6, 6, 0, 0]} maxBarSize={44}>
            {data.map((_, i) => (
              <Cell key={i} fill={i === last ? BRAND : BRAND_SOFT} fillOpacity={i === last ? 1 : 0.55} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Ranked horizontal bars (HTML) — category mix, dealer performance. */
/* ---------------------------------------------------------------- */
export function RankedBars({
  rows,
  valueLabel = (v: number) => String(v),
  secondary,
}: {
  rows: Array<{ key: string; label: React.ReactNode; value: number; sub?: React.ReactNode }>;
  valueLabel?: (v: number) => string;
  secondary?: (row: any) => React.ReactNode;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <EmptyState title="No data for this period" className="py-8" />;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium text-slate-800">{r.label}</span>
            <span className="shrink-0 font-semibold text-slate-900 tabular">
              {valueLabel(r.value)}
              {secondary && <span className="ml-2 text-xs font-normal text-slate-500">{secondary(r)}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-[width] duration-700"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          {r.sub && <p className="mt-1 text-[11px] text-slate-500">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- */
/* Leaderboard                                                       */
/* ---------------------------------------------------------------- */
export function Leaderboard({ rows, highlight }: { rows: any[]; highlight?: string }) {
  if (!rows?.length) return <EmptyState title="No deliveries yet this month" className="py-8" />;
  const max = Math.max(1, ...rows.map((r) => r.units));
  return (
    <ol className="divide-y divide-slate-100">
      {rows.map((r, i) => (
        <li
          key={r._id || r.code}
          className={cn("flex items-center gap-3 py-2.5", highlight && String(r._id) === highlight && "rounded-xl bg-volt-50 px-2")}
        >
          <span
            className={cn(
              "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular",
              i === 0 && r.units > 0 ? "bg-volt-300 text-ink-900" : i < 3 && r.units > 0 ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-500"
            )}
          >
            {i + 1}
          </span>
          <Avatar name={r.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{r.name}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.units / max) * 100}%` }} />
            </div>
          </div>
          <div className="w-20 shrink-0 text-right">
            <p className="text-sm font-bold text-slate-900 tabular">{r.units} <span className="text-[11px] font-medium text-slate-500">units</span></p>
            <p className="text-[11px] text-slate-500 tabular">{formatRupeesShort(r.revenue)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- */
/* Recent sales — rows on every screen size (no wide table)          */
/* ---------------------------------------------------------------- */
export function RecentSales({ sales, showSeller = true }: { sales: any[]; showSeller?: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Latest deliveries</CardTitle>
          <CardDescription>Most recent invoices</CardDescription>
        </div>
        <Link href="/sales" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
          All sales <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="px-2 sm:px-3">
        {sales?.length ? (
          <ul className="divide-y divide-slate-100">
            {sales.map((s) => (
              <li key={s._id}>
                <Link href={`/sales/${s._id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-slate-50">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-[10px] font-bold uppercase text-brand-700 ring-1 ring-brand-100">
                    {s.vehicle?.model?.category?.replace("E_RICKSHAW", "E-R").replace("LOADER", "LDR") || "EV"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{s.customer?.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {s.vehicle?.model?.name}
                      {showSeller && s.soldBy?.name ? ` · ${s.soldBy.name}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-slate-900 tabular">{formatINR(s.totalAmount, false)}</p>
                    <div className="mt-0.5 flex items-center justify-end gap-1.5">
                      <span className="text-[11px] text-slate-500">
                        {new Date(s.saleDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                      {s.status !== "DELIVERED" && <StatusBadge status={s.status} />}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No sales yet" description="Recorded sales will show up here." />
        )}
      </CardContent>
    </Card>
  );
}

export { formatRupees, formatRupeesShort };
