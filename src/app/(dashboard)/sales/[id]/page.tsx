"use client";
import { useSession } from "@/components/layout/session";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Ban,
  Download,
  AlertCircle,
  CheckCircle,
  Truck,
  User,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { formatINR } from "@/lib/money";

export default function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { can } = useSession();
  const { id } = use(params);
  const router = useRouter();

  const [sale, setSale] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancel Modal State
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const fetchSale = () => {
    setLoading(true);
    fetch(`/api/sales/${id}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setSale(res.data);
        } else {
          setError(res.error || "Sale not found");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSale();
  }, [id]);

  const handleCancelSale = async () => {
    if (!cancelReason || cancelReason.length < 5) {
      alert("Please provide a valid cancellation reason (minimum 5 characters)");
      return;
    }

    setCancelling(true);
    try {
      const res = await fetch(`/api/sales/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to cancel sale");
        setCancelling(false);
        return;
      }
      setIsCancelModalOpen(false);
      setCancelling(false);
      fetchSale();
    } catch (err: any) {
      alert(err.message);
      setCancelling(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading sale details...</div>;
  }

  if (error || !sale) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
        {error || "Sale not found"}
      </div>
    );
  }

  const vehicle = sale.vehicle;
  const model = vehicle?.model;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/sales">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">{sale.saleCode}</h1>
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
            </div>
            <p className="text-xs text-slate-500">
              Invoiced on {new Date(sale.saleDate).toLocaleDateString("en-IN")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={`/api/sales/${sale._id}/invoice`}
            target="_blank"
            rel="noreferrer"
          >
            <Button size="sm" className="bg-brand-600 hover:bg-brand-500">
              <Download className="w-4 h-4" /> Download Tax Invoice (PDF)
            </Button>
          </a>

          {sale.status !== "CANCELLED" && can("sales.cancel") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCancelModalOpen(true)}
              className="text-red-600 hover:bg-red-50 hover:border-red-200"
            >
              <Ban className="w-4 h-4" /> Cancel Sale
            </Button>
          )}
        </div>
      </div>

      {sale.status === "CANCELLED" && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center justify-between">
          <div>
            <span className="font-bold">Cancellation Reason:</span> {sale.cancellationReason}
          </div>
          <div>
            Cancelled on {sale.cancelledAt ? new Date(sale.cancelledAt).toLocaleDateString("en-IN") : "-"}
          </div>
        </div>
      )}

      {/* Grid of Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Customer & Attribution */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Customer & Salesperson</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <p className="text-slate-400">Customer Name</p>
              <p className="font-semibold text-slate-900 text-sm mt-0.5">{sale.customer.name}</p>
              <p className="text-slate-600 mt-0.5">{sale.customer.phone}</p>
              {sale.customer.email && <p className="text-slate-500">{sale.customer.email}</p>}
              <p className="text-slate-600 mt-1">{sale.customer.address}</p>
              {sale.customer.idProofNumber && (
                <p className="text-slate-500 mt-0.5">
                  ID: {sale.customer.idProofType} ({sale.customer.idProofNumber})
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <p className="text-slate-400">Salesperson (FEC)</p>
              <p className="font-medium text-slate-800 mt-0.5">
                {sale.soldBy?.name} ({sale.soldBy?.employeeCode})
              </p>
            </div>

            {sale.asmAtSale && (
              <div>
                <p className="text-slate-400">Derived Area Manager (ASM at Sale)</p>
                <p className="font-medium text-slate-800 mt-0.5">
                  {sale.asmAtSale.name} ({sale.asmAtSale.employeeCode})
                </p>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100">
              <p className="text-slate-400">Dispatch Outlet / Dealership</p>
              <p className="font-medium text-slate-800 mt-0.5">
                {sale.dealer ? `${sale.dealer.name} (${sale.dealer.dealerCode})` : "Central Warehouse"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Unit & Identifiers */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Vehicle Specifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-100">
              <div>
                <span className="text-slate-400 block">Model & Variant</span>
                <span className="font-semibold text-slate-800 text-sm">
                  {model?.name} {model?.variant}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Category</span>
                <span className="font-medium text-slate-800">{model?.category}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Color</span>
                <span className="font-medium text-slate-800">{vehicle?.color}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Battery Type</span>
                <span className="font-medium text-slate-800">{model?.batteryType}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Chassis No</span>
                <span className="font-mono font-bold text-slate-900 text-xs mt-0.5 block">
                  {vehicle?.chassisNumber}
                </span>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Motor No</span>
                <span className="font-mono font-bold text-slate-900 text-xs mt-0.5 block">
                  {vehicle?.motorNumber}
                </span>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">Battery No</span>
                <span className="font-mono font-bold text-slate-900 text-xs mt-0.5 block">
                  {vehicle?.batteryNumber}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Price Breakdown Table */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm">Invoiced Price Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">Ex-Showroom Price</span>
                <span className="font-medium">{formatINR(sale.priceBreakdown.exShowroom)}</span>
              </div>
              {sale.priceBreakdown.discount > 0 && (
                <div className="flex justify-between py-1.5 border-b border-slate-100 text-red-600">
                  <span>Dealer Promotional Discount</span>
                  <span>-{formatINR(sale.priceBreakdown.discount)}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-600">GST @ 5% Concessional EV Rate</span>
                <span className="font-medium">{formatINR(sale.priceBreakdown.gst)}</span>
              </div>
              {sale.priceBreakdown.insurance > 0 && (
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Comprehensive Insurance</span>
                  <span className="font-medium">{formatINR(sale.priceBreakdown.insurance)}</span>
                </div>
              )}
              {sale.priceBreakdown.registration > 0 && (
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">RTO Registration & Road Tax</span>
                  <span className="font-medium">{formatINR(sale.priceBreakdown.registration)}</span>
                </div>
              )}
              {sale.priceBreakdown.accessories > 0 && (
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Accessories & Helmet Kit</span>
                  <span className="font-medium">{formatINR(sale.priceBreakdown.accessories)}</span>
                </div>
              )}

              <div className="flex justify-between py-3 border-t-2 border-brand-500 font-bold text-sm text-slate-900">
                <span>Total Invoice Amount</span>
                <span className="text-brand-700 text-base">{formatINR(sale.totalAmount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cancellation Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Sale Confirmation"
        description="Cancelling will revert vehicle status to available stock and recompute incentive achievements."
      >
        <div className="space-y-4">
          <div>
            <Label>Cancellation Reason *</Label>
            <Input
              required
              placeholder="e.g. Customer loan rejected, order cancelled by buyer"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsCancelModalOpen(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={cancelling || cancelReason.length < 5}
              onClick={handleCancelSale}
            >
              {cancelling ? "Reversing..." : "Confirm Cancellation"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

