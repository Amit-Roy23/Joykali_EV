"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Store, PlusCircle, Search, Eye, MapPin, Truck, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";

export default function DealersListPage() {
  const [dealers, setDealers] = useState<any[]>([]);
  const [asms, setAsms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    ownerName: "",
    phone: "",
    email: "",
    address: "",
    city: "Barasat",
    state: "West Bengal",
    gstin: "",
    assignedASM: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchDealers = () => {
    setLoading(true);
    fetch(`/api/dealers?search=${search}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setDealers(res.data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDealers();
    fetch("/api/employees?role=ASM")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setAsms(res.data);
      });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/dealers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to register dealer");
        setSubmitting(false);
        return;
      }
      setIsModalOpen(false);
      setSubmitting(false);
      fetchDealers();
    } catch (err: any) {
      alert(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dealer Network</h1>
          <p className="text-xs text-slate-500">
            Authorized franchise dealers, inventory allocation, and outlet sales tracking
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-500"
        >
          <PlusCircle className="w-4 h-4" /> Onboard Dealer
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Search dealers by code, business name, owner or city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchDealers()}
                className="pl-9"
              />
            </div>
            <Button size="sm" variant="secondary" onClick={fetchDealers}>
              Search
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dealer Code</TableHead>
                <TableHead>Dealership Name</TableHead>
                <TableHead>Owner / Contact</TableHead>
                <TableHead>City, State</TableHead>
                <TableHead>Assigned ASM</TableHead>
                <TableHead className="text-center">Live Stock</TableHead>
                <TableHead className="text-center">Vehicles Sold</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6 text-slate-400">
                    Loading dealer network...
                  </TableCell>
                </TableRow>
              ) : dealers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6 text-slate-500">
                    No dealers registered yet.
                  </TableCell>
                </TableRow>
              ) : (
                dealers.map((d) => (
                  <TableRow key={d._id}>
                    <TableCell className="font-mono font-bold text-xs text-emerald-700">
                      {d.dealerCode}
                    </TableCell>
                    <TableCell className="font-semibold text-xs text-slate-900">
                      {d.name}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.ownerName} <br />
                      <span className="text-[10px] text-slate-400">{d.phone}</span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {d.city}, {d.state}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {d.assignedASM ? d.assignedASM.name : "Unassigned"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
                        {d.stockCount} Units
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {d.soldCount} Units
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.status === "ACTIVE" ? "success" : "secondary"}>
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/dealers/${d._id}`}>
                        <Button variant="ghost" size="icon" title="View Dealership Details">
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

      {/* Onboard Dealer Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Onboard New Dealership"
        description="Register a new franchise dealership and assign an Area Sales Manager"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Dealership Business Name *</Label>
              <Input
                required
                placeholder="e.g. Green Wheels EV Barasat"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Owner / Proprietor Name *</Label>
              <Input
                required
                placeholder="e.g. Rajesh Ghosh"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone Number *</Label>
              <Input
                required
                placeholder="9876543210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                required
                placeholder="dealer@gmail.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>GSTIN *</Label>
              <Input
                required
                placeholder="19ABCDE1234F1Z5"
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                className="mt-1 font-mono uppercase"
              />
            </div>
            <div>
              <Label>City *</Label>
              <Input
                required
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>State *</Label>
              <Input
                required
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Showroom Address *</Label>
            <Input
              required
              placeholder="Full showroom street address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Assigned Area Sales Manager (ASM)</Label>
            <select
              className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500"
              value={form.assignedASM}
              onChange={(e) => setForm({ ...form, assignedASM: e.target.value })}
            >
              <option value="">-- Optional: Assign ASM --</option>
              {asms.map((asm) => (
                <option key={asm._id} value={asm._id}>
                  {asm.name} ({asm.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {submitting ? "Onboarding..." : "Register Dealership"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

