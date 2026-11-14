"use client";

import React, { useEffect, useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader, PageSkeleton } from "@/components/ui/kit";
import { api, CreditMeter, Notice } from "@/components/workflow";
import { DepositPanel, KycPanel, StatementCard, TierBadge } from "@/components/network";

/** Partner portal: my credit, my statement with my supplier (downloadable), my KYC and deposit. */
export default function AccountPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<any>("/api/network/catalogue").then(setData).catch((e) => setError(e.message));
  }, []);
  if (!data) return error ? <Notice>{error}</Notice> : <PageSkeleton />;
  const me = data.me;
  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            My account <TierBadge tier={me.tier} />
          </span>
        }
        title={me.name}
        description={`${me.code} · buys from ${data.supplier ? data.supplier.name : "Joykali EV Mobility"}`}
        actions={<StatusBadge status={me.status} label={me.status === "PENDING" ? "KYC PENDING" : undefined} />}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Credit</CardTitle>
            <CardDescription>{data.supplier ? `Given by ${data.supplier.name}` : "Approved by the Business Head and Managing Partner"}</CardDescription>
          </CardHeader>
          <div className="px-5 pb-5">{data.credit ? <CreditMeter credit={data.credit} /> : <p className="text-sm text-slate-500">No credit yet.</p>}</div>
        </Card>
        <DepositPanel partyType={me.type} partyId={String(me.id)} canRecord={false} />
      </div>
      <StatementCard />
      <KycPanel partyType={me.type} partyId={String(me.id)} />
    </div>
  );
}
