"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Check, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const ALL_PERMISSIONS = [
  { key: "sales.create", label: "Create Sales", group: "Sales" },
  { key: "sales.view.own", label: "View Own Sales", group: "Sales" },
  { key: "sales.view.team", label: "View Team Sales", group: "Sales" },
  { key: "sales.view.all", label: "View All Sales", group: "Sales" },
  { key: "sales.cancel", label: "Cancel Delivered Sale", group: "Sales" },
  { key: "purchase.manage", label: "Procure / Manage Purchases", group: "Purchase" },
  { key: "purchase.view", label: "View Purchases", group: "Purchase" },
  { key: "inventory.manage", label: "Manage / Allocate Inventory", group: "Inventory" },
  { key: "inventory.view", label: "View Vehicle Stock", group: "Inventory" },
  { key: "dealer.manage", label: "Onboard / Manage Dealers", group: "Dealers" },
  { key: "dealer.view", label: "View Dealer Network", group: "Dealers" },
  { key: "employee.manage", label: "Manage / Add Staff", group: "People" },
  { key: "employee.view", label: "View Employees", group: "People" },
  { key: "scheme.create", label: "Create Incentive Schemes", group: "Incentives" },
  { key: "scheme.approve", label: "Approve Incentive Schemes", group: "Incentives" },
  { key: "scheme.view", label: "View Incentive Schemes", group: "Incentives" },
  { key: "payroll.run", label: "Generate Payroll Draft", group: "Payroll" },
  { key: "payroll.adjust", label: "Adjust Attendance / Deductions", group: "Payroll" },
  { key: "payroll.approve", label: "Approve Payroll Run", group: "Payroll" },
  { key: "payroll.lock", label: "Lock Payroll (Permanent)", group: "Payroll" },
  { key: "payslip.view.own", label: "View Own Payslips", group: "Payroll" },
  { key: "payslip.view.team", label: "View Team Payslips", group: "Payroll" },
  { key: "payslip.view.all", label: "View All Staff Payslips", group: "Payroll" },
  { key: "reports.view", label: "View & Export Reports Hub", group: "Analytics" },
  { key: "distributor.view", label: "View Distributors", group: "Channel" },
  { key: "distributor.manage", label: "Onboard / Manage Distributors", group: "Channel" },
  { key: "order.view", label: "View Orders", group: "Channel" },
  { key: "order.create", label: "Place Orders (dealer / distributor)", group: "Channel" },
  { key: "credit.request", label: "Request Credit Limit Changes", group: "Channel" },
  { key: "ledger.view", label: "View Party Ledgers", group: "Channel" },
  { key: "ledger.manage", label: "Record Payments Received", group: "Channel" },
  { key: "dispatch.view", label: "View Delivery Orders", group: "Warehouse" },
  { key: "dispatch.manage", label: "Create / Load / Dispatch DOs", group: "Warehouse" },
  { key: "grn.record", label: "Record Goods Receipt (GRN)", group: "Warehouse" },
  { key: "fleet.view", label: "View Transport Fleet", group: "Warehouse" },
  { key: "fleet.manage", label: "Manage Fleet & Documents", group: "Warehouse" },
  { key: "salary.manage", label: "Propose Salary Revisions", group: "Payroll" },
  { key: "approvals.sign", label: "Sign Approvals (BH / MP only)", group: "Approvals" },
  { key: "portal.access", label: "Partner Portal", group: "Portal" },
  { key: "partner.sell", label: "Sell to Network / Customers", group: "Portal" },
  { key: "partner.appoint", label: "Appoint Own Network", group: "Portal" },
  { key: "network.view", label: "View Business Network", group: "Network" },
  { key: "network.manage", label: "Manage Territories & Network", group: "Network" },
  { key: "kyc.verify", label: "Verify Partner KYC", group: "Network" },
  { key: "target.manage", label: "Set Partner Targets", group: "Network" },
  { key: "outlet.view", label: "View Outlets", group: "Network" },
  { key: "outlet.manage", label: "Manage Outlets & Transfers", group: "Network" },
  { key: "settings.manage", label: "Manage Company Settings", group: "Settings" },
  { key: "audit.view", label: "View Audit Log History", group: "Settings" },
];

const ROLES = ["FEC", "OUTLET", "ASM", "HR_MANAGER", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN", "SUPER_DISTRIBUTOR", "DISTRIBUTOR", "DEALER", "SUB_DEALER"];

export default function RolesPermissionsPage() {
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});
  const [selectedRole, setSelectedRole] = useState("FEC");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/settings/roles")
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setRolePermissions(res.data);
        setLoading(false);
      });
  }, []);

  const handleToggle = (permKey: string) => {
    if (selectedRole === "ADMIN") return; // Admin always retains all permissions

    const currentPerms = rolePermissions[selectedRole] || [];
    const updated = currentPerms.includes(permKey)
      ? currentPerms.filter((p) => p !== permKey)
      : [...currentPerms, permKey];

    setRolePermissions({
      ...rolePermissions,
      [selectedRole]: updated,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      const res = await fetch("/api/settings/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: selectedRole,
          permissions: rolePermissions[selectedRole] || [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error || "Failed to update permissions");
        setSaving(false);
        return;
      }
      setSaving(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: any) {
      alert(err.message);
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading permissions matrix...</div>;

  const currentRolePerms = rolePermissions[selectedRole] || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Roles & Permissions Matrix</h1>
            <p className="text-xs text-slate-500">
              Granular permission assignments controlling screen access and API execution
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {savedSuccess && (
            <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-3 py-1 rounded-full border border-brand-200 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Matrix Saved!
            </span>
          )}
          {selectedRole !== "ADMIN" && (
            <Button
              size="sm"
              disabled={saving}
              onClick={handleSave}
              className="bg-brand-600 hover:bg-brand-500 text-white"
            >
              <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save Role Permissions"}
            </Button>
          )}
        </div>
      </div>

      {/* Role Picker Tabs */}
      <div className="flex gap-2 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setSelectedRole(r)}
            className={`px-4 py-2 rounded-md text-xs font-bold transition-all shrink-0 ${
              selectedRole === r
                ? "bg-white text-brand-800 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {r.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Permissions Checkbox Table */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Granted Permissions for {selectedRole.replace(/_/g, " ")}</CardTitle>
            <p className="text-xs text-slate-400">
              {selectedRole === "ADMIN"
                ? "System Administrator has full implicit system control."
                : `Toggle switches below to grant or revoke specific operational rights.`}
            </p>
          </div>
          <Badge variant="secondary">{currentRolePerms.length} Enabled</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-slate-100">
            {ALL_PERMISSIONS.map((perm) => {
              const isChecked = selectedRole === "ADMIN" ? perm.key !== "approvals.sign" : currentRolePerms.includes(perm.key);

              return (
                <label
                  key={perm.key}
                  className={`flex items-center justify-between p-3.5 text-xs transition-colors ${
                    selectedRole === "ADMIN" ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={selectedRole === "ADMIN"}
                      onChange={() => handleToggle(perm.key)}
                      className="w-4 h-4 rounded text-brand-600 border-slate-300 focus:ring-brand-500 cursor-pointer"
                    />
                    <div>
                      <p className="font-semibold text-slate-800">{perm.label}</p>
                      <p className="font-mono text-[10px] text-slate-400">{perm.key}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {perm.group}
                  </Badge>
                </label>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

