"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History, Search, Shield, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resource, setResource] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "15",
      ...(resource && { resource }),
      ...(action && { action }),
    });

    fetch(`/api/audit?${params.toString()}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) {
          setLogs(res.data);
          setTotalPages(res.meta?.pages || 1);
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLogs();
  }, [page, resource, action]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Security & Operational Audit Log</h1>
            <p className="text-xs text-slate-500">
              Immutable trail of every user creation, sale, cancellation, scheme approval and payout lock
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={resource}
              onChange={(e) => {
                setResource(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs"
            >
              <option value="">All Entities / Resources</option>
              <option value="SALE">Sales</option>
              <option value="PURCHASE">Purchases</option>
              <option value="VEHICLE">Vehicles / Stock</option>
              <option value="EMPLOYEE">Employees / HR</option>
              <option value="DEALER">Dealers</option>
              <option value="SCHEME">Incentive Schemes</option>
              <option value="PAYROLL">Payroll Runs</option>
              <option value="SETTINGS">Settings</option>
              <option value="AUTH">Authentication / Logins</option>
            </select>

            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs"
            >
              <option value="">All Actions</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="APPROVE">APPROVE</option>
              <option value="LOCK">LOCK</option>
              <option value="CANCEL">CANCEL</option>
              <option value="LOGIN">LOGIN</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User / Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Reference ID</TableHead>
                <TableHead>Change Summary / Diff</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-400">
                    Loading audit trail...
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-500">
                    No audit records match the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log._id}>
                    <TableCell className="text-xs font-mono text-slate-500">
                      {new Date(log.timestamp).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-xs">
                      <p className="font-semibold text-slate-800">{log.userName || "System"}</p>
                      <p className="text-[10px] text-slate-400">{log.userEmail || "—"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          log.action === "CANCEL"
                            ? "destructive"
                            : log.action === "LOCK" || log.action === "APPROVE"
                            ? "success"
                            : "outline"
                        }
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-bold text-slate-700">
                      {log.resource}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-500">
                      {log.resourceId || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 max-w-xs truncate">
                      {log.after ? JSON.stringify(log.after) : log.before ? JSON.stringify(log.before) : "—"}
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
    </div>
  );
}

