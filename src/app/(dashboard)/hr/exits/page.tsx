"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Calculator, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees } from "@/components/workflow";

/** Resignations: manager accepts (last day, notice waiver) → HR computes F&F → BH + MP approve → login closes on the last day. */
export default function ExitsPage() {
  const { can, user } = useSession();
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lwd, setLwd] = useState<Record<string, string>>({});
  const [waive, setWaive] = useState<Record<string, boolean>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const load = useCallback(() => {
    api<any[]>("/api/hr/resignations").then(setList).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  const act = async (id: string, json: any) => {
    setErr(null);
    try {
      await api(`/api/hr/resignations/${id}`, { method: "POST", json });
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  if (!list) return err ? <Notice>{err}</Notice> : <Skeleton className="h-48" />;
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="People"
        title="Exits & final settlement"
        description="Full & final = salary for the days worked in the final month + earned-leave encashment + gratuity (after 5 years: 15/26 × basic × years) + approved claims − notice shortfall − outstanding loans. It needs the Business Head and the Managing Partner; the login closes on the last working day."
      />
      {err && <Notice>{err}</Notice>}
      {list.length === 0 ? (
        <Card>
          <EmptyState title="No resignations" />
        </Card>
      ) : (
        list.map((r) => {
          const own = String(r.employee) === String(user?.userId);
          return (
            <Card key={r._id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-semibold">{r.employeeName}</p>
                  <p className="text-xs text-slate-500">
                    Resigned {dt(r.submittedAt)} · asked for last day {r.requestedLwd} · notice {r.noticeDays} days
                    {r.acceptedLwd ? ` · accepted last day ${r.acceptedLwd}${r.noticeWaived ? " (shortfall waived)" : ""} by ${r.acceptedByName}` : ""}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">“{r.reason}”</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
              {r.status === "SUBMITTED" && !own && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label>Last working day</Label>
                    <Input id={`lwd-${r._id}`} type="date" className="h-9" value={lwd[r._id] ?? r.requestedLwd} onChange={(e) => setLwd({ ...lwd, [r._id]: e.target.value })} />
                  </div>
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input id={`wv-${r._id}`} type="checkbox" checked={!!waive[r._id]} onChange={(e) => setWaive({ ...waive, [r._id]: e.target.checked })} /> Waive notice shortfall
                  </label>
                  <Button size="sm" onClick={() => act(r._id, { action: "accept", lwd: lwd[r._id] ?? r.requestedLwd, noticeWaived: !!waive[r._id] })}>
                    <Check className="h-4 w-4" /> Accept
                  </Button>
                </div>
              )}
              {["ACCEPTED", "SETTLEMENT_PENDING"].includes(r.status) && can("hr.manage") && !own && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label>Other recoveries (₹)</Label>
                    <Input id={`ot-${r._id}`} className="h-9 w-36" inputMode="numeric" value={other[r._id] || ""} onChange={(e) => setOther({ ...other, [r._id]: e.target.value.replace(/\D/g, "") })} placeholder="e.g. unreturned phone" />
                  </div>
                  <Button size="sm" variant="outline" onClick={() => act(r._id, { action: "compute", otherDeductionsRupees: Number(other[r._id] || 0) })}>
                    <Calculator className="h-4 w-4" /> {r.settlement ? "Recompute" : "Compute"} settlement
                  </Button>
                </div>
              )}
              {r.settlement && (
                <div className="rounded-xl bg-slate-50 p-3">
                  <ul className="space-y-1 text-sm">
                    {r.settlement.lines.map((l: any) => (
                      <li key={l.label} className="flex justify-between gap-3">
                        <span className="text-slate-600">{l.label}</span>
                        <span className={l.amount < 0 ? "tabular text-rose-700" : "tabular"}>{rupees(l.amount)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                      <span>Net payable</span>
                      <span>{rupees(r.settlement.net)}</span>
                    </li>
                  </ul>
                  {r.status === "SETTLEMENT_PENDING" && <p className="mt-2 text-xs text-slate-500">Waiting for {r.approvals?.length ? "the Managing Partner" : "the Business Head"} in Approvals.</p>}
                </div>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
