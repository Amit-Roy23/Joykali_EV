"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PlusCircle, Layers, BatteryCharging, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { formatINR } from "@/lib/money";

export default function VehicleModelsPage() {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    variant: "",
    category: "2W",
    batteryType: "Lithium-ion (LFP)",
    rangeKm: 85,
    purchasePrice: 65000,
    sellingPrice: 85000,
    gstRate: 5,
    hsnCode: "870380",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchModels = () => {
    setLoading(true);
    fetch("/api/vehicles/models")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setModels(res.data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/vehicles/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to create model");
        setSubmitting(false);
        return;
      }
      setIsModalOpen(false);
      setSubmitting(false);
      fetchModels();
    } catch (err: any) {
      alert(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/inventory">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Vehicle Models Catalog</h1>
            <p className="text-xs text-slate-500">
              Manage EV lineup, technical specifications, and ex-showroom benchmarks
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500"
        >
          <PlusCircle className="w-4 h-4" /> Add Model
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <p className="text-xs text-slate-400">Loading models...</p>
        ) : (
          models.map((m) => (
            <Card key={m._id} className="hover:border-emerald-300 transition-colors">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base text-slate-900">{m.name}</CardTitle>
                  <p className="text-xs text-slate-500 font-medium">{m.variant}</p>
                </div>
                <Badge variant="secondary">{m.category}</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <BatteryCharging className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="text-[10px] text-slate-400 block">Battery</span>
                      <span className="font-semibold text-slate-700">{m.batteryType}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-teal-600" />
                    <div>
                      <span className="text-[10px] text-slate-400 block">Range</span>
                      <span className="font-semibold text-slate-700">{m.rangeKm} km</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Ex-Showroom Price</span>
                    <span className="text-sm font-bold text-emerald-700">
                      {formatINR(m.sellingPrice)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">GST Rate</span>
                    <span className="font-semibold text-slate-700">{m.gstRate}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Add Model Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Vehicle Model"
        description="Add a new EV model specification and pricing benchmark"
      >
        <form onSubmit={handleCreateModel} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Model Name *</Label>
              <Input
                required
                placeholder="e.g. Joykali Falcon"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Variant *</Label>
              <Input
                required
                placeholder="e.g. Pro Dual-Battery"
                value={form.variant}
                onChange={(e) => setForm({ ...form, variant: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Category *</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="2W">2-Wheeler (Scooter/Bike)</option>
                <option value="3W">3-Wheeler Passenger</option>
                <option value="4W">4-Wheeler Car</option>
                <option value="E_RICKSHAW">E-Rickshaw</option>
                <option value="LOADER">Electric Cargo Loader</option>
              </select>
            </div>
            <div>
              <Label>Battery Technology</Label>
              <Input
                required
                placeholder="e.g. Lithium LFP 60V 30Ah"
                value={form.batteryType}
                onChange={(e) => setForm({ ...form, batteryType: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Full Range (Km) *</Label>
              <Input
                type="number"
                required
                value={form.rangeKm}
                onChange={(e) => setForm({ ...form, rangeKm: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Purchase Cost (₹) *</Label>
              <Input
                type="number"
                required
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Ex-Showroom (₹) *</Label>
              <Input
                type="number"
                required
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {submitting ? "Saving..." : "Save Vehicle Model"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

