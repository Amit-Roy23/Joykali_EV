"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Truck, Calendar, Store, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/money";

export default function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/purchases/${id}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.data);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading purchase receipt...</div>;
  }

  if (!data?.purchase) {
    return <div className="p-6 text-red-600">Purchase record not found.</div>;
  }

  const { purchase, vehicles = [] } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/purchases">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold font-mono text-slate-900">{purchase.purchaseCode}</h1>
              <StatusBadge status={purchase.paymentStatus} />
            </div>
            <p className="text-xs text-slate-500">
              Supplier Invoice #{purchase.invoiceNumber} • Date:{" "}
              {new Date(purchase.invoiceDate).toLocaleDateString("en-IN")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-400 uppercase">Supplier Details</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <p className="font-bold text-sm text-slate-800">{purchase.supplier?.name}</p>
            <p className="text-slate-600">GSTIN: {purchase.supplier?.gstin}</p>
            <p className="text-slate-500">
              {purchase.supplier?.address}, {purchase.supplier?.city}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-slate-400 uppercase">Procurement Financials</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Subtotal:</span>
              <span className="font-semibold">{formatINR(purchase.subTotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">GST (5%):</span>
              <span className="font-semibold">{formatINR(purchase.gstAmount)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-brand-700 pt-1 border-t border-slate-100">
              <span>Total Cost:</span>
              <span>{formatINR(purchase.totalAmount)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inwarded Vehicles List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Inwarded Units ({vehicles.length} Units)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {vehicles.map((v: any) => (
              <div
                key={v._id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-slate-900 block">{v.chassisNumber}</span>
                  <span className="text-slate-500 text-[10px]">
                    Motor: {v.motorNumber} • Battery: {v.batteryNumber} • Color: {v.color}
                  </span>
                </div>
                <div className="text-right">
                  <Badge variant={v.status === "IN_STOCK" ? "default" : "secondary"}>
                    {v.status}
                  </Badge>
                  <Link
                    href={`/inventory/${v._id}`}
                    className="block text-[10px] text-brand-600 hover:underline mt-1"
                  >
                    View Timeline
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

