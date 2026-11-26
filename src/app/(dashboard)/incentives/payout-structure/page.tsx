"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Calculator, History, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { api, Notice, rupees } from "@/components/workflow";

const thisMonth = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
const n = (v: number) => (v || 0).toLocaleString("en-IN");
const r0 = (p: number) => `₹${n(Math.round((p || 0) / 100))}`;
const RULE = { ON_TARGET: "paid on all once the number is reached", EVERY: "paid on every one" } as const;

/** Joykali's ASM / FSE payout structure, and how each person is doing against it this month. */
export default function PayoutStructurePage() {
  const [period, setPeriod] = useState(thisMonth());
  const [sheet, setSheet] = useState<any>(null);
  const [st, setSt] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const load = useCallback(() => {
    setErr(null);
    api<any>(`/api/payout-plan?period=${period}`).then(setSheet).catch((e) => setErr(e.message));
    api<any>(`/api/payout-plan/statement?period=${period}`).then(setSt).catch((e) => setErr(e.message));
  }, [period]);
  useEffect(load, [load]);

  const th = "px-2.5 py-2 text-right align-bottom text-[11px] font-semibold uppercase leading-tight text-slate-600";
  const td = "px-2.5 py-2 text-right tabular";
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Incentives"
        title="Payout structure"
        description="Salary + activation benefit (₹ per new dealer) + target incentive (₹ per vehicle) + TA. Incentives are worked out every month from dealers activated and vehicles sold, and go into the payslip with the TA."
        actions={
          <div className="flex items-center gap-2">
            <Label className="text-xs">Month</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value || thisMonth())} className="w-40" />
          </div>
        }
      />
      {err && <Notice>{err}</Notice>}
      {ok && <Notice tone="success">{ok}</Notice>}
      {!sheet ? (
        <Skeleton className="h-40" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm" id="plan-sheet">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className={cn(th, "text-left")}>Position</th>
                  <th className={th}>Planned headcount</th>
                  <th className={th}>Salary / person (₹ / month)</th>
                  <th className={th}>New dealer (₹ / dealer)</th>
                  <th className={th}>Monthly activation (nos. of dealer)</th>
                  <th className={th}>Activation benefit (D × E)</th>
                  <th className={th}>Target achieve (nos / month)</th>
                  <th className={th}>Target incentive (₹ / vehicle)</th>
                  <th className={th}>Total incentive (G × H)</th>
                  <th className={th}>TA</th>
                  <th className={cn(th, "bg-brand-50 text-brand-900")}>CTC / employee</th>
                  <th className={th}>Head (people now)</th>
                  <th className={cn(th, "bg-brand-50 text-brand-900")}>Total payout monthly</th>
                  {sheet.canEdit && <th className={th} />}
                </tr>
              </thead>
              <tbody>
                {sheet.sheet.map((r: any) =>
                  !r.plan ? (
                    <tr key={r.role} className="border-b border-slate-100">
                      <td className="px-2.5 py-2 font-semibold">{r.label}</td>
                      <td colSpan={11} className="px-2.5 py-2 text-xs text-amber-700">
                        No structure set for this month.
                      </td>
                      {sheet.canEdit && (
                        <td className="px-2.5 py-2 text-right">
                          <Button size="sm" onClick={() => setEdit({ role: r.role, label: r.label, plan: null })}>
                            Set
                          </Button>
                        </td>
                      )}
                    </tr>
                  ) : (
                    <tr key={r.role} className="border-b border-slate-100" data-role={r.role}>
                      <td className="min-w-[190px] px-2.5 py-2">
                        <p className="font-semibold text-slate-900">{r.label}</p>
                        <p className="text-[11px] text-slate-500">
                          {r.plan.measure === "TEAM" ? "counted on own + team" : "counted on own"} · from {r.plan.effectiveFrom}
                        </p>
                      </td>
                      <td className={td}>{r.plan.headcount}</td>
                      <td className={td}>{n(r.plan.salary / 100)}</td>
                      <td className={td}>{n(r.plan.perDealer / 100)}</td>
                      <td className={td}>{r.plan.dealerTarget}</td>
                      <td className={td}>{n(r.activationBenefit / 100)}</td>
                      <td className={td}>{r.plan.vehicleTarget}</td>
                      <td className={td}>{n(r.plan.perVehicle / 100)}</td>
                      <td className={td}>{n(r.targetIncentive / 100)}</td>
                      <td className={td}>{n(r.plan.ta / 100)}</td>
                      <td className={cn(td, "bg-brand-50/60 font-bold text-brand-900")}>{n(r.ctc / 100)}</td>
                      <td className={td}>{r.people}</td>
                      <td className={cn(td, "bg-brand-50/60 font-bold text-brand-900")}>{n(r.totalPayoutNow / 100)}</td>
                      {sheet.canEdit && (
                        <td className="px-2.5 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setEdit({ role: r.role, label: r.label, plan: r.plan })} id={`edit-${r.role}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  )
                )}
              </tbody>
              {sheet.all && (
                <tfoot>
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-2.5 py-2" colSpan={12}>
                      Total monthly payout at today&apos;s head count
                    </td>
                    <td className={cn(td, "text-brand-900")}>{n(sheet.grandTotalNow / 100)}</td>
                    {sheet.canEdit && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="space-y-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
            {sheet.sheet
              .filter((r: any) => r.plan)
              .map((r: any) => (
                <p key={r.role}>
                  <b>{r.label}:</b> dealer benefit {RULE[r.plan.dealerPay as keyof typeof RULE]}; vehicle incentive {RULE[r.plan.vehiclePay as keyof typeof RULE]}
                  {r.plan.note ? ` · ${r.plan.note}` : ""}
                </p>
              ))}
            <p>A person&apos;s own vehicle target set on the Targets page replaces the plan number for that month. TA is cut for unpaid (loss-of-pay) days.</p>
            {sheet.versions?.length > 0 && (
              <button className="inline-flex items-center gap-1 font-semibold text-brand-700" onClick={() => setShowVersions((v) => !v)}>
                <History className="h-3.5 w-3.5" /> {showVersions ? "Hide" : "Show"} changes ({sheet.versions.length})
              </button>
            )}
            {showVersions && (
              <table className="mt-2 w-full">
                <tbody>
                  {sheet.versions.map((v: any) => (
                    <tr key={v._id} className="border-t border-slate-100">
                      <td className="py-1 pr-3">{v.role === "ASM" ? "ASM" : "FSE"}</td>
                      <td className="py-1 pr-3">from {v.effectiveFrom}</td>
                      <td className="py-1 pr-3">
                        salary {r0(v.salary)} · {r0(v.perDealer)}/dealer × {v.dealerTarget} · {r0(v.perVehicle)}/vehicle × {v.vehicleTarget} · TA {r0(v.ta)}
                      </td>
                      <td className="py-1 text-slate-500">{v.updatedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      <div>
        <h2 className="mb-2 font-display text-lg font-bold text-slate-900">Month by person</h2>
        {!st ? (
          <Skeleton className="h-64" />
        ) : st.rows.length === 0 ? (
          <EmptyState icon={Calculator} title="Nobody to show" description="No ASMs or FSEs in your view." />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm" id="plan-statement">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className={cn(th, "text-left")}>Person</th>
                    <th className={th}>Salary</th>
                    <th className={th}>New dealers</th>
                    <th className={th}>Activation benefit</th>
                    <th className={th}>Vehicles</th>
                    <th className={th}>Target incentive</th>
                    <th className={th}>Other schemes</th>
                    <th className={th}>TA</th>
                    <th className={cn(th, "bg-brand-50 text-brand-900")}>Total this month</th>
                    <th className={th}>Plan CTC</th>
                  </tr>
                </thead>
                <tbody>
                  {st.rows.map((r: any) => (
                    <tr key={r._id} className="border-b border-slate-100 align-top" data-emp={r.employeeCode}>
                      <td className="px-2.5 py-2">
                        <Link href={`/employees/${r._id}`} className="font-semibold text-slate-900 hover:underline">
                          {r.name}
                        </Link>
                        <p className="text-[11px] text-slate-500">
                          {r.role === "ASM" ? "ASM" : "FSE"} · {r.employeeCode}
                          {r.measure === "TEAM" ? ` · team of ${r.teamSize}` : ""}
                          {r.area ? ` · ${r.area}` : ""}
                        </p>
                      </td>
                      <td className={td}>{rupees(r.salary)}</td>
                      <td className={td}>
                        <span className={cn("font-semibold", r.dealerTarget && r.dealers >= r.dealerTarget ? "text-emerald-700" : "text-slate-800")}>{r.dealers}</span>
                        <span className="text-slate-400"> / {r.dealerTarget}</span>
                        <Bar v={r.dealers} of={r.dealerTarget} />
                      </td>
                      <td className={cn(td, r.activation ? "font-semibold text-emerald-700" : "text-slate-400")} title={r.activationNote}>
                        {rupees(r.activation)}
                      </td>
                      <td className={td}>
                        <span className={cn("font-semibold", r.vehicleTarget && r.vehicles >= r.vehicleTarget ? "text-emerald-700" : "text-slate-800")}>{r.vehicles}</span>
                        <span className="text-slate-400"> / {r.vehicleTarget}</span>
                        <Bar v={r.vehicles} of={r.vehicleTarget} />
                      </td>
                      <td className={cn(td, r.targetIncentive ? "font-semibold text-emerald-700" : "text-slate-400")} title={r.targetNote}>
                        {rupees(r.targetIncentive)}
                      </td>
                      <td className={cn(td, !r.otherSchemes && "text-slate-400")}>{rupees(r.otherSchemes)}</td>
                      <td className={td}>{rupees(r.ta)}</td>
                      <td className={cn(td, "bg-brand-50/60 font-bold text-brand-900")}>{rupees(r.total)}</td>
                      <td className={cn(td, "text-slate-500")}>{rupees(r.planCtc)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-2.5 py-2">Total ({st.rows.length})</td>
                    <td className={td}>{rupees(st.totals.salary)}</td>
                    <td />
                    <td className={td}>{rupees(st.totals.activation)}</td>
                    <td />
                    <td className={td}>{rupees(st.totals.targetIncentive)}</td>
                    <td />
                    <td className={td}>{rupees(st.totals.ta)}</td>
                    <td className={cn(td, "text-brand-900")}>{rupees(st.totals.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Salary is each person&apos;s own approved salary. Hover an incentive to see how it was worked out. The payslip may also differ by loss-of-pay days, PF / ESI and other deductions.</p>
          </Card>
        )}
      </div>
      {edit && (
        <EditPlan
          {...edit}
          onClose={() => setEdit(null)}
          onSaved={(m: string) => {
            setEdit(null);
            setOk(m);
            load();
          }}
        />
      )}
    </div>
  );
}

function Bar({ v, of }: { v: number; of: number }) {
  const pct = of ? Math.min(100, Math.round((v / of) * 100)) : 0;
  return (
    <span className="mt-1 block h-1 w-full overflow-hidden rounded bg-slate-100">
      <span className={cn("block h-full", pct >= 100 ? "bg-emerald-500" : "bg-brand-500")} style={{ width: `${pct}%` }} />
    </span>
  );
}

function EditPlan({ role, label, plan, onClose, onSaved }: { role: string; label: string; plan: any; onClose: () => void; onSaved: (m: string) => void }) {
  const R = (p: number | undefined, d: number) => String(p != null ? p / 100 : d);
  const [f, setF] = useState({
    effectiveFrom: thisMonth(),
    salaryRupees: R(plan?.salary, role === "ASM" ? 26000 : 18000),
    perDealerRupees: R(plan?.perDealer, role === "ASM" ? 500 : 1000),
    dealerTarget: String(plan?.dealerTarget ?? (role === "ASM" ? 40 : 5)),
    dealerPay: plan?.dealerPay || "ON_TARGET",
    vehicleTarget: String(plan?.vehicleTarget ?? (role === "ASM" ? 600 : 75)),
    perVehicleRupees: R(plan?.perVehicle, role === "ASM" ? 60 : 180),
    vehiclePay: plan?.vehiclePay || "ON_TARGET",
    taRupees: R(plan?.ta, role === "ASM" ? 2000 : 3000),
    measure: plan?.measure || (role === "ASM" ? "TEAM" : "SELF"),
    headcount: String(plan?.headcount ?? 1),
    note: plan?.note || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (k: keyof typeof f) => Number(f[k]) || 0;
  const benefit = num("perDealerRupees") * num("dealerTarget");
  const incentive = num("perVehicleRupees") * num("vehicleTarget");
  const ctc = num("salaryRupees") + benefit + incentive + num("taRupees");
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/payout-plan", { method: "PUT", json: { role, ...f } });
      onSaved(`${label} structure saved from ${f.effectiveFrom}.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const field = (k: keyof typeof f, l: string, extra: any = {}) => (
    <div className="space-y-1.5">
      <Label>{l}</Label>
      <Input id={`pp-${k}`} type="number" min={0} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} />
    </div>
  );
  const sel = "h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm";
  return (
    <Modal isOpen onClose={onClose} title={`Payout structure — ${label}`} maxWidth="2xl">
      <div className="grid gap-3 sm:grid-cols-3">
        {field("salaryRupees", "Salary / person (₹ / month)")}
        {field("taRupees", "TA (₹ / month)")}
        {field("headcount", "Planned headcount")}
        {field("perDealerRupees", "New dealer (₹ / dealer)")}
        {field("dealerTarget", "Monthly activation (dealers)")}
        <div className="space-y-1.5">
          <Label>Dealer benefit paid</Label>
          <select className={sel} value={f.dealerPay} onChange={(e) => setF({ ...f, dealerPay: e.target.value })}>
            <option value="ON_TARGET">On all, once the number is reached</option>
            <option value="EVERY">On every dealer</option>
          </select>
        </div>
        {field("perVehicleRupees", "Target incentive (₹ / vehicle)")}
        {field("vehicleTarget", "Target achieve (vehicles / month)")}
        <div className="space-y-1.5">
          <Label>Vehicle incentive paid</Label>
          <select className={sel} value={f.vehiclePay} onChange={(e) => setF({ ...f, vehiclePay: e.target.value })}>
            <option value="ON_TARGET">On all, once the target is met</option>
            <option value="EVERY">On every vehicle</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Count dealers & vehicles of</Label>
          <select className={sel} value={f.measure} onChange={(e) => setF({ ...f, measure: e.target.value })}>
            <option value="SELF">Own only</option>
            <option value="TEAM">Own + team reporting to them</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Applies from (month)</Label>
          <Input type="month" min={thisMonth()} value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Note</Label>
          <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-brand-50 p-3 text-sm sm:grid-cols-4">
        <p>
          Activation benefit<br />
          <b>₹{n(benefit)}</b>
        </p>
        <p>
          Total incentive<br />
          <b>₹{n(incentive)}</b>
        </p>
        <p>
          TA<br />
          <b>₹{n(num("taRupees"))}</b>
        </p>
        <p className="text-brand-900">
          CTC / employee<br />
          <b id="pp-ctc">₹{n(ctc)}</b>
        </p>
      </div>
      <p className="mt-2 text-xs text-slate-500">Months already worked out are not changed. A change from this month re-works this month&apos;s incentives straight away.</p>
      {error && <Notice className="mt-3">{error}</Notice>}
      <div className="modal-actions mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button id="pp-save" disabled={busy} onClick={save}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
