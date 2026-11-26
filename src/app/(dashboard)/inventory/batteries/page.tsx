"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BatteryWarning, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, dt, Notice } from "@/components/workflow";
import { REMOVAL_REASONS } from "@/components/batteryPanel";

/** Every battery taken out of a vehicle: why, by whom, where it is kept, and whether it went back. */
export default function BatteryRegisterPage() {
  const [d, setD] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (reason) p.set("reason", reason);
    if (q.trim()) p.set("q", q.trim());
    api<any>(`/api/battery-removals?${p}`).then(setD).catch((e) => setErr(e.message));
  }, [status, reason, q]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const list: any[] = d.list;
  const out = list.filter((r) => r.status === "REMOVED");
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Stock"
        title="Battery out register"
        description="Every battery taken out of a vehicle — the reason and explanation, who did it, where the battery is kept, and whether it was fitted back. Open a vehicle to take a battery out or refit one."
      />
      {err && <Notice>{err}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Vehicles without battery now" value={out.length} icon={BatteryWarning} tone={out.length ? "amber" : "slate"} />
        <StatCard label="Sold without battery" value={list.filter((r) => r.reason === "CUSTOMER_NO_BATTERY").length} tone="sky" />
        <StatCard label="Refitted" value={list.filter((r) => r.status === "REFITTED").length} tone="emerald" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Status" className="field h-9 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          <option value="REMOVED">Battery still out</option>
          <option value="REFITTED">Refitted</option>
        </select>
        <select aria-label="Reason" className="field h-9 w-auto" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">All reasons</option>
          {Object.entries(REMOVAL_REASONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input aria-label="Search" className="pl-8" placeholder="Chassis, battery no., invoice" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState icon={BatteryWarning} title="No batteries taken out" description="When a battery is taken out of a vehicle (or a vehicle is sold without one) it is recorded here." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Battery</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead>Taken out</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell>
                      <Link href={`/inventory/${r.vehicle}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                        {r.chassisNumber}
                      </Link>
                      <p className="text-[11px] text-slate-500">{r.modelName}</p>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.item?.name}
                      <p className="font-mono text-[11px] text-slate-500">{r.serialNo || "—"}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.warehouse?.name} · {r.condition === "GOOD" ? "sellable" : "defective"}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-[300px] text-xs">
                      <p className="font-semibold text-slate-800">{REMOVAL_REASONS[r.reason]}</p>
                      <p className="text-slate-600">{r.notes}</p>
                      {r.saleCode && <p className="text-slate-500">Sale {r.saleCode}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {dt(r.removedAt)}
                      <p className="text-[11px] text-slate-500">{r.removedByName}</p>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.status === "REMOVED" ? (
                        <Badge variant="warning">Battery out</Badge>
                      ) : (
                        <>
                          <Badge variant="success">Refitted</Badge>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {dt(r.refit?.at)} · {r.refit?.byName}
                            {r.refit?.serialNo && r.refit.serialNo !== r.serialNo ? ` · new battery ${r.refit.serialNo}` : ""}
                          </p>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
