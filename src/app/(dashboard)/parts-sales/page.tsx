"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, IndianRupee, Loader2, Plus, Search, ShoppingBasket, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, dt, Notice, rupees, rupeesShort } from "@/components/workflow";

/** Counter sales of parts, accessories, batteries and chargers. */
export default function PartsSalesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <PartsSales />
    </Suspense>
  );
}

function PartsSales() {
  const sp = useSearchParams();
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(sp.get("done") ? `Bill ${sp.get("done")} saved — download the invoice from the list.` : null);
  const [cancelFor, setCancelFor] = useState<any | null>(null);
  const [payFor, setPayFor] = useState<any | null>(null);
  const load = useCallback(() => {
    api<any[]>(`/api/parts-sales${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`)
      .then(setList)
      .catch((e) => setErr(e.message));
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  const live = (list || []).filter((s) => s.status !== "CANCELLED");
  const paid = (s: any) => s.payments.reduce((t: number, p: any) => t + p.amount, 0);
  const monthKey = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7);
  const month = live.filter((s) => new Date(new Date(s.saleDate).getTime() + 330 * 60000).toISOString().slice(0, 7) === monthKey);
  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader
        eyebrow="Sales"
        title="Parts & accessories sales"
        description="Counter bills for spare parts, accessories, batteries and chargers. Each bill takes the goods out of the warehouse stock; cancelling puts them back."
        actions={
          <Link href="/parts-sales/new">
            <Button>
              <Plus className="h-4 w-4" /> New bill
            </Button>
          </Link>
        }
      />
      {msg && <Notice tone="success">{msg}</Notice>}
      {err && <Notice>{err}</Notice>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Billed this month" value={rupeesShort(month.reduce((t, s) => t + s.totalAmount, 0))} sub={`${month.length} bill(s)`} icon={ShoppingBasket} />
        <StatCard label="Due from customers" value={rupeesShort(live.reduce((t, s) => t + s.totalAmount - paid(s), 0))} icon={IndianRupee} tone="amber" />
        <StatCard label="Bills (all)" value={live.length} icon={ShoppingBasket} tone="slate" />
      </div>
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
        <Input aria-label="Search bills" className="pl-8" placeholder="Bill no., customer, phone, chassis" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!list ? (
        <Skeleton className="h-48" />
      ) : list.length === 0 ? (
        <EmptyState icon={ShoppingBasket} title="No bills yet" description="Make a counter bill for parts or accessories." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((s) => {
                  const due = s.totalAmount - paid(s);
                  return (
                    <TableRow key={s._id} className={cn(s.status === "CANCELLED" && "opacity-60")}>
                      <TableCell>
                        <p className="font-mono text-xs font-semibold">{s.saleCode}</p>
                        <p className="text-[11px] text-slate-500">
                          {dt(s.saleDate)} · {s.soldByName}
                          {s.source === "BATTERY_JOB" ? " · battery replacement" : ""}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.customer.name}
                        <p className="text-[11px] text-slate-500">{s.customer.phone}</p>
                      </TableCell>
                      <TableCell className="max-w-[260px] text-xs text-slate-600">{s.lines.map((l: any) => `${l.qty} × ${l.name}`).join(", ")}</TableCell>
                      <TableCell className="text-right font-semibold tabular">{rupees(s.totalAmount)}</TableCell>
                      <TableCell className={cn("text-right tabular", due > 0 && s.status !== "CANCELLED" ? "text-amber-700" : "text-slate-400")}>{s.status === "CANCELLED" ? "—" : rupees(due)}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <a href={`/api/parts-sales/${s._id}/invoice`} target="_blank" rel="noreferrer">
                            <Button size="sm" variant="outline" aria-label={`Invoice ${s.saleCode}`}>
                              <Download className="h-3.5 w-3.5" /> Invoice
                            </Button>
                          </a>
                          {s.status !== "CANCELLED" && due > 0 && (
                            <Button size="sm" variant="outline" onClick={() => setPayFor(s)}>
                              <IndianRupee className="h-3.5 w-3.5" /> Receive
                            </Button>
                          )}
                          {s.status !== "CANCELLED" && s.source !== "BATTERY_JOB" && (
                            <Button size="sm" variant="ghost" aria-label={`Cancel ${s.saleCode}`} onClick={() => setCancelFor(s)}>
                              <XCircle className="h-3.5 w-3.5 text-rose-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      <ActionModal
        title={cancelFor ? `Cancel ${cancelFor.saleCode}` : ""}
        open={!!cancelFor}
        onClose={() => setCancelFor(null)}
        fields={[{ key: "reason", label: "Reason" }]}
        submit={(v) => api(`/api/parts-sales/${cancelFor._id}`, { method: "POST", json: { action: "cancel", reason: v.reason } })}
        onDone={() => {
          setMsg(`${cancelFor.saleCode} cancelled — goods back in stock`);
          setCancelFor(null);
          load();
        }}
      />
      <ActionModal
        title={payFor ? `Payment for ${payFor.saleCode}` : ""}
        open={!!payFor}
        onClose={() => setPayFor(null)}
        fields={[
          { key: "amountRupees", label: "Amount (₹)", initial: payFor ? String((payFor.totalAmount - paid(payFor)) / 100) : "" },
          { key: "mode", label: "Mode", options: ["CASH", "UPI", "BANK"] },
          { key: "reference", label: "UTR / reference" },
        ]}
        submit={(v) => api(`/api/parts-sales/${payFor._id}`, { method: "POST", json: { action: "payment", ...v, amountRupees: Number(v.amountRupees) } })}
        onDone={() => {
          setMsg("Payment recorded");
          setPayFor(null);
          load();
        }}
      />
    </div>
  );
}

function ActionModal({
  title,
  open,
  onClose,
  fields,
  submit,
  onDone,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  fields: Array<{ key: string; label: string; initial?: string; options?: string[] }>;
  submit: (v: Record<string, string>) => Promise<any>;
  onDone: () => void;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setV(Object.fromEntries(fields.map((f) => [f.key, f.initial ?? f.options?.[0] ?? ""])));
      setErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal isOpen={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`am-${f.key}`}>{f.label}</Label>
            {f.options ? (
              <select id={`am-${f.key}`} className="field" value={v[f.key] || ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                {f.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <Input id={`am-${f.key}`} value={v[f.key] || ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
      {err && <Notice className="mt-3">{err}</Notice>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await submit(v);
              onDone();
            } catch (e: any) {
              setErr(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </Button>
      </div>
    </Modal>
  );
}
