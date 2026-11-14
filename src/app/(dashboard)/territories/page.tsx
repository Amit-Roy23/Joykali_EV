"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Map as MapIcon, PlusCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { api, Notice } from "@/components/workflow";

const KIND_LABEL: Record<string, string> = { ZONE: "Zone", DISTRICT: "District", AREA: "Area" };
const CHILD: Record<string, string> = { ZONE: "DISTRICT", DISTRICT: "AREA" };

function TNode({ t, depth, onAdd, canEdit }: { t: any; depth: number; onAdd: (kind: string, parent: any) => void; canEdit: boolean }) {
  return (
    <li>
      <div className="flex flex-wrap items-start gap-2 border-b border-slate-100 py-2.5 pr-3" style={{ paddingLeft: 16 + depth * 22 }}>
        <span className={cn("mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase", t.kind === "ZONE" ? "bg-ink-900 text-volt-300" : t.kind === "DISTRICT" ? "bg-brand-100 text-brand-800" : "bg-slate-100 text-slate-700")}>
          {KIND_LABEL[t.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {t.name} <span className="font-mono text-xs font-normal text-slate-500">{t.code}</span>
          </p>
          {t.partners.length > 0 ? (
            <p className="text-xs text-slate-600">{t.partners.map((p: any) => `${p.label}: ${p.name}`).join(" · ")}</p>
          ) : (
            <p className="text-xs text-slate-400">{t.kind === "AREA" ? "No partner allocated — open area" : t.kind === "DISTRICT" ? "No super distributor" : ""}</p>
          )}
        </div>
        {canEdit && CHILD[t.kind] && (
          <Button size="sm" variant="ghost" onClick={() => onAdd(CHILD[t.kind], t)}>
            <PlusCircle className="h-3.5 w-3.5" /> {KIND_LABEL[CHILD[t.kind]]}
          </Button>
        )}
      </div>
      {t.children.length > 0 && (
        <ul>
          {t.children.map((c: any) => (
            <TNode key={c._id} t={c} depth={depth + 1} onAdd={onAdd} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Zone → district → area master, with who is allocated where. */
export default function TerritoriesPage() {
  const { can } = useSession();
  const [tree, setTree] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [add, setAdd] = useState<null | { kind: string; parent: any }>(null);
  const [form, setForm] = useState({ name: "", code: "", state: "West Bengal" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<any[]>("/api/territories").then(setTree).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const save = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await api("/api/territories", { method: "POST", json: { kind: add!.kind, parentId: add!.parent?._id, ...form } });
      setAdd(null);
      setForm({ name: "", code: "", state: "West Bengal" });
      load();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const canEdit = can("network.manage");
  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Channel"
        title="Territories"
        description="Super distributors are allocated districts; distributors get areas inside those districts (one distributor per area). Dealers, sub dealers and outlets sit in an area."
        actions={
          canEdit && (
            <Button size="sm" onClick={() => setAdd({ kind: "ZONE", parent: null })}>
              <PlusCircle className="h-4 w-4" /> Zone
            </Button>
          )
        }
      />
      {error && <Notice className="mb-4">{error}</Notice>}
      <Card className="overflow-hidden">
        {!tree ? (
          <Skeleton className="m-5 h-64" />
        ) : tree.length === 0 ? (
          <EmptyState icon={MapIcon} title="No territories yet" description="Start with a zone, then add its districts and areas." />
        ) : (
          <ul>
            {tree.map((t) => (
              <TNode key={t._id} t={t} depth={0} onAdd={(kind, parent) => setAdd({ kind, parent })} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </Card>
      <Modal isOpen={!!add} onClose={() => setAdd(null)} title={`New ${KIND_LABEL[add?.kind || "ZONE"].toLowerCase()}${add?.parent ? ` in ${add.parent.name}` : ""}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input id="t-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input id="t-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. DT-BDN" />
          </div>
          {!add?.parent && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>State</Label>
              <Input id="t-state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
          )}
        </div>
        {formError && <Notice className="mt-3">{formError}</Notice>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setAdd(null)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            Save
          </Button>
        </div>
      </Modal>
    </div>
  );
}
