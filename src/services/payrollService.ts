import { PayrollRun, IPayrollRun } from "@/models/PayrollRun";
import { PayrollEntry, IPayrollEntry } from "@/models/PayrollEntry";
import { User } from "@/models/User";
import { SalaryStructure } from "@/models/SalaryStructure";
import { IncentiveLedger } from "@/models/IncentiveLedger";
import { Setting } from "@/models/Setting";
import { generatePayrollRunCode, generatePayslipCode } from "@/lib/codeGenerator";
import { calculatePayrollEntry } from "./payrollEngine";
import { recalculateIncentivesForPeriod } from "./salesService";
import { withTransaction } from "@/lib/db";
import { JWTPayload } from "@/types";
import { rupeesToPaise } from "@/lib/money";
import mongoose from "mongoose";

export async function generateDraftPayrollRun(
  year: number,
  month: number,
  user: JWTPayload,
  notes?: string
): Promise<IPayrollRun> {
  return await withTransaction(async (session) => {
    const runCode = generatePayrollRunCode(year, month);
    const existingRun = await PayrollRun.findOne({ year, month }).session(session ?? null);

    if (existingRun && existingRun.status === "LOCKED") {
      throw new Error(`Payroll run for ${runCode} is LOCKED and cannot be regenerated`);
    }

    const period = `${year}-${String(month).padStart(2, "0")}`;
    const periodDate = new Date(Date.UTC(year, month - 1, 15));

    // Get company settings for statutory deduction rules
    const settings = await Setting.findOne().session(session ?? null).lean();

    // Fetch active employees
    const employees = await User.find({ status: "ACTIVE" }).session(session ?? null).lean();

    // Ensure all incentives for the month are calculated
    const empIds = employees.map((e: any) => e._id);
    await recalculateIncentivesForPeriod(empIds, periodDate);

    // Create or find PayrollRun
    let payrollRun = existingRun;
    if (!payrollRun) {
      const createdRuns = await PayrollRun.create(
        [
          {
            runCode,
            month,
            year,
            status: "DRAFT",
            createdBy: new mongoose.Types.ObjectId(user.userId),
            notes,
          },
        ],
        { session }
      );
      payrollRun = createdRuns[0];
    } else {
      payrollRun.status = "DRAFT";
      payrollRun.notes = notes || payrollRun.notes;
    }

    let totalGrossPaise = 0;
    let totalDeductionsPaise = 0;
    let totalNetPaise = 0;

    for (const emp of employees) {
      // Find salary structure
      const salaryStruct = await SalaryStructure.findOne({
        employee: emp._id,
        isActive: true,
      })
        .session(session ?? null)
        .sort({ effectiveFrom: -1 })
        .lean();

      if (!salaryStruct) continue;

      // Find incentive ledger for this period
      const ledger = await IncentiveLedger.findOne({
        employee: emp._id,
        period,
      })
        .session(session ?? null)
        .lean();

      const incentiveEarned = ledger ? ledger.totalEarned : 0;
      const incentiveBreakdown = (ledger?.breakdown || []).map((b: any) => ({
        schemeId: b.schemeId,
        schemeName: b.schemeName,
        amount: b.earnedAmount,
      }));

      // Check existing entry to retain manual adjustments if regenerating
      const existingEntry = await PayrollEntry.findOne({
        payrollRun: payrollRun._id,
        employee: emp._id,
      }).session(session ?? null);

      const workingDays = existingEntry?.workingDays || 30;
      const lopDays = existingEntry?.lopDays || 0;
      const adjustments = existingEntry?.adjustments || [];
      const tds = existingEntry?.deductions?.tds || 0;
      const advanceRecovery = existingEntry?.deductions?.advanceRecovery || 0;

      const calc = calculatePayrollEntry({
        salary: {
          basic: salaryStruct.basic,
          hra: salaryStruct.hra,
          conveyance: salaryStruct.conveyance,
          otherAllowances: salaryStruct.otherAllowances,
          fixedDeductions: salaryStruct.fixedDeductions,
        },
        workingDays,
        lopDays,
        incentives: incentiveEarned,
        incentiveBreakdown,
        adjustments: adjustments.map((a: any) => ({
          amount: a.amount,
          reason: a.reason,
        })),
        tds,
        advanceRecovery,
        settings: settings?.statutoryDeductions,
      });

      const payslipCode = generatePayslipCode(year, month, emp.employeeCode);

      await PayrollEntry.findOneAndUpdate(
        { payrollRun: payrollRun._id, employee: emp._id },
        {
          payrollRun: payrollRun._id,
          employee: emp._id,
          payslipCode,
          salaryStructureSnapshot: salaryStruct,
          workingDays: calc.workingDays,
          lopDays: calc.lopDays,
          paidDays: calc.paidDays,
          earnings: calc.earnings,
          deductions: calc.deductions,
          adjustments,
          grossPay: calc.grossPay,
          totalDeductions: calc.totalDeductions,
          netPay: calc.netPay,
        },
        { upsert: true, new: true, session }
      );

      totalGrossPaise += calc.grossPay;
      totalDeductionsPaise += calc.totalDeductions;
      totalNetPaise += calc.netPay;
    }

    payrollRun.totals = {
      totalGross: totalGrossPaise,
      totalDeductions: totalDeductionsPaise,
      totalNet: totalNetPaise,
      totalEmployees: employees.length,
    };
    await payrollRun.save({ session });

    return payrollRun;
  });
}

