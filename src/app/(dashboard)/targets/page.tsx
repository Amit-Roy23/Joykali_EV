"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlusCircle, Target, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, Notice, rupees, rupeesShort } from "@/components/workflow";
import { QuickFormModal, TierBadge } from "@/components/network";

const thisMonth = () => {
  const d = new Date(Date.now() + 330 * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

function Board() {
  const { can, user } = useSession();
  const sp = useSearchParams();
  const [period, setPeriod] = useState(sp.get("period") || thisMonth());
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setOpen, setSetOpen] = useState(false);
  const [parties, setParties] = useState<Array<[string, string]>>([]);

  const load = useCallback(() => {
    setData(null);
    api<any>(`/api/targets?period=${period}`).then(setData).catch((e) => setError(e.message));
  }, [period]);
  useEffect(load, [load]);
  const isStaff = !!user && !["SUPER_DISTRIBUTOR", "DISTRIBUTOR", "DEALER", "SUB_DEALER"].includes(user.role);

  const openSet = async () => {
    setSetOpen(true);
    if (isStaff) {
      const t = await api<any>("/api/network/tree");
      setParties(t.nodes.filter((n: any) => n.type !== "OUTLET").map((n: any) => [`${n.type}:${n.id}`, `${n.name} (${n.code})`]));
    } else {
      const r = await api<any>("/api/network/partners");
      setParties(r.children.map((c: any) => [`${c.partyType}:${c._id}`, `${c.name} (${c.code})`]));
    }
  };
  const settle = async (id: string) => {
    setError(null);
    try {
      const t = await api<any>(`/api/targets/${id}/settle`, { method: "POST" });
      setNotice(t.settlement.status === "SETTLED" ? `Settled: credit note ${t.settlement.creditNote} for ${rupees(t.settlement.amount)}` : "Sent to the Business Head and Managing Partner for approval.");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const past = period < thisMonth();
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Channel"
        title="Targets & ranking"
        description="Monthly purchase targets per partner and how far each has got. Commission is earned on every unit once the unit target is reached, and paid as a credit note after the month ends (company commission needs Business Head and Managing Partner approval)."
        actions={
          <>
            <Input id="period" type="month" className="h-9 w-40" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
            {(can("target.manage") || can("partner.appoint")) && (
              <Button size="sm" onClick={openSet}>
                <PlusCircle className="h-4 w-4" /> Set target
              </Button>
            )}
          </>
        }
      />
      {notice && <Notice tone="success" className="mb-4">{notice}</Notice>}
      {error && <Notice className="mb-4">{error}</Notice>}
      {!data ? (
        <Skeleton className="h-64" />
      ) : data.rows.length === 0 ? (
        <Card>
          <EmptyState icon={Target} title="No targets for this month" />
        </Card>
      ) : (
        <ul className="space-y-2">
          {data.rows.map((r: any) => {
            const pct = Math.min(100, r.pct);
            return (
              <li key={r._id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display text-sm font-bold", r.rank === 1 ? "bg-volt-300 text-ink-900" : r.rank <= 3 ? "bg-ink-900 text-white" : "bg-slate-100 text-slate-600")}>
                    {r.rank === 1 ? <Trophy className="h-4 w-4" /> : `#${r.rank}`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TierBadge tier={r.tier} />
                      <span className="truncate font-semibold text-slate-900">{r.partyName}</span>
                      <span className="font-mono text-[11px] text-slate-500">{r.partyCode}</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className={cn("h-full rounded-full", r.pct >= 100 ? "bg-emerald-500" : r.pct >= 60 ? "bg-brand-500" : "bg-amber-500")} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {r.achievedUnits} / {r.targetUnits} units ({r.pct}%) · {rupeesShort(r.achievedValue)} bought
                      {r.commissionPerUnit ? ` · ${rupees(r.commissionPerUnit)}/unit commission` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-bold tabular text-slate-900">{rupees(r.commission)}</p>
                    <p className="text-[11px] text-slate-500">
                      {r.settlement?.status === "SETTLED" ? `settled · ${r.settlement.creditNote}` : r.settlement?.status === "PENDING_APPROVAL" ? "awaiting approval" : r.commission ? "earned" : "not earned"}
                    </p>
                    {past && r.commission > 0 && (!r.settlement || r.settlement.status === "REJECTED") && (r.setByType === "COMPANY" ? can("target.manage") : !isStaff) && (
                      <Button size="sm" variant="outline" className="mt-1" onClick={() => settle(r._id)}>
                        Settle
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <QuickFormModal
        open={setOpen}
        onClose={() => setSetOpen(false)}
        title="Set a monthly target"
        description={isStaff ? "For partners the company supplies. Partners set targets for their own network." : "For partners you supply."}
        submitLabel="Save target"
        fields={[
          { key: "party", label: "Partner", options: parties.length ? parties : [["", "Loading…"]] },
          { key: "period", label: "Month", type: "month", initial: thisMonth() },
          { key: "targetUnits", label: "Target (units)", numeric: true },
          { key: "commissionPerUnitRupees", label: "Commission per unit (₹)", numeric: true },
        ]}
        onSubmit={async (v) => {
          const [partyType, partyId] = (v.party || parties[0]?.[0] || "").split(":");
          await api("/api/targets", { method: "POST", json: { partyType, partyId, period: v.period, targetUnits: Number(v.targetUnits), commissionPerUnitRupees: Number(v.commissionPerUnitRupees || 0) } });
          load();
        }}
      />
    </div>
  );
}

export default function TargetsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Board />
    </Suspense>
  );
}
