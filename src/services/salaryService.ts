import mongoose from "mongoose";
import { JWTPayload, UserRole } from "@/types";
import { SalaryStructure } from "@/models/SalaryStructure";
import { PayrollRun } from "@/models/PayrollRun";
import { Setting } from "@/models/Setting";
import { User } from "@/models/User";
import { canManageRole } from "@/lib/rbac";
import { periodFor, periodOf } from "@/lib/period";
import { logAudit } from "@/lib/audit";
import { buildSalaryFromGross, costSalary, DEFAULT_SALARY_RULES, grossFromAnnualCtc, statutorySettingsFrom } from "./payrollEngine";

export class SalaryError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface SalaryInput {
  mode: "GROSS" | "CTC"; // monthly gross, or annual CTC
  amountRupees: number;
  flags: { pf: boolean; esi: boolean; professionalTax: boolean };
}

async function rules() {
  const s: any = await Setting.findOne().lean();
  return {
    salaryRules: { ...DEFAULT_SALARY_RULES, ...(s?.salaryRules || {}) },
    statutory: { ...statutorySettingsFrom(s?.statutoryDeductions), employerEsiRate: s?.statutoryDeductions?.employerEsiRate ?? 3.25 },
  };
}

/** Automatic component split + deductions + CTC for a gross or CTC figure. */
export async function previewSalary(input: SalaryInput) {
  const amount = Math.round(Number(input.amountRupees) * 100);
  if (!Number.isFinite(amount) || amount <= 0) throw new SalaryError("Enter a salary amount");
  const { salaryRules, statutory } = await rules();
  const flags = { pf: !!input.flags?.pf, esi: !!input.flags?.esi, professionalTax: !!input.flags?.professionalTax };
  const gross = input.mode === "CTC" ? grossFromAnnualCtc(amount, flags, salaryRules, statutory) : amount;
  return { flags, rules: salaryRules, breakup: buildSalaryFromGross(gross, flags, salaryRules, statutory) };
}

/**
 * Propose a salary revision effective from the 1st of a month. It sits as
 * PENDING_APPROVAL until the Business Head and then the Managing Partner approve.
 */
export async function proposeRevision(
  employeeId: string,
  input: SalaryInput & {
    effectiveMonth: string; // "YYYY-MM"
    reason: string;
    bankDetails?: { accountNo: string; ifsc: string; bankName: string };
    pan?: string;
  },
  user: JWTPayload
) {
  if (!mongoose.isValidObjectId(employeeId)) throw new SalaryError("Employee not found", 404);
  const emp = await User.findById(employeeId).lean();
  if (!emp || emp.role === "DISTRIBUTOR") throw new SalaryError("Employee not found", 404);
  if (String(emp._id) === String(user.userId)) throw new SalaryError("You cannot propose your own salary", 403);
  if (!canManageRole(user.role, emp.role as UserRole)) {
    throw new SalaryError("You can only propose salaries for roles below yours", 403);
  }
  if (!input.reason?.trim()) throw new SalaryError("Give a reason for the revision");
  const m = /^(\d{4})-(\d{2})$/.exec(input.effectiveMonth || "");
  if (!m) throw new SalaryError("Choose the month the revision takes effect");
  const eff = periodFor(Number(m[1]), Number(m[2]));
  const locked = await PayrollRun.findOne({ year: eff.year, month: eff.month, status: "LOCKED" }).lean();
  if (locked) throw new SalaryError(`Payroll for ${eff.period} is already locked — choose a later month`);
  const now = periodOf(new Date());
  if (eff.start.getTime() > periodFor(now.year + 1, now.month).start.getTime()) {
    throw new SalaryError("Revisions can be scheduled up to 12 months ahead");
  }

  const pending = await SalaryStructure.findOne({ employee: emp._id, status: "PENDING_APPROVAL" }).lean();
  if (pending) throw new SalaryError("A revision for this employee is already awaiting approval", 409);

  const current = await SalaryStructure.findOne({ employee: emp._id, status: { $in: ["APPROVED", "SUPERSEDED", null] } })
    .sort({ effectiveFrom: -1, createdAt: -1 })
    .lean();
  const bank = input.bankDetails?.accountNo ? input.bankDetails : (current as any)?.bankDetails;
  const pan = (input.pan || (current as any)?.pan || "").toUpperCase().trim();
  if (!bank?.accountNo || !bank?.ifsc || !bank?.bankName) throw new SalaryError("Bank account, IFSC and bank name are required");
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(bank.ifsc).toUpperCase())) throw new SalaryError("Invalid IFSC code");
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) throw new SalaryError("Invalid PAN");

  const { breakup, flags } = await previewSalary(input);
  if (breakup.gross < 100000) throw new SalaryError("Gross salary looks too low (below ₹1,000/month)");

  const doc = await SalaryStructure.create({
    employee: emp._id,
    basic: breakup.basic,
    hra: breakup.hra,
    conveyance: breakup.conveyance,
    otherAllowances: breakup.otherAllowances,
    fixedDeductions: flags,
    bankDetails: { accountNo: String(bank.accountNo), ifsc: String(bank.ifsc).toUpperCase(), bankName: String(bank.bankName) },
    pan,
    effectiveFrom: eff.start,
    isActive: false,
    status: "PENDING_APPROVAL",
    approvals: [],
    grossMonthly: breakup.gross,
    reason: input.reason.trim(),
    proposedBy: new mongoose.Types.ObjectId(user.userId),
  });
  await logAudit({
    user,
    action: "CREATE",
    resource: "SALARY",
    resourceId: String(doc._id),
    after: { employee: emp.employeeCode, gross: breakup.gross, effective: eff.period, reason: input.reason },
  });
  return doc;
}

/** Salary history: in force, scheduled, pending and past structures. */
export async function salaryHistory(employeeId: string) {
  const list = await SalaryStructure.find({ employee: employeeId })
    .populate("proposedBy", "name employeeCode")
    .sort({ effectiveFrom: -1, createdAt: -1 })
    .lean();
  const { statutory } = await rules();
  return list.map((s: any) => {
    const breakup = costSalary(
      { basic: s.basic, hra: s.hra, conveyance: s.conveyance, otherAllowances: s.otherAllowances },
      s.fixedDeductions || { pf: true, esi: false, professionalTax: true },
      statutory
    );
    return { ...s, status: s.status || "APPROVED", gross: breakup.gross, breakup };
  });
}
