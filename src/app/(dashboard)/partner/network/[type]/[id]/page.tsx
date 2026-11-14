"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader, PageSkeleton } from "@/components/ui/kit";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { api, CreditMeter, Notice } from "@/components/workflow";
import { DepositPanel, KycPanel, StatementCard, TierBadge } from "@/components/network";

/** One partner in my downline: their account in my books, KYC, deposit. */
export default function ChildPartnerPage() {
  const { type, id } = useParams<{ type: "DEALER" | "DISTRIBUTOR"; id: string }>();
  const [child, setChild] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<any>("/api/network/partners")
      .then((r) => {
        const k = r.children.find((c: any) => String(c._id) === id);
        if (!k) throw new Error("This partner is not in your network");
        setChild(k);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  if (!child) return error ? <Notice>{error}</Notice> : <PageSkeleton />;
  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader backHref="/partner/network" eyebrow={<TierBadge tier={child.tier} />} title={child.name} description={`${child.code} · ${child.city} · GSTIN ${child.gstin} · ${child.phone}`} />
      {child.status === "PENDING" && <Notice tone="warning">Pending: the company has not yet verified this partner&apos;s KYC. You cannot sell to them until it is verified.</Notice>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Credit you give</CardTitle>
          </CardHeader>
          <div className="px-5 pb-5">{child.credit && <CreditMeter credit={child.credit} />}</div>
        </Card>
        <DepositPanel partyType={type} partyId={id} canRecord />
      </div>
      <StatementCard partyType={type} partyId={id} title="Their account in your books" />
      <KycPanel partyType={type} partyId={id} />
    </div>
  );
}
