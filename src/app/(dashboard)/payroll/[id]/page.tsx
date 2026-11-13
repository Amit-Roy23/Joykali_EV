"use client";
import { useSession } from "@/components/layout/session";
import { ApprovalPanel } from "@/components/workflow";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  Lock,
  CheckCircle,
  FileSpreadsheet,
  FileArchive,
  Edit2,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { formatINR } from "@/lib/money";

export default function PayrollRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { can } = useSession();
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Adjustment Modal
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const [adjWorkingDays, setAdjWorkingDays] = useState(30);
  const [adjLopDays, setAdjLopDays] = useState(0);
  const [adjAmount, setAdjAmount] = useState(0);
  const [adjReason, setAdjReason] = useState("");
  const [adjTds, setAdjTds] = useState(0);
  const [adjAdvance, setAdjAdvance] = useState(0);
  const [savingAdj, setSavingAdj] = useState(false);

  const fetchRun = () => {
    setLoading(true);
    fetch(`/api/payroll/runs/${id}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRun();
  }, [id]);

  const handleOpenAdjust = (entry: any) => {
    setSelectedEntry(entry);
    setAdjWorkingDays(entry.workingDays);
    setAdjLopDays(entry.lopDays);
    setAdjAmount(0);
    setAdjReason("");
    setAdjTds((entry.deductions?.tds || 0) / 100);
    setAdjAdvance((entry.deductions?.advanceRecovery || 0) / 100);
  };

  const handleSaveAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry) return;

    setSavingAdj(true);
    try {
      const res = await fetch(`/api/payroll/runs/${id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: selectedEntry._id,
          workingDays: adjWorkingDays,
          lopDays: adjLopDays,
          adjustment: adjAmount !== 0 ? { amount: adjAmount, reason: adjReason } : undefined,
          tds: adjTds,
          advanceRecovery: adjAdvance,
        }),
      });

      const resData = await res.json();
      if (!res.ok || !resData.success) {
        alert(resData.error || "Adjustment failed");
        setSavingAdj(false);
        return;
      }
      setSelectedEntry(null);
      setSavingAdj(false);
      fetchRun();
    } catch (e: any) {
      alert(e.message);
      setSavingAdj(false);
    }
  };

  const handleApprove = async () => {
    if (!confirm("Approve this payroll run? This will finalize payouts and allow downloading payslips.")) return;
    try {
      const res = await fetch(`/api/payroll/runs/${id}/approve`, { method: "POST" });
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        alert(resData.error || "Approval failed");
        return;
      }
      fetchRun();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleLock = async () => {
    if (
      !confirm(
        "LOCK this payroll run? Locking is PERMANENT and will freeze all salary structures and incentives for this month."
      )
    )
      return;
    try {
      const res = await fetch(`/api/payroll/runs/${id}/lock`, { method: "POST" });
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        alert(resData.error || "Lock failed");
        return;
      }
      fetchRun();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading payroll register...</div>;
  }

  if (!data?.run) {
    return <div className="p-6 text-red-600">Payroll run not found.</div>;
  }

  const { run, entries = [] } = data;
  const isLocked = run.status === "LOCKED";
  const isApproved = run.status === "APPROVED" || isLocked;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/payroll">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold font-mono text-slate-900">{run.runCode}</h1>
              <Badge
                variant={
                  isLocked ? "default" : isApproved ? "success" : "warning"
                }
              >
                {run.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              Period: {run.month}/{run.year} • Processed for {entries.length} staff members
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Excel Register */}
          {can("payroll.view") && (
            <a href={`/api/payroll/runs/${run._id}/excel`} download>
              <Button variant="outline" size="sm">
                <FileSpreadsheet className="w-4 h-4" /> Export Register (Excel)
              </Button>
            </a>
          )}

          {/* Bulk ZIP Payslips */}
          {isApproved && (
            <a href={`/api/payroll/runs/${run._id}/bulk-payslips`} download>
              <Button size="sm" variant="secondary" className="bg-brand-100 text-brand-800 hover:bg-brand-200">
                <FileArchive className="w-4 h-4" /> Download All Payslips (ZIP)
              </Button>
            </a>
          )}


          {/* Lock Button */}
          {run.status === "APPROVED" && can("payroll.lock") && (
            <Button size="sm" onClick={handleLock} className="bg-slate-900 hover:bg-slate-800 text-white">
              <Lock className="w-4 h-4" /> Lock Payout
            </Button>
          )}
        </div>
      </div>

      {/* Two-signature approval: Business Head, then Managing Partner */}
      {["DRAFT", "UNDER_REVIEW"].includes(run.status) && (
        <ApprovalPanel
          kind="payroll"
          id={String(run._id)}
          approvals={run.approvals}
          active
          onDone={fetchRun}
          title="Payroll approval"
          note={run.notes ? <>Note: {run.notes}</> : "Any adjustment after a signature clears the approvals so the final figures are signed."}
        />
      )}

      {/* Financial Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-slate-400">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Headcount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{entries.length} Staff</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-brand-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Total Gross Earnings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {formatINR(run.totals?.totalGross || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Total Deductions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              -{formatINR(run.totals?.totalDeductions || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-teal-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Net Disbursable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-brand-700">
              {formatINR(run.totals?.totalNet || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Entries Register Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Employee Payout Register</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Days (Paid / LOP)</TableHead>
                <TableHead className="text-right">Basic</TableHead>
                <TableHead className="text-right">Allowances</TableHead>
                <TableHead className="text-right">Incentives</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Pay</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry: any) => {
                const allowances =
                  entry.earnings.hra +
                  entry.earnings.conveyance +
                  entry.earnings.otherAllowances;

                return (
                  <TableRow key={entry._id}>
                    <TableCell>
                      <p className="text-xs font-bold text-slate-900">{entry.employee?.name}</p>
                      <p className="text-[10px] font-mono text-slate-400">
                        {entry.employee?.employeeCode} • {entry.employee?.role}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs">
                      {entry.paidDays} / {entry.workingDays}
                      {entry.lopDays > 0 && (
                        <span className="text-red-500 ml-1 font-semibold">({entry.lopDays} LOP)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {formatINR(entry.earnings.basic)}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {formatINR(allowances)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-semibold text-brand-600">
                      {formatINR(entry.earnings.incentives)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {formatINR(entry.grossPay)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-red-600">
                      -{formatINR(entry.totalDeductions)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold text-slate-900">
                      {formatINR(entry.netPay)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!isLocked && can("payroll.adjust") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenAdjust(entry)}
                            className="text-xs h-7"
                          >
                            <Edit2 className="w-3.5 h-3.5 mr-1" /> Adjust
                          </Button>
                        )}
                        <a
                          href={`/api/payslips/${entry._id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          title="Download Payslip PDF"
                        >
                          <Button variant="ghost" size="icon">
                            <Download className="w-4 h-4 text-brand-600" />
                          </Button>
                        </a>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Adjust Entry Modal */}
      <Modal
        isOpen={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title={`Adjust Payroll Entry: ${selectedEntry?.employee?.name}`}
        description="Modify attendance/loss-of-pay days or apply discretionary bonuses/deductions"
      >
        <form onSubmit={handleSaveAdjust} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Working Days in Month *</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={adjWorkingDays}
                onChange={(e) => setAdjWorkingDays(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Loss of Pay (LOP Days)</Label>
              <Input
                type="number"
                min={0}
                max={31}
                value={adjLopDays}
                onChange={(e) => setAdjLopDays(Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Manual Adjustment Amount (₹)</Label>
              <Input
                type="number"
                placeholder="+ for Bonus, - for Penalty"
                value={adjAmount || ""}
                onChange={(e) => setAdjAmount(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Adjustment Reason</Label>
              <Input
                placeholder="e.g. Festival advance, incentive adjustment"
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>TDS Tax Deduction (₹)</Label>
              <Input
                type="number"
                min={0}
                value={adjTds}
                onChange={(e) => setAdjTds(Number(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Advance Recovery (₹)</Label>
              <Input
                type="number"
                min={0}
                value={adjAdvance}
                onChange={(e) => setAdjAdvance(Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setSelectedEntry(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={savingAdj}
              className="bg-brand-600 hover:bg-brand-500 text-white"
            >
              {savingAdj ? "Updating..." : "Save Adjustments"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

