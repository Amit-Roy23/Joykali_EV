"use client";
import { useSession } from "@/components/layout/session";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Truck, Search, Download, Filter, Eye, Layers, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";

export default function InventoryPage() {
  const { can } = useSession();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [dealers, setDealers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [locationType, setLocationType] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Bulk Allocation Modal State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [targetDealer, setTargetDealer] = useState("");
  const [allocationNotes, setAllocationNotes] = useState("");
  const [allocating, setAllocating] = useState(false);

  const fetchVehicles = () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "15",
      search,
      ...(status && { status }),
      ...(locationType && { locationType }),
    });

    fetch(`/api/vehicles?${params.toString()}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setVehicles(res.data);
          setTotalPages(res.meta?.pages || 1);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchVehicles();
  }, [page, status, locationType]);

  useEffect(() => {
    fetch("/api/dealers")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setDealers(res.data);
      });
  }, []);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const inStockIds = vehicles
        .filter((v) => v.status === "IN_STOCK")
        .map((v) => v._id);
      setSelectedIds(inStockIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkAllocate = async () => {
    if (!targetDealer) {
      alert("Please select a dealer");
      return;
    }
    setAllocating(true);
    try {
      const res = await fetch("/api/vehicles/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleIds: selectedIds,
          dealerId: targetDealer,
          notes: allocationNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Allocation failed");
        setAllocating(false);
        return;
      }
      setIsAllocateModalOpen(false);
      setSelectedIds([]);
      setAllocating(false);
      fetchVehicles();
    } catch (err: any) {
      alert(err.message);
      setAllocating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Vehicle Inventory</h1>
          <p className="text-xs text-slate-500">
            Track individual EV units by chassis, battery and dealer warehouse location
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can("order.create") && (
            <Link href="/orders/new">
              <Button size="sm">Send stock to a dealer</Button>
            </Link>
          )}
          {can("reports.view") && (
            <a href="/api/reports/stock/excel" download>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4" /> Stock Report
              </Button>
            </a>
          )}
          <Link href="/inventory/models">
            <Button size="sm" variant="outline">
              <Layers className="w-4 h-4" /> Vehicle Models
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Search chassis, motor, or battery number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchVehicles()}
                className="pl-9"
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="IN_STOCK">In Stock (Warehouse)</option>
              <option value="ALLOCATED_TO_DEALER">At Dealer (consignment)</option>
              <option value="RESERVED">Reserved on a DO</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="WITH_DISTRIBUTOR">With Distributor</option>
              <option value="SOLD">Sold</option>
              <option value="MISSING">Missing (short on GRN)</option>
            </select>
            <select
              value={locationType}
              onChange={(e) => setLocationType(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All Locations</option>
              <option value="WAREHOUSE">Main Warehouse</option>
              <option value="DEALER">Dealer Outlets</option>
            </select>
            <Button size="sm" variant="secondary" onClick={fetchVehicles}>
              Filter
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Chassis Number</TableHead>
                <TableHead>Model & Variant</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Motor / Battery No</TableHead>
                <TableHead>Current Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-400">
                    Loading inventory...
                  </TableCell>
                </TableRow>
              ) : vehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    No vehicles found. Inward new vehicles via Purchases.
                  </TableCell>
                </TableRow>
              ) : (
                vehicles.map((v) => (
                  <TableRow key={v._id}>
                    <TableCell className="font-mono font-bold text-xs text-slate-900">
                      {v.chassisNumber}
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-semibold text-slate-800">
                        {v.model?.name} ({v.model?.variant})
                      </p>
                      <p className="text-[10px] text-slate-400">{v.model?.category}</p>
                    </TableCell>
                    <TableCell className="text-xs">{v.color}</TableCell>
                    <TableCell className="font-mono text-[11px] text-slate-500">
                      M: {v.motorNumber} <br />
                      B: {v.batteryNumber}
                    </TableCell>
                    <TableCell className="text-xs">
                      {v.currentLocationType === "DEALER" && v.currentLocationDealer ? (
                        <span className="font-medium text-teal-800">
                          {v.currentLocationDealer.name} ({v.currentLocationDealer.city})
                        </span>
                      ) : (
                        <span className="text-slate-600 font-medium">Main Central Warehouse</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          v.status === "IN_STOCK"
                            ? "default"
                            : v.status === "ALLOCATED_TO_DEALER"
                            ? "secondary"
                            : v.status === "SOLD"
                            ? "success"
                            : "outline"
                        }
                      >
                        {v.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/inventory/${v._id}`}>
                        <Button variant="ghost" size="icon" title="View Timeline">
                          <Eye className="w-4 h-4 text-slate-600" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

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

      {/* Allocate to Dealer Modal */}
      <Modal
        isOpen={isAllocateModalOpen}
        onClose={() => setIsAllocateModalOpen(false)}
        title={`Allocate ${selectedIds.length} Vehicles to Dealership`}
        description="Transfers selected units from central warehouse stock to the chosen dealer outlet"
      >
        <div className="space-y-4">
          <div>
            <Label>Select Destination Dealer *</Label>
            <select
              required
              value={targetDealer}
              onChange={(e) => setTargetDealer(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-500"
            >
              <option value="">-- Choose Dealer --</option>
              {dealers.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name} ({d.dealerCode}) — {d.city}, {d.state}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Dispatch Notes / Gate Pass Info</Label>
            <Input
              placeholder="e.g. Dispatched via Truck WB-01-AB-1234"
              value={allocationNotes}
              onChange={(e) => setAllocationNotes(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsAllocateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={allocating || !targetDealer}
              onClick={handleBulkAllocate}
              className="bg-teal-600 hover:bg-teal-500 text-white"
            >
              {allocating ? "Allocating..." : "Confirm Stock Transfer"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

