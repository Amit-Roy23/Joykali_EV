"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Users, ChevronDown, ChevronRight, UserCheck, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function OrgNode({ node }: { node: any }) {
  const [isOpen, setIsOpen] = useState(true);
  const hasSubs = node.subordinates && node.subordinates.length > 0;

  const roleBadges: Record<string, string> = {
    ADMIN: "bg-purple-100 text-purple-800 border-purple-200",
    MANAGING_PARTNER: "bg-indigo-100 text-indigo-800 border-indigo-200",
    BUSINESS_HEAD: "bg-blue-100 text-blue-800 border-blue-200",
    ASM: "bg-teal-100 text-teal-800 border-teal-200",
    FEC: "bg-emerald-100 text-emerald-800 border-emerald-200",
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:shadow-sm transition-all max-w-lg">
        {hasSubs ? (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <div className="w-6" />
        )}

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900">{node.name}</span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${roleBadges[node.role] || "bg-slate-100"}`}
            >
              {node.role.replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
            <span>{node.designation}</span>
            <span className="font-mono text-emerald-700 font-semibold">{node.employeeCode}</span>
          </div>
        </div>

        <Link href={`/employees/${node._id}`}>
          <Button variant="ghost" size="sm" className="text-xs h-7 px-2">
            View
          </Button>
        </Link>
      </div>

      {hasSubs && isOpen && (
        <div className="pl-8 border-l-2 border-emerald-500/30 ml-4 space-y-3 pt-2">
          {node.subordinates.map((sub: any) => (
            <OrgNode key={sub._id} node={sub} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgTreePage() {
  const [treeData, setTreeData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employees/tree")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setTreeData(res.data);
        setLoading(false);
      });
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/employees">
          <Button variant="outline" size="icon">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Organizational Hierarchy Tree</h1>
          <p className="text-xs text-slate-500">
            Interactive reporting tree from Business Heads & Area Managers down to Field Executives
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Team Org Structure</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-slate-400">Loading organizational tree...</p>
          ) : treeData.length === 0 ? (
            <p className="text-xs text-slate-500">No organizational data available.</p>
          ) : (
            <div className="space-y-4">
              {treeData.map((root: any) => (
                <OrgNode key={root._id} node={root} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

