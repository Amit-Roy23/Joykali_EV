export type UserRole =
  | "FEC"
  | "ASM"
  | "BUSINESS_HEAD"
  | "MANAGING_PARTNER"
  | "ADMIN"
  /** Company showroom / outlet login (an employee tied to one outlet). */
  | "OUTLET"
  /** HR manager: attendance, leave, documents, joining & exit. Not a finance approver. */
  | "HR_MANAGER"
  /** External channel partners — outside the employee hierarchy. */
  | "SUPER_DISTRIBUTOR"
  | "DISTRIBUTOR"
  | "DEALER"
  | "SUB_DEALER";

export const EMPLOYEE_ROLES = ["FEC", "OUTLET", "ASM", "HR_MANAGER", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"] as const;
export const PARTNER_ROLES = ["SUPER_DISTRIBUTOR", "DISTRIBUTOR", "DEALER", "SUB_DEALER"] as const;
export const ALL_ROLES = [...EMPLOYEE_ROLES, ...PARTNER_ROLES] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number];

/** Channel partner logins (super distributor, distributor, dealer, sub dealer). */
export function isPartnerRole(role?: string | null): role is PartnerRole {
  return !!role && (PARTNER_ROLES as readonly string[]).includes(role);
}
/** Which party collection a partner login belongs to. */
export function partyTypeOfRole(role?: string | null): "DEALER" | "DISTRIBUTOR" | null {
  if (role === "SUPER_DISTRIBUTOR" || role === "DISTRIBUTOR") return "DISTRIBUTOR";
  if (role === "DEALER" || role === "SUB_DEALER") return "DEALER";
  return null;
}

/** Everything needs BOTH signatures, in this order. Admin cannot approve. */
export const APPROVAL_CHAIN = ["BUSINESS_HEAD", "MANAGING_PARTNER"] as const;
export type ApprovalLevel = (typeof APPROVAL_CHAIN)[number];

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  FEC: 1,
  ASM: 2,
  BUSINESS_HEAD: 3,
  MANAGING_PARTNER: 4,
  ADMIN: 5,
  OUTLET: 1,
  HR_MANAGER: 2.5,
  SUPER_DISTRIBUTOR: 0,
  DISTRIBUTOR: 0,
  DEALER: 0,
  SUB_DEALER: 0,
};

export type Permission =
  | "sales.create"
  | "sales.view.own"
  | "sales.view.team"
  | "sales.view.all"
  | "sales.cancel"
  | "purchase.manage"
  | "purchase.view"
  | "inventory.manage"
  | "inventory.view"
  | "dealer.manage"
  | "dealer.view"
  | "employee.manage"
  | "employee.view"
  | "scheme.create"
  | "scheme.approve"
  | "scheme.view"
  | "scheme.manage"
  | "payroll.run"
  | "payroll.adjust"
  | "payroll.approve"
  | "payroll.lock"
  | "payroll.view"
  | "payslip.view.own"
  | "payslip.view.team"
  | "payslip.view.all"
  | "payslip.download"
  | "settings.manage"
  | "reports.view"
  | "audit.view"
  // --- channel partners, orders & credit
  | "distributor.view"
  | "distributor.manage"
  | "order.view"
  | "order.create"
  | "credit.request"
  | "ledger.view"
  | "ledger.manage"
  // --- warehouse delivery orders, dispatch & receipts
  | "dispatch.view"
  | "dispatch.manage"
  | "grn.record"
  // --- fleet & documents
  | "fleet.view"
  | "fleet.manage"
  // --- salary structures & approvals
  | "salary.manage"
  | "approvals.sign"
  // --- distributor self-service portal
  | "portal.access"
  // --- channel network (phase 4)
  | "network.view"
  | "network.manage"
  | "kyc.verify"
  | "target.manage"
  | "outlet.view"
  | "outlet.manage"
  | "partner.sell"
  | "partner.appoint"
  // --- HR, attendance & staff self-service (phase 5)
  | "hr.self"
  | "hr.manage"
  | "attendance.team"
  | "attendance.manage"
  | "leave.approve";

export type VehicleCategory =
  | "2W"
  | "3W"
  | "4W"
  | "E_RICKSHAW"
  | "LOADER";

export type VehicleStatus =
  | "IN_STOCK"
  | "ALLOCATED_TO_DEALER"
  | "SOLD"
  | "RETURNED"
  /** Picked onto a warehouse Delivery Order, not yet dispatched. */
  | "RESERVED"
  | "IN_TRANSIT"
  /** Received by a distributor against a GRN (sold to the distributor). */
  | "WITH_DISTRIBUTOR"
  /** Reported short on a GRN — under investigation. */
  | "MISSING"
  /** Company stock sitting at a company outlet / showroom. */
  | "AT_OUTLET"
  /** Owned by a dealer / sub dealer who bought it from a distributor or dealer. */
  | "WITH_DEALER";

export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export type PaymentMode = "CASH" | "UPI" | "BANK" | "FINANCE";

export type SaleStatus = "BOOKED" | "DELIVERED" | "CANCELLED";

export type IncentiveRuleType =
  | "PER_UNIT"
  | "SLAB"
  | "TARGET_BONUS"
  | "PERCENTAGE"
  | "TEAM_OVERRIDE";

export type SchemeStatus = "DRAFT" | "ACTIVE" | "EXPIRED" | "ARCHIVED";

export type SlabApplicationType = "ALL_UNITS" | "INCREMENTAL";

export type PayrollRunStatus =
  | "DRAFT"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "LOCKED";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    pages?: number;
  };
}

export interface JWTPayload {
  userId: string;
  employeeCode: string;
  email: string;
  name: string;
  role: UserRole;
  reportsTo?: string | null;
  mustChangePassword?: boolean;
}

