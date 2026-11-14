"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, Download, Loader2, Upload, X } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PageHeader, Skeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { api, Notice, rupees } from "@/components/workflow";
import { DAY_CODE, DAY_LABEL, DAY_STYLE, hm, MonthGrid } from "@/components/hr";

type Tab = "today" | "requests" | "register" | "roster" | "performance" | "setup";
const todayIst = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Managers and HR: who is in, decisions waiting, register, roster, performance, setup. */
export default function HrHub() {
  const { can } = useSession();
  const [tab, setTab] = useState<Tab>("today");
  const tabs: Array<[Tab, string, boolean]> = [
    ["today", "Team today", true],
    ["requests", "Requests", true],
    ["register", "Register", true],
    ["roster", "Roster & duty", true],
    ["performance", "Performance", true],
    ["setup", "HR setup", can("hr.manage")],
  ];
  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (tabs.some((t) => t[0] === h)) setTab(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="animate-fade-up">
      <PageHeader eyebrow="People" title="HR & attendance" description="Attendance comes from mobile punches (selfie + GPS) and biometric machines. Leave and corrections are decided by the reporting manager or HR; approved overtime, loss of pay, claims and loan instalments flow into payroll automatically." />
      <nav className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {tabs
          .filter((t) => t[2])
          .map(([k, label]) => (
            <button
              key={k}
              onClick={() => {
                setTab(k);
                try {
                  history.replaceState(null, "", `#${k}`);
                } catch {}
              }}
              className={cn("shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold", tab === k ? "border-ink-900 bg-ink-900 text-white" : "border-slate-200 bg-white text-slate-600")}
            >
              {label}
            </button>
          ))}
      </nav>
      {tab === "today" && <TeamToday />}
      {tab === "requests" && <Requests />}
      {tab === "register" && <Register />}
      {tab === "roster" && <Roster />}
      {tab === "performance" && <Performance />}
      {tab === "setup" && <Setup />}
    </div>
  );
}

