"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  PlusCircle,
  Truck,
  Layers,
  Store,
  Users,
  GitBranch,
  Award,
  Sliders,
  DollarSign,
  FileText,
  BarChart3,
  Settings,
  ShieldCheck,
  History,
  ChevronDown,
  ChevronRight,
  Zap,
} from "lucide-react";
import { cn } from "@/components/ui/button";

interface NavItem {
  title: string;
  href: string;
  icon: any;
  requiredPermission?: string;
  roles?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export function Sidebar({ user, permissions = [] }: { user: any; permissions?: string[] }) {
  const pathname = usePathname();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const hasAccess = (item: NavItem) => {
    if (user?.role === "ADMIN") return true;
    if (item.roles && !item.roles.includes(user?.role)) return false;
    if (item.requiredPermission && !permissions.includes(item.requiredPermission)) return false;
    return true;
  };

  const navGroups: NavGroup[] = [
    {
      label: "Main",
      items: [
        {
          title: "Dashboard",
          href: "/",
          icon: LayoutDashboard,
        },
      ],
    },
    {
      label: "Sales",
      items: [
        {
          title: "Sales Invoices",
          href: "/sales",
          icon: ShoppingCart,
          requiredPermission: "sales.view.own",
        },
        {
          title: "Record Sale",
          href: "/sales/new",
          icon: PlusCircle,
          requiredPermission: "sales.create",
        },
      ],
    },
    {
      label: "Inventory",
      items: [
        {
          title: "Vehicles Stock",
          href: "/inventory",
          icon: Truck,
          requiredPermission: "inventory.view",
        },
        {
          title: "Vehicle Models",
          href: "/inventory/models",
          icon: Layers,
          requiredPermission: "inventory.view",
        },
      ],
    },
    {
      label: "Purchases",
      items: [
        {
          title: "Purchase Orders",
          href: "/purchases",
          icon: Truck,
          requiredPermission: "purchase.view",
        },
        {
          title: "Suppliers",
          href: "/suppliers",
          icon: Store,
          requiredPermission: "purchase.view",
        },
      ],
    },
    {
      label: "Dealer Network",
      items: [
        {
          title: "Dealers",
          href: "/dealers",
          icon: Store,
          requiredPermission: "dealer.view",
        },
      ],
    },
    {
      label: "People & Org",
      items: [
        {
          title: "Employees",
          href: "/employees",
          icon: Users,
          requiredPermission: "employee.view",
        },
        {
          title: "Org Hierarchy Tree",
          href: "/employees/tree",
          icon: GitBranch,
          requiredPermission: "employee.view",
        },
      ],
    },
    {
      label: "Incentive Engine",
      items: [
        {
          title: "My Incentives",
          href: "/incentives/my-incentives",
          icon: Award,
        },
        {
          title: "Schemes",
          href: "/schemes",
          icon: Award,
          requiredPermission: "scheme.view",
        },
        {
          title: "Scheme Builder",
          href: "/schemes/builder",
          icon: Sliders,
          requiredPermission: "scheme.create",
        },
      ],
    },
    {
      label: "Payroll",
      items: [
        {
          title: "Payroll Runs",
          href: "/payroll",
          icon: DollarSign,
          requiredPermission: "payroll.view",
        },
      ],
    },
    {
      label: "Analytics",
      items: [
        {
          title: "Reports Hub",
          href: "/reports",
          icon: BarChart3,
          requiredPermission: "reports.view",
        },
      ],
    },
    {
      label: "Administration",
      items: [
        {
          title: "Company Settings",
          href: "/settings",
          icon: Settings,
          requiredPermission: "settings.manage",
        },
        {
          title: "Roles & Permissions",
          href: "/settings/roles",
          icon: ShieldCheck,
          requiredPermission: "settings.manage",
        },
        {
          title: "Audit Log",
          href: "/settings/audit",
          icon: History,
          requiredPermission: "audit.view",
        },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen border-r border-slate-800 shrink-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 gap-3 border-b border-slate-800 bg-slate-950/60">
        <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
          <Zap className="w-5 h-5 fill-current" />
        </div>
        <div>
          <h1 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
            Joykali EV
            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold px-1.5 py-0.5 rounded border border-emerald-500/30">
              PRO
            </span>
          </h1>
          <p className="text-[10px] text-slate-400 font-medium">Mobility Dealership System</p>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin scrollbar-thumb-slate-800">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(hasAccess);
          if (visibleItems.length === 0) return null;

          const isCollapsed = collapsedGroups[group.label];

          return (
            <div key={group.label} className="space-y-1">
              <button
                onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-300"
              >
                <span>{group.label}</span>
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-slate-600" />
                )}
              </button>

              {!isCollapsed && (
                <div className="space-y-0.5 pt-1">
                  {visibleItems.map((item) => {
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all group",
                          isActive
                            ? "bg-emerald-600 text-white font-semibold shadow-sm shadow-emerald-900/30"
                            : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                        )}
                      >
                        <Icon
                          className={cn(
                            "w-4 h-4 transition-colors",
                            isActive
                              ? "text-white"
                              : "text-slate-400 group-hover:text-emerald-400"
                          )}
                        />
                        <span>{item.title}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-900/80 border border-slate-800">
          <div className="w-8 h-8 rounded-full bg-emerald-700 text-emerald-100 flex items-center justify-center font-bold text-xs uppercase">
            {user?.name?.slice(0, 2) || "JK"}
          </div>
          <div className="overflow-hidden flex-1">
            <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
            <p className="text-[10px] text-emerald-400 font-mono truncate">{user?.employeeCode}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

