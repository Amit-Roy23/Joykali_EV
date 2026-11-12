"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Award, TrendingUp, CheckCircle, ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatINR } from "@/lib/money";

export default function MyIncentivesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/incentives/my-incentives")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading your incentive metrics...</div>;
  }

  if (!data) {
    return <div className="p-6 text-red-600">Failed to load incentive data.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Sales Incentives</h1>
        <p className="text-xs text-slate-500">
          Real-time performance earnings, slab trajectory, and qualifying sales for Period: {data.period}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="border-l-4 border-l-brand-500 bg-brand-50/20">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 uppercase">
              Total Incentive Projected (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-brand-600">
              {formatINR(data.totalEarned)}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              From {data.totalUnits} delivered vehicle sales
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-teal-500">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 uppercase">Personal Deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold text-slate-800">
              {data.totalUnits} <span className="text-sm font-normal text-slate-500">Units</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Eligible towards volume slabs</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bars Toward Next Slab */}
      {data.slabProgress && data.slabProgress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-600" /> Slab Advancement Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {data.slabProgress.map((prog: any, idx: number) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">{prog.schemeName}</span>
                  {prog.nextTier ? (
                    <span className="text-brand-700 font-semibold">
                      Need {prog.unitsNeededForNextTier} more unit(s) for next slab @{" "}
                      {formatINR(prog.nextTier.amountPerUnit)}/unit!
                    </span>
                  ) : (
                    <span className="text-brand-600 font-bold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Highest Slab Reached!
                    </span>
                  )}
                </div>

                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                  <div
                    className="bg-brand-500 h-full rounded-full transition-all duration-500 shadow-sm"
                    style={{ width: `${prog.percentToNextTier}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Current: {prog.currentUnits} units sold</span>
                  <span>
                    {prog.nextTier
                      ? `Target: ${prog.nextTier.minUnits} units`
                      : "Top tier achieved"}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Breakdown per Scheme */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Earnings Breakdown by Scheme</CardTitle>
        </CardHeader>
        <CardContent>
          {data.breakdown.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No qualifying incentive earnings yet.</p>
          ) : (
            <div className="space-y-3">
              {data.breakdown.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-900 block">{item.schemeName}</span>
                    <span className="text-slate-500">{item.description}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-bold text-brand-700 block">
                      {formatINR(item.earnedAmount)}
                    </span>
                    <span className="text-[10px] text-slate-400">{item.unitsCount} units</span>
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

