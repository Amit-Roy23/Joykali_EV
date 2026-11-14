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
  Building2,
  ClipboardList,
  ShoppingBag,
  Truck,
  BadgeCheck,
  BookOpen,
  Container,
  GitFork,
  Map,
  Target,
  Boxes,
  HandCoins,
  ShoppingCart,
  PackageCheck,
  ReceiptText,
  Fingerprint,
  CalendarClock,
  HandCoins as Coins,
  DoorOpen,
} from "lucide-react";
import { isPartnerRole } from "@/types";

export interface NavItem {
  title: string;
  href: string;
  icon: any;
  /** One permission, or any of several. */
  permission?: string | string[];
  /** Menu audience: partner-only pages are hidden from staff (and vice versa). */
  audience?: "staff" | "partner";
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
    label: "My Business",
    items: [
      { title: "Buy Stock", href: "/partner/buy", icon: ShoppingCart, permission: "order.create", audience: "partner" },
      { title: "My Orders", href: "/partner/orders", icon: ClipboardList, permission: "order.view", audience: "partner" },
      { title: "Stock & Deliveries", href: "/partner/stock", icon: PackageCheck, permission: "portal.access", audience: "partner" },
      { title: "Sell", href: "/partner/sell", icon: HandCoins, permission: "partner.sell", audience: "partner" },
      { title: "My Sales", href: "/partner/sales", icon: ReceiptText, permission: "partner.sell", audience: "partner" },
      { title: "My Network", href: "/partner/network", icon: GitFork, permission: "partner.appoint", audience: "partner" },
      { title: "Targets", href: "/targets", icon: Target, permission: ["portal.access", "network.view"], audience: "partner" },
      { title: "My Account", href: "/account", icon: BookOpen, permission: "portal.access", audience: "partner" },
    ],
  },
  {
    label: "Channel & Dispatch",
    items: [
      { title: "Approvals", href: "/approvals", icon: BadgeCheck, permission: "approvals.sign" },
      { title: "Place an Order", href: "/orders/new", icon: ShoppingBag, permission: "order.create", audience: "staff" },
      { title: "Orders", href: "/orders", icon: ClipboardList, permission: "order.view", audience: "staff" },
      { title: "Delivery Orders", href: "/dispatch", icon: Truck, permission: "dispatch.view", audience: "staff" },
      { title: "Business Network", href: "/network", icon: GitFork, permission: "network.view", audience: "staff" },
      { title: "Distributors", href: "/distributors", icon: Building2, permission: "distributor.view", audience: "staff" },
      { title: "Partner Targets", href: "/targets", icon: Target, permission: ["portal.access", "network.view"], audience: "staff" },
      { title: "Territories", href: "/territories", icon: Map, permission: "network.view", audience: "staff" },
      { title: "Outlets & Showrooms", href: "/outlets", icon: Boxes, permission: "outlet.view", audience: "staff" },
      { title: "Transport Fleet", href: "/fleet", icon: Container, permission: "fleet.view", audience: "staff" },
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
    label: "People",
    items: [
      { title: "My HR", href: "/me", icon: Fingerprint, permission: "hr.self", audience: "staff" },
      { title: "HR & Attendance", href: "/hr", icon: CalendarClock, permission: "attendance.team", audience: "staff" },
      { title: "Advances & Claims", href: "/hr/money", icon: Coins, permission: ["attendance.team", "hr.manage", "approvals.sign"], audience: "staff" },
      { title: "Exits", href: "/hr/exits", icon: DoorOpen, permission: ["attendance.team", "hr.manage", "approvals.sign"], audience: "staff" },
    ],
  },
  {
    label: "Earnings",
    items: [
      { title: "My Incentives", href: "/incentives/my-incentives", icon: Trophy, permission: "scheme.view" },
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
const EXTRA_ROUTES: Array<{ prefix: string; permission?: string | string[]; title: string }> = [
  { prefix: "/orders", permission: "order.view", title: "Orders" },
  { prefix: "/dispatch", permission: "dispatch.view", title: "Delivery Orders" },
  { prefix: "/purchases/new", permission: "purchase.manage", title: "New Purchase" },
  { prefix: "/change-password", title: "Change Password" },
];

export function canSee(item: { permission?: string | string[]; audience?: "staff" | "partner" }, role: string, permissions: string[]) {
  if (item.audience === "partner" && !isPartnerRole(role)) return false;
  if (item.audience === "staff" && isPartnerRole(role)) return false;
  if (role === "ADMIN") return true;
  if (!item.permission) return true;
  const need = Array.isArray(item.permission) ? item.permission : [item.permission];
  return need.some((p) => permissions.includes(p));
}

/** Route guard: permission only (audience just shapes the menu, deep links still work). */
export function canOpen(item: { permission?: string | string[] }, role: string, permissions: string[]) {
  return canSee({ permission: item.permission }, role, permissions);
}

/** Longest-prefix match of the current path against all known routes. */
export function routeFor(pathname: string): { title: string; permission?: string | string[] } | null {
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
