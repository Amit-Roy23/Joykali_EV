"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BadgeCheck, IdCard } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useSession } from "@/components/layout/session";
import { api, Notice } from "@/components/workflow";
import { MonthGrid } from "@/components/hr";

/** HR view of one employee: assignment (department, shift, attendance mode), documents, ID card, this month. */
export function EmployeeHrPanel({ employee }: { employee: any }) {
  const { can, user } = useSession();
  const isHr = can("hr.manage");
  const [deps, setDeps] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [month, setMonth] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    departmentId: String(employee.department?._id || employee.department || ""),
    shiftId: String(employee.shift?._id || employee.shift || ""),
    attendanceMode: employee.attendanceMode || "FIELD",
    noticeDays: String(employee.noticeDays ?? 30),
    dob: employee.profile?.dob || "",
    gender: employee.profile?.gender || "",
  });
  const id = String(employee._id);
  const load = useCallback(() => {
    if (isHr || String(user?.userId) === id) api<any[]>(`/api/hr/documents/${id}`).then(setDocs).catch(() => setDocs([]));
    api<any>(`/api/hr/attendance?employeeId=${id}`).then(setMonth).catch(() => setMonth(null));
  }, [id, isHr, user?.userId]);
  useEffect(() => {
    load();
    if (isHr) {
      api<any[]>("/api/hr/departments").then(setDeps).catch(() => {});
      api<any[]>("/api/hr/shifts").then(setShifts).catch(() => {});
    }
  }, [load, isHr]);
  const save = async () => {
    setErr(null);
    setMsg(null);
    try {
      await api(`/api/hr/profile/${id}`, { method: "PUT", json: { ...f, noticeDays: Number(f.noticeDays) } });
      setMsg("Saved");
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>HR record</CardTitle>
            <CardDescription>Department, shift and how attendance is taken</CardDescription>
          </div>
          <a href={`/api/hr/idcard/${id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink-900 px-3 text-sm font-semibold text-white">
            <IdCard className="h-4 w-4" /> ID card
          </a>
        </CardHeader>
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Department</Label>
            <select id="hr-dep" className="field" disabled={!isHr} value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
              <option value="">—</option>
              {deps.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
              {!isHr && employee.department?.name && <option value={f.departmentId}>{employee.department.name}</option>}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Shift</Label>
            <select id="hr-shift" className="field" disabled={!isHr} value={f.shiftId} onChange={(e) => setF({ ...f, shiftId: e.target.value })}>
              <option value="">Default shift</option>
              {shifts.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} {s.start}–{s.end}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Attendance</Label>
            <select id="hr-mode" className="field" disabled={!isHr} value={f.attendanceMode} onChange={(e) => setF({ ...f, attendanceMode: e.target.value })}>
              <option value="FIELD">Field — selfie + GPS anywhere</option>
              <option value="OFFICE">Office — within office radius</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Notice period (days)</Label>
            <Input id="hr-notice" disabled={!isHr} inputMode="numeric" value={f.noticeDays} onChange={(e) => setF({ ...f, noticeDays: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="space-y-1.5">
            <Label>Date of birth</Label>
            <Input id="hr-dob" disabled={!isHr} type="date" value={f.dob} onChange={(e) => setF({ ...f, dob: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <select id="hr-gender" className="field" disabled={!isHr} value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
              <option value="">—</option>
              <option>Female</option>
              <option>Male</option>
              <option>Other</option>
            </select>
          </div>
          {isHr && (
            <Button size="sm" className="sm:col-span-2 sm:justify-self-start" onClick={save}>
              Save
            </Button>
          )}
          {msg && <Notice tone="success" className="sm:col-span-2">{msg}</Notice>}
          {err && <Notice className="sm:col-span-2">{err}</Notice>}
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>This month&apos;s attendance</CardTitle>
          <CardDescription>
            {month ? `Present ${month.summary.present}/${month.summary.workingDays} · late ${month.summary.lateCount} · loss of pay ${month.summary.lop}` : "—"}
          </CardDescription>
        </CardHeader>
        <div className="px-5 pb-5">{month && <MonthGrid days={month.days} />}</div>
      </Card>
      {(isHr || String(user?.userId) === id) && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Documents & joining papers</CardTitle>
            <CardDescription>Verified by HR (not by the person who uploaded them)</CardDescription>
          </CardHeader>
          <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
            {docs.length === 0 && <li className="px-5 py-3 text-slate-500">No documents yet.</li>}
            {docs.map((d) => (
              <li key={d._id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                <span className="min-w-0 flex-1">
                  {d.docType.replace(/_/g, " ").toLowerCase()} {d.number ? `· ${d.number}` : ""}
                </span>
                {d.file && (
                  <a className="text-xs font-semibold text-brand-700" href={`/api/files/${d.file}`} target="_blank" rel="noreferrer">
                    View
                  </a>
                )}
                {d.verified ? (
                  <span className="text-xs font-semibold text-emerald-700">verified by {d.verifiedByName}</span>
                ) : isHr ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      setErr(null);
                      try {
                        await api(`/api/hr/documents/verify/${d._id}`, { method: "POST" });
                        load();
                      } catch (e: any) {
                        setErr(e.message);
                      }
                    }}
                  >
                    <BadgeCheck className="h-4 w-4" /> Verify
                  </Button>
                ) : (
                  <span className="text-xs text-amber-700">pending</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
