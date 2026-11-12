export type UserRole =
  | "FEC"
  | "ASM"
  | "BUSINESS_HEAD"
  | "MANAGING_PARTNER"
  | "ADMIN";

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  FEC: 1,
  ASM: 2,
  BUSINESS_HEAD: 3,
  MANAGING_PARTNER: 4,
  ADMIN: 5,
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
  | "audit.view";

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
  | "RETURNED";

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

