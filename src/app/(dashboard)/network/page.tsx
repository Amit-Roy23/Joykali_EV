"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, GitFork, PlusCircle, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { useSession } from "@/components/layout/session";
import { api, Notice, rupeesShort } from "@/components/workflow";
import { AppointPartnerModal, TierBadge } from "@/components/network";

const hrefFor = (n: any) =>
  n.type === "OUTLET" ? `/outlets/${n.id}` : n.type === "DEALER" ? `/dealers/${n.id}` : `/distributors/${n.id}`;

function count(nodes: any[], f: (n: any) => boolean): number {
  return nodes.reduce((s, n) => s + (f(n) ? 1 : 0) + count(n.children || [], f), 0);
}
function matches(n: any, q: string): boolean {
  if (!q) return true;
  const t = q.toLowerCase();
  return n.name.toLowerCase().includes(t) || n.code.toLowerCase().includes(t) || (n.city || "").toLowerCase().includes(t) || (n.children || []).some((c: any) => matches(c, q));
}

function Node({ n, depth, q, open, toggle, onAppoint }: { n: any; depth: number; q: string; open: Set<string>; toggle: (id: string) => void; onAppoint: (n: any) => void }) {
  if (!matches(n, q)) return null;
  const kids = n.children || [];
  const isOpen = q ? true : open.has(n.id);
  return (
    <li>
      <div className={cn("flex items-center gap-2 border-b border-slate-100 py-2.5 pr-3")} style={{ paddingLeft: 12 + depth * 20 }}>
        <button
          aria-label={isOpen ? "Collapse" : "Expand"}
          className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100", !kids.length && "invisible")}
          onClick={() => toggle(n.id)}
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <TierBadge tier={n.tier} />
            <Link href={hrefFor(n)} className="truncate font-semibold text-slate-900 hover:text-brand-700">
              {n.name}
            </Link>
            {n.status !== "ACTIVE" && <StatusBadge status={n.status} label={n.status === "PENDING" ? "KYC PENDING" : undefined} />}
          </div>
          <p className="truncate text-xs text-slate-500">
            {n.code} · {n.city} · {n.stock} in stock{n.outstanding ? ` · owes ${rupeesShort(n.outstanding)}` : ""}
            {kids.length ? ` · ${kids.length} below` : ""}
          </p>
        </div>
        {n.type === "DISTRIBUTOR" && (
          <Button size="sm" variant="ghost" className="hidden sm:inline-flex" onClick={() => onAppoint(n)}>
            <PlusCircle className="h-3.5 w-3.5" /> Add below
          </Button>
        )}
      </div>
      {isOpen && kids.length > 0 && (
        <ul>
          {kids.map((c: any) => (
            <Node key={c.id} n={c} depth={depth + 1} q={q} open={open} toggle={toggle} onAppoint={onAppoint} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Business chain tree: super distributor → distributor → dealer → sub dealer, plus company dealers and outlets. */
export default function NetworkPage() {
  const { can } = useSession();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [appoint, setAppoint] = useState<null | { parent: any | null }>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    api<any>("/api/network/tree")
      .then((d) => {
        setData(d);
        setOpen(new Set(d.nodes.map((n: any) => n.id)));
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const toggle = (id: string) => {
    const s = new Set(open);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setOpen(s);
  };
  const stats = useMemo(() => {
    const nodes = data?.nodes || [];
    return {
      sd: count(nodes, (n) => n.tier === "SUPER_DISTRIBUTOR"),
      dist: count(nodes, (n) => n.tier === "DISTRIBUTOR"),
      dealers: count(nodes, (n) => n.tier === "DEALER"),
      subs: count(nodes, (n) => n.tier === "SUB_DEALER"),
      pending: count(nodes, (n) => n.status === "PENDING"),
    };
  }, [data]);
  const canCreate = can("distributor.manage") || can("dealer.manage");
  const parentTiers = (p: any) => (!p ? ["SUPER_DISTRIBUTOR", "DISTRIBUTOR", "DEALER"] : p.tier === "SUPER_DISTRIBUTOR" ? ["DISTRIBUTOR"] : ["DEALER", "SUB_DEALER"]);

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Channel"
        title="Business network"
        description="Who supplies whom. Each partner buys from the level above it; the company supplies super distributors, independent distributors and company dealers. Stock and dues are live."
        actions={
          canCreate && (
            <Button size="sm" onClick={() => setAppoint({ parent: null })}>
              <PlusCircle className="h-4 w-4" /> Onboard partner
            </Button>
          )
        }
      />
      {notice && <Notice tone="success" className="mb-4">{notice}</Notice>}
      {error && <Notice className="mb-4">{error}</Notice>}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Super distributors" value={data ? stats.sd : "–"} tone="amber" />
        <StatCard label="Distributors" value={data ? stats.dist : "–"} tone="amber" />
        <StatCard label="Dealers" value={data ? stats.dealers : "–"} tone="volt" />
        <StatCard label="Sub dealers" value={data ? stats.subs : "–"} tone="volt" />
        <StatCard label="KYC pending" value={data ? stats.pending : "–"} tone="rose" className="col-span-2 md:col-span-1" />
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input id="net-q" className="pl-9" placeholder="Find a partner by name, code or city" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Card className="overflow-hidden">
        {!data ? (
          <Skeleton className="m-5 h-64" />
        ) : data.nodes.length === 0 ? (
          <EmptyState icon={GitFork} title="No partners yet" />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-slate-200 bg-ink-900 px-4 py-3 text-sm font-semibold text-white">
              <GitFork className="h-4 w-4 text-volt-300" /> {data.root}
            </div>
            <ul>
              {data.nodes.map((n: any) => (
                <Node key={n.id} n={n} depth={0} q={q} open={open} toggle={toggle} onAppoint={(p) => setAppoint({ parent: p })} />
              ))}
            </ul>
          </>
        )}
      </Card>
      <AppointPartnerModal
        open={!!appoint}
        onClose={() => setAppoint(null)}
        tiers={parentTiers(appoint?.parent)}
        parent={appoint?.parent ? { partyType: appoint.parent.type, id: appoint.parent.id, name: appoint.parent.name } : null}
        byPartner={false}
        onDone={(r) => {
          setAppoint(null);
          setNotice(`${r.partner.name} created as ${r.code}.`);
          load();
        }}
      />
    </div>
  );
}
