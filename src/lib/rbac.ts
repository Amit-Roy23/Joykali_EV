import { Permission, UserRole, ROLE_HIERARCHY, JWTPayload } from "@/types";
import { RolePermission } from "@/models/RolePermission";
import { User } from "@/models/User";
import mongoose from "mongoose";

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  FEC: [
    "sales.create",
    "sales.view.own",
    "scheme.view",
    "payslip.view.own",
    "payslip.download",
    "employee.view",
  ],
  ASM: [
    "sales.create",
    "sales.view.own",
    "sales.view.team",
    "inventory.view",
    "dealer.view",
    "employee.view",
    "scheme.view",
    "payslip.view.own",
    "payslip.view.team",
    "payslip.download",
    "reports.view",
  ],
  BUSINESS_HEAD: [
    "sales.create",
    "sales.view.own",
    "sales.view.team",
    "sales.view.all",
    "purchase.view",
    "inventory.view",
    "inventory.manage",
    "dealer.view",
    "dealer.manage",
    "employee.view",
    "employee.manage",
    "scheme.create",
    "scheme.view",
    "scheme.manage",
    "payroll.run",
    "payroll.adjust",
    "payroll.view",
    "payslip.view.own",
    "payslip.view.team",
    "payslip.view.all",
    "payslip.download",
    "reports.view",
  ],
  MANAGING_PARTNER: [
    "sales.create",
    "sales.view.own",
    "sales.view.team",
    "sales.view.all",
    "sales.cancel",
    "purchase.view",
    "purchase.manage",
    "inventory.view",
    "inventory.manage",
    "dealer.view",
    "dealer.manage",
    "employee.view",
    "employee.manage",
    "scheme.create",
    "scheme.approve",
    "scheme.view",
    "scheme.manage",
    "payroll.run",
    "payroll.adjust",
    "payroll.approve",
    "payroll.lock",
    "payroll.view",
    "payslip.view.own",
    "payslip.view.team",
    "payslip.view.all",
    "payslip.download",
    "reports.view",
    "audit.view",
  ],
  ADMIN: [
    "sales.create",
    "sales.view.own",
    "sales.view.team",
    "sales.view.all",
    "sales.cancel",
    "purchase.view",
    "purchase.manage",
    "inventory.view",
    "inventory.manage",
    "dealer.view",
    "dealer.manage",
    "employee.view",
    "employee.manage",
    "scheme.create",
    "scheme.approve",
    "scheme.view",
    "scheme.manage",
    "payroll.run",
    "payroll.adjust",
    "payroll.approve",
    "payroll.lock",
    "payroll.view",
    "payslip.view.own",
    "payslip.view.team",
    "payslip.view.all",
    "payslip.download",
    "settings.manage",
    "reports.view",
    "audit.view",
  ],
};

/**
 * Fetch permissions for a given role from database, falling back to defaults
 */
export async function getPermissionsForRole(role: UserRole): Promise<Permission[]> {
  try {
    const customRole = await RolePermission.findOne({ role }).lean();
    if (customRole && customRole.permissions && customRole.permissions.length > 0) {
      return customRole.permissions as Permission[];
    }
  } catch (err) {
    // Database might not be initialized yet
  }
  return DEFAULT_ROLE_PERMISSIONS[role] || [];
}

/**
 * Check if a role has a specific permission
 */
export async function hasPermission(
  role: UserRole,
  permission: Permission
): Promise<boolean> {
  if (role === "ADMIN") return true;
  const permissions = await getPermissionsForRole(role);
  return permissions.includes(permission);
}

/**
 * Hierarchy check: User A cannot manage User B if Rank(A) <= Rank(B)
 */
export function canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
  if (managerRole === "ADMIN") return true;
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

