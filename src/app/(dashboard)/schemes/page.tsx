"use client";
import { useSession } from "@/components/layout/session";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Award, PlusCircle, CheckCircle, Clock, Eye, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export default function SchemesListPage() {
  const { can } = useSession();
  const [schemes, setSchemes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchemes = () => {
    setLoading(true);
    fetch("/api/schemes")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setSchemes(res.data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchSchemes();
  }, []);

  const handleApprove = async (schemeId: string) => {
    if (!confirm("Are you sure you want to approve and ACTIVATE this scheme?")) return;
    try {
      const res = await fetch(`/api/schemes/${schemeId}/approve`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to approve scheme");
        return;
      }
      fetchSchemes();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Incentive Schemes</h1>
          <p className="text-xs text-slate-500">
            Define performance payout rules: Per-Unit, Slabs, Target Bonuses, and Team Overrides
          </p>
        </div>
        {can("scheme.create") && (
          <Link href="/schemes/builder">
            <Button size="sm">
              <PlusCircle className="w-4 h-4" /> Build New Scheme
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scheme Name</TableHead>
                <TableHead>Applicable Roles</TableHead>
                <TableHead>Rule Types</TableHead>
                <TableHead>Validity Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-400">
                    Loading incentive schemes...
                  </TableCell>
                </TableRow>
              ) : schemes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-slate-500">
                    No schemes configured yet. Click "Build New Scheme".
                  </TableCell>
                </TableRow>
              ) : (
                schemes.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell>
                      <span className="font-semibold text-xs text-slate-900 block">{s.name}</span>
                      {s.description && (
                        <span className="text-[10px] text-slate-400">{s.description}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.applicableRoles?.map((r: string) => (
                        <Badge key={r} variant="outline" className="mr-1 text-[10px]">
                          {r}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.rules?.map((r: any, idx: number) => (
                        <Badge key={idx} variant="secondary" className="mr-1 text-[10px]">
                          {r.ruleType}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {new Date(s.validFrom).toLocaleDateString("en-IN")} —{" "}
                      {new Date(s.validTo).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.status === "ACTIVE"
                            ? "success"
                            : s.status === "DRAFT"
                            ? "warning"
                            : "secondary"
                        }
                      >
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {s.status === "DRAFT" && (
                          <Link href={`/schemes/${s._id}`}>
                            <Button size="sm" variant="secondary" className="h-7 text-xs">
                              {(s.approvals || []).some((x: any) => x.level === "BUSINESS_HEAD")
                                ? "Awaiting MP"
                                : "Awaiting BH"}
                            </Button>
                          </Link>
                        )}
                        <Link href={`/schemes/${s._id}`}>
                          <Button variant="ghost" size="icon" title="View Details">
                            <Eye className="w-4 h-4 text-slate-600" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

