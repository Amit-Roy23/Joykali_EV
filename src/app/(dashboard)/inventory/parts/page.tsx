"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, BatteryCharging, Boxes, Pencil, Plus, Search, Wrench } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees, rupeesShort } from "@/components/workflow";
import { CATEGORY_LABEL, ItemFormModal, MOVE_LABEL, StockActionModal } from "@/components/items";


/** Parts, accessories, batteries and chargers: stock by warehouse, item master and stock movements. */
export default function PartsStockPage() {
  const { can } = useSession();
  const [d, setD] = useState<any>(null);
  const [moves, setMoves] = useState<any[] | null>(null);
  const [tab, setTab] = useState<"stock" | "moves">("stock");
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [act, setAct] = useState<{ action: "in" | "out" | "repaired" | "transfer"; item: any } | null>(null);
  const canStock = can("inventory.manage") || can("warehouse.transfer");

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (cat) p.set("category", cat);
    if (q.trim()) p.set("q", q.trim());
    api<any>(`/api/items/stock?${p}`).then(setD).catch((e) => setErr(e.message));
  }, [cat, q]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    if (tab === "moves" && !moves) api<any[]>("/api/items/movements").then(setMoves).catch((e) => setErr(e.message));
  }, [tab, moves]);

  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const ws: any[] = d.warehouses;
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Stock"
        title="Parts & accessories"
        description="Spare parts, accessories, batteries and chargers, warehouse by warehouse. Buy them on a purchase entry, sell them on a vehicle sale or a counter sale, and use Stock in / out for everything else."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/battery-service">
              <Button variant="outline">
                <BatteryCharging className="h-4 w-4" /> Battery service
              </Button>
            </Link>
            {can("inventory.manage") && (
              <Button onClick={() => setEdit({})}>
                <Plus className="h-4 w-4" /> Add item
              </Button>
            )}
          </div>
        }
      />
      {msg && <Notice tone="success">{msg}</Notice>}
      {err && <Notice>{err}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Items" value={d.totals.items} icon={Boxes} />
        <StatCard label="Stock value (at purchase rate)" value={rupeesShort(d.totals.value)} icon={Wrench} tone="emerald" />
        <StatCard label="Below minimum" value={d.totals.low} icon={AlertTriangle} tone={d.totals.low ? "amber" : "slate"} />
        <StatCard label="Defective / in for repair" value={`${d.totals.defective} / ${d.totals.repair}`} icon={BatteryCharging} tone="rose" sub="defective is company stock; repair is customers'" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["stock", "moves"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === t ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>
            {t === "stock" ? "Stock" : "Stock movements"}
          </button>
        ))}
        {tab === "stock" && (
          <>
            <select aria-label="Item type" className="field ml-auto h-9 w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All types</option>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input aria-label="Search items" className="pl-8" placeholder="Name, code, part no." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </>
        )}
      </div>

      {tab === "stock" ? (
        d.items.length === 0 ? (
          <EmptyState icon={Wrench} title="No items yet" description="Add spare parts, accessories, batteries and chargers to start keeping their stock." />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    {ws.map((w) => (
                      <TableHead key={w._id} className="text-right">
                        {w.name.replace(/ Warehouse$/, "")}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total good</TableHead>
                    <TableHead className="text-right">Defective</TableHead>
                    <TableHead className="text-right">Repair</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.items.map((i: any) => (
                    <TableRow key={i._id} className={cn(!i.isActive && "opacity-60")}>
                      <TableCell>
                        <Link href={`/inventory/parts/${i._id}`} className="font-semibold text-slate-900 hover:text-brand-700">
                          {i.name}
                        </Link>
                        <p className="text-[11px] text-slate-500">
                          {i.code} · {CATEGORY_LABEL[i.category]}
                          {i.partNo ? ` · ${i.partNo}` : ""}
                          {i.serialTracked ? " · serial no." : ""}
                          {!i.isActive ? " · inactive" : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular">
                        {rupees(i.sellingPrice)}
                        <p className="text-[11px] text-slate-400">+{i.gstRate}% GST</p>
                      </TableCell>
                      {ws.map((w) => (
                        <TableCell key={w._id} className="text-right tabular">
                          {i.byWarehouse[w._id] || <span className="text-slate-300">0</span>}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-semibold tabular">
                        {i.stock.good} <span className="text-[11px] font-normal text-slate-400">{i.unit}</span>
                        {i.low && (
                          <Badge variant="warning" className="ml-1">
                            low
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular text-rose-700">{i.stock.defective || ""}</TableCell>
                      <TableCell className="text-right tabular text-amber-700">{i.stock.repair || ""}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {canStock && (
                            <>
                              <Button size="sm" variant="outline" title="Stock in" aria-label={`Stock in ${i.name}`} onClick={() => setAct({ action: "in", item: i })}>
                                <ArrowDownToLine className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" title="Stock out" aria-label={`Stock out ${i.name}`} onClick={() => setAct({ action: "out", item: i })}>
                                <ArrowUpFromLine className="h-3.5 w-3.5" />
                              </Button>
                              {ws.length > 1 && (
                                <Button size="sm" variant="outline" title="Move to another warehouse" aria-label={`Move ${i.name}`} onClick={() => setAct({ action: "transfer", item: i })}>
                                  <ArrowRightLeft className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {i.stock.defective > 0 && (
                                <Button size="sm" variant="outline" title="Repaired → good stock" onClick={() => setAct({ action: "repaired", item: i })}>
                                  Repaired
                                </Button>
                              )}
                            </>
                          )}
                          {(can("inventory.manage") || can("price.manage")) && (
                            <Button size="sm" variant="ghost" title="Edit item / rates" aria-label={`Edit ${i.name}`} onClick={() => api<any>(`/api/items/${i._id}`).then((r) => setEdit(r.item))}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )
      ) : !moves ? (
        <Skeleton className="h-48" />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reference / party</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moves.map((m) => (
                  <TableRow key={m._id}>
                    <TableCell className="whitespace-nowrap text-xs">{dt(m.at, true)}</TableCell>
                    <TableCell className="text-sm">
                      {m.item?.name}
                      {m.serials?.length ? <p className="font-mono text-[11px] text-slate-500">{m.serials.join(", ")}</p> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {MOVE_LABEL[m.type] || m.type}
                      {m.condition !== "GOOD" && <span className="text-slate-500"> · {m.condition.toLowerCase()}</span>}
                      {m.reason && <p className="text-[11px] text-slate-500">{m.reason}</p>}
                    </TableCell>
                    <TableCell className="text-xs">{m.warehouse?.name}</TableCell>
                    <TableCell className={cn("text-right font-semibold tabular", m.qty < 0 ? "text-rose-600" : "text-emerald-700")}>{m.qty > 0 ? `+${m.qty}` : m.qty}</TableCell>
                    <TableCell className="text-xs">
                      {m.reference}
                      {m.party && <p className="text-[11px] text-slate-500">{m.party}</p>}
                    </TableCell>
                    <TableCell className="text-xs">{m.byName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <ItemFormModal
        open={!!edit}
        item={edit}
        onClose={() => setEdit(null)}
        onSaved={() => {
          setEdit(null);
          setMsg("Item saved");
          load();
        }}
      />
      <StockActionModal
        open={!!act}
        action={act?.action || "in"}
        item={act?.item}
        onClose={() => setAct(null)}
        onDone={(m) => {
          setAct(null);
          setMsg(m);
          setMoves(null);
          load();
        }}
      />
    </div>
  );
}
