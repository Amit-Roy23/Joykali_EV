"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader, RoleBadge, Skeleton, StatCard } from "@/components/ui/kit";
import { api, Notice } from "@/components/workflow";
import { Field } from "@/components/network";

/** Posts (designations): create new positions any time, each with an access level and its own employee-ID prefix. */
export default function PostsPage() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => {
    api<any>("/api/posts").then(setD).catch((e) => setErr(e.message));
  }, []);
  useEffect(load, [load]);
  const groups = useMemo(() => {
    if (!d) return [];
    const s = q.trim().toLowerCase();
    const list = d.posts.filter((p: any) => !s || p.name.toLowerCase().includes(s) || p.code.toLowerCase().includes(s));
    const order = [...d.levels.map((l: any) => l.role), "ADMIN"];
    return order.map((role: string) => ({ role, level: d.levels.find((l: any) => l.role === role), posts: list.filter((p: any) => p.accessRole === role) })).filter((g: any) => g.posts.length);
  }, [d, q]);
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const toggle = async (p: any) => {
    setErr(null);
    try {
      await api(`/api/posts/${p._id}`, { method: "PATCH", json: { name: p.name, code: p.code, accessRole: p.accessRole, departmentId: p.department?._id, description: p.description, active: !p.active } });
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  const remove = async (p: any) => {
    if (!confirm(`Delete the post "${p.name}"?`)) return;
    setErr(null);
    try {
      await api(`/api/posts/${p._id}`, { method: "DELETE" });
      setMsg(`"${p.name}" deleted.`);
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="People"
        title="Posts & designations"
        description="Create a new post whenever the company needs one — Showroom Manager, Regional Manager, Clerk, Personal Assistant … Each post has an access level that decides what its people can see and do, and its own employee-ID prefix."
        actions={
          d.canManage && (
            <Button onClick={() => setEdit({})}>
              <Plus className="h-4 w-4" /> New post
            </Button>
          )
        }
      />
      {err && <Notice>{err}</Notice>}
      {msg && <Notice tone="success">{msg}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Posts" value={d.posts.filter((p: any) => p.active).length} sub={`${d.posts.filter((p: any) => !p.active).length} switched off`} icon={BriefcaseBusiness} tone="brand" />
        <StatCard label="People in posts" value={d.posts.reduce((s: number, p: any) => s + p.holders, 0)} tone="emerald" />
        <StatCard label="Empty posts" value={d.posts.filter((p: any) => p.active && !p.holders).length} sub="no one appointed yet" tone="slate" />
        <StatCard label="Access levels" value={d.levels.length} sub="managed in Roles & Access" tone="sky" />
      </div>
      <Input id="post-q" className="max-w-xs" placeholder="Search post or prefix" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map((g: any) => (
        <Card key={g.role} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <RoleBadge role={g.role} />
            <span className="text-xs text-slate-600">{g.level?.means || "Full system administration."}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {g.posts.map((p: any) => (
              <li key={p._id} className={cn("flex flex-wrap items-center gap-2 px-4 py-3 text-sm", !p.active && "opacity-50")}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {p.name} <span className="ml-1 font-mono text-xs text-brand-700">JKE-{p.code}-0001</span>
                    {!p.active && <Badge variant="secondary" className="ml-2">off</Badge>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.holders} {p.holders === 1 ? "person" : "people"}
                    {p.department?.name ? ` · ${p.department.name}` : ""}
                    {p.description ? ` · ${p.description}` : ""}
                  </p>
                </div>
                {p.holders > 0 && (
                  <Link href={`/employees?post=${p._id}`} className="text-xs font-semibold text-brand-700">
                    View people
                  </Link>
                )}
                {d.canManage && d.levels.find((l: any) => l.role === p.accessRole)?.allowed !== false && p.accessRole !== "ADMIN" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEdit(p)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <button className="text-xs font-semibold text-slate-600" onClick={() => toggle(p)}>
                      {p.active ? "Switch off" : "Switch on"}
                    </button>
                    {p.holders === 0 && (
                      <Button size="sm" variant="ghost" onClick={() => remove(p)} title="Delete">
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {edit && <PostForm p={edit} d={d} onClose={() => setEdit(null)} onSaved={(m) => { setMsg(m); load(); }} />}
    </div>
  );
}

function PostForm({ p, d, onClose, onSaved }: { p: any; d: any; onClose: () => void; onSaved: (m: string) => void }) {
  const [v, setV] = useState({ name: p.name || "", code: p.code || "", accessRole: p.accessRole || "", departmentId: p.department?._id || "", description: p.description || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const level = d.levels.find((l: any) => l.role === v.accessRole);
  const suggest = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 4);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(p._id ? `/api/posts/${p._id}` : "/api/posts", { method: p._id ? "PATCH" : "POST", json: v });
      onSaved(p._id ? `"${v.name}" updated.` : `Post "${v.name}" created — choose it in Add employee.`);
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen onClose={onClose} title={p._id ? `Edit ${p.name}` : "New post"} description="The access level decides what people in this post can see and do. Fine-tune each access level under Roles & Access." maxWidth="xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Post name">
          <Input
            id="pf-name"
            value={v.name}
            placeholder="e.g. Regional Manager"
            onChange={(e) => setV({ ...v, name: e.target.value, code: p._id || (v.code && v.code !== suggest(v.name)) ? v.code : suggest(e.target.value) })}
          />
        </Field>
        <Field label="Employee ID prefix (2–4 letters)">
          <Input id="pf-code" value={v.code} maxLength={4} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })} />
        </Field>
        <Field label="Access level" className="sm:col-span-2">
          <select id="pf-role" className="field" value={v.accessRole} disabled={!!p._id && p.holders > 0} onChange={(e) => setV({ ...v, accessRole: e.target.value })}>
            <option value="">Choose what this post can do…</option>
            {d.levels
              .filter((l: any) => l.allowed)
              .map((l: any) => (
                <option key={l.role} value={l.role}>
                  {l.label}
                </option>
              ))}
          </select>
        </Field>
        {level && <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:col-span-2">{level.means}{level.needs ? ` Each person is linked to one ${level.needs === "outlet" ? "showroom" : "warehouse"} when appointed.` : ""}</p>}
        {!!p._id && p.holders > 0 && <p className="text-xs text-amber-700 sm:col-span-2">People hold this post, so its access level is locked. Create a new post and move them if their access should change.</p>}
        <Field label="Department (optional)">
          <select id="pf-dept" className="field" value={v.departmentId} onChange={(e) => setV({ ...v, departmentId: e.target.value })}>
            <option value="">—</option>
            {d.departments.map((x: any) => (
              <option key={x._id} value={x._id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description (optional)">
          <Input id="pf-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
        {v.code && <p className="text-xs text-slate-500 sm:col-span-2">New people in this post get IDs like <b className="font-mono">JKE-{v.code}-0001</b>. Existing IDs never change.</p>}
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy || !v.name || !v.code || !v.accessRole} onClick={save}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {p._id ? "Save" : "Create post"}
        </Button>
      </div>
    </Modal>
  );
}
