"use client";
import { useSession } from "@/components/layout/session";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { DollarSign, PlusCircle, Eye, Download, Lock, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { Input, Label } from "@/components/ui/input";
import { formatINR } from "@/lib/money";

export default function PayrollPage() {
  const { can } = useSession();
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);

  const fetchRuns = () => {
    setLoading(true);
    fetch("/api/payroll/runs")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setRuns(res.data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await fetch("/api/payroll/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(year), month: Number(month), notes }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to generate payroll run");
        setGenerating(false);
        return;
      }
      setIsModalOpen(false);
      setGenerating(false);
      fetchRuns();
    } catch (e: any) {
      alert(e.message);
      setGenerating(false);
    }
  };

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Payroll Management</h1>
          <p className="text-xs text-slate-500">
            Monthly salary processing, automatic incentive integration, statutory deductions and payslip generation
          </p>
        </div>
        {can("payroll.run") && (
        <Button
          size="sm"
          onClick={() => setIsModalOpen(true)}
          className="bg-brand-600 hover:bg-brand-500"
        >
          <PlusCircle className="w-4 h-4" /> Run Payroll Draft
        </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run Code</TableHead>
                <TableHead>Month / Year</TableHead>
                <TableHead>Staff Count</TableHead>
                <TableHead className="text-right">Gross Pay</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Payout</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-slate-400">
                    Loading payroll runs...
                  </TableCell>
                </TableRow>
              ) : runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-slate-500">
                    No payroll runs found. Click "Run Payroll Draft" to process salaries.
                  </TableCell>
                </TableRow>
              ) : (
                runs.map((r) => (
                  <TableRow key={r._id}>
                    <TableCell className="font-mono font-bold text-xs text-brand-700">
                      {r.runCode}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-slate-800">
                      {monthNames[r.month - 1]} {r.year}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {r.totals?.totalEmployees || 0} Staff
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      {formatINR(r.totals?.totalGross || 0)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-red-600">
                      -{formatINR(r.totals?.totalDeductions || 0)}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold text-slate-900">
                      {formatINR(r.totals?.totalNet || 0)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "LOCKED"
                            ? "default"
                            : r.status === "APPROVED"
                            ? "success"
                            : "warning"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/payroll/${r._id}`}>
                        <Button variant="ghost" size="sm">
                          Review <Eye className="w-3.5 h-3.5 ml-1" />
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

      {/* Generate Payroll Draft Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Generate Monthly Payroll Run"
        description="Auto-pulls active salary structures and calculated incentives for the period"
      >
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Month (1–12) *</Label>
              <select
                className="mt-1 w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-sm focus:ring-2 focus:ring-brand-500"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {monthNames.map((m, idx) => (
                  <option key={idx} value={idx + 1}>
                    {m} ({idx + 1})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Year *</Label>
              <Input
                type="number"
                required
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Notes / Comments</Label>
            <Input
              placeholder="e.g. Regular monthly payout with Diwali incentives"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={generating}
              className="bg-brand-600 hover:bg-brand-500 text-white"
            >
              {generating ? "Processing..." : "Generate Payroll Draft"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