export async function adjustPayrollEntry(
  entryId: string,
  data: {
    workingDays?: number;
    lopDays?: number;
    adjustment?: { amount: number; reason: string }; // amount in rupees
    tds?: number; // rupees
    advanceRecovery?: number; // rupees
  },
  user: JWTPayload
): Promise<IPayrollEntry> {
  return await withTransaction(async (session) => {
    const entry = await PayrollEntry.findById(entryId).session(session ?? null);
    if (!entry) throw new Error("Payroll entry not found");

    const run = await PayrollRun.findById(entry.payrollRun).session(session ?? null);
    if (!run) throw new Error("Payroll run not found");
    if (run.status === "LOCKED") {
      throw new Error("Cannot modify an entry in a LOCKED payroll run");
    }

    const settings = await Setting.findOne().session(session ?? null).lean();
    const workingDays = data.workingDays ?? entry.workingDays;
    const lopDays = data.lopDays ?? entry.lopDays;

    const adjustments = [...(entry.adjustments || [])];
    if (data.adjustment && data.adjustment.amount !== 0) {
      adjustments.push({
        amount: rupeesToPaise(data.adjustment.amount),
        reason: data.adjustment.reason,
        addedBy: new mongoose.Types.ObjectId(user.userId),
        addedAt: new Date(),
      });
    }

    const tdsPaise = data.tds !== undefined ? rupeesToPaise(data.tds) : entry.deductions.tds;
    const advanceRecoveryPaise =
      data.advanceRecovery !== undefined
        ? rupeesToPaise(data.advanceRecovery)
        : entry.deductions.advanceRecovery;

    const calc = calculatePayrollEntry({
      salary: {
        basic: entry.salaryStructureSnapshot.basic,
        hra: entry.salaryStructureSnapshot.hra,
        conveyance: entry.salaryStructureSnapshot.conveyance,
        otherAllowances: entry.salaryStructureSnapshot.otherAllowances,
        fixedDeductions: entry.salaryStructureSnapshot.fixedDeductions,
      },
      workingDays,
      lopDays,
      incentives: entry.earnings.incentives,
      incentiveBreakdown: entry.earnings.incentiveBreakdown.map((b) => ({
        schemeId: String(b.schemeId),
        schemeName: b.schemeName,
        amount: b.amount,
      })),
      adjustments: adjustments.map((a: any) => ({
        amount: a.amount,
        reason: a.reason,
      })),
      tds: tdsPaise,
      advanceRecovery: advanceRecoveryPaise,
      settings: settings?.statutoryDeductions,
    });

    entry.workingDays = calc.workingDays;
    entry.lopDays = calc.lopDays;
    entry.paidDays = calc.paidDays;
    entry.earnings = calc.earnings as any;
    entry.deductions = calc.deductions;
    entry.adjustments = adjustments;
    entry.grossPay = calc.grossPay;
    entry.totalDeductions = calc.totalDeductions;
    entry.netPay = calc.netPay;
    await entry.save({ session });

    // Recalculate run totals
    const allEntries = await PayrollEntry.find({ payrollRun: run._id }).session(session ?? null);
    run.totals = {
      totalGross: allEntries.reduce((s, e) => s + e.grossPay, 0),
      totalDeductions: allEntries.reduce((s, e) => s + e.totalDeductions, 0),
      totalNet: allEntries.reduce((s, e) => s + e.netPay, 0),
      totalEmployees: allEntries.length,
    };
    await run.save({ session });

    return entry;
  });
}

export async function approvePayrollRun(
  runId: string,
  user: JWTPayload
): Promise<IPayrollRun> {
  const run = await PayrollRun.findById(runId);
  if (!run) throw new Error("Payroll run not found");
  if (run.status === "LOCKED") throw new Error("Payroll run is already locked");

  run.status = "APPROVED";
  run.approvedBy = new mongoose.Types.ObjectId(user.userId);
  run.approvedAt = new Date();
  await run.save();
  return run;
}

export async function lockPayrollRun(
  runId: string,
  user: JWTPayload
): Promise<IPayrollRun> {
  return await withTransaction(async (session) => {
    const run = await PayrollRun.findById(runId).session(session ?? null);
    if (!run) throw new Error("Payroll run not found");
    if (run.status === "LOCKED") throw new Error("Payroll run is already locked");

    run.status = "LOCKED";
    run.approvedBy = run.approvedBy || new mongoose.Types.ObjectId(user.userId);
    run.lockedAt = new Date();
    await run.save({ session });

    // Lock all associated IncentiveLedger documents for that period
    const period = `${run.year}-${String(run.month).padStart(2, "0")}`;
    await IncentiveLedger.updateMany(
      { period },
      { $set: { isLocked: true } },
      { session }
    );

    return run;
  });
}

