import { JWTPayload, Permission } from "@/types";
import { MoneyAccount } from "@/models/Accounts";
import { getPermissionsForRole, hasPermission } from "./rbac";

/**
 * Person-level grants on top of the role matrix.
 * Whoever currently holds a cash box (MoneyAccount.custodian) — e.g. a clerk covering
 * for the cashier on sick leave — gets the cashier's working rights for as long as they hold it.
 */
export const CASHIER_GRANTS: Permission[] = ["accounts.view", "accounts.manage", "expense.create"];

export async function holdsCash(userId: string) {
  if (!userId) return false;
  return !!(await MoneyAccount.exists({ custodian: userId, kind: "CASH", status: "ACTIVE" }));
}

export async function grantedPermissions(userId: string): Promise<Permission[]> {
  return (await holdsCash(userId)) ? CASHIER_GRANTS : [];
}

/** Role permission, or a person-level grant. */
export async function userCan(user: Pick<JWTPayload, "userId" | "role">, permission: Permission) {
  if (await hasPermission(user.role, permission)) return true;
  return CASHIER_GRANTS.includes(permission) && (await holdsCash(user.userId));
}

/** Everything a person may do (for the UI). */
export async function permissionsForUser(user: { userId?: string; _id?: any; role: any }) {
  const role = await getPermissionsForRole(user.role);
  const extra = await grantedPermissions(String(user.userId || user._id || ""));
  return [...new Set([...role, ...extra])];
}
