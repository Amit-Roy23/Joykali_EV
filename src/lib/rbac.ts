import { Permission, UserRole, ROLE_HIERARCHY, JWTPayload, isPartnerRole } from "@/types";
import { RolePermission } from "@/models/RolePermission";
import { User } from "@/models/User";
import mongoose from "mongoose";

const FEC_BASE: Permission[] = [
  "sales.create",
  "sales.view.own",
  "scheme.view",
  "payslip.view.own",
  "payslip.download",
  "employee.view",
];
const ASM_BASE: Permission[] = [
  ...FEC_BASE,
  "sales.view.team",
  "inventory.view",
  "dealer.view",
  "payslip.view.team",
  "reports.view",
  // dealer orders for their own dealers; record goods receipt (GRN) for a dealer
  "order.view",
  "order.create",
  "dispatch.view",
  "grn.record",
  "ledger.view",
  "network.view",
  "outlet.view",
];
const BH_BASE: Permission[] = [
  ...ASM_BASE,
  "sales.view.all",
  "purchase.view",
  "inventory.manage",
  "dealer.manage",
  "employee.manage",
  "scheme.create",
  "scheme.manage",
  "scheme.approve",
  "payroll.run",
  "payroll.adjust",
  "payroll.approve",
  "payroll.view",
  "payslip.view.all",
  "distributor.view",
  "distributor.manage",
  "credit.request",
  "ledger.manage",
  "dispatch.manage",
  "fleet.view",
  "fleet.manage",
  "salary.manage",
  "approvals.sign",
  "network.manage",
  "kyc.verify",
  "target.manage",
  "outlet.manage",
];
const MP_BASE: Permission[] = [...BH_BASE, "sales.cancel", "purchase.manage", "payroll.lock", "audit.view"];

const PARTNER_BASE: Permission[] = ["portal.access", "order.view", "order.create", "dispatch.view", "grn.record", "ledger.view"];

const uniq = (list: Permission[]) => [...new Set(list)];

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  FEC: uniq(FEC_BASE),
  ASM: uniq(ASM_BASE),
  BUSINESS_HEAD: uniq(BH_BASE),
  MANAGING_PARTNER: uniq(MP_BASE),
  // Admin governs the system but is deliberately NOT an approver: every approval
  // needs the Business Head and then the Managing Partner.
  ADMIN: uniq([...MP_BASE, "settings.manage"]).filter((p) => p !== "approvals.sign"),
  // Showroom counter login: sells from its own outlet's stock and receives transfers.
  OUTLET: uniq([...FEC_BASE, "outlet.view"]),
  // Channel partner logins see only their own business and their own downline.
  SUPER_DISTRIBUTOR: [...PARTNER_BASE, "partner.sell", "partner.appoint"],
  DISTRIBUTOR: [...PARTNER_BASE, "partner.sell", "partner.appoint"],
  DEALER: [...PARTNER_BASE, "partner.sell", "partner.appoint"],
  SUB_DEALER: [...PARTNER_BASE, "partner.sell"],
};

/**
 * Permissions that existed before role documents recorded `knownPermissions`.
 * A stored role only "knows" these, so any newer default permission is added
 * automatically instead of silently missing after an upgrade.
 */
const LEGACY_PERMISSIONS: string[] = [
  "sales.create", "sales.view.own", "sales.view.team", "sales.view.all", "sales.cancel",
  "purchase.manage", "purchase.view", "inventory.manage", "inventory.view",
  "dealer.manage", "dealer.view", "employee.manage", "employee.view",
  "scheme.create", "scheme.approve", "scheme.view", "scheme.manage",
  "payroll.run", "payroll.adjust", "payroll.approve", "payroll.lock", "payroll.view",
  "payslip.view.own", "payslip.view.team", "payslip.view.all", "payslip.download",
  "settings.manage", "reports.view", "audit.view",
];

/** Every permission the system knows about (used when saving the role matrix). */
export const ALL_PERMISSIONS: Permission[] = uniq(Object.values(DEFAULT_ROLE_PERMISSIONS).flat());

/**
 * Permissions for a role: the stored matrix plus any default permission
 * introduced after that matrix was saved.
 */
export async function getPermissionsForRole(role: UserRole): Promise<Permission[]> {
  const defaults = DEFAULT_ROLE_PERMISSIONS[role] || [];
  try {
    const stored: any = await RolePermission.findOne({ role }).lean();
    if (stored && Array.isArray(stored.permissions)) {
      const known = new Set<string>(stored.knownPermissions?.length ? stored.knownPermissions : LEGACY_PERMISSIONS);
      const added = defaults.filter((p) => !known.has(p));
      let perms = uniq([...(stored.permissions as Permission[]), ...added]);
      if (role === "ADMIN") perms = perms.filter((p) => p !== "approvals.sign");
      return perms;
    }
  } catch {
    // Database might not be initialized yet
  }
  return defaults;
}

