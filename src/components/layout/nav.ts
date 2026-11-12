import {
  LayoutDashboard,
  Receipt,
  PlusCircle,
  Warehouse,
  Layers,
  PackagePlus,
  Factory,
  Store,
  Users,
  Network,
  Trophy,
  Sparkles,
  Wand2,
  Wallet,
  FileText,
  BarChart3,
  Settings,
  ShieldCheck,
  History,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: any;
  permission?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [
      { title: "Sales & Invoices", href: "/sales", icon: Receipt, permission: "sales.view.own" },
      { title: "Record a Sale", href: "/sales/new", icon: PlusCircle, permission: "sales.create" },
    ],
  },
  {
    label: "Stock",
    items: [
      { title: "Vehicle Inventory", href: "/inventory", icon: Warehouse, permission: "inventory.view" },
      { title: "Models & Pricing", href: "/inventory/models", icon: Layers, permission: "inventory.view" },
      { title: "Purchases", href: "/purchases", icon: PackagePlus, permission: "purchase.view" },
      { title: "Suppliers", href: "/suppliers", icon: Factory, permission: "purchase.view" },
    ],
  },
  {
    label: "Network",
    items: [
      { title: "Dealers", href: "/dealers", icon: Store, permission: "dealer.view" },
      { title: "Employees", href: "/employees", icon: Users, permission: "employee.view" },
      { title: "Org Chart", href: "/employees/tree", icon: Network, permission: "employee.view" },
    ],
  },
  {
    label: "Earnings",
    items: [
      { title: "My Incentives", href: "/incentives/my-incentives", icon: Trophy },
      { title: "Payslips", href: "/payslips", icon: FileText, permission: "payslip.view.own" },
      { title: "Incentive Schemes", href: "/schemes", icon: Sparkles, permission: "scheme.view" },
      { title: "Scheme Builder", href: "/schemes/builder", icon: Wand2, permission: "scheme.create" },
      { title: "Payroll Runs", href: "/payroll", icon: Wallet, permission: "payroll.view" },
    ],
  },
  {
    label: "Insights & Admin",
    items: [
      { title: "Reports", href: "/reports", icon: BarChart3, permission: "reports.view" },
      { title: "Company Settings", href: "/settings", icon: Settings, permission: "settings.manage" },
      { title: "Roles & Access", href: "/settings/roles", icon: ShieldCheck, permission: "settings.manage" },
      { title: "Audit Log", href: "/settings/audit", icon: History, permission: "audit.view" },
    ],
  },
];

/** Pages that are not in the menu but still need a permission. */
const EXTRA_ROUTES: Array<{ prefix: string; permission?: string; title: string }> = [
  { prefix: "/purchases/new", permission: "purchase.manage", title: "New Purchase" },
  { prefix: "/change-password", title: "Change Password" },
];

export function canSee(item: { permission?: string }, role: string, permissions: string[]) {
  if (role === "ADMIN") return true;
  return !item.permission || permissions.includes(item.permission);
}

/** Longest-prefix match of the current path against all known routes. */
export function routeFor(pathname: string): { title: string; permission?: string } | null {
  const candidates = [
    ...NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ prefix: i.href, permission: i.permission, title: i.title }))),
    ...EXTRA_ROUTES,
  ].filter((r) => (r.prefix === "/" ? pathname === "/" : pathname === r.prefix || pathname.startsWith(r.prefix + "/")));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.prefix.length - a.prefix.length);
  return candidates[0];
}

export function isActive(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  // "/inventory" must not light up for "/inventory/models"
  const all = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  const best = all
    .filter((h) => h !== "/" && (pathname === h || pathname.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];
  return best === href;
}
