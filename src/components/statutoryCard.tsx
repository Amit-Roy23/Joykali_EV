"use client";

import React, { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, Notice, rupees } from "@/components/workflow";

/** PF and ESI for a payroll run: challan heads, due date, upload files and missing UAN / IP numbers. */
export function StatutoryCard({ runId }: { runId: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<any>(`/api/payroll/runs/${runId}/statutory`).then(setD).catch((e) => setErr(e.message));
  }, [runId]);
  if (err) return <Notice>{err}</Notice>;
  if (!d) return null;
  const link = (fmt: string, label: string, Icon: any) => (
    <a href={`/api/payroll/runs/${runId}/statutory?format=${fmt}`} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-slate-200 hover:bg-slate-50">
      <Icon className="h-3.5 w-3.5" /> {label}
    </a>
  );
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm">PF & ESI for this month</CardTitle>
          <CardDescription>Deposit by {d.due}. Upload the ECR file on the EPFO portal and the ESI sheet on the ESIC portal.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {link("ecr", "PF ECR (.txt)", FileText)}
          {link("esi", "ESI sheet (.xlsx)", Download)}
          {link("xlsx", "PF + ESI + challan (.xlsx)", Download)}
        </div>
      </CardHeader>
      <div className="grid gap-3 px-4 pb-4 md:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="mb-1 font-semibold">Provident fund · {d.pfChallan.employees} member(s)</p>
          {[
            ["A/c 1 — EPF (employee + employer)", d.pfChallan.ac1],
            ["A/c 10 — Pension (EPS)", d.pfChallan.ac10],
            ["A/c 2 — Admin charges", d.pfChallan.ac2],
            ["A/c 21 — EDLI", d.pfChallan.ac21],
          ].map(([k, v]: any) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-slate-600">{k}</span>
              <span className="tabular">{rupees(v)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold">
            <span>PF challan total</span>
            <span className="tabular">{rupees(d.pfChallan.total)}</span>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p className="mb-1 font-semibold">ESI · {d.esiChallan.employees} employee(s)</p>
          {[
            ["ESI wages", d.esiChallan.wages],
            ["Employee share 0.75%", d.esiChallan.employee],
            ["Employer share 3.25%", d.esiChallan.employer],
          ].map(([k, v]: any) => (
            <div key={k} className="flex justify-between text-xs">
              <span className="text-slate-600">{k}</span>
              <span className="tabular">{rupees(v)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold">
            <span>ESI challan total</span>
            <span className="tabular">{rupees(d.esiChallan.total)}</span>
          </div>
        </div>
        {(d.missing.uan.length > 0 || d.missing.esiNumber.length > 0) && (
          <Notice tone="warning" className="md:col-span-2">
            {d.missing.uan.length > 0 && `UAN missing for ${d.missing.uan.join(", ")}. `}
            {d.missing.esiNumber.length > 0 && `ESI IP number missing for ${d.missing.esiNumber.join(", ")}. `}
            Add them on the employee's HR details before uploading.
          </Notice>
        )}
      </div>
    </Card>
  );
}
