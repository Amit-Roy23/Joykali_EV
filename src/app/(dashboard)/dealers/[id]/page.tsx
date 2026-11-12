"use client";
import { useSession } from "@/components/layout/session";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Store, Truck, ShoppingCart, MapPin, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatINR } from "@/lib/money";

export default function DealerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { can } = useSession();
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/dealers/${id}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.data);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading dealer profile...</div>;
  }

  if (!data?.dealer) {
    return <div className="p-6 text-red-600">Dealer not found.</div>;
  }

  const { dealer, allocatedVehicles = [], salesHistory = [] } = data;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dealers">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{dealer.name}</h1>
            <StatusBadge status={dealer.status} />
          </div>
          <p className="text-xs text-slate-500">
            Dealer Code: <span className="font-mono font-bold">{dealer.dealerCode}</span> • Owner:{" "}
            {dealer.ownerName}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Contact & Tax Info</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <p className="flex items-center gap-1.5 text-slate-700">
              <Phone className="w-3.5 h-3.5 text-slate-400" /> {dealer.phone}
            </p>
            <p className="flex items-center gap-1.5 text-slate-700">
              <Mail className="w-3.5 h-3.5 text-slate-400" /> {dealer.email}
            </p>
            <p className="font-mono text-slate-600">GSTIN: {dealer.gstin}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Showroom Address</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <p className="text-slate-700">{dealer.address}</p>
            <p className="font-semibold text-slate-800">
              {dealer.city}, {dealer.state}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Area Management</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <p className="text-slate-500">Assigned Area Sales Manager:</p>
            <p className="font-bold text-slate-800">
              {dealer.assignedASM ? dealer.assignedASM.name : "Unassigned"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Vehicles In Stock at Dealer */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">
            Current Stock at Dealer ({allocatedVehicles.length} Units)
          </CardTitle>
          {can("inventory.manage") && (
            <Link href="/inventory">
              <Button size="sm" variant="outline">
                Allocate More Vehicles
              </Button>
            </Link>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chassis Number</TableHead>
                <TableHead>Model & Variant</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Motor / Battery No</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocatedVehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-slate-500">
                    No vehicles currently in stock at this dealer.
                  </TableCell>
                </TableRow>
              ) : (
                allocatedVehicles.map((v: any) => (
                  <TableRow key={v._id}>
                    <TableCell className="font-mono font-bold text-xs text-slate-900">
                      {v.chassisNumber}
                    </TableCell>
                    <TableCell className="text-xs">
                      {v.model?.name} ({v.model?.variant})
                    </TableCell>
                    <TableCell className="text-xs">{v.color}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {v.motorNumber} / {v.batteryNumber}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/inventory/${v._id}`}>
                        <Button variant="ghost" size="sm">
                          Timeline
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

      {/* Sales History through Dealer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Sales History Through Dealership ({salesHistory.length} Invoices)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Attributed FEC</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-500">
                    No sales recorded through this dealership yet.
                  </TableCell>
                </TableRow>
              ) : (
                salesHistory.map((s: any) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-mono font-bold text-xs text-brand-700">
                      <Link href={`/sales/${s._id}`} className="hover:underline">
                        {s.saleCode}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(s.saleDate).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell className="text-xs font-semibold">{s.customer?.name}</TableCell>
                    <TableCell className="text-xs">{s.soldBy?.name}</TableCell>
                    <TableCell className="text-right font-bold text-xs">
                      {formatINR(s.totalAmount)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

