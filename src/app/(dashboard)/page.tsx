"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ShoppingCart,
  Award,
  Truck,
  Store,
  Users,
  DollarSign,
  ArrowRight,
  Download,
  AlertCircle,
  FileText,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR, paiseToRupees } from "@/lib/money";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setData(res.data);
        } else {
          setError(res.error || "Failed to load dashboard");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-lg" />
          ))}
        </div>
        <div className="h-72 bg-slate-200 rounded-lg" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p>{error || "Could not fetch dashboard metrics"}</p>
      </div>
    );
  }

  // 1. FEC Dashboard
  if (data.role === "FEC") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">FEC Sales Dashboard</h1>
          <p className="text-xs text-slate-500">Track your personal sales, incentive slabs, and payouts</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
                Vehicles Sold This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {data.metrics.unitsSoldThisMonth}{" "}
                <span className="text-xs font-normal text-slate-500">Units</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Delivered sales in current calendar month
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-teal-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
                Revenue Generated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {formatINR(data.metrics.revenueThisMonth)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Total invoiced value</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
                Incentive Earned So Far
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {formatINR(data.metrics.incentiveEarnedSoFar)}
              </div>
              <Link
                href="/incentives/my-incentives"
                className="text-xs text-emerald-600 hover:underline flex items-center gap-1 mt-1 font-medium"
              >
                View Slab Progress <ArrowRight className="w-3 h-3" />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Incentive Breakdown */}
        {data.metrics.incentiveBreakdown?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Current Month Incentive Scheme Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.metrics.incentiveBreakdown.map((item: any, i: number) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.schemeName}</p>
                      <p className="text-xs text-slate-500">{item.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-600">
                        {formatINR(item.earnedAmount)}
                      </p>
                      <p className="text-[10px] text-slate-400">{item.unitsCount} qualifying units</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Payslips */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Payslips</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentPayslips?.length === 0 ? (
              <p className="text-xs text-slate-500">No payslips generated yet.</p>
            ) : (
              <div className="space-y-2">
                {data.recentPayslips.map((ps: any) => (
                  <div
                    key={ps._id}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-emerald-600" />
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{ps.payslipCode}</p>
                        <p className="text-[10px] text-slate-400">
                          {ps.payrollRun?.month}/{ps.payrollRun?.year} • Paid Days: {ps.paidDays}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-bold text-slate-900">
                        {formatINR(ps.netPay)}
                      </span>
                      <a
                        href={`/api/payslips/${ps._id}/pdf`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. ASM Dashboard
  if (data.role === "ASM") {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">ASM Area Dashboard</h1>
          <p className="text-xs text-slate-500">Oversee team performance, FEC leaderboard and team override earnings</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Card className="border-l-4 border-l-teal-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
                Team Sales This Month
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {data.metrics.totalTeamUnits}{" "}
                <span className="text-xs font-normal text-slate-500">Units</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Across {data.metrics.fecCount} reporting FECs</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
                Total Team Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">
                {formatINR(data.metrics.totalTeamRevenue)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Current month value</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
                ASM Team Override Incentive
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {formatINR(data.metrics.asmIncentiveEarned)}
              </div>
              <p className="text-xs text-slate-500 mt-1">Calculated from team override scheme</p>
            </CardContent>
          </Card>
        </div>

        {/* FEC Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle>Team Sales Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            {data.leaderboard?.length === 0 ? (
              <p className="text-xs text-slate-500">No team sales recorded this month yet.</p>
            ) : (
              <div className="space-y-3">
                {data.leaderboard.map((fec: any, rank: number) => (
                  <div
                    key={rank}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                        {rank + 1}
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{fec.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{fec.code}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-900">{fec.units} Units</span>
                      <p className="text-xs text-emerald-600">{formatINR(fec.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. BH / MP / Admin Business-Wide Dashboard
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Executive Overview</h1>
          <p className="text-xs text-slate-500">
            Real-time business intelligence, vehicle stock and monthly sales trajectory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sales/new">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500">
              <ShoppingCart className="w-4 h-4" /> New Sale
            </Button>
          </Link>
          <Link href="/reports">
            <Button size="sm" variant="outline">
              Reports Hub
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              Sales This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {data.metrics.unitsThisMonth}{" "}
              <span className="text-xs font-normal text-slate-500">Units</span>
            </div>
            <p className="text-xs font-medium text-emerald-600 mt-1">
              {formatINR(data.metrics.revenueThisMonth)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              Warehouse Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {data.metrics.totalInStock}{" "}
              <span className="text-xs font-normal text-slate-500">Units</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Available in main warehouse</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-teal-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              Dealer Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-teal-600">
              {data.metrics.totalAllocated}{" "}
              <span className="text-xs font-normal text-slate-500">Units</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Across {data.metrics.totalDealers} dealerships</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase">
              Active Workforce
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {data.metrics.totalEmployees}{" "}
              <span className="text-xs font-normal text-slate-500">Staff</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">FEC, ASM, BH & Partners</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Sales Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Revenue Trend (Last 6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.monthlyTrends || []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `₹${val / 1000}k`} />
                <Tooltip
                  formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, "Revenue"]}
                />
                <Legend />
                <Bar dataKey="revenue" name="Sales Revenue (₹)" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

