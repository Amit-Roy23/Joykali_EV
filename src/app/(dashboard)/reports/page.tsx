"use client";

import React, { useState } from "react";
import { Download, FileSpreadsheet, Calendar, Filter, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function ReportsPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const downloadReport = (endpoint: string, filename: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    const url = `${endpoint}?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Reports & Data Exports</h1>
        <p className="text-xs text-slate-500">
          Generate comprehensive Excel spreadsheets for GST compliance, stock audits, and sales registers
        </p>
      </div>

      {/* Date Filter Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4 text-brand-600" /> Date Range Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>From Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>To Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="hover:border-brand-300 transition-all">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-800 flex items-center justify-center mb-2">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <CardTitle className="text-sm">Sales Register</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Detailed list of all delivered sales invoices, customer details, chassis numbers, GST breakdown, and salesperson attribution.
            </p>
            <Button
              className="w-full bg-brand-600 hover:bg-brand-500 text-xs"
              onClick={() =>
                downloadReport(
                  "/api/reports/sales-register/excel",
                  `Sales_Register_${Date.now()}.xlsx`
                )
              }
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Export Sales (Excel)
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-teal-300 transition-all">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center mb-2">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <CardTitle className="text-sm">Purchase Register</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Complete OEM procurement log, invoice numbers, supplier GSTINs, quantities, and GST paid breakdown.
            </p>
            <Button
              variant="outline"
              className="w-full text-xs hover:border-teal-400"
              onClick={() =>
                downloadReport(
                  "/api/reports/purchase-register/excel",
                  `Purchase_Register_${Date.now()}.xlsx`
                )
              }
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Export Purchases (Excel)
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-blue-300 transition-all">
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center mb-2">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <CardTitle className="text-sm">Stock Audit Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-slate-500">
              Physical inventory list: all vehicles by chassis, motor, battery numbers, current warehouse vs dealer location, and status.
            </p>
            <Button
              variant="outline"
              className="w-full text-xs hover:border-blue-400"
              onClick={() =>
                downloadReport(
                  "/api/reports/stock/excel",
                  `Stock_Report_${Date.now()}.xlsx`
                )
              }
            >
              <Download className="w-3.5 h-3.5 mr-1" /> Export Stock (Excel)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

