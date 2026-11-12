"use client";
import { useSession } from "@/components/layout/session";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Users, PlusCircle, Search, GitBranch, Eye, Shield } from "lucide-react";
import { Button, cn } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Avatar, EmptyState, PageHeader, RoleBadge, Skeleton } from "@/components/ui/kit";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";

export default function EmployeesListPage() {
  const { can } = useSession();
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
        accountNo: "",
        ifsc: "",
        bankName: "",
      },
      pan: "",
    },
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchEmployees = () => {
    setLoading(true);
    fetch(`/api/employees?limit=100&search=${encodeURIComponent(search)}&role=${role}`)
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

  const ROLES = [
    { id: "", label: "Everyone" },
    { id: "FEC", label: "FEC" },
    { id: "ASM", label: "ASM" },
    { id: "BUSINESS_HEAD", label: "BH" },
    { id: "MANAGING_PARTNER", label: "MP" },
    { id: "ADMIN", label: "Admin" },
  ];

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="People"
        title="Employees"
        description={`${employees.length} people · codes, roles, reporting lines and salary structures`}
        actions={
          <>
            <Link href="/employees/tree">
              <Button size="sm" variant="outline">
                <GitBranch className="h-4 w-4" /> Org chart
              </Button>
            </Link>
            {can("employee.manage") && (
              <Button size="sm" onClick={() => setIsModalOpen(true)}>
                <PlusCircle className="h-4 w-4" /> Add employee
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            fetchEmployees();
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, code or email — press Enter" className="pl-9" />
        </form>
        <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                role === r.id ? "border-ink-900 bg-ink-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No employees match" />
        </Card>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {employees.map((emp) => (
              <li key={emp._id}>
                <Link href={`/employees/${emp._id}`} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-card active:bg-slate-50">
                  <Avatar name={emp.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{emp.name}</p>
                    <p className="truncate font-mono text-[11px] text-slate-500">{emp.employeeCode}</p>
                    {emp.reportsTo && <p className="truncate text-[11px] text-slate-500">Reports to {emp.reportsTo.name}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <RoleBadge role={emp.role} short />
                    {emp.status !== "ACTIVE" && <StatusBadge status={emp.status} />}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Reports to</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp._id} className="cursor-pointer" onClick={() => (window.location.href = `/employees/${emp._id}`)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar name={emp.name} size="sm" />
                        <div className="min-w-0">
                          <Link href={`/employees/${emp._id}`} className="font-semibold text-slate-900 hover:text-brand-700">
                            {emp.name}
                          </Link>
                          <p className="truncate text-[11px] text-slate-500">{emp.designation}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-brand-700">{emp.employeeCode}</TableCell>
                    <TableCell>
                      <RoleBadge role={emp.role} />
                    </TableCell>
                    <TableCell className="text-slate-700">{emp.reportsTo?.name || <span className="text-slate-400">—</span>}</TableCell>
                    <TableCell>
                      <p className="text-xs text-slate-700">{emp.email}</p>
                      <p className="text-[11px] text-slate-500">{emp.phone}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={emp.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

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
                className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-500 font-semibold"
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
                className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-500"
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
                  placeholder="SBIN0001234"
                  required
                />
              </div>
              <div>
                <Label>Bank Name</Label>
                <Input
                  value={form.salary.bankDetails.bankName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      salary: {
                        ...form.salary,
                        bankDetails: { ...form.salary.bankDetails, bankName: e.target.value },
                      },
                    })
                  }
                  className="mt-1"
                  placeholder="State Bank of India"
                  required
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
              className="bg-brand-600 hover:bg-brand-500 text-white"
            >
              {submitting ? "Onboarding..." : "Onboard Employee"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