/**
 * Check if a role has a specific permission
 */
export async function hasPermission(
  role: UserRole,
  permission: Permission
): Promise<boolean> {
  // Admin has every permission except signing approvals (BH + MP only).
  if (role === "ADMIN") return permission !== "approvals.sign";
  const permissions = await getPermissionsForRole(role);
  return permissions.includes(permission);
}

/**
 * Hierarchy check: User A cannot manage User B if Rank(A) <= Rank(B)
 */
export function canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
  if (managerRole === "ADMIN") return true;
  // Distributor logins are managed with their distributor (BH and above).
  // Partner logins are managed with their partner record (BH and above).
  if (isPartnerRole(targetRole)) return ROLE_HIERARCHY[managerRole] >= ROLE_HIERARCHY.BUSINESS_HEAD;
  if (isPartnerRole(managerRole)) return false;
  return ROLE_HIERARCHY[managerRole] > ROLE_HIERARCHY[targetRole];
}

/**
 * Recursively fetches all downline user IDs (direct + indirect reports) for a user
 */
export async function getTeamUserIds(userId: string | mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId[]> {
  const directReports = await User.find(
    { reportsTo: userId, status: "ACTIVE" },
    { _id: 1 }
  ).lean();

  if (directReports.length === 0) {
    return [];
  }

  const directIds = directReports.map((d: any) => d._id);
  const subTreeIds: mongoose.Types.ObjectId[] = [];

  for (const id of directIds) {
    const downline = await getTeamUserIds(id);
    subTreeIds.push(...downline);
  }

  return [...directIds, ...subTreeIds];
}

/**
 * Data Scoping Rule Helper: returns a MongoDB query filter object
 * based on user's role and permission level
 */
export async function getScopeFilter(
  user: JWTPayload,
  resource: "sales" | "employees" | "dealers" | "payslips" | "payroll" | "inventory"
): Promise<Record<string, any>> {
  const userObjectId = new mongoose.Types.ObjectId(user.userId);

  if (user.role === "ADMIN" || user.role === "MANAGING_PARTNER") {
    return {};
  }
  // External distributor logins never see internal sales, staff, payroll or stock.
  if (isPartnerRole(user.role)) {
    return { _id: null };
  }
  if (user.role === "OUTLET") {
    const me = await User.findById(userObjectId).select("outlet").lean();
    const outlet = (me as any)?.outlet || null;
    if (resource === "sales") return outlet ? { outlet } : { soldBy: userObjectId };
    if (resource === "inventory") return outlet ? { status: "AT_OUTLET", currentLocationOutlet: outlet } : { _id: null };
    if (resource === "payslips") return { employee: userObjectId };
    if (resource === "employees") return { _id: userObjectId };
    return { _id: null };
  }

  if (resource === "sales") {
    if (await hasPermission(user.role, "sales.view.all")) {
      return {};
    }
    if (await hasPermission(user.role, "sales.view.team")) {
      const teamIds = await getTeamUserIds(userObjectId);
      return { soldBy: { $in: [userObjectId, ...teamIds] } };
    }
    if (await hasPermission(user.role, "sales.view.own")) {
      return { soldBy: userObjectId };
    }
    return { _id: null };
  }

  if (resource === "employees") {
    if (user.role === "BUSINESS_HEAD") {
      const teamIds = await getTeamUserIds(userObjectId);
      return { _id: { $in: [userObjectId, ...teamIds] } };
    }
    if (user.role === "ASM") {
      const teamIds = await getTeamUserIds(userObjectId);
      return { _id: { $in: [userObjectId, ...teamIds] } };
    }
    return { _id: userObjectId };
  }

  if (resource === "dealers") {
    if (user.role === "BUSINESS_HEAD") {
      return {};
    }
    if (user.role === "ASM") {
      return { assignedASM: userObjectId };
    }
    // FEC sees assigned dealer if any
    const currentUser = await User.findById(userObjectId).lean();
    if (currentUser?.dealer) {
      return { _id: currentUser.dealer };
    }
    return { _id: null };
  }

  if (resource === "payslips") {
    if (await hasPermission(user.role, "payslip.view.all")) {
      return {};
    }
    if (await hasPermission(user.role, "payslip.view.team")) {
      const teamIds = await getTeamUserIds(userObjectId);
      return { employee: { $in: [userObjectId, ...teamIds] } };
    }
    return { employee: userObjectId };
  }

  if (resource === "inventory") {
    if (user.role === "BUSINESS_HEAD" || user.role === "ASM") {
      return {};
    }
    // FEC sees warehouse and their own dealer inventory
    const currentUser = await User.findById(userObjectId).lean();
    if (currentUser?.dealer) {
      return {
        $or: [
          { currentLocationType: "WAREHOUSE" },
          { currentLocationDealer: currentUser.dealer },
        ],
      };
    }
    return { currentLocationType: "WAREHOUSE" };
  }

  return {};
}

