"use client";
import { useSession } from "@/components/layout/session";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle, Search, Download, Eye, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatINR } from "@/lib/money";

export default function PurchasesListPage() {
  const { can } = useSession();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchPurchases = () => {
    setLoading(true);
    fetch(`/api/purchases?page=${page}&limit=10&search=${search}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setPurchases(res.data);
          setTotalPages(res.meta?.pages || 1);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchPurchases();
  }, [page]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Purchase Inwards</h1>
          <p className="text-xs text-slate-500">
            OEM supplier purchases, invoices, and inventory batch inwards
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can("reports.view") && (
            <a href="/api/reports/purchase-register/excel" download>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4" /> Export Register
              </Button>
            </a>
          )}
          {can("purchase.manage") && (
            <Link href="/purchases/new">
              <Button size="sm">
                <PlusCircle className="w-4 h-4" /> New Purchase Inward
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Search purchase code or supplier invoice..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchPurchases()}
                className="pl-9"
              />
            </div>
            <Button size="sm" variant="secondary" onClick={fetchPurchases}>
              Search
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase #</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Supplier Inv #</TableHead>
                <TableHead>Items Count</TableHead>
                <TableHead className="text-right">Total (Inc. GST)</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                    Loading purchases...
                  </TableCell>
                </TableRow>
              ) : purchases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                    No purchase inwards recorded. Click "New Purchase Inward" to add stock.
                  </TableCell>
                </TableRow>
              ) : (
                purchases.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="font-mono font-bold text-xs text-brand-700">
                      {p.purchaseCode}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(p.invoiceDate).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-slate-800">
                      {p.supplier?.name}
                    </TableCell>
                    <TableCell className="text-xs font-mono">{p.invoiceNumber}</TableCell>
                    <TableCell className="text-xs">
                      {p.lineItems?.reduce((s: number, i: any) => s + i.quantity, 0)} Units
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-slate-900">
                      {formatINR(p.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={p.paymentStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/purchases/${p._id}`}>
                        <Button variant="ghost" size="icon" title="View Details">
                          <Eye className="w-4 h-4 text-slate-600" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-xs text-slate-500 tabular">
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

