"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GitFork, IndianRupee, Landmark, PlusCircle, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { api, CreditMeter, Notice } from "@/components/workflow";
import { AppointPartnerModal, QuickFormModal, TierBadge } from "@/components/network";

const nextMonth = () => {
  const d = new Date(Date.now() + 330 * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** My downline: appoint partners, give them credit, record their payments, set their targets. */
export default function MyNetworkPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [appoint, setAppoint] = useState(false);
  const [action, setAction] = useState<null | { kind: "credit" | "payment" | "target"; child: any }>(null);

  const load = useCallback(() => {
    api<any>("/api/network/partners").then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (!data) return error ? <Notice>{error}</Notice> : <Skeleton className="h-64" />;
  const tiers: string[] = data.parent?.appointable || [];
  const c = action?.child;
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="My business"
        title="My network"
        description="Partners you supply. You set their credit limit and targets, record what they pay you, and sell to them from your stock. New partners stay pending until the company verifies their KYC."
        actions={
          tiers.length > 0 && (
            <Button size="sm" onClick={() => setAppoint(true)}>
              <PlusCircle className="h-4 w-4" /> Appoint
            </Button>
          )
        }
      />
      {notice && <Notice tone="success" className="mb-4">{notice}</Notice>}
      {error && <Notice className="mb-4">{error}</Notice>}
      {data.children.length === 0 ? (
        <Card>
          <EmptyState
            icon={GitFork}
            title="No partners under you yet"
            description={tiers.length ? "Appoint your first dealer or sub dealer." : "Your account type cannot appoint partners."}
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.children.map((k: any) => (
            <li key={k._id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
              <Link href={`/partner/network/${k.partyType}/${k._id}`} className="block">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TierBadge tier={k.tier} />
                      <span className="font-mono text-[11px] text-slate-500">{k.code}</span>
                    </div>
                    <p className="mt-1.5 truncate font-semibold text-slate-900 hover:text-brand-700">{k.name}</p>
                    <p className="text-xs text-slate-500">
                      {k.city} · {k.stock} in stock
                    </p>
                  </div>
                  <StatusBadge status={k.status} label={k.status === "PENDING" ? "KYC PENDING" : undefined} />
                </div>
              </Link>
              <div className="mt-3">{k.credit && <CreditMeter credit={k.credit} compact />}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setAction({ kind: "credit", child: k })}>
                  <Landmark className="h-3.5 w-3.5" /> Credit
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAction({ kind: "payment", child: k })}>
                  <IndianRupee className="h-3.5 w-3.5" /> Payment
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAction({ kind: "target", child: k })}>
                  <Target className="h-3.5 w-3.5" /> Target
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AppointPartnerModal
        open={appoint}
        onClose={() => setAppoint(false)}
        tiers={tiers}
        byPartner
        onDone={(r) => {
          setAppoint(false);
          setNotice(`${r.partner.name} appointed as ${r.code}. It becomes active once the company verifies its GST, PAN and agreement.${r.login ? ` Login: ${r.login.email}.` : ""}`);
          load();
        }}
      />
      <QuickFormModal
        open={action?.kind === "credit"}
        onClose={() => setAction(null)}
        title={`Credit limit for ${c?.name || ""}`}
        description="This is credit you give from your own books."
        submitLabel="Save limit"
        fields={[
          { key: "limitRupees", label: "Credit limit (₹)", numeric: true, initial: c?.credit ? String(Math.round(c.credit.limit / 100)) : "" },
          { key: "creditDays", label: "Credit days", numeric: true, initial: c?.credit ? String(c.credit.creditDays) : "30" },
          { key: "reason", label: "Reason" },
        ]}
        onSubmit={async (v) => {
          await api(`/api/network/credit/${c.partyType}/${c._id}`, { method: "POST", json: { limitRupees: Number(v.limitRupees), creditDays: Number(v.creditDays), reason: v.reason } });
          load();
        }}
      />
      <QuickFormModal
        open={action?.kind === "payment"}
        onClose={() => setAction(null)}
        title={`Payment from ${c?.name || ""}`}
        description="Credited to their account in your books; a receipt number is issued."
        submitLabel="Record payment"
        fields={[
          { key: "amountRupees", label: "Amount (₹)", numeric: true },
          { key: "mode", label: "Mode", options: [["BANK", "Bank transfer"], ["UPI", "UPI"], ["CHEQUE", "Cheque"], ["CASH", "Cash"]] },
          { key: "reference", label: "UTR / cheque no." },
          { key: "date", label: "Date", type: "date" },
        ]}
        onSubmit={async (v) => {
          await api("/api/network/payments", { method: "POST", json: { buyerType: c.partyType, buyerId: c._id, amountRupees: Number(v.amountRupees), mode: v.mode, reference: v.reference, date: v.date || undefined } });
          setNotice(`Payment recorded for ${c.name}.`);
          load();
        }}
      />
      <QuickFormModal
        open={action?.kind === "target"}
        onClose={() => setAction(null)}
        title={`Monthly target for ${c?.name || ""}`}
        description="Units they should buy from you in the month. Commission per unit is paid only if the target is reached."
        submitLabel="Save target"
        fields={[
          { key: "period", label: "Month", type: "month", initial: nextMonth() },
          { key: "targetUnits", label: "Target (units)", numeric: true },
          { key: "commissionPerUnitRupees", label: "Commission per unit (₹)", numeric: true },
        ]}
        onSubmit={async (v) => {
          await api("/api/targets", { method: "POST", json: { partyType: c.partyType, partyId: c._id, period: v.period, targetUnits: Number(v.targetUnits), commissionPerUnitRupees: Number(v.commissionPerUnitRupees || 0) } });
          setNotice(`Target saved for ${c.name}.`);
        }}
      />
    </div>
  );
}