function TeamToday() {
  const [date, setDate] = useState(todayIst());
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<any>(null);
  useEffect(() => {
    setD(null);
    api<any>(`/api/hr/attendance/team?date=${date}`).then(setD).catch((e) => setErr(e.message));
  }, [date]);
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const count = (st: string[]) => d.rows.filter((r: any) => (st[0] === "LATE" ? r.day.lateMin > 0 : st.includes(r.day.status))).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input id="team-date" type="date" className="h-9 w-44" value={date} max={todayIst()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
          {[
            ["In", ["PRESENT", "LATE", "HALF_DAY", "MISSED_PUNCH", "ON_DUTY"], "bg-emerald-100 text-emerald-800"],
            ["Late", ["LATE"], "bg-amber-100 text-amber-800"],
            ["Absent", ["ABSENT"], "bg-rose-100 text-rose-700"],
            ["On leave", ["LEAVE", "HALF_LEAVE"], "bg-sky-100 text-sky-800"],
          ].map(([l, st, c]) => (
            <span key={l as string} className={cn("rounded-full px-2.5 py-1", c as string)}>
              {l} {count(st as string[])}
            </span>
          ))}
        </div>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {d.rows.map((r: any) => (
            <li key={r.employee._id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setView(r.employee)}>
                <span className={cn("grid h-9 w-11 shrink-0 place-items-center rounded-lg text-xs font-bold", DAY_STYLE[r.day.status])}>{DAY_CODE[r.day.status] || "–"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-slate-900">{r.employee.name}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {r.employee.employeeCode} · {r.employee.designation}
                    {r.day.duty ? ` · ${r.day.duty}` : ""}
                  </span>
                </span>
                <span className="text-right text-xs tabular text-slate-600">
                  {r.day.inMin != null ? `${hm(r.day.inMin)} – ${hm(r.day.outMin)}` : DAY_LABEL[r.day.status]}
                  {r.day.lateMin ? <span className="block text-amber-700">{r.day.lateMin} min late</span> : null}
                  {r.day.punches?.some((p: any) => p.lat) ? <span className="block text-slate-400">located{r.day.punches.some((p: any) => p.hasPhoto) ? " · photo" : ""}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <EmployeeMonth employee={view} onClose={() => setView(null)} />
    </div>
  );
}

/** One employee's month with overtime approval. */
function EmployeeMonth({ employee, onClose }: { employee: any; onClose: () => void }) {
  const [period, setPeriod] = useState(todayIst().slice(0, 7));
  const [m, setM] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!employee) return;
    setM(null);
    api<any>(`/api/hr/attendance?employeeId=${employee._id}&period=${period}`).then(setM).catch((e) => setErr(e.message));
  }, [employee, period]);
  useEffect(load, [load]);
  const pendingOt = (m?.days || []).filter((d: any) => d.otMin > d.otApprovedMin);
  return (
    <Modal isOpen={!!employee} onClose={onClose} maxWidth="2xl" title={employee ? `${employee.name} · ${employee.employeeCode}` : ""}>
      <div className="mb-3 flex items-center gap-2">
        <Input id="em-period" type="month" className="h-9 w-40" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
        {m && (
          <span className="text-xs text-slate-500">
            Present {m.summary.present}/{m.summary.workingDays} · late {m.summary.lateCount} · LOP {m.summary.lop} · OT {(m.summary.otApprovedMinutes / 60).toFixed(1)}/{(m.summary.otMinutes / 60).toFixed(1)} h approved
          </span>
        )}
      </div>
      {!m ? <Skeleton className="h-56" /> : <MonthGrid days={m.days} />}
      {pendingOt.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">Overtime waiting for approval</p>
          <p className="text-amber-800">{pendingOt.map((d: any) => `${d.date.slice(8)}: ${d.otMin} min`).join(" · ")}</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={async () => {
              setErr(null);
              try {
                const r = await api<any>("/api/hr/attendance/overtime", { method: "POST", json: { employeeId: employee._id, dates: pendingOt.map((d: any) => d.date) } });
                setMsg(`Approved ${(r.approvedMinutes / 60).toFixed(1)} h — paid in this month's payroll`);
                load();
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            <Check className="h-4 w-4" /> Approve overtime
          </Button>
        </div>
      )}
      {msg && <Notice tone="success" className="mt-3">{msg}</Notice>}
      {err && <Notice className="mt-3">{err}</Notice>}
    </Modal>
  );
}

function Requests() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const load = useCallback(() => {
    api<any>("/api/hr/attendance/team").then((x) => setD(x.pending)).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  const act = async (url: string, json: any) => {
    setErr(null);
    try {
      await api(url, { method: "POST", json });
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-48" />;
  return (
    <div className="space-y-4">
      {err && <Notice>{err}</Notice>}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Leave requests ({d.leaves.length})</CardTitle>
          <CardDescription>Paid leave is checked against the balance again when you approve.</CardDescription>
        </CardHeader>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {d.leaves.length === 0 && <li className="px-5 py-3 text-sm text-slate-500">Nothing waiting.</li>}
          {d.leaves.map((l: any) => (
            <li key={l._id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {l.employeeName} · {l.leaveCode} {l.from === l.to ? l.from : `${l.from} → ${l.to}`} · {l.days} day(s)
                </p>
                <p className="text-xs text-slate-500">{l.reason}</p>
              </div>
              <Input id={`rm-${l._id}`} className="h-9 w-full sm:w-48" placeholder="Remarks (to reject)" value={remarks[l._id] || ""} onChange={(e) => setRemarks({ ...remarks, [l._id]: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => act(`/api/hr/leave/${l._id}`, { action: "reject", remarks: remarks[l._id] })}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => act(`/api/hr/leave/${l._id}`, { action: "approve", remarks: remarks[l._id] })}>
                <Check className="h-4 w-4" /> Approve
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Attendance corrections ({d.corrections.length})</CardTitle>
          <CardDescription>Approving adds the punch times as a manual entry, kept in the audit trail.</CardDescription>
        </CardHeader>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {d.corrections.length === 0 && <li className="px-5 py-3 text-sm text-slate-500">Nothing waiting.</li>}
          {d.corrections.map((c: any) => (
            <li key={c._id} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {c.employeeName} · {c.date} · in {c.inTime || "—"} · out {c.outTime || "—"}
                </p>
                <p className="text-xs text-slate-500">{c.reason}</p>
              </div>
              <Input id={`rc-${c._id}`} className="h-9 w-full sm:w-48" placeholder="Remarks (to reject)" value={remarks[c._id] || ""} onChange={(e) => setRemarks({ ...remarks, [c._id]: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => act(`/api/hr/regularizations/${c._id}`, { decision: "REJECTED", remarks: remarks[c._id] })}>
                <X className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={() => act(`/api/hr/regularizations/${c._id}`, { decision: "APPROVED" })}>
                <Check className="h-4 w-4" /> Approve
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Register() {
  const [period, setPeriod] = useState(todayIst().slice(0, 7));
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setD(null);
    api<any>(`/api/hr/attendance/register?period=${period}`).then(setD).catch((e) => setErr(e.message));
  }, [period]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input id="reg-period" type="month" className="h-9 w-40" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
        <a href={`/api/hr/attendance/register?period=${period}&format=xlsx`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <Download className="h-4 w-4" /> Excel (register, late & early, overtime)
        </a>
      </div>
      {err && <Notice>{err}</Notice>}
      {!d ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">Employee</th>
                {d.rows[0]?.codes.map((_: any, i: number) => (
                  <th key={i} className="px-1 py-2 text-center font-semibold tabular">
                    {i + 1}
                  </th>
                ))}
                <th className="px-2">Pres.</th>
                <th className="px-2">LOP</th>
                <th className="px-2">Late</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r: any) => (
                <tr key={r.employee._id} className="border-t border-slate-100">
                  <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-1.5 font-semibold">
                    {r.employee.name}
                    <span className="block font-mono text-[10px] font-normal text-slate-400">{r.employee.employeeCode}</span>
                  </td>
                  {r.codes.map((c: string, i: number) => (
                    <td key={i} className="px-0.5 py-1 text-center">
                      <span className={cn("inline-block min-w-[1.6rem] rounded px-0.5 py-0.5 text-[10px] font-bold", c === "A" ? "bg-rose-100 text-rose-700" : c === "P*" ? "bg-amber-100 text-amber-800" : c === "P" ? "bg-emerald-50 text-emerald-700" : c === "L" || c === "HL" ? "bg-sky-100 text-sky-800" : c === "H" ? "bg-violet-100 text-violet-800" : c ? "bg-slate-100 text-slate-500" : "")}>
                        {c}
                      </span>
                    </td>
                  ))}
                  <td className="px-2 text-center tabular">{r.summary.present}</td>
                  <td className="px-2 text-center tabular">{r.summary.lop}</td>
                  <td className="px-2 text-center tabular">{r.summary.lateCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Roster() {
  const [from, setFrom] = useState(todayIst());
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<null | { employee: any; date: string; cell: any }>(null);
  const [form, setForm] = useState({ shiftId: "", off: false, duty: "", location: "", days: "1" });
  const load = useCallback(() => {
    api<any>(`/api/hr/roster?from=${from}`).then(setD).catch((e) => setErr(e.message));
  }, [from]);
  useEffect(load, [load]);
  const save = async () => {
    setErr(null);
    try {
      const n = Math.max(1, Math.min(31, Number(form.days) || 1));
      await api("/api/hr/roster", { method: "POST", json: { employeeId: edit!.employee._id, dates: Array.from({ length: n }, (_, i) => addDays(edit!.date, i)), shiftId: form.shiftId || null, off: form.off, duty: form.duty, location: form.location } });
      setEdit(null);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setFrom(addDays(from, -7))}>
          ‹ Week
        </Button>
        <Input id="roster-from" type="date" className="h-9 w-44" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => setFrom(addDays(from, 7))}>
          Week ›
        </Button>
      </div>
      <p className="text-xs text-slate-500">Tap a day to change the shift, give a day off, or assign a duty (task and place). Past days cannot be changed.</p>
      {err && <Notice>{err}</Notice>}
      {!d ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left">Employee</th>
                {d.dates.map((x: string) => (
                  <th key={x} className="min-w-[6.5rem] px-2 py-2 text-left">
                    {new Date(`${x}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r: any) => (
                <tr key={r.employee._id} className="border-t border-slate-100 align-top">
                  <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-2 font-semibold">{r.employee.name}</td>
                  {r.cells.map((c: any) => (
                    <td key={c.date} className="px-1 py-1">
                      <button
                        disabled={c.date < todayIst()}
                        onClick={() => {
                          setEdit({ employee: r.employee, date: c.date, cell: c });
                          setForm({ shiftId: "", off: c.off, duty: c.duty, location: c.location, days: "1" });
                        }}
                        className={cn("w-full rounded-lg px-2 py-1.5 text-left disabled:opacity-60", c.holiday ? "bg-violet-50" : c.leave ? "bg-sky-50" : c.off ? "bg-slate-100" : "bg-emerald-50 hover:bg-emerald-100")}
                      >
                        <span className="block font-semibold">{c.holiday ? "Holiday" : c.leave ? `${c.leave} leave` : c.off ? "Off" : c.shift}</span>
                        {c.duty && <span className="block truncate text-[10px] text-slate-600">{c.duty}</span>}
                        {c.location && <span className="block truncate text-[10px] text-slate-400">{c.location}</span>}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <Modal isOpen={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.employee.name} · from ${edit.date}` : ""}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Shift</Label>
            <select id="ro-shift" className="field" value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
              <option value="">Their usual shift</option>
              {d?.shifts.map((s: any) => (
                <option key={s._id} value={s._id}>
                  {s.name} {s.start}–{s.end}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>For how many days</Label>
            <Input id="ro-days" inputMode="numeric" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value.replace(/\D/g, "") })} />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input id="ro-off" type="checkbox" checked={form.off} onChange={(e) => setForm({ ...form, off: e.target.checked })} /> Rostered day off
          </label>
          <div className="space-y-1.5">
            <Label>Duty / task</Label>
            <Input id="ro-duty" value={form.duty} onChange={(e) => setForm({ ...form, duty: e.target.value })} placeholder="e.g. Test-ride camp" />
          </div>
          <div className="space-y-1.5">
            <Label>Place</Label>
            <Input id="ro-loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Howrah Maidan" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setEdit(null)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </Modal>
    </div>
  );
}

function Performance() {
  const [period, setPeriod] = useState(todayIst().slice(0, 7));
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [target, setTarget] = useState<null | any>(null);
  const [units, setUnits] = useState("");
  const load = useCallback(() => {
    setD(null);
    api<any>(`/api/hr/performance?period=${period}`).then(setD).catch((e) => setErr(e.message));
  }, [period]);
  useEffect(load, [load]);
  return (
    <div className="space-y-3">
      <Input id="pf-period" type="month" className="h-9 w-40" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
      <p className="text-xs text-slate-500">Score = 50% sales against the unit target + 30% attendance + 20% punctuality (staff without a sales target: 60% attendance + 40% punctuality).</p>
      {err && <Notice>{err}</Notice>}
      {!d ? (
        <Skeleton className="h-64" />
      ) : (
        <ul className="space-y-2">
          {d.rows.map((r: any) => (
            <li key={r.employee._id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-card">
              <span className={cn("grid h-9 w-9 place-items-center rounded-xl font-display text-sm font-bold", r.rank <= 3 ? "bg-ink-900 text-volt-300" : "bg-slate-100 text-slate-600")}>#{r.rank}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{r.employee.name}</p>
                <p className="text-xs text-slate-500">
                  {r.units} sold{r.target ? ` of ${r.target} target (${r.sales}%)` : ""} · attendance {r.attendancePct}% · {r.lateCount} late · incentive {rupees(r.incentive)}
                </p>
              </div>
              <span className="font-display text-xl font-bold tabular">{r.score}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setTarget(r);
                  setUnits(String(r.target || ""));
                }}
              >
                Target
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Modal isOpen={!!target} onClose={() => setTarget(null)} title={target ? `${period} target for ${target.employee.name}` : ""}>
        <Label>Units to sell</Label>
        <Input id="tg-units" inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))} />
        <div className="mt-4 flex justify-end">
          <Button
            onClick={async () => {
              try {
                await api("/api/hr/targets", { method: "POST", json: { employeeId: target.employee._id, period, targetUnits: Number(units) } });
                setTarget(null);
                load();
              } catch (e: any) {
                setErr(e.message);
                setTarget(null);
              }
            }}
          >
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Setup() {
  const [deps, setDeps] = useState<any[]>([]);
  const [hols, setHols] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dep, setDep] = useState({ name: "", code: "" });
  const [hol, setHol] = useState({ date: "", name: "", kind: "FESTIVAL" });
  const [sh, setSh] = useState({ name: "", code: "", start: "09:30", end: "18:30", graceMinutes: "10", weeklyOffs: "0" });
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api<any[]>("/api/hr/departments").then(setDeps).catch(() => {});
    api<any[]>("/api/hr/holidays").then(setHols).catch(() => {});
    api<any[]>("/api/hr/shifts").then(setShifts).catch(() => {});
    api<any>("/api/hr/leave").then((x) => setTypes(x.types)).catch(() => {});
  }, []);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<any>, ok: string) => {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      await fn();
      setMsg(ok);
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="space-y-4">
      {msg && <Notice tone="success">{msg}</Notice>}
      {err && <Notice>{err}</Notice>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 font-display font-semibold">Departments</p>
          <ul className="mb-3 divide-y divide-slate-100 text-sm">
            {deps.map((d) => (
              <li key={d._id} className="flex justify-between py-1.5">
                <span>
                  {d.name} <span className="font-mono text-xs text-slate-400">{d.code}</span>
                </span>
                <span className="text-slate-500">{d.headcount} staff</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input id="dep-name" placeholder="Name" value={dep.name} onChange={(e) => setDep({ ...dep, name: e.target.value })} />
            <Input id="dep-code" className="w-28" placeholder="Code" value={dep.code} onChange={(e) => setDep({ ...dep, code: e.target.value.toUpperCase() })} />
            <Button disabled={busy} onClick={() => run(() => api("/api/hr/departments", { method: "POST", json: dep }), "Department saved")}>
              Add
            </Button>
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-2 font-display font-semibold">Holiday calendar {new Date().getFullYear()}</p>
          <ul className="mb-3 max-h-56 divide-y divide-slate-100 overflow-y-auto text-sm">
            {hols.map((h) => (
              <li key={h._id} className="flex items-center justify-between gap-2 py-1.5">
                <span>
                  {h.name} <span className="text-xs text-slate-400">{h.kind.toLowerCase()}</span>
                </span>
                <span className="text-slate-500">{new Date(`${h.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-[9.5rem_1fr_7rem_auto]">
            <Input id="hol-date" type="date" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
            <Input id="hol-name" placeholder="Name" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
            <select id="hol-kind" className="field" value={hol.kind} onChange={(e) => setHol({ ...hol, kind: e.target.value })}>
              <option value="NATIONAL">National</option>
              <option value="FESTIVAL">Festival</option>
              <option value="OPTIONAL">Optional</option>
            </select>
            <Button disabled={busy} onClick={() => run(() => api("/api/hr/holidays", { method: "POST", json: hol }), "Holiday added")}>
              Add
            </Button>
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-2 font-display font-semibold">Shifts</p>
          <ul className="mb-3 divide-y divide-slate-100 text-sm">
            {shifts.map((s) => (
              <li key={s._id} className="flex justify-between py-1.5">
                <span>
                  {s.name} <span className="font-mono text-xs text-slate-400">{s.code}</span> {s.isDefault && <span className="text-xs text-emerald-700">default</span>}
                </span>
                <span className="text-slate-500">
                  {s.start}–{s.end} · grace {s.graceMinutes}m · off {s.weeklyOffs.map((d: number) => DOW[d]).join(", ")}
                </span>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input id="sh-name" placeholder="Name" value={sh.name} onChange={(e) => setSh({ ...sh, name: e.target.value })} />
            <Input id="sh-code" placeholder="Code" value={sh.code} onChange={(e) => setSh({ ...sh, code: e.target.value.toUpperCase() })} />
            <Input id="sh-grace" placeholder="Grace min" value={sh.graceMinutes} onChange={(e) => setSh({ ...sh, graceMinutes: e.target.value })} />
            <Input id="sh-start" type="time" value={sh.start} onChange={(e) => setSh({ ...sh, start: e.target.value })} />
            <Input id="sh-end" type="time" value={sh.end} onChange={(e) => setSh({ ...sh, end: e.target.value })} />
            <select id="sh-off" className="field" value={sh.weeklyOffs} onChange={(e) => setSh({ ...sh, weeklyOffs: e.target.value })}>
              {DOW.map((d, i) => (
                <option key={d} value={String(i)}>
                  Off on {d}
                </option>
              ))}
            </select>
          </div>
          <Button className="mt-2" disabled={busy} onClick={() => run(() => api("/api/hr/shifts", { method: "POST", json: { ...sh, graceMinutes: Number(sh.graceMinutes), weeklyOffs: [Number(sh.weeklyOffs)] } }), "Shift saved")}>
            Add shift
          </Button>
        </Card>
        <Card className="p-4">
          <p className="mb-2 font-display font-semibold">Leave types</p>
          <ul className="divide-y divide-slate-100 text-sm">
            {types.map((t) => (
              <li key={t._id} className="flex justify-between py-1.5">
                <span>
                  {t.name} <span className="font-mono text-xs text-slate-400">{t.code}</span>
                </span>
                <span className="text-slate-500">
                  {t.paid ? `${t.annualQuota} days/yr` : "unpaid"}
                  {t.carryForwardMax ? ` · carry ${t.carryForwardMax}` : ""}
                  {t.encashable ? " · encashable" : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <p className="font-display font-semibold">Biometric machine import</p>
          <p className="mb-2 text-xs text-slate-500">
            Paste the machine&apos;s export: one punch per line, <span className="font-mono">EMPLOYEE_CODE, YYYY-MM-DD HH:MM</span> (IST). Punches alternate in/out each day; duplicates are ignored. A machine can also push directly to /api/hr/biometric with its device key.
          </p>
          <textarea id="bio-csv" className="field h-28 py-2 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"JKE-FEC-0001, 2026-11-14 09:28\nJKE-FEC-0001, 2026-11-14 18:41"} />
          <Button
            className="mt-2"
            disabled={busy || !csv.trim()}
            onClick={() =>
              run(async () => {
                const r = await api<any>("/api/hr/biometric", { method: "POST", json: { csv } });
                setCsv("");
                if (r.skipped.length) throw new Error(`Added ${r.added}; skipped ${r.skipped.length}: ${r.skipped.slice(0, 5).join(", ")}`);
              }, "Punches imported")
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import
          </Button>
        </Card>
      </div>
    </div>
  );
}
