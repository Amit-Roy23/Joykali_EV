"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle, Search, Download, Filter, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatINR } from "@/lib/money";

export default function SalesListPage() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchSales = () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "10",
      search,
      ...(status && { status }),
    });

    fetch(`/api/sales?${params.toString()}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setSales(res.data);
          setTotalPages(res.meta?.pages || 1);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchSales();
  }, [page, status]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchSales();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Sales Invoices</h1>
          <p className="text-xs text-slate-500">
            View, search, and manage customer vehicle bookings & delivered sales
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/reports/sales-register/excel" download>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4" /> Export Excel
            </Button>
          </a>
          <Link href="/sales/new">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500">
              <PlusCircle className="w-4 h-4" /> Record New Sale
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Search by invoice code, customer name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">All Statuses</option>
              <option value="DELIVERED">Delivered</option>
              <option value="BOOKED">Booked</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <Button type="submit" size="sm" variant="secondary">
              Filter
            </Button>
          </form>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle Unit</TableHead>
                <TableHead>Salesperson</TableHead>
                <TableHead>Dealer / Outlet</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-slate-400">
                    Loading sales records...
                  </TableCell>
                </TableRow>
              ) : sales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                    No sales found. Click "Record New Sale" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                sales.map((sale) => (
                  <TableRow key={sale._id}>
                    <TableCell className="font-mono font-medium text-xs text-emerald-700">
                      {sale.saleCode}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(sale.saleDate).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-semibold text-slate-800">{sale.customer.name}</p>
                      <p className="text-[10px] text-slate-400">{sale.customer.phone}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs text-slate-800">
                        {sale.vehicle?.model?.name} ({sale.vehicle?.model?.variant})
                      </p>
                      <p className="text-[10px] font-mono text-slate-400">
                        {sale.vehicle?.chassisNumber}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {sale.soldBy?.name}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {sale.dealer ? sale.dealer.name : "Warehouse Direct"}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-slate-900">
                      {formatINR(sale.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          sale.status === "DELIVERED"
                            ? "success"
                            : sale.status === "CANCELLED"
                            ? "destructive"
                            : "warning"
                        }
                      >
                        {sale.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/sales/${sale._id}`}>
                          <Button variant="ghost" size="icon" title="View Details">
                            <Eye className="w-4 h-4 text-slate-600" />
                          </Button>
                        </Link>
                        <a
                          href={`/api/sales/${sale._id}/invoice`}
                          target="_blank"
                          rel="noreferrer"
                          title="Download Tax Invoice"
                        >
                          <Button variant="ghost" size="icon">
                            <FileText className="w-4 h-4 text-emerald-600" />
                          </Button>
                        </a>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

