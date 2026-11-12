"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, AlertCircle, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatINR, rupeesToPaise } from "@/lib/money";

export default function NewSalePage() {
  const router = useRouter();

  // Form State
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    idProofType: "Aadhaar",
    idProofNumber: "",
  });

  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  const [dealers, setDealers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedDealer, setSelectedDealer] = useState("");
  const [selectedSoldBy, setSelectedSoldBy] = useState("");

  const [pricing, setPricing] = useState({
    exShowroom: 0,
    discount: 0,
    gst: 0,
    registration: 4500,
    insurance: 3500,
    accessories: 1200,
  });

  const [paymentMode, setPaymentMode] = useState<"CASH" | "UPI" | "BANK" | "FINANCE">("UPI");
  const [financier, setFinancier] = useState({
    financierName: "",
    loanAmount: 0,
    downPayment: 0,
    loanAccountNo: "",
  });
  const [initialPayment, setInitialPayment] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available vehicles, dealers, and staff
  useEffect(() => {
    fetch("/api/vehicles?limit=100")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          const eligible = res.data.filter(
            (v: any) => v.status === "IN_STOCK" || v.status === "ALLOCATED_TO_DEALER"
          );
          setAvailableVehicles(eligible);
        }
      });

    fetch("/api/dealers")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setDealers(res.data);
      });

    fetch("/api/employees?limit=100")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setEmployees(res.data);
          if (res.data.length > 0) {
            setSelectedSoldBy(res.data[0]._id);
          }
        }
      });
  }, []);

  const handleSelectVehicle = (vehicleId: string) => {
    const v = availableVehicles.find((item) => item._id === vehicleId);
    setSelectedVehicle(v || null);
    if (v && v.model) {
      const exShowroomRupees = (v.model.sellingPrice || 0) / 100;
      const gst = Math.round(exShowroomRupees * 0.05); // 5% standard EV GST
      setPricing((prev) => ({
        ...prev,
        exShowroom: exShowroomRupees,
        gst,
      }));
      if (v.currentLocationDealer) {
        setSelectedDealer(v.currentLocationDealer._id || v.currentLocationDealer);
      }
    }
  };

  const handleExShowroomChange = (val: number) => {
    const netBase = Math.max(0, val - pricing.discount);
    setPricing((p) => ({
      ...p,
      exShowroom: val,
      gst: Math.round(netBase * 0.05),
    }));
  };

  const handleDiscountChange = (val: number) => {
    const netBase = Math.max(0, pricing.exShowroom - val);
    setPricing((p) => ({
      ...p,
      discount: val,
      gst: Math.round(netBase * 0.05),
    }));
  };

  const totalAmount =
    pricing.exShowroom -
    pricing.discount +
    pricing.gst +
    pricing.registration +
    pricing.insurance +
    pricing.accessories;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) {
      setError("Please select a vehicle unit");
      return;
    }
    if (!selectedSoldBy) {
      setError("Please select the salesperson");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        saleDate: new Date(),
        customer,
        vehicleId: selectedVehicle._id,
        dealerId: selectedDealer || null,
        soldBy: selectedSoldBy,
        priceBreakdown: pricing,
        paymentMode,
        initialPayment: { amount: initialPayment || totalAmount },
      };

      if (paymentMode === "FINANCE") {
        payload.financierDetails = financier;
      }

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to create sale");
        setLoading(false);
        return;
      }

      router.push(`/sales/${data.data._id}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Network error");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/sales">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Record New Vehicle Sale</h1>
          <p className="text-xs text-slate-500">
            Generate GST tax invoice, allocate stock, and attribute incentives
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer Details */}
        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Customer Full Name *</Label>
              <Input
                required
                value={customer.name}
                onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                placeholder="e.g. Anupam Ghosh"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Phone Number (10 Digits) *</Label>
              <Input
                required
                value={customer.phone}
                onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                placeholder="9876543210"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Email (Optional)</Label>
              <Input
                type="email"
                value={customer.email}
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                placeholder="customer@gmail.com"
                className="mt-1"
              />
            </div>

            <div>
              <Label>ID Proof Number (Aadhaar / Voter ID)</Label>
              <Input
                value={customer.idProofNumber}
                onChange={(e) => setCustomer({ ...customer, idProofNumber: e.target.value })}
                placeholder="e.g. 1234 5678 9012"
                className="mt-1"
              />
            </div>

            <div className="sm:col-span-2">
              <Label>Residential / Delivery Address *</Label>
              <Input
                required
                value={customer.address}
                onChange={(e) => setCustomer({ ...customer, address: e.target.value })}
                placeholder="Full address with town and pincode"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Vehicle Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Vehicle Selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Select Vehicle by Chassis Number *</Label>
              <select
                required
                className="mt-1 w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500 font-mono"
                value={selectedVehicle?._id || ""}
                onChange={(e) => handleSelectVehicle(e.target.value)}
              >
                <option value="">-- Choose available in-stock vehicle --</option>
                {availableVehicles.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.chassisNumber} — {v.model?.name} ({v.model?.variant}) • Color: {v.color} • Status: {v.status}
                  </option>
                ))}
              </select>
            </div>

            {selectedVehicle && (
              <div className="p-4 rounded-lg bg-emerald-50/60 border border-emerald-200/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Model:</span>
                  <span className="font-semibold text-slate-800">{selectedVehicle.model?.name}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Motor Number:</span>
                  <span className="font-mono font-medium text-slate-800">{selectedVehicle.motorNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Battery Number:</span>
                  <span className="font-mono font-medium text-slate-800">{selectedVehicle.batteryNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Location:</span>
                  <span className="font-medium text-emerald-800">
                    {selectedVehicle.currentLocationType === "DEALER" ? "Dealer Stock" : "Central Warehouse"}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Pricing & Tax Breakdown (₹)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Ex-Showroom Price (₹) *</Label>
                <Input
                  type="number"
                  required
                  min={0}
                  value={pricing.exShowroom}
                  onChange={(e) => handleExShowroomChange(Number(e.target.value))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Dealer Discount (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={pricing.discount}
                  onChange={(e) => handleDiscountChange(Number(e.target.value))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>GST @ 5% Concessional (₹)</Label>
                <Input
                  type="number"
                  value={pricing.gst}
                  readOnly
                  className="mt-1 bg-slate-50 text-slate-600 font-semibold"
                />
              </div>

              <div>
                <Label>RTO Registration (₹)</Label>
                <Input
                  type="number"
                  value={pricing.registration}
                  onChange={(e) => setPricing({ ...pricing, registration: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Comprehensive Insurance (₹)</Label>
                <Input
                  type="number"
                  value={pricing.insurance}
                  onChange={(e) => setPricing({ ...pricing, insurance: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Accessories & Helmet Kit (₹)</Label>
                <Input
                  type="number"
                  value={pricing.accessories}
                  onChange={(e) => setPricing({ ...pricing, accessories: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-900 text-white flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">Total On-Road Invoiced Price</p>
                <p className="text-xl font-bold text-emerald-400">
                  {formatINR(rupeesToPaise(totalAmount))}
                </p>
              </div>
              <div className="text-right text-xs text-slate-400">
                GST: ₹{pricing.gst.toLocaleString("en-IN")} • Ins: ₹{pricing.insurance.toLocaleString("en-IN")}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attribution & Payment Mode */}
        <Card>
          <CardHeader>
            <CardTitle>Sales Attribution & Payment</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Salesperson (Attributed FEC) *</Label>
              <select
                required
                className="mt-1 w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500"
                value={selectedSoldBy}
                onChange={(e) => setSelectedSoldBy(e.target.value)}
              >
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.name} ({emp.employeeCode}) • {emp.role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Outlet / Dealership (Optional)</Label>
              <select
                className="mt-1 w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500"
                value={selectedDealer}
                onChange={(e) => setSelectedDealer(e.target.value)}
              >
                <option value="">Direct / Central Warehouse</option>
                {dealers.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name} ({d.dealerCode}) — {d.city}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Payment Mode *</Label>
              <select
                className="mt-1 w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500 font-semibold"
                value={paymentMode}
                onChange={(e: any) => setPaymentMode(e.target.value)}
              >
                <option value="UPI">UPI / QR Payment</option>
                <option value="BANK">Bank Transfer (NEFT/RTGS/IMPS)</option>
                <option value="CASH">Cash</option>
                <option value="FINANCE">Vehicle Loan / Finance</option>
              </select>
            </div>

            <div>
              <Label>Initial Paid Amount (₹)</Label>
              <Input
                type="number"
                min={0}
                placeholder={`Default: ₹${totalAmount}`}
                value={initialPayment || ""}
                onChange={(e) => setInitialPayment(Number(e.target.value))}
                className="mt-1"
              />
            </div>

            {paymentMode === "FINANCE" && (
              <div className="sm:col-span-2 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <p className="text-xs font-semibold text-slate-800">Financier Details</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>Financier / Bank Name</Label>
                    <Input
                      placeholder="e.g. HDFC Bank, Hero Fincorp"
                      value={financier.financierName}
                      onChange={(e) => setFinancier({ ...financier, financierName: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Loan Amount (₹)</Label>
                    <Input
                      type="number"
                      value={financier.loanAmount}
                      onChange={(e) => setFinancier({ ...financier, loanAmount: Number(e.target.value) })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Down Payment (₹)</Label>
                    <Input
                      type="number"
                      value={financier.downPayment}
                      onChange={(e) => setFinancier({ ...financier, downPayment: Number(e.target.value) })}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Link href="/sales">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-36"
          >
            {loading ? "Recording Sale..." : "Confirm & Deliver Sale"}
          </Button>
        </div>
      </form>
    </div>
  );
}

