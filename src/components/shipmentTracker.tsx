"use client";

import React from "react";
import Link from "next/link";
import { Check, Download, FileText, PackageCheck, Phone, Truck, Warehouse } from "lucide-react";
import { cn } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { dt, rupees } from "@/components/workflow";

const ORDER = ["CREATED", "SUBMITTED", "LOADING", "LOADED", "DISPATCHED", "DELIVERED"];

/**
 * One delivery order as the buyer follows it: raised → loading → invoice → dispatched → received.
 * Shows the invoice / challan download, the truck, driver and e-way bill, and the GRN.
 */
export function ShipmentTracker({ d, canReceive }: { d: any; canReceive?: boolean }) {
  const at = (s: string) => d.timeline?.find((t: any) => t.status === s)?.at;
  const idx = d.status === "DELIVERED_WITH_ISSUES" ? 5 : ORDER.indexOf(d.status);
  const units = d.lines.reduce((s: number, l: any) => s + l.quantity, 0);
  const steps = [
    { label: "Delivery order raised", done: idx >= 0, when: d.createdAt, icon: Warehouse, note: d.warehouseName ? `from ${d.warehouseName}` : undefined },
    { label: "Loading at the warehouse", done: idx >= 2, when: at("LOADING"), icon: Warehouse, note: d.vehicles?.length ? `${d.vehicles.length}/${units} picked` : undefined },
    {
      label: d.document?.kind === "TAX_INVOICE" ? "Tax invoice made" : "Delivery challan made",
      done: !!d.document?.number,
      when: d.document?.date,
      icon: FileText,
      note: d.document?.number ? `${d.document.number} · ${rupees(d.document.totalValue)}` : undefined,
    },
    {
      label: "Dispatched",
      done: idx >= 4,
      when: d.dispatch?.at,
      icon: Truck,
      note: d.loading?.registrationNo && idx >= 4 ? `Truck ${d.loading.registrationNo}${d.ewayBill?.ewbNo ? ` · e-way bill ${d.ewayBill.ewbNo}` : ""}` : undefined,
    },
    {
      label: "Received (GRN)",
      done: idx >= 5,
      when: d.grn?.at,
      icon: PackageCheck,
      note: d.grn?.grnNo
        ? `${d.grn.grnNo} by ${d.grn.receivedByName}${(d.grn.items || []).some((i: any) => i.condition !== "RECEIVED") ? ` · ${(d.grn.items || []).filter((i: any) => i.condition === "SHORT").length} short, ${(d.grn.items || []).filter((i: any) => i.condition === "DAMAGED").length} damaged` : " · all in order"}${d.grn.creditNoteNo ? ` · credit note ${d.grn.creditNoteNo}` : ""}`
        : undefined,
    },
  ];
  const cancelled = d.status === "CANCELLED";
  return (
    <div className={cn("rounded-2xl border border-slate-200 p-4", cancelled && "opacity-60")}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={`/dispatch/${d._id}`} className="font-mono text-sm font-semibold text-brand-700 hover:underline">
          {d.doCode}
        </Link>
        <span className="text-xs text-slate-500">{units} vehicle(s)</span>
        <StatusBadge status={d.status} className="ml-auto" />
      </div>
      {!cancelled && (
        <ol className="relative space-y-3 pl-7">
          <span className="absolute bottom-2 left-[11px] top-2 w-px bg-slate-200" />
          {steps.map((st) => (
            <li key={st.label} className="relative">
              <span className={cn("absolute -left-7 top-0 grid h-[22px] w-[22px] place-items-center rounded-full ring-4 ring-white", st.done ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400")}>
                {st.done ? <Check className="h-3 w-3" /> : <st.icon className="h-3 w-3" />}
              </span>
              <p className={cn("text-sm font-medium", st.done ? "text-slate-900" : "text-slate-400")}>
                {st.label}
                {st.done && st.when && <span className="ml-2 text-xs font-normal text-slate-500">{dt(st.when, true)}</span>}
              </p>
              {st.done && st.note && <p className="text-xs text-slate-600">{st.note}</p>}
            </li>
          ))}
        </ol>
      )}
      {idx >= 4 && !cancelled && d.loading?.driverName && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">
          <Truck className="h-4 w-4" /> {d.loading.registrationNo} · driver {d.loading.driverName}
          {d.loading.driverPhone && (
            <a href={`tel:${d.loading.driverPhone}`} className="inline-flex items-center gap-1 font-semibold underline">
              <Phone className="h-3 w-3" /> {d.loading.driverPhone}
            </a>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {d.document?.number && (
          <a href={`/api/delivery-orders/${d._id}/document`} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-slate-200 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> {d.document.kind === "TAX_INVOICE" ? "Tax invoice" : "Delivery challan"} PDF
          </a>
        )}
        {d.grn?.grnNo && (
          <a href={`/api/grn/do/${d._id}/pdf`} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-slate-200 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> GRN PDF
          </a>
        )}
        {canReceive && d.status === "DISPATCHED" && (
          <Link href={`/dispatch/${d._id}`} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white">
            <PackageCheck className="h-3.5 w-3.5" /> Record GRN — confirm receipt
          </Link>
        )}
      </div>
      {cancelled && <p className="text-xs text-slate-500">Cancelled {dt(at("CANCELLED"))}</p>}
    </div>
  );
}
