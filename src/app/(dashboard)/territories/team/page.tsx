"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, MapPin, Search, UserRound, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice } from "@/components/workflow";
import { AssignModal, TerritoryTabs } from "@/components/territoryPanel";

const Chip = ({ t, tone = "brand" }: { t: any; tone?: "brand" | "slate" | "amber" }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1",
      tone === "brand" && "bg-brand-50 text-brand-900 ring-brand-100",
      tone === "slate" && "bg-slate-50 text-slate-700 ring-slate-200",
      tone === "amber" && "bg-amber-50 text-amber-800 ring-amber-200"
    )}
  >
    {t.name}
  </span>
);

/** ASM → districts → FSEs → areas, with what is not covered, and a "who covered it when" lookup. */
export default function TerritoryTeamPage() {
  const { can, user } = useSession();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<null | { id: string; name: string; role: string; kind: any; current: any[]; manager: any }>(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => {
    api<any>("/api/territories/team").then(setD).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  const admin = can("employee.manage") || can("network.manage");
  const isAsm = user?.role === "ASM";

  const teams = useMemo(() => {
    if (!d) return [];
    const n = q.trim().toLowerCase();
    if (!n) return d.teams;
    const hit = (p: any) => `${p.name} ${p.employeeCode} ${p.territories.map((t: any) => t.name).join(" ")}`.toLowerCase().includes(n);
    return d.teams
      .map((t: any) => (hit(t) ? t : { ...t, fses: t.fses.filter(hit) }))
      .filter((t: any) => hit(t) || t.fses.length);
  }, [d, q]);

  if (err) return <Notice>{err}</Notice>;
  const g = d?.gaps;
  const fseCount = d ? d.teams.reduce((s: number, t: any) => s + t.fses.length, 0) + d.otherFses.length : 0;

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Channel"
        title="Field team areas"
        description="Which Area Sales Manager covers which districts, and which Field Sales Executive works in which area. Every change is dated, so you can always see who covered an area in the past."
      />
      <TerritoryTabs />
      {!d ? (
        <Skeleton className="h-72" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Area Sales Managers" value={d.teams.length} icon={UserRound} tone="sky" />
            <StatCard label="Field Sales Executives" value={fseCount} icon={Users} tone="emerald" />
            {!isAsm && <StatCard label="Districts with no ASM" value={g.districtsWithoutAsm.length} tone={g.districtsWithoutAsm.length ? "amber" : "slate"} />}
            <StatCard label="Areas with no FSE" value={g.areasWithoutFse.length} tone={g.areasWithoutFse.length ? "amber" : "slate"} />
            <StatCard label="FSEs with no area" value={g.fsesWithoutArea.length} tone={g.fsesWithoutArea.length ? "rose" : "slate"} />
          </div>

          {(g.fsesWithoutArea.length > 0 || g.areasOutsideAsm.length > 0 || g.districtsWithoutAsm.length > 0 || g.areasWithoutFse.length > 0) && (
            <Card className="space-y-2 border-amber-200 bg-amber-50/50 p-4 text-xs">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" /> Needs attention
              </p>
              {g.fsesWithoutArea.length > 0 && (
                <p>
                  <b>FSEs with no area:</b>{" "}
                  {g.fsesWithoutArea.map((f: any, i: number) => (
                    <React.Fragment key={f._id}>
                      {i > 0 && ", "}
                      <Link className="text-brand-700 underline" href={`/employees/${f._id}`}>
                        {f.name}
                      </Link>
                    </React.Fragment>
                  ))}
                </p>
              )}
              {g.areasOutsideAsm.map((x: any) => (
                <p key={x._id}>
                  <b>{x.name}</b> works in {x.areas.join(", ")}, which is outside {x.asm}&apos;s districts.
                </p>
              ))}
              {g.districtsWithoutAsm.length > 0 && (
                <p>
                  <b>Districts with no ASM:</b> {g.districtsWithoutAsm.map((t: any) => t.name).join(", ")}
                </p>
              )}
              {g.areasWithoutFse.length > 0 && (
                <p>
                  <b>Areas with no FSE:</b> {g.areasWithoutFse.map((t: any) => `${t.name} (${t.district})`).join(", ")}
                </p>
              )}
            </Card>
          )}

          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input className="pl-9" placeholder="Search a name, district or area…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          {teams.length === 0 ? (
            <EmptyState icon={MapPin} title="No ASMs found" description="Add Area Sales Managers under Employees, then assign their districts here." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {teams.map((t: any) => (
                <Card key={t._id} className="overflow-hidden" data-asm={t.employeeCode}>
                  <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 bg-slate-50/60 p-4">
                    <div className="min-w-0 flex-1">
                      <Link href={`/employees/${t._id}`} className="font-semibold text-slate-900 hover:underline">
                        {t.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {t.designation} · <span className="font-mono">{t.employeeCode}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {t.territories.length ? t.territories.map((x: any) => <Chip key={x._id} t={x} />) : <span className="text-xs text-amber-700">No district assigned</span>}
                      </div>
                    </div>
                    {admin && (
                      <Button size="sm" variant="outline" onClick={() => setEdit({ id: t._id, name: t.name, role: "ASM", kind: "DISTRICT", current: t.territories, manager: null })}>
                        Districts
                      </Button>
                    )}
                  </div>
                  {t.fses.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500">No FSEs report to {t.name.split(" ")[0]}.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {t.fses.map((f: any) => (
                        <li key={f._id} className="flex flex-wrap items-center gap-2 px-4 py-2.5" data-fse={f.employeeCode}>
                          <div className="min-w-[150px] flex-1">
                            <Link href={`/employees/${f._id}`} className="text-sm font-medium text-slate-800 hover:underline">
                              {f.name}
                            </Link>
                            <p className="font-mono text-[11px] text-slate-500">{f.employeeCode}</p>
                          </div>
                          <div className="flex flex-[2] flex-wrap gap-1">
                            {f.territories.length ? (
                              f.territories.map((x: any) => <Chip key={x._id} t={x} tone={f.outside.includes(x.name) ? "amber" : "slate"} />)
                            ) : (
                              <span className="text-xs font-semibold text-rose-600">No area</span>
                            )}
                          </div>
                          {(admin || isAsm) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEdit({ id: f._id, name: f.name, role: "FEC", kind: "AREA", current: f.territories, manager: { name: t.name, districts: t.territories.map((x: any) => String(x._id)) } })}
                            >
                              Areas
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          )}

          {d.otherFses.length > 0 && (
            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">FSEs not reporting to an ASM</p>
              <ul className="divide-y divide-slate-100">
                {d.otherFses.map((f: any) => (
                  <li key={f._id} className="flex flex-wrap items-center gap-2 py-2">
                    <Link href={`/employees/${f._id}`} className="flex-1 text-sm hover:underline">
                      {f.name} <span className="font-mono text-[11px] text-slate-500">{f.employeeCode}</span>
                    </Link>
                    <div className="flex flex-wrap gap-1">{f.territories.length ? f.territories.map((x: any) => <Chip key={x._id} t={x} tone="slate" />) : <span className="text-xs text-rose-600">No area</span>}</div>
                    {admin && (
                      <Button size="sm" variant="ghost" onClick={() => setEdit({ id: f._id, name: f.name, role: "FEC", kind: "AREA", current: f.territories, manager: null })}>
                        Areas
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <WhoCovered />
        </>
      )}
      {edit && <AssignModal employeeId={edit.id} name={edit.name} role={edit.role} kind={edit.kind} current={edit.current} manager={edit.manager} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}

/** Look back: who covered a district / area, on a date or over time. */
function WhoCovered() {
  const [terrs, setTerrs] = useState<any[]>([]);
  const [tid, setTid] = useState("");
  const [on, setOn] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<any[]>("/api/territories?flat=1")
      .then((l) => setTerrs(l.filter((t) => t.kind !== "ZONE")))
      .catch(() => setTerrs([]));
  }, []);
  const look = () => {
    if (!tid) return;
    setErr(null);
    api<any[]>(`/api/territories/history?territory=${tid}${on ? `&on=${on}` : ""}`).then(setRows).catch((e) => setErr(e.message));
  };
  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-semibold">Who covered it?</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>District or area</Label>
          <select id="who-terr" className="h-9 min-w-[220px] rounded-lg border border-slate-200 bg-white px-2 text-sm" value={tid} onChange={(e) => setTid(e.target.value)}>
            <option value="">Choose…</option>
            {terrs.map((t) => (
              <option key={t._id} value={t._id}>
                {t.kind === "DISTRICT" ? "District" : "Area"}: {t.name} ({t.code})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>On date (optional)</Label>
          <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} />
        </div>
        <Button onClick={look} disabled={!tid} id="who-look">
          Show
        </Button>
      </div>
      {err && <Notice>{err}</Notice>}
      {rows &&
        (rows.length === 0 ? (
          <p className="text-xs text-slate-500">Nobody was assigned {on ? "on that date" : "yet"}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" id="who-table">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3">Person</th>
                  <th className="py-1.5 pr-3">Territory</th>
                  <th className="py-1.5 pr-3">From</th>
                  <th className="py-1.5 pr-3">To</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-semibold">
                      {r.employeeName} <span className="font-normal text-slate-500">({r.role === "FEC" ? "FSE" : r.role === "BUSINESS_HEAD" ? "BH" : r.role})</span>
                    </td>
                    <td className="py-1.5 pr-3">{r.territoryName}</td>
                    <td className="py-1.5 pr-3">{dt(r.from)}</td>
                    <td className="py-1.5 pr-3">{r.to ? dt(r.to) : "now"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </Card>
  );
}
