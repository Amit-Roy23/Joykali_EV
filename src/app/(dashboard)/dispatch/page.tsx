"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees } from "@/components/workflow";

const STAGES = [
  { key: "warehouse", label: "At warehouse", statuses: ["CREATED", "SUBMITTED"], hint: "Submit, then assign a vehicle" },
  { key: "loading", label: "Loading", statuses: ["LOADING", "LOADED"], hint: "Pick chassis, checklist, invoice & e-way bill" },
  { key: "transit", label: "In transit", statuses: ["DISPATCHED"], hint: "Waiting for the receiver's GRN" },
  { key: "done", label: "Delivered", statuses: ["DELIVERED", "DELIVERED_WITH_ISSUES"], hint: "Goods receipt recorded" },
];

export default function DispatchBoard() {
  const { user } = useSession();
  const [list, setList] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(user?.role === "DISTRIBUTOR" ? "transit" : "warehouse");

  useEffect(() => {
    api<any[]>("/api/delivery-orders")
      .then(setList)
      .catch((e) => setError(e.message));
  }, []);

  const current = STAGES.find((s) => s.key === stage)!;
  const shown = (list || []).filter((d) => current.statuses.includes(d.status));

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow={user?.role === "DISTRIBUTOR" ? "Distributor portal" : "Warehouse"}
        title={user?.role === "DISTRIBUTOR" ? "Deliveries" : "Delivery orders"}
        description={
          user?.role === "DISTRIBUTOR"
            ? "Shipments on their way to you. When a truck arrives, record the goods receipt (GRN) for every vehicle."
            : "Every vehicle leaving the warehouse: DO → loading → invoice / challan & e-way bill → dispatch → receipt."
        }
      />
      {error && <Notice className="mb-4">{error}</Notice>}

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {STAGES.map((s) => {
          const n = (list || []).filter((d) => s.statuses.includes(d.status)).length;
          return (
            <button
              key={s.key}
              onClick={() => setStage(s.key)}
              className={cn(
                "rounded-2xl border p-3 text-left transition",
                stage === s.key ? "border-ink-900 bg-ink-900 text-white" : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <p className={cn("text-[11px] font-semibold uppercase tracking-wider", stage === s.key ? "text-slate-300" : "text-slate-500")}>{s.label}</p>
              <p className="mt-1 font-display text-2xl font-bold tabular">{list ? n : "–"}</p>
              <p className={cn("mt-0.5 hidden text-[11px] sm:block", stage === s.key ? "text-slate-400" : "text-slate-400")}>{s.hint}</p>
            </button>
          );
        })}
      </div>

      {!list ? (
        <Skeleton className="h-64" />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState icon={Truck} title={`Nothing ${current.label.toLowerCase()}`} description="Delivery orders are raised from approved orders." />
        </Card>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((d) => (
            <li key={d._id}>
              <Link href={`/dispatch/${d._id}`} className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-lift">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-brand-700">{d.doCode}</p>
                    <p className="mt-1 truncate font-semibold text-slate-900">{d.partySnapshot?.name}</p>
                    <p className="text-xs text-slate-500">
                      {d.partyType === "DEALER" ? "Dealer" : "Distributor"} · {d.partySnapshot?.city}
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center text-[11px]">
                  <div>
                    <p className="text-slate-500">Vehicles</p>
                    <p className="font-semibold text-slate-900 tabular">
                      {d.status === "LOADING" ? `${d.picked}/${d.units}` : d.units}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Truck</p>
                    <p className="truncate font-semibold text-slate-900">{d.loading?.registrationNo || "—"}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Value</p>
                    <p className="font-semibold text-slate-900 tabular">{d.document?.totalValue ? rupees(d.document.totalValue) : "—"}</p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {d.document?.number ? `${d.document.number} · ` : ""}
                  {d.ewayBill?.ewbNo ? `EWB ${d.ewayBill.ewbNo} · ` : ""}updated {dt(d.updatedAt, true)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
