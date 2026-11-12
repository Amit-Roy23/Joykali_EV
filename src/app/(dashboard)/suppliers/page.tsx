"use client";
import { useSession } from "@/components/layout/session";

import React, { useEffect, useState } from "react";
import { Store, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";

export default function SuppliersPage() {
  const { can } = useSession();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    gstin: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    city: "Kolkata",
    state: "West Bengal",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchSuppliers = () => {
    setLoading(true);
    fetch("/api/suppliers")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setSuppliers(res.data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to add supplier");
        setSubmitting(false);
        return;
      }
      setIsModalOpen(false);
      setSubmitting(false);
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">OEM Suppliers</h1>
          <p className="text-xs text-slate-500">
            Registered vehicle manufacturers, parts suppliers, and procurement vendors
          </p>
        </div>
        {can("purchase.manage") && (
        <Button
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="bg-brand-600 hover:bg-brand-500"
        >
          <PlusCircle className="w-4 h-4" /> Add Supplier
        </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier Name</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Phone / Email</TableHead>
                <TableHead>Location</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-slate-400">
                    Loading suppliers...
                  </TableCell>
                </TableRow>
              ) : suppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-slate-500">
                    No suppliers found. Click "Add Supplier" to create one.
                  </TableCell>
                </TableRow>
              ) : (
                suppliers.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-semibold text-xs text-slate-800">
                      {s.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.gstin}</TableCell>
                    <TableCell className="text-xs">{s.contactPerson}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {s.phone} <br />
                      <span className="text-[10px] text-slate-400">{s.email}</span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {s.city}, {s.state}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Supplier Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add OEM Supplier"
        description="Register an EV manufacturer or components supplier"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Supplier Company Name *</Label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>GSTIN *</Label>
              <Input
                required
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                className="mt-1 font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Contact Person</Label>
              <Input
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-brand-600 hover:bg-brand-500 text-white"
            >
              {submitting ? "Saving..." : "Save Supplier"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

