"use client";
import { useSession } from "@/components/layout/session";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  GitBranch,
  DollarSign,
  Award,
  FileText,
  Calendar,
  Phone,
  Mail,
  Download,
  Edit3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { formatINR } from "@/lib/money";

export default function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { can } = useSession();
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Reassignment Modal State
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [newManagerId, setNewManagerId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [savingReassignment, setSavingReassignment] = useState(false);

  const fetchProfile = () => {
    setLoading(true);
    fetch(`/api/employees/${id}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProfile();
    fetch("/api/employees?limit=100")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setAllEmployees(res.data);
      });
  }, [id]);

  const handleReassignManager = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newManagerId) return;

    setSavingReassignment(true);
    try {
      const res = await fetch(`/api/employees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportsTo: newManagerId,
          reassignmentReason: reassignReason || "Territory alignment",
        }),
      });
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        alert(resData.error || "Failed to reassign manager");
        setSavingReassignment(false);
        return;
      }
      setIsReassignModalOpen(false);
      setSavingReassignment(false);
      fetchProfile();
    } catch (err: any) {
      alert(err.message);
      setSavingReassignment(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading employee profile...</div>;
  }

  if (!data?.user) {
    return <div className="p-6 text-red-600">Employee profile not found.</div>;
  }

  const { user, salary, reportingHistory = [], performance, incentiveHistory = [], recentPayslips = [] } = data;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/employees">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">{user.name}</h1>
              <Badge variant="outline">{user.role.replace(/_/g, " ")}</Badge>
              <Badge variant={user.status === "ACTIVE" ? "success" : "secondary"}>
                {user.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Code: <span className="font-mono font-bold">{user.employeeCode}</span> •{" "}
              {user.designation}
            </p>
          </div>
        </div>

        {can("employee.manage") && <Button
          size="sm"
          variant="outline"
          onClick={() => setIsReassignModalOpen(true)}
          className="text-slate-700"
        >
          <GitBranch className="w-4 h-4" /> Reassign Manager
        </Button>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Contact info */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Contact & Joining</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1.5">
            <p className="flex items-center gap-2 text-slate-700">
              <Phone className="w-3.5 h-3.5 text-slate-400" /> {user.phone}
            </p>
            <p className="flex items-center gap-2 text-slate-700">
              <Mail className="w-3.5 h-3.5 text-slate-400" /> {user.email}
            </p>
            <p className="flex items-center gap-2 text-slate-500 pt-1 border-t border-slate-100">
              <Calendar className="w-3.5 h-3.5 text-slate-400" /> Joined:{" "}
              {new Date(user.joiningDate).toLocaleDateString("en-IN")}
            </p>
          </CardContent>
        </Card>

        {/* Manager info */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Current Manager</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1">
            {user.reportsTo ? (
              <>
                <p className="font-bold text-slate-800 text-sm">{user.reportsTo.name}</p>
                <p className="font-mono text-brand-700">{user.reportsTo.employeeCode}</p>
                <p className="text-slate-500">{user.reportsTo.role}</p>
              </>
            ) : (
              <p className="text-slate-500 italic">Top Level / No Manager</p>
            )}
          </CardContent>
        </Card>

        {/* Performance Overview */}
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Lifetime Delivered Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-brand-700">
              {performance?.totalSalesCount || 0}{" "}
              <span className="text-xs font-normal text-slate-500">Vehicles</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Attributed direct sales</p>
          </CardContent>
        </Card>
      </div>

      {/* Salary Structure Card */}
      {salary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Configured Monthly Salary Structure</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-slate-50 border border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 block">Basic Pay</span>
                <span className="font-bold text-slate-800 text-sm">{formatINR(salary.basic)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">House Rent (HRA)</span>
                <span className="font-bold text-slate-800 text-sm">{formatINR(salary.hra)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Conveyance Allowance</span>
                <span className="font-bold text-slate-800 text-sm">
                  {formatINR(salary.conveyance)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Other Allowances</span>
                <span className="font-bold text-slate-800 text-sm">
                  {formatINR(salary.otherAllowances)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs text-slate-600">
              <div>
                <span className="font-semibold text-slate-700">PAN:</span> {salary.pan}
              </div>
              <div>
                <span className="font-semibold text-slate-700">Bank:</span> {salary.bankDetails?.bankName}
              </div>
              <div>
                <span className="font-semibold text-slate-700">A/C:</span> {salary.bankDetails?.accountNo} (IFSC: {salary.bankDetails?.ifsc})
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reporting History Timeline (Maintains past attribution) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Manager Assignment History</CardTitle>
        </CardHeader>
        <CardContent>
          {reportingHistory.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No manager reassignments recorded.</p>
          ) : (
            <div className="space-y-3">
              {reportingHistory.map((h: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-800">
                      Transferred to: {h.newManager?.name} ({h.newManager?.employeeCode})
                    </span>
                    <p className="text-slate-500 mt-0.5">
                      Previous: {h.previousManager ? h.previousManager.name : "None"} • Reason:{" "}
                      {h.reason || "Reassigned"}
                    </p>
                  </div>
                  <span className="text-slate-400 text-[11px]">
                    {new Date(h.changedAt).toLocaleDateString("en-IN")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Payslips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Issued Payslips</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payslip Code</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Paid Days</TableHead>
                <TableHead>Gross Pay</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
                <TableHead className="text-right">Download</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentPayslips.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-slate-500">
                    No payslips generated for this employee yet.
                  </TableCell>
                </TableRow>
              ) : (
                recentPayslips.map((ps: any) => (
                  <TableRow key={ps._id}>
                    <TableCell className="font-mono text-xs font-semibold text-brand-700">
                      {ps.payslipCode}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {ps.payrollRun?.month}/{ps.payrollRun?.year}
                    </TableCell>
                    <TableCell className="text-xs">{ps.paidDays} Days</TableCell>
                    <TableCell className="text-xs">{formatINR(ps.grossPay)}</TableCell>
                    <TableCell className="text-xs text-red-600">
                      -{formatINR(ps.totalDeductions)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-xs text-slate-900">
                      {formatINR(ps.netPay)}
                    </TableCell>
                    <TableCell className="text-right">
                      <a href={`/api/payslips/${ps._id}/pdf`} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="icon">
                          <Download className="w-4 h-4 text-brand-600" />
                        </Button>
                      </a>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reassign Manager Modal */}
      <Modal
        isOpen={isReassignModalOpen}
        onClose={() => setIsReassignModalOpen(false)}
        title="Reassign Reporting Manager"
        description="Past sales & incentives remain safely attributed to historical managers"
      >
        <form onSubmit={handleReassignManager} className="space-y-4">
          <div>
            <Label>Select New Manager *</Label>
            <select
              required
              value={newManagerId}
              onChange={(e) => setNewManagerId(e.target.value)}
              className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-500"
            >
              <option value="">-- Choose New Manager --</option>
              {allEmployees
                .filter((e) => e._id !== user._id)
                .map((e) => (
                  <option key={e._id} value={e._id}>
                    {e.name} ({e.employeeCode}) • {e.role}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <Label>Reassignment Reason / Transfer Order Details</Label>
            <Input
              placeholder="e.g. Promoted to North Region ASM team"
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsReassignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={savingReassignment || !newManagerId}
              className="bg-brand-600 hover:bg-brand-500 text-white"
            >
              {savingReassignment ? "Updating..." : "Save Reassignment"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

