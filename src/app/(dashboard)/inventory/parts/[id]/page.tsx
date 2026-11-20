"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, History, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { DataRow, PageHeader, Skeleton } from "@/components/ui/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees } from "@/components/workflow";
import { CATEGORY_LABEL, ItemFormModal, MOVE_LABEL, RateHistory, StockActionModal } from "@/components/items";

export default function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [act, setAct] = useState<"in" | "out" | null>(null);
  const load = useCallback(() => {
    api<any>(`/api/items/${id}`).then(setD).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(load, [load]);
  if (!d) return err ? <Notice>{err}</Notice> : <Skeleton className="h-64" />;
  const it = d.item;
  const canStock = can("inventory.manage") || can("warehouse.transfer");
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        backHref="/inventory/parts"
        eyebrow={`${it.code} · ${CATEGORY_LABEL[it.category]}`}
        title={it.name}
        description={[it.brand, it.partNo, it.description].filter(Boolean).join(" · ") || undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            {canStock && (
              <>
                <Button variant="outline" onClick={() => setAct("in")}>
                  <ArrowDownToLine className="h-4 w-4" /> Stock in
                </Button>
                <Button variant="outline" onClick={() => setAct("out")}>
                  <ArrowUpFromLine className="h-4 w-4" /> Stock out
                </Button>
              </>
            )}
            {(can("inventory.manage") || can("price.manage")) && (
              <Button onClick={() => setEdit(true)}>
                <Pencil className="h-4 w-4" /> Edit / change rate
              </Button>
            )}
          </div>
        }
      />
      {msg && <Notice tone="success">{msg}</Notice>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Rates (before GST)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DataRow label="Selling rate" value={rupees(it.sellingPrice)} />
            <DataRow label="Purchase rate" value={rupees(it.purchasePrice)} />
            {it.dealerPrice ? <DataRow label="Dealer rate" value={rupees(it.dealerPrice)} /> : null}
            <DataRow label="GST" value={`${it.gstRate}% · HSN ${it.hsnCode}`} />
            <DataRow label="Unit" value={it.unit} />
            <DataRow label="Minimum stock" value={it.minStock || "—"} />
            <DataRow label="Serial numbers" value={it.serialTracked ? "Tracked" : "Not tracked"} />
            {it.compatibleModels?.length ? <DataRow label="Fits" value={it.compatibleModels.map((m: any) => `${m.name} ${m.variant}`).join(", ")} /> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Stock by warehouse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {d.stock.length === 0 && <p className="text-sm text-slate-500">Nothing in stock.</p>}
            {d.stock.map((s: any) => (
              <DataRow key={s._id} label={`${s.warehouse?.name}${s.condition !== "GOOD" ? ` · ${s.condition === "REPAIR" ? "in for repair (customers')" : "defective"}` : ""}`} value={`${s.qty} ${it.unit}`} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <History className="h-4 w-4" /> Rate history
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RateHistory rows={it.rateHistory || []} />
          </CardContent>
        </Card>
      </div>
      {it.serialTracked && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Serial numbers in stock ({d.serials.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {d.serials.map((s: any) => (
              <span
                key={s._id}
                className={cn("rounded-md border px-2 py-0.5 font-mono text-[11px]", s.condition === "GOOD" ? "border-slate-200" : s.condition === "DEFECTIVE" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-800")}
                title={`${s.warehouse?.name} · ${s.condition.toLowerCase()} · from ${String(s.source).toLowerCase()}`}
              >
                {s.serialNo}
              </span>
            ))}
            {d.serials.length === 0 && <p className="text-sm text-slate-500">None.</p>}
          </CardContent>
        </Card>
      )}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-sm">Stock movements</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Movement</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Reference / party</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.movements.map((m: any) => (
                <TableRow key={m._id}>
                  <TableCell className="whitespace-nowrap text-xs">{dt(m.at, true)}</TableCell>
                  <TableCell className="text-xs">
                    {MOVE_LABEL[m.type] || m.type}
                    {m.condition !== "GOOD" && <span className="text-slate-500"> · {m.condition.toLowerCase()}</span>}
                    {m.reason && <p className="text-[11px] text-slate-500">{m.reason}</p>}
                    {m.serials?.length ? <p className="font-mono text-[11px] text-slate-500">{m.serials.join(", ")}</p> : null}
                  </TableCell>
                  <TableCell className="text-xs">{m.warehouse?.name}</TableCell>
                  <TableCell className={cn("text-right font-semibold tabular", m.qty < 0 ? "text-rose-600" : "text-emerald-700")}>{m.qty > 0 ? `+${m.qty}` : m.qty}</TableCell>
                  <TableCell className="text-xs">
                    {m.reference}
                    {m.party && <p className="text-[11px] text-slate-500">{m.party}</p>}
                    {m.notes && <p className="text-[11px] text-slate-500">{m.notes}</p>}
                  </TableCell>
                  <TableCell className="text-xs">{m.byName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      <ItemFormModal
        open={edit}
        item={it}
        onClose={() => setEdit(false)}
        onSaved={() => {
          setEdit(false);
          setMsg("Saved");
          load();
        }}
      />
      <StockActionModal
        open={!!act}
        action={act || "in"}
        item={it}
        onClose={() => setAct(null)}
        onDone={(m) => {
          setAct(null);
          setMsg(m);
          load();
        }}
      />
    </div>
  );
}
