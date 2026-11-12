"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatINR, rupeesToPaise } from "@/lib/money";

export default function NewPurchasePage() {
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);

  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");

  // Line item
  const [selectedModel, setSelectedModel] = useState("");
  const [unitCost, setUnitCost] = useState(65000);
  const [quantity, setQuantity] = useState(1);
  const [vehicles, setVehicles] = useState<
    Array<{
      chassisNumber: string;
      motorNumber: string;
      batteryNumber: string;
      color: string;
    }>
  >([{ chassisNumber: "", motorNumber: "", batteryNumber: "", color: "Glossy Black" }]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/suppliers")
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data.length > 0) {
          setSuppliers(res.data);
          setSupplierId(res.data[0]._id);
        }
      });

    fetch("/api/vehicles/models")
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data.length > 0) {
          setModels(res.data);
          setSelectedModel(res.data[0]._id);
          setUnitCost((res.data[0].purchasePrice || 0) / 100);
        }
      });
  }, []);

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    const m = models.find((item) => item._id === modelId);
    if (m && m.purchasePrice) {
      setUnitCost(m.purchasePrice / 100);
    }
  };

  const handleQuantityChange = (newQty: number) => {
    const qty = Math.max(1, newQty);
    setQuantity(qty);

    setVehicles((prev) => {
      const updated = [...prev];
      while (updated.length < qty) {
        updated.push({
          chassisNumber: "",
          motorNumber: "",
          batteryNumber: "",
          color: "Glossy Black",
        });
      }
      return updated.slice(0, qty);
    });
  };

  const handleVehicleChange = (index: number, field: string, value: string) => {
    setVehicles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const totalBase = unitCost * quantity;
  const gstAmount = Math.round(totalBase * 0.05);
  const grandTotal = totalBase + gstAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || !invoiceNumber || !selectedModel) {
      setError("Please fill all required purchase fields");
      return;
    }

    // Verify all chassis filled
    for (let i = 0; i < vehicles.length; i++) {
      if (!vehicles[i].chassisNumber || !vehicles[i].motorNumber || !vehicles[i].batteryNumber) {
        setError(`Please fill chassis, motor, and battery number for Unit #${i + 1}`);
        return;
      }
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        supplier: supplierId,
        invoiceNumber,
        invoiceDate,
        notes,
        lineItems: [
          {
            model: selectedModel,
            quantity,
            unitCost,
            gstRate: 5,
            vehicles,
          },
        ],
      };

      const res = await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to create purchase inward");
        setLoading(false);
        return;
      }

      router.push(`/purchases/${data.data._id}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/purchases">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Purchase Inward Receipt</h1>
          <p className="text-xs text-slate-500">
            Record supplier invoice, purchase cost, and inward individual EV units into stock
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
        {/* Supplier & Invoice */}
        <Card>
          <CardHeader>
            <CardTitle>Supplier & Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>OEM Supplier *</Label>
              <select
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500"
              >
                {suppliers.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.gstin})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Supplier Invoice Number *</Label>
              <Input
                required
                placeholder="e.g. OEM/2026/9981"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Invoice Date *</Label>
              <Input
                type="date"
                required
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Model & Cost */}
        <Card>
          <CardHeader>
            <CardTitle>Vehicle Model & Procurement Cost</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Vehicle Model *</Label>
                <select
                  required
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500"
                >
                  {models.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} ({m.variant})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label>Unit Cost (Ex-GST) (₹) *</Label>
                <Input
                  type="number"
                  required
                  min={0}
                  value={unitCost}
                  onChange={(e) => setUnitCost(Number(e.target.value))}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Quantity Inwarded (Units) *</Label>
                <Input
                  type="number"
                  required
                  min={1}
                  max={50}
                  value={quantity}
                  onChange={(e) => handleQuantityChange(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 text-white flex justify-between items-center text-xs">
              <div>
                <span>Base Subtotal: ₹{totalBase.toLocaleString("en-IN")}</span>
                <span className="mx-2">•</span>
                <span>GST (5%): ₹{gstAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="text-sm font-bold text-emerald-400">
                Total Cost: {formatINR(rupeesToPaise(grandTotal))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Individual Vehicle Units Identification */}
        <Card>
          <CardHeader>
            <CardTitle>Unit Serial Numbers & Identifiers ({vehicles.length} Units)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-slate-500">
              Enter the unique Chassis, Motor and Battery numbers for each inwarded unit.
            </p>

            <div className="space-y-3">
              {vehicles.map((v, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs"
                >
                  <div>
                    <Label>Unit #{idx + 1} Chassis No *</Label>
                    <Input
                      required
                      placeholder="e.g. ME4EVJK26X0001"
                      value={v.chassisNumber}
                      onChange={(e) => handleVehicleChange(idx, "chassisNumber", e.target.value)}
                      className="mt-1 font-mono uppercase text-xs"
                    />
                  </div>

                  <div>
                    <Label>Motor Number *</Label>
                    <Input
                      required
                      placeholder="e.g. MOT-88912"
                      value={v.motorNumber}
                      onChange={(e) => handleVehicleChange(idx, "motorNumber", e.target.value)}
                      className="mt-1 font-mono uppercase text-xs"
                    />
                  </div>

                  <div>
                    <Label>Battery Serial *</Label>
                    <Input
                      required
                      placeholder="e.g. BAT-60V-4012"
                      value={v.batteryNumber}
                      onChange={(e) => handleVehicleChange(idx, "batteryNumber", e.target.value)}
                      className="mt-1 font-mono uppercase text-xs"
                    />
                  </div>

                  <div>
                    <Label>Color</Label>
                    <Input
                      value={v.color}
                      onChange={(e) => handleVehicleChange(idx, "color", e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/purchases">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white min-w-36"
          >
            {loading ? "Inwarding..." : "Confirm & Inward to Stock"}
          </Button>
        </div>
      </form>
    </div>
  );
}

