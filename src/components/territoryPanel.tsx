"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, MapPin, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { api, dt, Notice } from "@/components/workflow";

const WORD: Record<string, string> = { ZONE: "zones", DISTRICT: "districts", AREA: "areas" };
const ROLE_SAYS: Record<string, string> = {
  ASM: "An Area Sales Manager covers one or more districts. Each district has one ASM.",
  FEC: "A Field Sales Executive covers one or more areas inside their ASM's districts.",
  BUSINESS_HEAD: "The Business Head can be given the zones they look after.",
};

/** Flatten the territory tree into rows with their parent names. */
function flatten(tree: any[]) {
  const out: any[] = [];
  const walk = (n: any, zone: string, district: string, districtId: string) => {
    out.push({ ...n, zone, district, districtId });
    (n.children || []).forEach((c: any) =>
      walk(c, n.kind === "ZONE" ? n.name : zone, n.kind === "DISTRICT" ? n.name : district, n.kind === "DISTRICT" ? String(n._id) : districtId)
    );
  };
  tree.forEach((z) => walk(z, z.name, "", ""));
  return out;
}

/** "Working area" card on an employee's page: current districts / areas, edit, and the dated history. */
export function TerritoryPanel({ employeeId, role, name }: { employeeId: string; role: string; name: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const load = useCallback(() => {
    api<any>(`/api/employees/${employeeId}/territories`).then(setD).catch((e) => setErr(e.message));
  }, [employeeId]);
  useEffect(load, [load]);
  if (!["ASM", "FEC", "BUSINESS_HEAD"].includes(role)) return null;
  if (err) return <Notice>{err}</Notice>;
  if (!d) return null;

  const current = d.territories || [];
  const open_ = (d.history || []).filter((h: any) => !h.to);
  const since = (tid: any) => open_.find((h: any) => String(h.territory) === String(tid))?.from;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-brand-600" /> Working area
          <span className="text-xs font-normal text-slate-500">({WORD[d.kind]})</span>
        </CardTitle>
        <div className="flex gap-2">
          {d.history?.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowHistory((v) => !v)}>
              <History className="h-3.5 w-3.5" /> {showHistory ? "Hide" : "History"}
            </Button>
          )}
          {d.canAssign && (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} id="assign-area">
              <Pencil className="h-3.5 w-3.5" /> {current.length ? "Change" : "Assign"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {current.length === 0 ? (
          <p className="text-sm text-amber-700">No {WORD[d.kind]} assigned yet. {d.canAssign ? "Use Assign to set where this person works." : ""}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {current.map((t: any) => (
              <span key={t._id} className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs ring-1 ring-brand-100">
                <span className="font-semibold text-brand-900">{t.name}</span> <span className="font-mono text-[10px] text-slate-500">{t.code}</span>
                {since(t._id) && <span className="block text-[10px] text-slate-500">since {dt(since(t._id))}</span>}
              </span>
            ))}
          </div>
        )}
        {d.manager && <p className="text-xs text-slate-500">Reports to {d.manager.name} (ASM) — areas must be inside that ASM&apos;s districts.</p>}
        {showHistory && (
          <div className="overflow-x-auto rounded-lg ring-1 ring-slate-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">Territory</th>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2">By / note</th>
                </tr>
              </thead>
              <tbody>
                {d.history.map((h: any) => (
                  <tr key={h._id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">
                      {h.territoryName} <span className="font-mono text-[10px] font-normal text-slate-500">{h.territoryCode}</span>
                    </td>
                    <td className="px-3 py-2">{dt(h.from)}</td>
                    <td className="px-3 py-2">{h.to ? dt(h.to) : <Badge variant="success">Current</Badge>}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {h.assignedByName}
                      {h.endedByName && h.to ? ` → ended by ${h.endedByName}` : ""}
                      {h.note && <span className="block text-[11px] text-slate-500">{h.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      {open && <AssignModal employeeId={employeeId} name={name} role={role} kind={d.kind} current={current} manager={d.manager} onClose={() => setOpen(false)} onSaved={load} />}
    </Card>
  );
}

export function AssignModal({
  employeeId,
  name,
  role,
  kind,
  current,
  manager,
  onClose,
  onSaved,
}: {
  employeeId: string;
  name: string;
  role: string;
  kind: "ZONE" | "DISTRICT" | "AREA";
  current: any[];
  manager?: { name: string; districts: string[] } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tree, setTree] = useState<any[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set(current.map((t) => String(t._id))));
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(false);
  const [warn, setWarn] = useState<string[]>([]);
  useEffect(() => {
    api<any[]>("/api/territories").then(setTree).catch((e) => setError(e.message));
  }, []);
  const rows = useMemo(() => (tree ? flatten(tree).filter((t) => t.kind === kind) : []), [tree, kind]);
  const groups = useMemo(() => {
    const g = new Map<string, any[]>();
    const needle = q.trim().toLowerCase();
    for (const t of rows) {
      if (needle && !`${t.name} ${t.code} ${t.district} ${t.zone}`.toLowerCase().includes(needle)) continue;
      const key = kind === "AREA" ? `${t.district} · ${t.zone}` : kind === "DISTRICT" ? t.zone : t.state || "Zones";
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(t);
    }
    return [...g.entries()];
  }, [rows, q, kind]);
  const allowed = (t: any) => kind !== "AREA" || !manager || manager.districts.length === 0 || manager.districts.includes(t.districtId);
  const toggle = (id: string) => {
    const n = new Set(picked);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setPicked(n);
    setTaken(false);
  };
  const save = async (takeOver = false) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<any>(`/api/employees/${employeeId}/territories`, { method: "PUT", json: { territoryIds: [...picked], note, takeOver } });
      onSaved();
      if (r.warnings?.length) setWarn(r.warnings);
      else onClose();
    } catch (e: any) {
      setError(e.message);
      setTaken(/Already covered/.test(e.message));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={`${kind === "AREA" ? "Areas" : kind === "DISTRICT" ? "Districts" : "Zones"} for ${name}`} maxWidth="2xl">
      <p className="mb-3 text-xs text-slate-600">{ROLE_SAYS[role]}</p>
      {manager && manager.districts.length > 0 && <p className="mb-3 text-xs text-brand-700">Showing areas of {manager.name}&apos;s districts first; others are greyed out.</p>}
      {warn.length > 0 ? (
        <>
          <Notice tone="warning">
            Saved. {warn.join(" ")}
          </Notice>
          <div className="mt-4 flex justify-end">
            <Button onClick={onClose}>OK</Button>
          </div>
        </>
      ) : (
        <>
          <Input placeholder={`Search ${WORD[kind]}…`} value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
          {!tree ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <Notice tone="info">No {WORD[kind]} exist yet. Add them under Territories first.</Notice>
          ) : (
            <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
              {groups
                .sort(([, a], [, b]) => Number(b.some(allowed)) - Number(a.some(allowed)))
                .map(([g, list]) => (
                  <div key={g}>
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{g}</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {list.map((t: any) => {
                        const id = String(t._id);
                        const others = (t.staff || []).filter((s: any) => String(s._id) !== employeeId && s.role === role);
                        const ok = allowed(t);
                        return (
                          <label key={id} className={cn("flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-xs ring-1", picked.has(id) ? "bg-brand-50 ring-brand-300" : "ring-slate-200", !ok && "opacity-50")}>
                            <input type="checkbox" className="mt-0.5" checked={picked.has(id)} disabled={!ok && !picked.has(id)} onChange={() => toggle(id)} data-code={t.code} />
                            <span className="min-w-0">
                              <span className="font-semibold text-slate-900">{t.name}</span> <span className="font-mono text-[10px] text-slate-500">{t.code}</span>
                              {others.length > 0 && <span className="block text-[11px] text-slate-500">{kind === "AREA" ? "Also: " : "Now with "}{others.map((s: any) => s.name).join(", ")}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Took over from Rakhi from 1 Dec" />
          </div>
          {error && <Notice className="mt-3">{error}</Notice>}
          <div className="modal-actions mt-4 flex flex-wrap justify-end gap-2">
            <span className="mr-auto self-center text-xs text-slate-500">{picked.size} selected</span>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {taken ? (
              <Button disabled={busy} onClick={() => save(true)}>
                Move it to {name.split(" ")[0]}
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => save(false)} id="save-areas">
                Save
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

const T_TABS = [
  { href: "/territories", label: "Territory map" },
  { href: "/territories/team", label: "Field team areas" },
];
/** Tabs shared by the territory pages. */
export function TerritoryTabs() {
  const path = usePathname();
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {T_TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold", path === t.href ? "bg-ink-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
