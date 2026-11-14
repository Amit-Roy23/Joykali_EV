"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, PlusCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, Notice } from "@/components/workflow";
import { QuickFormModal } from "@/components/network";

/** Company showrooms: stock on the floor, sales this month, staff. */
export default function OutletsPage() {
  const { can } = useSession();
  const [list, setList] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    api<any[]>("/api/outlets").then(setList).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Retail"
        title="Outlets & showrooms"
        description="Company-owned showrooms hold their own stock, sent from the warehouse on a branch transfer, and bill customers at the counter."
        actions={
          can("outlet.manage") && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <PlusCircle className="h-4 w-4" /> New outlet
            </Button>
          )
        }
      />
      {error && <Notice className="mb-4">{error}</Notice>}
      {!list ? (
        <Skeleton className="h-48" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={Boxes} title="No outlets yet" />
        </Card>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => (
            <li key={o._id}>
              <Link href={`/outlets/${o._id}`} className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:border-brand-200 hover:shadow-lift">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="inline-flex rounded-md bg-ink-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-volt-300">{o.outletCode}</span>
                    <p className="mt-2 truncate font-display text-base font-semibold text-slate-900">{o.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {o.address}, {o.city}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2.5 text-center text-[11px]">
                  <div>
                    <p className="text-slate-500">On floor</p>
                    <p className="font-semibold tabular text-slate-900">{o.stock}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Sold (month)</p>
                    <p className="font-semibold tabular text-slate-900">{o.monthSales}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Staff</p>
                    <p className="font-semibold tabular text-slate-900">{o.staff}</p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <QuickFormModal
        open={open}
        onClose={() => setOpen(false)}
        title="New outlet"
        submitLabel="Create outlet"
        fields={[
          { key: "name", label: "Showroom name" },
          { key: "city", label: "City" },
          { key: "address", label: "Address" },
          { key: "pincode", label: "Pincode", numeric: true },
          { key: "phone", label: "Phone", numeric: true },
        ]}
        onSubmit={async (v) => {
          await api("/api/outlets", { method: "POST", json: v });
          load();
        }}
      />
    </div>
  );
}
