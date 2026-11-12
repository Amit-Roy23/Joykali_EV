"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Plus, Receipt, Search } from "lucide-react";
import { Button, cn } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/kit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession } from "@/components/layout/session";
import { formatINR } from "@/lib/money";

const STATUSES = [
  { id: "", label: "All" },
  { id: "DELIVERED", label: "Delivered" },
  { id: "CANCELLED", label: "Cancelled" },
];
const PAY_LABEL: Record<string, string> = { CASH: "Cash", UPI: "UPI", BANK: "Bank", FINANCE: "Finance" };
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function SalesListPage() {
  const { can, user } = useSession();
  const [sales, setSales] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: "15", search: debounced, ...(status && { status }) });
    let live = true;
    fetch(`/api/sales?${params}`)
      .then((r) => r.json())
      .then((r) => {
        if (!live || !r.success) return;
        setSales(r.data);
        setPages(r.meta?.pages || 1);
        setTotal(r.meta?.total || 0);
      });
    return () => {
      live = false;
    };
  }, [page, status, debounced]);

  const scopeNote =
    user?.role === "FEC" ? "Sales credited to you" : user?.role === "ASM" ? "Sales by you and your team" : "All sales across the network";

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Sales"
        title="Sales & invoices"
        description={`${scopeNote} · ${total.toLocaleString("en-IN")} invoices`}
        actions={
          <>
            {can("reports.view") && (
              <a href="/api/reports/sales-register/excel" download>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" /> Excel register
                </Button>
              </a>
            )}
            {can("sales.create") && (
              <Link href="/sales/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> Record a sale
                </Button>
              </Link>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice no., customer or phone" className="pl-9" />
        </div>
        <div className="inline-flex shrink-0 rounded-xl bg-slate-100 p-1">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setStatus(s.id);
                setPage(1);
              }}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition",
                status === s.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!sales ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : sales.length === 0 ? (
        <Card>
          <EmptyState icon={Receipt} title="No sales found" description="Try a different search or status filter." />
        </Card>
      ) : (
        <>
          {/* Phone: cards */}
          <ul className="space-y-2 md:hidden">
            {sales.map((s) => (
              <li key={s._id}>
                <Link href={`/sales/${s._id}`} className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card active:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{s.customer?.name}</p>
                      <p className="truncate text-xs text-slate-500">{s.vehicle?.model?.name} · {s.vehicle?.color}</p>
                    </div>
                    <p className="shrink-0 font-display font-bold text-slate-900 tabular">{formatINR(s.totalAmount, false)}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="truncate font-mono">{s.saleCode}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {fmtDate(s.saleDate)}
                      <StatusBadge status={s.status} />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Tablet & desktop: table */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Sold by</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s) => (
                  <TableRow key={s._id} className="cursor-pointer" onClick={() => (window.location.href = `/sales/${s._id}`)}>
                    <TableCell>
                      <Link href={`/sales/${s._id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                        {s.saleCode}
                      </Link>
                      <p className="text-[11px] text-slate-500">{fmtDate(s.saleDate)}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-semibold text-slate-900">{s.customer?.name}</p>
                      <p className="text-[11px] text-slate-500">{s.customer?.phone}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-slate-900">{s.vehicle?.model?.name}</p>
                      <p className="font-mono text-[11px] text-slate-500">{s.vehicle?.chassisNumber}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-slate-900">{s.soldBy?.name}</p>
                      <p className="text-[11px] text-slate-500">{s.dealer?.name || "Direct"}</p>
                    </TableCell>
                    <TableCell className="text-slate-600">{PAY_LABEL[s.paymentMode] || s.paymentMode}</TableCell>
                    <TableCell className="text-right font-semibold text-slate-900">{formatINR(s.totalAmount, false)}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="mt-4 flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="text-xs text-slate-500 tabular">
              Page {page} of {pages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
