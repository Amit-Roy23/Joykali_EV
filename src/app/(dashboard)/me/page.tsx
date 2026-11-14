"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BadgeIndianRupee,
  CalendarDays,
  Camera,
  CircleUserRound,
  Clock3,
  FileText,
  IdCard,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Palmtree,
  Receipt,
  RotateCcw,
} from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { api, dt, Notice, rupees } from "@/components/workflow";
import { DAY_STYLE, DAY_LABEL, MonthGrid, hm } from "@/components/hr";

type Tab = "today" | "attendance" | "leave" | "money" | "profile";
const TABS: Array<[Tab, string, any]> = [
  ["today", "Today", Clock3],
  ["attendance", "Attendance", CalendarDays],
  ["leave", "Leave", Palmtree],
  ["money", "Advance & claims", BadgeIndianRupee],
  ["profile", "Profile", CircleUserRound],
];

/** Shrink a camera photo to ≤ 960 px JPEG so it uploads quickly on mobile data. */
async function compress(file: File): Promise<Blob> {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, 960 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", 0.8));
}
function locate(): Promise<GeolocationPosition> {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("This device cannot share its location"));
    navigator.geolocation.getCurrentPosition(res, (e) => rej(new Error(e.code === 1 ? "Location permission was denied — allow it in the browser settings" : "Could not get your location; try again in the open")), {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
  });
}

