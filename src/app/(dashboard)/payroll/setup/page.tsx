"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { PageHeader, Skeleton } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees } from "@/components/workflow";
import { Field } from "@/components/network";

type Comp = { key: string; name: string; kind: "EARNING" | "DEDUCTION"; calc: "PCT_GROSS" | "PCT_BASIC" | "FIXED" | "BALANCE"; value: number; pfWage: boolean; prorate: boolean; active: boolean };

const CALC_LABEL: Record<string, string> = { PCT_GROSS: "% of gross", PCT_BASIC: "% of basic", FIXED: "Fixed ₹ / month", BALANCE: "Balance of gross" };
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "c$1")
    .slice(0, 20) || "col";

/** Rupees in the form for FIXED, percent otherwise; the API stores paise for FIXED. */
const toForm = (c: Comp) => ({ ...c, value: c.calc === "FIXED" ? c.value / 100 : c.value });
const toApi = (c: Comp) => ({ ...c, value: c.calc === "FIXED" ? Math.round(Number(c.value) * 100) : Number(c.value) });

export default function PayrollSetupPage() {
  const { can } = useSession();
  const [d, setD] = useState<any>(null);
  const [cols, setCols] = useState<Comp[]>([]);
  const [st, setSt] = useState<any>(null);
  const [from, setFrom] = useState("");
  const [reason, setReason] = useState("");
  const [sample, setSample] = useState("25000");
  const [preview, setPreview] = useState<any>(null);
  const [pErr, setPErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const canPropose = can("payroll.run") || can("settings.manage") || can("accounts.manage");

  const load = useCallback(() => {
    api<any>("/api/payroll/setup")
      .then((r) => {
        setD(r);
        setCols(r.current.components.map(toForm));
        setSt({ ...r.current.statutory, pfCeilingPaise: r.current.statutory.pfCeilingPaise / 100, esiCeilingPaise: r.current.statutory.esiCeilingPaise / 100, ptFlatPaise: r.current.statutory.ptFlatPaise / 100 });
        setFrom(r.period);
      })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);

  const statutoryApi = useMemo(
    () => (st ? { ...st, pfCeilingPaise: Math.round(Number(st.pfCeilingPaise) * 100), esiCeilingPaise: Math.round(Number(st.esiCeilingPaise) * 100), ptFlatPaise: Math.round(Number(st.ptFlatPaise) * 100) } : null),
    [st]
  );
  useEffect(() => {
    if (!statutoryApi || !cols.length || !Number(sample)) return;
    const t = setTimeout(() => {
      api<any>("/api/payroll/setup/preview", { method: "POST", json: { components: cols.map(toApi), statutory: statutoryApi, amountRupees: Number(sample) } })
        .then((p) => {
          setPreview(p);
          setPErr(null);
        })
        .catch((e) => {
          setPreview(null);
          setPErr(e.message);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [cols, statutoryApi, sample]);

  if (!d || !st) return err ? <Notice>{err}</Notice> : <Skeleton className="h-96" />;
  const pending = d.list.find((t: any) => t.status === "PENDING_APPROVAL");
  const set = (i: number, patch: Partial<Comp>) => setCols(cols.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= cols.length || cols[i].key === "basic" || cols[j].key === "basic") return;
    const n = [...cols];
    [n[i], n[j]] = [n[j], n[i]];
    setCols(n);
  };
  const add = (kind: "EARNING" | "DEDUCTION") => {
    const name = kind === "EARNING" ? "New allowance" : "New deduction";
    let key = `new_${slug(name)}`;
    let k = 2;
    while (cols.some((c) => c.key === key)) key = `new_${slug(name)}_${k++}`;
    setCols([...cols, { key, name, kind, calc: "PCT_BASIC", value: 10, pfWage: false, prorate: true, active: true }]);
  };
  const remove = (i: number) => setCols(cols.filter((_, j) => j !== i));
  const propose = async () => {
    setErr(null);
    setMsg(null);
    try {
      await api("/api/payroll/setup", { method: "POST", json: { effectiveFrom: from, components: cols.map(toApi), statutory: statutoryApi, reason } });
      setMsg("Sent to the Business Head and the Managing Partner. It applies to payroll from the chosen month once both approve.");
      setReason("");
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const withdraw = async (id: string) => {
    try {
      await api(`/api/payroll/setup/${id}`, { method: "DELETE" });
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const num = (k: string, label: string, suffix = "%") => (
    <Field label={`${label}${suffix ? ` (${suffix})` : ""}`}>
      <Input id={`st-${k}`} inputMode="decimal" disabled={!canPropose} value={st[k]} onChange={(e) => setSt({ ...st, [k]: e.target.value.replace(/[^\d.]/g, "") })} />
    </Field>
  );
  const flag = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" disabled={!canPropose} checked={!!st[k]} onChange={(e) => setSt({ ...st, [k]: e.target.checked })} /> {label}
    </label>
  );

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Payroll"
        title="Salary structure & PF / ESI"
        description="The columns of the monthly salary sheet — add, remove, rename or re-order them and set each as a percentage of gross, a percentage of basic, a fixed amount, or the balance. PF, ESI and professional tax options are set here too. Changes start from a month you choose, after the Business Head and the Managing Partner approve."
      />
      {err && <Notice>{err}</Notice>}
      {msg && <Notice tone="success">{msg}</Notice>}
      <Notice tone="info">
        In force for {d.period}:{" "}
        {d.current.source === "template" ? `approved structure from ${d.current.effectiveFrom}` : "the standard four columns (no structure approved yet — older salaries keep their fixed amounts)"}.
      </Notice>
      {pending && (
        <Notice tone="warning">
          A change from {pending.effectiveFrom} by {pending.proposedByName} is waiting for approval ({pending.approvals.length}/2 signatures).{" "}
          <button className="font-semibold underline" onClick={() => withdraw(pending._id)}>
            Withdraw
          </button>
        </Notice>
      )}

      <div className="grid gap-4 2xl:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Salary columns</CardTitle>
              <CardDescription>Earnings always add up to the gross: the balance column takes whatever is left.</CardDescription>
            </div>
            {canPropose && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => add("EARNING")}>
                  <Plus className="h-4 w-4" /> Earning
                </Button>
                <Button size="sm" variant="outline" onClick={() => add("DEDUCTION")}>
                  <Plus className="h-4 w-4" /> Deduction
                </Button>
              </div>
            )}
          </CardHeader>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-2 py-2">Column</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Calculated as</th>
                  <th className="px-2 py-2">Value</th>
                  <th className="px-2 py-2 text-center">PF wage</th>
                  <th className="px-2 py-2 text-center">Cut for LOP</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cols.map((c, i) => (
                  <tr key={c.key} className={cn(c.kind === "DEDUCTION" && "bg-rose-50/40")}>
                    <td className="px-2 py-1.5">
                      <Input
                        id={`c-name-${c.key}`}
                        className="h-8 w-44"
                        disabled={!canPropose}
                        value={c.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          // New columns take their key from the name; saved columns keep theirs so history lines up.
                          if (!c.key.startsWith("new_")) return set(i, { name });
                          let key = `new_${slug(name)}`.slice(0, 24);
                          let k = 2;
                          while (cols.some((x, j) => j !== i && x.key === key)) key = `new_${slug(name)}_${k++}`.slice(0, 24);
                          set(i, { name, key });
                        }}
                      />
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{c.key}</p>
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge variant={c.kind === "EARNING" ? "success" : "destructive"}>{c.kind === "EARNING" ? "Earning" : "Deduction"}</Badge>
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        id={`c-calc-${c.key}`}
                        className="field h-8 w-40"
                        disabled={!canPropose}
                        value={c.calc}
                        onChange={(e) => set(i, { calc: e.target.value as Comp["calc"], value: e.target.value === "BALANCE" ? 0 : c.value })}
                      >
                        {Object.entries(CALC_LABEL)
                          .filter(([k]) => !(c.key === "basic" && (k === "PCT_BASIC" || k === "BALANCE")) && !(c.kind === "DEDUCTION" && k === "BALANCE"))
                          .map(([k, l]) => (
                            <option key={k} value={k}>
                              {l}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      {c.calc === "BALANCE" ? (
                        <span className="text-xs text-slate-500">remainder</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          {c.calc === "FIXED" && <span className="text-xs text-slate-500">₹</span>}
                          <Input
                            id={`c-val-${c.key}`}
                            className="h-8 w-24 text-right"
                            inputMode="decimal"
                            disabled={!canPropose}
                            value={String(c.value)}
                            onChange={(e) => set(i, { value: e.target.value.replace(/[^\d.]/g, "") as any })}
                          />
                          {c.calc !== "FIXED" && <span className="text-xs text-slate-500">%</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {c.kind === "EARNING" && <input type="checkbox" disabled={!canPropose} checked={c.pfWage} onChange={(e) => set(i, { pfWage: e.target.checked })} />}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {c.calc !== "PCT_GROSS" && c.calc !== "PCT_BASIC" && c.calc !== "BALANCE" ? (
                        <input type="checkbox" disabled={!canPropose} checked={c.prorate} onChange={(e) => set(i, { prorate: e.target.checked })} />
                      ) : (
                        <input type="checkbox" disabled={!canPropose || c.kind === "DEDUCTION"} checked={c.prorate} onChange={(e) => set(i, { prorate: e.target.checked })} />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                      {canPropose && c.key !== "basic" && (
                        <>
                          <button className="p-1 text-slate-400 hover:text-slate-700" onClick={() => move(i, -1)} title="Up">
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button className="p-1 text-slate-400 hover:text-slate-700" onClick={() => move(i, 1)} title="Down">
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button className="p-1 text-rose-500 hover:text-rose-700" onClick={() => remove(i)} title="Delete column">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-slate-500">
            Columns are filled top to bottom; each is capped at what is left of the gross, so a small salary gets fewer allowances rather than going over. Deleting a column only affects payroll from the new month — past payslips keep
            their columns.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Try it on a salary</CardTitle>
            <CardDescription>Monthly gross for the preview</CardDescription>
          </CardHeader>
          <div className="space-y-3 px-4 pb-4">
            <Input id="sample" inputMode="numeric" value={sample} onChange={(e) => setSample(e.target.value.replace(/\D/g, ""))} />
            {pErr && <Notice>{pErr}</Notice>}
            {preview && (
              <div className="space-y-2 text-sm">
                {preview.lines.map((l: any) => (
                  <div key={l.key} className="flex justify-between">
                    <span className="text-slate-600">{l.name}</span>
                    <span className="tabular">{rupees(l.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                  <span>Gross</span>
                  <span className="tabular">{rupees(preview.gross)}</span>
                </div>
                {[
                  ["PF (employee)", preview.employee.pf],
                  ["ESI (employee)", preview.employee.esi],
                  ["Professional tax", preview.employee.professionalTax],
                  ...preview.deductionLines.map((l: any) => [l.name, l.amount]),
                ].map(([k, v]: any) => (
                  <div key={k} className="flex justify-between text-rose-700">
                    <span>− {k}</span>
                    <span className="tabular">{rupees(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-emerald-700">
                  <span>Take-home</span>
                  <span className="tabular">{rupees(preview.netTakeHome)}</span>
                </div>
                <div className="rounded-xl bg-ink-900 p-3 text-xs text-white">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Employer PF (EPS {rupees(preview.employer.eps)} + EPF {rupees(preview.employer.epf)})</span>
                    <span>{rupees(preview.employer.pf)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">EDLI + admin</span>
                    <span>{rupees(preview.employer.edli + preview.employer.pfAdmin)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Employer ESI</span>
                    <span>{rupees(preview.employer.esi)}</span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-white/10 pt-1 text-sm font-bold text-volt-300">
                    <span>CTC / month</span>
                    <span>{rupees(preview.monthlyCtc)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>PF, ESI and professional tax</CardTitle>
          <CardDescription>Per-employee opt-in stays on each employee's salary (PF / ESI / PT ticks). These are the company rules.</CardDescription>
        </CardHeader>
        <div className="grid gap-4 px-4 pb-4 md:grid-cols-3">
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            {flag("pfEnabled", "Provident fund (EPF) applies")}
            <div className="grid grid-cols-2 gap-2">
              {num("pfEmployeeRate", "Employee")}
              {num("pfEmployerRate", "Employer")}
              {num("epsRate", "of which pension (EPS)")}
              {num("edliRate", "EDLI")}
              {num("pfAdminRate", "Admin charges")}
              {num("pfCeilingPaise", "Wage ceiling", "₹")}
            </div>
            {flag("pfCapAtCeiling", "Limit PF to the wage ceiling")}
            <p className="text-xs text-slate-500">PF is on the columns ticked "PF wage" (Basic, DA). Pension and EDLI are always on wages up to the ceiling.</p>
          </div>
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            {flag("esiEnabled", "ESI applies")}
            <div className="grid grid-cols-2 gap-2">
              {num("esiEmployeeRate", "Employee")}
              {num("esiEmployerRate", "Employer")}
              {num("esiCeilingPaise", "Gross limit", "₹")}
            </div>
            <p className="text-xs text-slate-500">ESI covers staff whose fixed monthly gross is within the limit; it is charged on wages paid that month (incl. overtime and incentives, not reimbursements), rounded up to the rupee.</p>
          </div>
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            {flag("ptEnabled", "Professional tax applies")}
            <Field label="Method">
              <select id="st-ptMode" className="field" disabled={!canPropose} value={st.ptMode} onChange={(e) => setSt({ ...st, ptMode: e.target.value })}>
                <option value="WB_SLAB">West Bengal slabs</option>
                <option value="FLAT">Flat amount</option>
              </select>
            </Field>
            {st.ptMode === "FLAT" && num("ptFlatPaise", "Flat PT", "₹")}
            <p className="text-xs text-slate-500">WB slabs: nil up to ₹10,000 · ₹110 · ₹130 · ₹150 · ₹200 above ₹40,000.</p>
          </div>
        </div>
      </Card>

      {canPropose && (
        <Card>
          <div className="flex flex-wrap items-end gap-3 p-4">
            <Field label="Applies from payroll month">
              <Input id="tpl-from" type="month" value={from} min={d.period} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Reason for the change" className="min-w-[240px] flex-1">
              <Input id="tpl-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Add medical allowance 5% of basic as agreed" />
            </Field>
            <Button variant="outline" onClick={load}>
              <Undo2 className="h-4 w-4" /> Reset
            </Button>
            <Button disabled={!!pending || !reason.trim() || !!pErr} onClick={propose}>
              <Send className="h-4 w-4" /> Send for approval
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {d.list.map((t: any) => (
            <li key={t._id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">From {t.effectiveFrom}</p>
                <p className="truncate text-xs text-slate-500">
                  {t.components
                    .filter((c: any) => c.active !== false)
                    .map((c: any) => `${c.name} ${c.calc === "FIXED" ? rupees(c.value) : c.calc === "BALANCE" ? "(balance)" : `${c.value}%${c.calc === "PCT_BASIC" ? " of basic" : ""}`}`)
                    .join(" · ")}
                </p>
                <p className="text-xs text-slate-400">
                  {t.reason} · by {t.proposedByName} · {dt(t.createdAt)}
                </p>
              </div>
              <StatusBadge status={t.status} />
            </li>
          ))}
          {d.list.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No changes yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
