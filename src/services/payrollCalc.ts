import { Setting } from "@/models/Setting";
import { computePayslip, legacyLines, splitGross, statutoryFromSettings } from "./salaryTemplateEngine";
import { SalarySetup } from "./salaryTemplateService";

/**
 * Full-month salary columns for an employee: with an approved template, the employee's gross is
 * split into the template's columns; before the first template, the structure's own fixed amounts.
 */
export function monthLines(struct: any, setup: SalarySetup) {
  if (setup.source === "template") {
    const gross = struct.grossMonthly || struct.basic + struct.hra + struct.conveyance + struct.otherAllowances;
    return splitGross(gross, setup.components);
  }
  return legacyLines(struct);
}

/** Reimbursements and travel allowance are not wages for ESI. */
const isWage = (reason: string) => !/^(Reimbursement|Travel allowance)/i.test(reason || "");

/** Entries generated before salary templates carry no setup: rebuild it from the stored structure. */
export async function ensureSnapshotSetup(entry: any, session?: any) {
  if (entry.salaryStructureSnapshot?.setup) return;
  const s: any = await Setting.findOne().session(session ?? null).lean();
  entry.salaryStructureSnapshot = {
    ...entry.salaryStructureSnapshot,
    setup: { source: "default", templateId: null, earnings: legacyLines(entry.salaryStructureSnapshot || {}), deductions: [], statutory: statutoryFromSettings(s?.statutoryDeductions) },
  };
  entry.markModified?.("salaryStructureSnapshot");
}

export function runPayslip(
  snapshot: any,
  x: { workingDays: number; lopDays: number; incentives: number; incentiveBreakdown: any[]; adjustments: any[]; tds: number; advanceRecovery: number }
) {
  const setup = snapshot.setup;
  return computePayslip({
    earnings: setup.earnings,
    deductions: setup.deductions || [],
    statutory: setup.statutory,
    flags: snapshot.fixedDeductions || { pf: true, esi: true, professionalTax: true },
    workingDays: x.workingDays,
    lopDays: x.lopDays,
    incentives: x.incentives,
    incentiveBreakdown: x.incentiveBreakdown,
    adjustments: x.adjustments.map((a: any) => ({ amount: a.amount, reason: a.reason, wage: a.wage === false ? false : isWage(a.reason) })),
    tds: x.tds,
    advanceRecovery: x.advanceRecovery,
  });
}

/** Copy a payslip calculation onto a PayrollEntry document. */
export function applyCalc(entry: any, calc: ReturnType<typeof runPayslip>) {
  entry.workingDays = calc.workingDays;
  entry.lopDays = calc.lopDays;
  entry.paidDays = calc.paidDays;
  entry.earnings = calc.earnings as any;
  entry.deductions = calc.deductions;
  entry.earningLines = calc.earningLines;
  entry.deductionLines = calc.deductionLines;
  entry.employer = calc.employer;
  entry.pfWage = calc.pfWage;
  entry.esiWage = calc.esiWage;
  entry.grossPay = calc.grossPay;
  entry.totalDeductions = calc.totalDeductions;
  entry.netPay = calc.netPay;
}