export default function MyHrPage() {
  const [tab, setTab] = useState<Tab>("today");
  const [period, setPeriod] = useState<string | null>(null);
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | "leave" | "fix" | "advance" | "claim" | "resign">(null);
  const camRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<any>(`/api/hr/me${period ? `?period=${period}` : ""}`)
      .then((x) => {
        setD(x);
        if (!period) setPeriod(x.today.slice(0, 7));
      })
      .catch((e) => setError(e.message));
  }, [period]);
  useEffect(load, [load]);
  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (TABS.some((t) => t[0] === h)) setTab(h);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    try {
      history.replaceState(null, "", `#${t}`);
    } catch {}
  };

  const field = d?.profile?.attendanceMode !== "OFFICE";
  const doPunch = async (file?: File | null) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const pos = await locate();
      const fd = new FormData();
      fd.set("lat", String(pos.coords.latitude));
      fd.set("lng", String(pos.coords.longitude));
      fd.set("accuracy", String(Math.round(pos.coords.accuracy)));
      fd.set("device", navigator.userAgent.slice(0, 150));
      if (file) fd.set("photo", await compress(file), "selfie.jpg");
      const res = await fetch("/api/hr/punch", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || "Punch failed");
      setNotice(`Punched ${j.data.type === "IN" ? "in" : "out"} at ${new Date(j.data.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}${pos.coords.accuracy ? ` · location ±${Math.round(pos.coords.accuracy)} m` : ""}`);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = "";
    }
  };

  if (!d) return error ? <Notice>{error}</Notice> : <PageSkeleton />;
  const t = d.todayRow;
  const s = d.month.summary;
  const pendingCount = d.leaves.filter((l: any) => l.status === "PENDING").length + d.corrections.filter((c: any) => c.status === "PENDING").length;

  return (
    <div className="animate-fade-up space-y-4 pb-24 lg:pb-0">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-100 font-display text-lg font-bold text-brand-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {d.profile.profile?.photo ? <img src={`/api/files/${d.profile.profile.photo}`} alt="" className="h-full w-full object-cover" /> : d.profile.name.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600">My HR</p>
          <h1 className="truncate font-display text-xl font-bold text-slate-900 sm:text-2xl">{d.profile.name}</h1>
          <p className="truncate text-xs text-slate-500">
            {d.profile.employeeCode} · {d.profile.designation}
            {d.profile.department?.name ? ` · ${d.profile.department.name}` : ""}
          </p>
        </div>
      </div>

      <nav className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label="My HR sections">
        {TABS.map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => go(k)}
            className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold", tab === k ? "border-ink-900 bg-ink-900 text-white" : "border-slate-200 bg-white text-slate-600")}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </nav>
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice>{error}</Notice>}

      {tab === "today" && (
        <>
          <Card className="overflow-hidden">
            <div className="bg-ink-900 p-5 text-white">
              <p className="text-xs text-slate-300">{new Date(`${d.today}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}</p>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p className="font-display text-3xl font-bold tabular">
                    {t?.inMin != null ? hm(t.inMin) : "--:--"} <span className="text-slate-500">→</span> {t?.outMin != null ? hm(t.outMin) : "--:--"}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {t ? DAY_LABEL[t.status] : ""}
                    {t?.lateMin ? ` · ${t.lateMin} min late` : ""}
                    {t?.workedMin ? ` · worked ${hm(t.workedMin)}` : ""}
                    {t?.duty ? ` · duty: ${t.duty}` : ""}
                  </p>
                </div>
                <span className="rounded-lg bg-white/10 px-2 py-1 font-mono text-xs">Shift {t?.shiftCode}</span>
              </div>
            </div>
            <div className="space-y-3 p-4">
              <input
                ref={camRef}
                id="selfie"
                type="file"
                accept="image/*"
                capture="user"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) doPunch(f);
                }}
              />
              <Button
                size="lg"
                className={cn("h-14 w-full text-base", d.nextAction === "OUT" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700")}
                disabled={busy || !!d.resignation?.settledAt}
                onClick={() => (field ? camRef.current?.click() : doPunch(null))}
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : d.nextAction === "OUT" ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
                {d.nextAction === "OUT" ? "Punch out" : "Punch in"}
                {field && <Camera className="h-4 w-4 opacity-80" />}
              </Button>
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5" />
                {field ? "Field staff: a selfie and your location are saved with every punch." : "Office staff: punch inside the office; your location is checked."}
              </p>
              {t?.punches?.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
                  {t.punches.map((p: any, i: number) => (
                    <li key={i} className="flex items-center justify-between px-3 py-2">
                      <span className="font-semibold">{p.type === "IN" ? "In" : "Out"}</span>
                      <span className="tabular">{new Date(p.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>
                      <span className="text-xs text-slate-500">
                        {p.source.toLowerCase()}
                        {p.hasPhoto ? " · photo" : ""}
                        {p.lat ? " · located" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700" onClick={() => setModal("fix")}>
                <RotateCcw className="h-3.5 w-3.5" /> Forgot to punch? Request a correction
              </button>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Present", s.present, `of ${s.workingDays} working days`],
              ["Late marks", s.lateCount, s.latePenaltyLop ? `${s.latePenaltyLop} day cut` : "every 3rd = ½ day"],
              ["Leave left", d.balances.filter((b: any) => b.paid).reduce((t: number, b: any) => t + (b.available || 0), 0), "paid days this year"],
              ["Loss of pay", s.lop, d.month.tracking ? "this month so far" : "attendance not yet in use"],
            ].map(([l, v, sub]) => (
              <div key={l as string} className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-card">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{l}</p>
                <p className="mt-1 font-display text-2xl font-bold tabular text-slate-900">{v}</p>
                <p className="truncate text-[11px] text-slate-500">{sub}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Next 7 days</CardTitle>
                <CardDescription>Shift, duty and days off from your manager&apos;s roster</CardDescription>
              </CardHeader>
              <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
                {d.month.days
                  .filter((x: any) => x.date >= d.today)
                  .slice(0, 7)
                  .map((x: any) => (
                    <li key={x.date} className="flex items-center justify-between gap-2 px-5 py-2">
                      <span className="w-24 shrink-0 text-slate-600">{new Date(`${x.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
                      <span className="min-w-0 flex-1 truncate">{x.holiday || x.duty || (x.status === "WEEKLY_OFF" ? "Weekly off" : x.leaveCode ? `${x.leaveCode} leave` : `Shift ${x.shiftCode}`)}</span>
                      {x.location && <span className="truncate text-xs text-slate-500">{x.location}</span>}
                    </li>
                  ))}
              </ul>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Holidays</CardTitle>
              </CardHeader>
              <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
                {d.holidays
                  .filter((h: any) => h.date >= d.today)
                  .slice(0, 6)
                  .map((h: any) => (
                    <li key={h._id} className="flex justify-between gap-2 px-5 py-2">
                      <span>{h.name}</span>
                      <span className="text-slate-500">{new Date(`${h.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
                    </li>
                  ))}
                {!d.holidays.some((h: any) => h.date >= d.today) && <li className="px-5 py-3 text-slate-500">No more holidays this year.</li>}
              </ul>
            </Card>
          </div>
          {pendingCount > 0 && <Notice tone="info">{pendingCount} request(s) waiting for your manager.</Notice>}
        </>
      )}

      {tab === "attendance" && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Input id="period" type="month" className="h-9 w-40" value={period || ""} max={d.today.slice(0, 7)} onChange={(e) => e.target.value && setPeriod(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => setModal("fix")}>
              <RotateCcw className="h-4 w-4" /> Request correction
            </Button>
          </div>
          <MonthGrid days={d.month.days} />
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            {Object.entries(DAY_LABEL)
              .filter(([k]) => !["UPCOMING", "NOT_JOINED"].includes(k))
              .map(([k, v]) => (
                <span key={k} className={cn("rounded px-1.5 py-0.5", DAY_STYLE[k])}>
                  {v}
                </span>
              ))}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["Present", s.present],
              ["Absent", s.absent],
              ["Paid leave", s.leavePaid],
              ["Late / early", `${s.lateCount} / ${s.earlyCount}`],
              ["Overtime (approved)", `${(s.otApprovedMinutes / 60).toFixed(1)} h of ${(s.otMinutes / 60).toFixed(1)} h`],
              ["Loss of pay", s.lop],
              ["Holidays", s.holidays],
              ["Attendance", `${s.attendancePct}%`],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl bg-slate-50 p-2.5">
                <dt className="text-[11px] text-slate-500">{k}</dt>
                <dd className="font-semibold tabular">{v}</dd>
              </div>
            ))}
          </dl>
          {d.corrections.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Correction requests</p>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
                {d.corrections.map((c: any) => (
                  <li key={c._id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span>
                      {c.date} · {c.inTime || "—"} → {c.outTime || "—"}
                      <span className="block text-xs text-slate-500">{c.remarks || c.reason}</span>
                    </span>
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {tab === "leave" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {d.balances.map((b: any) => (
              <div key={b.code} className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-card">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{b.name}</p>
                <p className="mt-1 font-display text-2xl font-bold tabular">{b.paid ? b.available : "—"}</p>
                <p className="text-[11px] text-slate-500">{b.paid ? `of ${b.quota + b.opening} · ${b.taken} taken${b.pending ? ` · ${b.pending} pending` : ""}` : "unpaid, no limit"}</p>
              </div>
            ))}
          </div>
          <Button onClick={() => setModal("leave")}>
            <Palmtree className="h-4 w-4" /> Apply for leave
          </Button>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>My leave</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {d.leaves.length === 0 && <li className="px-5 py-3 text-slate-500">No leave applied yet.</li>}
              {d.leaves.map((l: any) => (
                <li key={l._id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {l.leaveCode} · {l.from === l.to ? l.from : `${l.from} → ${l.to}`} · {l.days} day(s){l.half ? " (half)" : ""}
                    </p>
                    <p className="truncate text-xs text-slate-500">{l.remarks ? `${l.decidedByName}: ${l.remarks}` : l.reason}</p>
                  </div>
                  <StatusBadge status={l.status} />
                  {(l.status === "PENDING" || (l.status === "APPROVED" && l.from > d.today)) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await api(`/api/hr/leave/${l._id}`, { method: "POST", json: { action: "cancel" } });
                          load();
                        } catch (e: any) {
                          setError(e.message);
                        }
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {tab === "money" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setModal("advance")}>
              <BadgeIndianRupee className="h-4 w-4" /> Request advance / loan
            </Button>
            <Button variant="outline" onClick={() => setModal("claim")}>
              <Receipt className="h-4 w-4" /> Submit expense claim
            </Button>
          </div>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Advances & loans</CardTitle>
              <CardDescription>Approved by the Business Head and the Managing Partner; instalments are deducted from salary automatically.</CardDescription>
            </CardHeader>
            <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {d.advances.length === 0 && <li className="px-5 py-3 text-slate-500">None.</li>}
              {d.advances.map((a: any) => (
                <li key={a._id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {a.code} · {a.kind === "LOAN" ? `Loan ${rupees(a.amount)} · ${rupees(a.emi)}/month` : `Advance ${rupees(a.amount)}`}
                    </p>
                    <p className="text-xs text-slate-500">
                      Balance {rupees(a.balance)}
                      {a.startPeriod ? ` · recovery from ${a.startPeriod}` : ""} · {a.reason}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Expense claims</CardTitle>
              <CardDescription>Your manager checks, then Business Head and Managing Partner approve; paid with your next salary.</CardDescription>
            </CardHeader>
            <ul className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {d.claims.length === 0 && <li className="px-5 py-3 text-slate-500">None.</li>}
              {d.claims.map((c: any) => (
                <li key={c._id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {c.code} · {rupees(c.amount)} · {c.category.toLowerCase().replace("_", " ")}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {c.date} · {c.rejectReason || c.description}
                      {c.paidInPeriod ? ` · paid in ${c.paidInPeriod}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={c.status === "VERIFIED" ? "UNDER_REVIEW" : c.status} label={c.status === "VERIFIED" ? "WITH BH / MP" : undefined} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {tab === "profile" && <ProfileTab d={d} reload={load} onResign={() => setModal("resign")} />}

      <RequestModals open={modal} onClose={() => setModal(null)} d={d} done={(msg) => { setModal(null); setNotice(msg); load(); }} />
    </div>
  );
}

function ProfileTab({ d, reload, onResign }: { d: any; reload: () => void; onResign: () => void }) {
  const p = d.profile;
  const [form, setForm] = useState({ address: p.profile?.address || "", bloodGroup: p.profile?.bloodGroup || "", emergencyName: p.profile?.emergencyName || "", emergencyPhone: p.profile?.emergencyPhone || "", emergencyRelation: p.profile?.emergencyRelation || "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [doc, setDoc] = useState({ docType: "AADHAAR", number: "" });
  const [file, setFile] = useState<File | null>(null);
  const save = async () => {
    setErr(null);
    try {
      await api(`/api/hr/profile/${p._id}`, { method: "PUT", json: form });
      setMsg("Saved");
      reload();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const upload = async () => {
    setErr(null);
    const fd = new FormData();
    fd.set("docType", doc.docType);
    fd.set("number", doc.number);
    if (file) fd.set("file", file);
    const r = await fetch(`/api/hr/documents/${p._id}`, { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok || !j.success) return setErr(j.error || "Upload failed");
    setDoc({ docType: "AADHAAR", number: "" });
    setFile(null);
    setMsg("Document uploaded — HR will verify it");
    reload();
  };
  const r = d.resignation;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4">
        <p className="mb-3 font-display font-semibold">Joining record</p>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {[
            ["Employee code", p.employeeCode],
            ["Joined", dt(p.joiningDate)],
            ["Designation", p.designation],
            ["Department", p.department?.name || "—"],
            ["Reports to", p.reportsTo?.name || "—"],
            ["Shift", p.shift ? `${p.shift.name} ${p.shift.start}–${p.shift.end}` : "General"],
            ["Attendance", p.attendanceMode === "OFFICE" ? "Office" : "Field (photo + GPS)"],
            ["Notice period", `${p.noticeDays ?? 30} days`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] text-slate-500">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/hr/idcard/${p._id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink-900 px-3 text-sm font-semibold text-white">
            <IdCard className="h-4 w-4" /> My ID card
          </a>
          <Link href="/payslips" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <FileText className="h-4 w-4" /> Payslips
          </Link>
        </div>
      </Card>
      <Card className="space-y-3 p-4">
        <p className="font-display font-semibold">Contact & emergency</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Address</Label>
            <Input id="pf-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Blood group</Label>
            <select id="pf-blood" className="field" value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}>
              <option value="">—</option>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Emergency contact</Label>
            <Input id="pf-ename" value={form.emergencyName} onChange={(e) => setForm({ ...form, emergencyName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Their mobile</Label>
            <Input id="pf-ephone" inputMode="numeric" maxLength={10} value={form.emergencyPhone} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="space-y-1.5">
            <Label>Relation</Label>
            <Input id="pf-erel" value={form.emergencyRelation} onChange={(e) => setForm({ ...form, emergencyRelation: e.target.value })} />
          </div>
        </div>
        <Button size="sm" onClick={save}>
          Save
        </Button>
      </Card>
      <Card className="space-y-3 p-4">
        <p className="font-display font-semibold">My documents</p>
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
          {d.docs.length === 0 && <li className="px-3 py-2 text-slate-500">Nothing uploaded yet.</li>}
          {d.docs.map((x: any) => (
            <li key={x._id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                {x.docType.replace(/_/g, " ").toLowerCase()} {x.number ? `· ${x.number}` : ""}
              </span>
              <span className={cn("text-xs font-semibold", x.verified ? "text-emerald-700" : "text-amber-700")}>{x.verified ? "verified" : "pending"}</span>
            </li>
          ))}
        </ul>
        <div className="grid gap-2 sm:grid-cols-3">
          <select id="doc-type" className="field" value={doc.docType} onChange={(e) => setDoc({ ...doc, docType: e.target.value })}>
            {["PHOTO", "AADHAAR", "PAN", "BANK_PROOF", "EDUCATION", "EXPERIENCE", "OTHER"].map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ").toLowerCase()}
              </option>
            ))}
          </select>
          <Input id="doc-number" placeholder="Number" value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value.toUpperCase() })} />
          <Input id="doc-file" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <Button size="sm" variant="outline" onClick={upload}>
          Upload
        </Button>
      </Card>
      <Card className="space-y-3 p-4">
        <p className="font-display font-semibold">Resignation</p>
        {r ? (
          <>
            <p className="text-sm">
              Submitted {dt(r.submittedAt)} · requested last day {r.requestedLwd}
              {r.acceptedLwd ? ` · accepted last day ${r.acceptedLwd}` : ""}
            </p>
            <StatusBadge status={r.status} />
            {r.settlement && (
              <ul className="space-y-1 text-sm">
                {r.settlement.lines.filter((l: any) => l.amount).map((l: any) => (
                  <li key={l.label} className="flex justify-between gap-2">
                    <span className="text-slate-600">{l.label}</span>
                    <span className="tabular">{rupees(l.amount)}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t pt-1 font-semibold">
                  <span>Net payable</span>
                  <span>{rupees(r.settlement.net)}</span>
                </li>
              </ul>
            )}
            {r.status === "SUBMITTED" && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await api(`/api/hr/resignations/${r._id}`, { method: "POST", json: { action: "withdraw" } });
                  reload();
                }}
              >
                Withdraw
              </Button>
            )}
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={onResign}>
            Submit resignation
          </Button>
        )}
      </Card>
      {msg && <Notice tone="success" className="lg:col-span-2">{msg}</Notice>}
      {err && <Notice className="lg:col-span-2">{err}</Notice>}
    </div>
  );
}

function RequestModals({ open, onClose, d, done }: { open: string | null; onClose: () => void; d: any; done: (m: string) => void }) {
  const [v, setV] = useState<Record<string, any>>({});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setV({ leaveCode: d.balances[0]?.code, from: d.today, to: d.today, date: d.today, kind: "ADVANCE", tenureMonths: 6, category: "TRAVEL", requestedLwd: new Date(Date.parse(`${d.today}T00:00:00Z`) + (d.profile.noticeDays ?? 30) * 86400000).toISOString().slice(0, 10) });
    setFile(null);
    setErr(null);
  }, [open, d]);
  const set = (k: string) => (e: any) => setV({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (open === "leave") {
        await api("/api/hr/leave", { method: "POST", json: { leaveCode: v.leaveCode, from: v.from, to: v.half ? v.from : v.to, half: !!v.half, reason: v.reason } });
        done("Leave applied — your manager will decide.");
      } else if (open === "fix") {
        await api("/api/hr/regularizations", { method: "POST", json: { date: v.date, inTime: v.inTime || undefined, outTime: v.outTime || undefined, reason: v.reason } });
        done("Correction sent to your manager.");
      } else if (open === "advance") {
        await api("/api/hr/advances", { method: "POST", json: { kind: v.kind, amountRupees: Number(v.amount), tenureMonths: Number(v.tenureMonths), reason: v.reason } });
        done("Request sent to the Business Head and the Managing Partner.");
      } else if (open === "claim") {
        const fd = new FormData();
        for (const k of ["date", "category", "description"]) fd.set(k, v[k] || "");
        fd.set("amountRupees", v.amount || "");
        if (v.km) fd.set("kmTravelled", v.km);
        if (file) fd.set("bill", file);
        const r = await fetch("/api/hr/claims", { method: "POST", body: fd });
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j.error || "Failed");
        done("Claim submitted.");
      } else if (open === "resign") {
        await api("/api/hr/resignations", { method: "POST", json: { reason: v.reason, requestedLwd: v.requestedLwd } });
        done("Resignation submitted to your manager.");
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const F = (label: string, el: React.ReactNode, wide = false) => (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <Label>{label}</Label>
      {el}
    </div>
  );
  const titles: Record<string, string> = { leave: "Apply for leave", fix: "Request an attendance correction", advance: "Salary advance or loan", claim: "Expense claim", resign: "Submit resignation" };
  const bal = d.balances.find((b: any) => b.code === v.leaveCode);
  return (
    <Modal isOpen={!!open} onClose={onClose} title={open ? titles[open] : ""}>
      <div className="grid gap-3 sm:grid-cols-2">
        {open === "leave" && (
          <>
            {F(
              "Type",
              <select id="lv-type" className="field" value={v.leaveCode || ""} onChange={set("leaveCode")}>
                {d.balances.map((b: any) => (
                  <option key={b.code} value={b.code}>
                    {b.name} {b.paid ? `(${b.available} left)` : "(unpaid)"}
                  </option>
                ))}
              </select>
            )}
            {F(
              "Half day?",
              <label className="flex h-10 items-center gap-2 text-sm">
                <input id="lv-half" type="checkbox" checked={!!v.half} disabled={bal && !bal.halfDayAllowed} onChange={set("half")} /> Half day (single date)
              </label>
            )}
            {F("From", <Input id="lv-from" type="date" value={v.from || ""} onChange={set("from")} />)}
            {!v.half && F("To", <Input id="lv-to" type="date" value={v.to || ""} onChange={set("to")} />)}
            {F("Reason", <Input id="lv-reason" value={v.reason || ""} onChange={set("reason")} />, true)}
            <p className="text-xs text-slate-500 sm:col-span-2">Sundays / weekly offs and holidays inside the dates are not counted.</p>
          </>
        )}
        {open === "fix" && (
          <>
            {F("Date", <Input id="fx-date" type="date" max={d.today} value={v.date || ""} onChange={set("date")} />, true)}
            {F("Actual in time", <Input id="fx-in" type="time" value={v.inTime || ""} onChange={set("inTime")} />)}
            {F("Actual out time", <Input id="fx-out" type="time" value={v.outTime || ""} onChange={set("outTime")} />)}
            {F("What happened", <Input id="fx-reason" value={v.reason || ""} onChange={set("reason")} placeholder="e.g. phone battery died at a customer site" />, true)}
          </>
        )}
        {open === "advance" && (
          <>
            {F(
              "Type",
              <select id="ad-kind" className="field" value={v.kind} onChange={set("kind")}>
                <option value="ADVANCE">Salary advance (recovered next month)</option>
                <option value="LOAN">Loan (monthly instalments)</option>
              </select>,
              true
            )}
            {F("Amount (₹)", <Input id="ad-amount" inputMode="numeric" value={v.amount || ""} onChange={set("amount")} />)}
            {v.kind === "LOAN" && F("Months", <Input id="ad-tenure" inputMode="numeric" value={v.tenureMonths} onChange={set("tenureMonths")} />)}
            {v.kind === "LOAN" && v.amount && v.tenureMonths ? <p className="text-xs text-slate-500 sm:col-span-2">Instalment about ₹{Math.ceil(Number(v.amount) / Number(v.tenureMonths)).toLocaleString("en-IN")} a month.</p> : null}
            {F("Reason", <Input id="ad-reason" value={v.reason || ""} onChange={set("reason")} />, true)}
          </>
        )}
        {open === "claim" && (
          <>
            {F("Date", <Input id="cl-date" type="date" max={d.today} value={v.date || ""} onChange={set("date")} />)}
            {F(
              "Category",
              <select id="cl-cat" className="field" value={v.category} onChange={set("category")}>
                {["TRAVEL", "FUEL", "FOOD", "LODGING", "MOBILE", "CUSTOMER_DEMO", "OTHER"].map((c) => (
                  <option key={c} value={c}>
                    {c.replace("_", " ").toLowerCase()}
                  </option>
                ))}
              </select>
            )}
            {F("Amount (₹)", <Input id="cl-amount" inputMode="decimal" value={v.amount || ""} onChange={set("amount")} />)}
            {(v.category === "TRAVEL" || v.category === "FUEL") && F("Km travelled", <Input id="cl-km" inputMode="numeric" value={v.km || ""} onChange={set("km")} />)}
            {F("What for", <Input id="cl-desc" value={v.description || ""} onChange={set("description")} />, true)}
            {F("Bill photo / PDF (needed above ₹500)", <Input id="cl-bill" type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFile(e.target.files?.[0] || null)} />, true)}
          </>
        )}
        {open === "resign" && (
          <>
            {F("Last working day you request", <Input id="rs-lwd" type="date" min={d.today} value={v.requestedLwd || ""} onChange={set("requestedLwd")} />, true)}
            <p className="text-xs text-slate-500 sm:col-span-2">Your notice period is {d.profile.noticeDays ?? 30} days. A shorter notice is recovered in the final settlement unless your manager waives it.</p>
            {F("Reason", <Input id="rs-reason" value={v.reason || ""} onChange={set("reason")} />, true)}
          </>
        )}
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={submit}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit
        </Button>
      </div>
    </Modal>
  );
}
