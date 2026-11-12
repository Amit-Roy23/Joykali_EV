"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Users, PlusCircle, Search, GitBranch, Eye, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";

export default function EmployeesListPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Employee Form State
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "FEC",
    reportsTo: "",
    designation: "Field Executive Consultant",
    joiningDate: new Date().toISOString().split("T")[0],
    salary: {
      basic: 18000,
      hra: 6000,
      conveyance: 3000,
      otherAllowances: 1000,
      fixedDeductions: {
        pf: true,
        esi: false,
        professionalTax: true,
      },
      bankDetails: {
        accountNo: "123456789012",
        ifsc: "SBIN0001234",
        bankName: "State Bank of India",
      },
      pan: "ABCDE1234F",
    },
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchEmployees = () => {
    setLoading(true);
    fetch(`/api/employees?search=${search}&role=${role}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setEmployees(res.data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchEmployees();
    fetch("/api/employees?limit=100")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setManagers(res.data);
      });
  }, [role]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to onboard employee");
        setSubmitting(false);
        return;
      }
      setIsModalOpen(false);
      setSubmitting(false);
      fetchEmployees();
    } catch (err: any) {
      alert(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Workforce & Employees</h1>
          <p className="text-xs text-slate-500">
            Field executives, area managers, business heads, and salary structures
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/employees/tree">
            <Button size="sm" variant="outline">
              <GitBranch className="w-4 h-4" /> Org Hierarchy Tree
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500"
          >
            <PlusCircle className="w-4 h-4" /> Add Employee
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <Input
                placeholder="Search by code, employee name, phone or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchEmployees()}
                className="pl-9"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">All Roles</option>
              <option value="FEC">FEC (Field Executive)</option>
              <option value="ASM">ASM (Area Sales Manager)</option>
              <option value="BUSINESS_HEAD">Business Head</option>
              <option value="MANAGING_PARTNER">Managing Partner</option>
              <option value="ADMIN">Admin</option>
            </select>
            <Button size="sm" variant="secondary" onClick={fetchEmployees}>
              Search
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee Code</TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Reports To</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-slate-400">
                    Loading employee directory...
                  </TableCell>
                </TableRow>
              ) : employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-slate-500">
                    No employees found.
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((emp) => (
                  <TableRow key={emp._id}>
                    <TableCell className="font-mono font-bold text-xs text-emerald-700">
                      {emp.employeeCode}
                    </TableCell>
                    <TableCell className="font-semibold text-xs text-slate-900">
                      {emp.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{emp.role.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{emp.designation}</TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {emp.reportsTo ? `${emp.reportsTo.name}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {emp.phone} <br />
                      <span className="text-[10px] text-slate-400">{emp.email}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={emp.status === "ACTIVE" ? "success" : "secondary"}>
                        {emp.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/employees/${emp._id}`}>
                        <Button variant="ghost" size="icon" title="View Profile">
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

      {/* Add Employee Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Onboard New Employee"
        description="Creates employee account, code, reporting manager, and salary structure"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Full Name *</Label>
              <Input
                required
                placeholder="e.g. Ramesh Kumar"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Email (Username) *</Label>
              <Input
                type="email"
                required
                placeholder="ramesh@joykali.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Phone (10 Digits) *</Label>
              <Input
                required
                placeholder="9876543210"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Role *</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500 font-semibold"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="FEC">FEC (Field Executive)</option>
                <option value="ASM">ASM (Area Sales Manager)</option>
                <option value="BUSINESS_HEAD">Business Head</option>
                <option value="MANAGING_PARTNER">Managing Partner</option>
              </select>
            </div>
            <div>
              <Label>Designation *</Label>
              <Input
                required
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Reports To (Manager)</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-emerald-500"
                value={form.reportsTo}
                onChange={(e) => setForm({ ...form, reportsTo: e.target.value })}
              >
                <option value="">-- No Direct Manager --</option>
                {managers.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name} ({m.employeeCode}) • {m.role}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Joining Date *</Label>
              <Input
                type="date"
                required
                value={form.joiningDate}
                onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>

          {/* Salary Structure Section */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
            <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Monthly Salary Structure (₹)
            </p>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label>Basic Pay (₹)</Label>
                <Input
                  type="number"
                  value={form.salary.basic}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      salary: { ...form.salary, basic: Number(e.target.value) },
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>HRA (₹)</Label>
                <Input
                  type="number"
                  value={form.salary.hra}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      salary: { ...form.salary, hra: Number(e.target.value) },
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Conveyance (₹)</Label>
                <Input
                  type="number"
                  value={form.salary.conveyance}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      salary: { ...form.salary, conveyance: Number(e.target.value) },
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Other (₹)</Label>
                <Input
                  type="number"
                  value={form.salary.otherAllowances}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      salary: { ...form.salary, otherAllowances: Number(e.target.value) },
                    })
                  }
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>PAN *</Label>
                <Input
                  required
                  placeholder="ABCDE1234F"
                  value={form.salary.pan}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      salary: { ...form.salary, pan: e.target.value.toUpperCase() },
                    })
                  }
                  className="mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <Label>Bank A/C Number</Label>
                <Input
                  value={form.salary.bankDetails.accountNo}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      salary: {
                        ...form.salary,
                        bankDetails: {
                          ...form.salary.bankDetails,
                          accountNo: e.target.value,
                        },
                      },
                    })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label>IFSC Code</Label>
                <Input
                  value={form.salary.bankDetails.ifsc}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      salary: {
                        ...form.salary,
                        bankDetails: {
                          ...form.salary.bankDetails,
                          ifsc: e.target.value.toUpperCase(),
                        },
                      },
                    })
                  }
                  className="mt-1 font-mono uppercase"
                />
              </div>
            </div>
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
              {submitting ? "Onboarding..." : "Onboard Employee"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

