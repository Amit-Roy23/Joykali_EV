import { Counter } from "@/models/Counter";
import { UserRole } from "@/types";

/**
 * Returns Indian Financial Year string (e.g. "2026-27") for a given date
 * FY runs from 1 April to 31 March
 */
export function getFinancialYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0 = Jan, 3 = Apr
  const year = date.getFullYear();

  let startYear = year;
  if (month < 3) {
    // Jan, Feb, Mar belong to previous FY start
    startYear = year - 1;
  }
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

/**
 * Atomically increments and gets the next sequence number for a given counter key
 */
export async function getNextSequence(key: string, session?: any): Promise<number> {
  const options: any = {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  };
  if (session) {
    options.session = session;
  }

  const counter: any = await Counter.findOneAndUpdate(
    { key },
    { $inc: { sequenceValue: 1 } },
    options
  );

  return counter.sequenceValue;
}

const ROLE_PREFIX_MAP: Record<UserRole, string> = {
  FEC: "FEC",
  ASM: "ASM",
  BUSINESS_HEAD: "BH",
  MANAGING_PARTNER: "MP",
  ADMIN: "ADM",
  DISTRIBUTOR: "DST",
};

/**
 * Generate Employee Code: JKE-FEC-0001, JKE-ASM-0001, etc.
 */
export async function generateEmployeeCode(
  role: UserRole,
  session?: any
): Promise<string> {
  const rolePrefix = ROLE_PREFIX_MAP[role] || "EMP";
  const key = `EMPLOYEE_${rolePrefix}`;
  const seq = await getNextSequence(key, session);
  return `JKE-${rolePrefix}-${String(seq).padStart(4, "0")}`;
}

/**
 * Generate Dealer Code: JKD-0001
 */
export async function generateDealerCode(session?: any): Promise<string> {
  const key = "DEALER";
  const seq = await getNextSequence(key, session);
  return `JKD-${String(seq).padStart(4, "0")}`;
}

/**
 * Generate Sales Invoice Code: JKS/2026-27/0001 (resets each FY)
 */
export async function generateSaleCode(
  date: Date = new Date(),
  session?: any
): Promise<string> {
  const fy = getFinancialYear(date);
  const key = `SALE_${fy}`;
  const seq = await getNextSequence(key, session);
  return `JKS/${fy}/${String(seq).padStart(4, "0")}`;
}

/**
 * Generate Purchase Code: JKP/2026-27/0001 (resets each FY)
 */
export async function generatePurchaseCode(
  date: Date = new Date(),
  session?: any
): Promise<string> {
  const fy = getFinancialYear(date);
  const key = `PURCHASE_${fy}`;
  const seq = await getNextSequence(key, session);
  return `JKP/${fy}/${String(seq).padStart(4, "0")}`;
}

/**
 * Generate Payroll Run Code: PR-2026-11
 */
export function generatePayrollRunCode(year: number, month: number): string {
  const monthStr = String(month).padStart(2, "0");
  return `PR-${year}-${monthStr}`;
}

/**
 * Generate Payslip Code: PS/2026-11/JKE-FEC-0001
 */
export function generatePayslipCode(
  year: number,
  month: number,
  employeeCode: string
): string {
  const monthStr = String(month).padStart(2, "0");
  return `PS/${year}-${monthStr}/${employeeCode}`;
}


/** Distributor code: JKDB-0001 (also the distributor's login ID). */
export async function generateDistributorCode(session?: any): Promise<string> {
  const seq = await getNextSequence("DISTRIBUTOR", session);
  return `JKDB-${String(seq).padStart(4, "0")}`;
}

/**
 * Financial-year document series (atomic, resets every 1 April):
 *   ORDER JKO · DO JKDO · INVOICE JKI · CHALLAN JKC · GRN JKG · CREDIT_NOTE JKCN · RECEIPT JKR
 */
export const FY_SERIES = {
  ORDER: "JKO",
  DO: "JKDO",
  INVOICE: "JKI",
  CHALLAN: "JKC",
  GRN: "JKG",
  CREDIT_NOTE: "JKCN",
  RECEIPT: "JKR",
} as const;

export async function generateFyCode(
  series: keyof typeof FY_SERIES,
  date: Date = new Date(),
  session?: any
): Promise<string> {
  // Indian FY (April–March) from the IST calendar date, independent of server timezone.
  const ist = new Date(date.getTime() + 330 * 60000);
  const start = ist.getUTCMonth() < 3 ? ist.getUTCFullYear() - 1 : ist.getUTCFullYear();
  const fy = `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  const seq = await getNextSequence(`${series}_${fy}`, session);
  return `${FY_SERIES[series]}/${fy}/${String(seq).padStart(4, "0")}`;
}
