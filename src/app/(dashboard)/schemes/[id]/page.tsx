"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Award, CheckCircle, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/money";

export default function SchemeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [scheme, setScheme] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/schemes/${id}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setScheme(res.data);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading scheme...</div>;
  if (!scheme) return <div className="p-6 text-red-600">Scheme not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/schemes">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{scheme.name}</h1>
            <Badge variant={scheme.status === "ACTIVE" ? "success" : "warning"}>
              {scheme.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            Valid: {new Date(scheme.validFrom).toLocaleDateString("en-IN")} —{" "}
            {new Date(scheme.validTo).toLocaleDateString("en-IN")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Applicable Roles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {scheme.applicableRoles?.map((r: string) => (
                <Badge key={r} variant="outline">
                  {r}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-400 uppercase">Approval Status</CardTitle>
          </CardHeader>
          <CardContent>
            {scheme.approvedBy ? (
              <p className="font-semibold text-brand-800">
                Approved by {scheme.approvedBy.name} ({scheme.approvedBy.employeeCode})
              </p>
            ) : (
              <p className="text-amber-700 font-semibold">Pending approval by Partner or Admin</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Configured Rules Specification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scheme.rules?.map((rule: any, i: number) => (
            <div key={i} className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-sm">Rule Type: {rule.ruleType}</span>
                {rule.slabApplication && (
                  <Badge variant="secondary">Method: {rule.slabApplication}</Badge>
                )}
              </div>

              {rule.ruleType === "SLAB" && rule.slabs && (
                <div className="mt-2 space-y-1">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase">Tier Structure:</p>
                  {rule.slabs.map((slab: any, idx: number) => (
                    <div key={idx} className="flex justify-between py-1 border-b border-slate-200">
                      <span>
                        Tier {idx + 1}: {slab.minUnits} {slab.maxUnits ? `to ${slab.maxUnits}` : "+"} units
                      </span>
                      <span className="font-bold text-brand-700">
                        {formatINR(slab.amountPerUnit)} / unit
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {rule.ruleType === "PER_UNIT" && (
                <p className="text-sm font-semibold text-brand-700">
                  {formatINR(rule.perUnitAmount)} per vehicle delivered
                </p>
              )}

              {rule.ruleType === "TARGET_BONUS" && (
                <p className="text-sm font-semibold text-brand-700">
                  Target: {rule.targetUnits} units → Lump sum bonus: {formatINR(rule.targetBonusAmount)}
                </p>
              )}

              {rule.ruleType === "TEAM_OVERRIDE" && (
                <p className="text-sm font-semibold text-teal-700">
                  {formatINR(rule.teamOverridePerUnit)} per team unit delivered under manager
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

