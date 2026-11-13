"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { DataRow, PageHeader, PageSkeleton } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { useSession } from "@/components/layout/session";
import { api, dt, Notice, rupees } from "@/components/workflow";
import { CreditPanel, LedgerCard } from "@/components/party";

/** Shared by /distributors/[id] (staff) and /account (the distributor's own portal view). */
export function DistributorDetail({ id, portal = false }: { id: string; portal?: boolean }) {
  const { can } = useSession();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [login, setLogin] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<any>(`/api/distributors/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <Notice>{error}</Notice>;
  if (!data) return <PageSkeleton />;
  const d = data.distributor;

  return (
    <div className="animate-fade-up">
      <PageHeader
        backHref={portal ? undefined : "/distributors"}
        eyebrow={portal ? "My account" : `Distributor · ${d.distributorCode}`}
        title={d.name}
        description={`${d.address}, ${d.city} - ${d.pincode} · GSTIN ${d.gstin}`}
        actions={
          <>
            <StatusBadge status={d.status} />
            {(portal || can("order.create")) && (
              <Link href={portal ? "/orders/new" : `/orders/new?partyType=DISTRIBUTOR&partyId=${d._id}`}>
                <Button size="sm">
                  <Plus className="h-4 w-4" /> {portal ? "Place an order" : "New order"}
                </Button>
              </Link>
            )}
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <LedgerCard partyType="distributor" partyId={d._id} title={portal ? "My account statement" : "Account ledger"} />
          <Card>
            <CardHeader>
              <CardTitle>Recent orders</CardTitle>
            </CardHeader>
            <CardContent>
              {data.orders.length === 0 ? (
                <p className="text-sm text-slate-500">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.orders.map((o: any) => (
                    <li key={o._id}>
                      <Link href={`/orders/${o._id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                        <div>
                          <p className="font-mono text-sm font-semibold">{o.orderCode}</p>
                          <p className="text-xs text-slate-500">
                            {o.lines.reduce((s: number, l: any) => s + l.quantity, 0)} vehicles · {rupees(o.totalValue)} · {dt(o.createdAt)}
                          </p>
                        </div>
                        <StatusBadge status={o.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Deliveries</CardTitle>
            </CardHeader>
            <CardContent>
              {data.deliveries.length === 0 ? (
                <p className="text-sm text-slate-500">No deliveries yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.deliveries.map((x: any) => (
                    <li key={x._id}>
                      <Link href={`/dispatch/${x._id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                        <div>
                          <p className="font-mono text-sm font-semibold">{x.doCode}</p>
                          <p className="text-xs text-slate-500">
                            {x.lines.reduce((s: number, l: any) => s + l.quantity, 0)} vehicles
                            {x.document?.number ? ` · ${x.document.number}` : ""}
                            {x.dispatch?.at ? ` · dispatched ${dt(x.dispatch.at)}` : ""}
                          </p>
                        </div>
                        <StatusBadge status={x.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-4">
          <CreditPanel partyType="distributor" partyId={d._id} />
          <Card className="p-4 sm:p-5">
            <p className="mb-1 font-display text-[15px] font-semibold">Details</p>
            <DataRow label="Owner" value={d.ownerName} />
            <DataRow label="Phone" value={d.phone} />
            <DataRow label="Email" value={d.email} />
            <DataRow label="GST state code" value={d.stateCode} />
            {d.assignedASM && <DataRow label="Area manager" value={d.assignedASM.name} />}
            <DataRow label="Since" value={dt(d.onboardingDate)} />
          </Card>
          {!portal && (
            <Card className="p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-display text-[15px] font-semibold">Portal logins</p>
                {can("distributor.manage") && (
                  <Button size="sm" variant="outline" onClick={() => setLoginOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5" /> Add
                  </Button>
                )}
              </div>
              {data.logins.length === 0 ? (
                <p className="text-sm text-slate-500">No portal login yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.logins.map((u: any) => (
                    <li key={u._id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{u.name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {u.email} · <span className="font-mono">{u.employeeCode}</span>
                        </span>
                      </span>
                      <StatusBadge status={u.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </aside>
      </div>

      <Modal isOpen={loginOpen} onClose={() => setLoginOpen(false)} title="Add a portal login" description="They must change the password on first login." maxWidth="md">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={login.name} onChange={(e) => setLogin({ ...login, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Temporary password (8+ characters)</Label>
            <Input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
          </div>
          {loginError && <Notice>{loginError}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLoginOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setLoginError(null);
                try {
                  await api(`/api/distributors/${d._id}/users`, { method: "POST", json: login });
                  setLoginOpen(false);
                  setLogin({ name: "", email: "", password: "" });
                  load();
                } catch (e: any) {
                  setLoginError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Create login
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
