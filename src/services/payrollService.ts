import { PayrollRun, IPayrollRun } from "@/models/PayrollRun";
import { PayrollEntry, IPayrollEntry } from "@/models/PayrollEntry";
import { User } from "@/models/User";
import { SalaryStructure } from "@/models/SalaryStructure";
import { IncentiveLedger } from "@/models/IncentiveLedger";
import { Setting } from "@/models/Setting";
import { generatePayrollRunCode, generatePayslipCode } from "@/lib/codeGenerator";
import { legacyFields } from "./salaryTemplateEngine";
import { setupFor } from "./salaryTemplateService";
import { applyCalc, ensureSnapshotSetup, monthLines, runPayslip } from "./payrollCalc";
import { recalculateIncentivesForPeriod } from "./incentiveService";
import { periodFor } from "@/lib/period";
import { withTransaction } from "@/lib/db";
import { JWTPayload, EMPLOYEE_ROLES } from "@/types";
import { rupeesToPaise } from "@/lib/money";
import { hrPayrollInputs, settleHrOnPayrollLock } from "./hrMoneyService";
import mongoose from "mongoose";

export async function generateDraftPayrollRun(
  year: number,
  month: number,
  user: JWTPayload,
  notes?: string
): Promise<IPayrollRun> {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Month must be between 1 and 12");
  }
  const { period, start: periodStart, daysInMonth } = periodFor(year, month);

  // Refresh incentive ledgers first, outside the payroll transaction, so the
  // run is generated from up-to-date figures (and the transaction stays short).
  const activeForRecalc = await User.find({ status: "ACTIVE", role: { $in: [...EMPLOYEE_ROLES] } }, { _id: 1 }).lean();
  await recalculateIncentivesForPeriod(
    activeForRecalc.map((e: any) => e._id),
    periodStart,
    { syncPayroll: false }
  );

  return await withTransaction(async (session) => {
    const runCode = generatePayrollRunCode(year, month);
    const existingRun = await PayrollRun.findOne({ year, month }).session(session ?? null);

    if (existingRun && existingRun.status === "LOCKED") {
      throw new Error(`Payroll run for ${runCode} is LOCKED and cannot be regenerated`);
    }

    // Salary columns and PF / ESI / PT options in force for this month.
    const setup = await setupFor(period);

    // Fetch active employees
    // Employees only — distributor logins are external partners, not on payroll.
    const employees = await User.find({ status: "ACTIVE", role: { $in: [...EMPLOYEE_ROLES] } }).session(session ?? null).lean();
    const periodEnd = periodFor(year, month).end;

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
      payrollRun.approvals = [];
      payrollRun.approvedBy = undefined;
      payrollRun.approvedAt = undefined;
      payrollRun.notes = notes || payrollRun.notes;
    }
    const includedEmployees: mongoose.Types.ObjectId[] = [];

    let totalGrossPaise = 0;
    let totalDeductionsPaise = 0;
    let totalNetPaise = 0;

    for (const emp of employees) {
      // Find salary structure
      // The approved structure in force for this month (effective-dated, so
      // re-running an old month uses the salary that applied then).
      const salaryStruct = await SalaryStructure.findOne({
        employee: emp._id,
        status: { $in: ["APPROVED", "SUPERSEDED", null] },
        effectiveFrom: { $lte: periodEnd },
      })
        .session(session ?? null)
        .sort({ effectiveFrom: -1, createdAt: -1 })
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

      const workingDays = existingEntry?.workingDays || daysInMonth;
      // HR feeds: attendance loss of pay, approved overtime, approved claims, loan / advance EMIs.
      const earningsFull = monthLines(salaryStruct, setup);
      const hr = await hrPayrollInputs(emp, period, legacyFields(earningsFull), emp.role);
      const manualLop = existingEntry?.hrAuto?.lopFromAttendance ? 0 : existingEntry?.lopDays || 0;
      const lopDays = hr.lopDays != null ? hr.lopDays : manualLop;
      const manualAdjustments = (existingEntry?.adjustments || []).filter((a: any) => !a.auto);
      const systemUser = new mongoose.Types.ObjectId(user.userId);
      const autoAdjustments = [
        ...(hr.otPay > 0 ? [{ amount: hr.otPay, reason: `Overtime ${(hr.otMinutes / 60).toFixed(1)} h (approved)`, addedBy: systemUser, addedAt: new Date(), auto: true }] : []),
        ...hr.claims.map((c) => ({ amount: c.amount, reason: `Reimbursement ${c.code}`, addedBy: systemUser, addedAt: new Date(), auto: true })),
      ];
      const adjustments = [...manualAdjustments, ...autoAdjustments];
      const tds = existingEntry?.deductions?.tds || 0;
      const loanRecovery = hr.loans.reduce((s, l) => s + l.amount, 0);
      const advanceRecovery = hr.loans.length ? loanRecovery : existingEntry?.hrAuto?.loans?.length ? 0 : existingEntry?.deductions?.advanceRecovery || 0;

      const snapshot = {
        ...salaryStruct,
        setup: { source: setup.source, templateId: setup.templateId, earnings: earningsFull, deductions: setup.components.filter((c) => c.kind === "DEDUCTION"), statutory: setup.statutory },
      };
      const calc = runPayslip(snapshot, { workingDays, lopDays, incentives: incentiveEarned, incentiveBreakdown, adjustments, tds, advanceRecovery });

      const payslipCode = generatePayslipCode(year, month, emp.employeeCode);

      await PayrollEntry.findOneAndUpdate(
        { payrollRun: payrollRun._id, employee: emp._id },
        {
          payrollRun: payrollRun._id,
          employee: emp._id,
          payslipCode,
          salaryStructureSnapshot: snapshot,
          workingDays: calc.workingDays,
          lopDays: calc.lopDays,
          paidDays: calc.paidDays,
          earnings: calc.earnings,
          deductions: calc.deductions,
          earningLines: calc.earningLines,
          deductionLines: calc.deductionLines,
          employer: calc.employer,
          pfWage: calc.pfWage,
          esiWage: calc.esiWage,
          adjustments,
          hrAuto: {
            lopFromAttendance: hr.lopDays != null,
            attendance: hr.attendance,
            otMinutes: hr.otMinutes,
            otPay: hr.otPay,
            claims: hr.claims,
            loans: hr.loans,
          },
          grossPay: calc.grossPay,
          totalDeductions: calc.totalDeductions,
          netPay: calc.netPay,
        },
        { upsert: true, new: true, session }
      );

      totalGrossPaise += calc.grossPay;
      totalDeductionsPaise += calc.totalDeductions;
      totalNetPaise += calc.netPay;
      includedEmployees.push(emp._id as mongoose.Types.ObjectId);
    }

    // Drop entries of employees who left / lost their salary structure since
    // the last generation, so totals and payslips match the current roster.
    await PayrollEntry.deleteMany(
      { payrollRun: payrollRun._id, employee: { $nin: includedEmployees } },
      { session }
    );

    payrollRun.totals = {
      totalGross: totalGrossPaise,
      totalDeductions: totalDeductionsPaise,
      totalNet: totalNetPaise,
      totalEmployees: includedEmployees.length,
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

    const workingDays = data.workingDays ?? entry.workingDays;
    if (data.lopDays !== undefined && data.lopDays < 0) {
      throw new Error("LOP days cannot be negative");
    }
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

    await ensureSnapshotSetup(entry, session);
    const calc = runPayslip(entry.salaryStructureSnapshot, {
      workingDays,
      lopDays,
      incentives: entry.earnings.incentives,
      incentiveBreakdown: entry.earnings.incentiveBreakdown.map((b) => ({
        schemeId: String(b.schemeId),
        schemeName: b.schemeName,
        amount: b.amount,
      })),
      adjustments,
      tds: tdsPaise,
      advanceRecovery: advanceRecoveryPaise,
    });

    applyCalc(entry, calc);
    entry.adjustments = adjustments;
    await entry.save({ session });

    // Recalculate run totals
    const allEntries = await PayrollEntry.find({ payrollRun: run._id }).session(session ?? null);
    run.totals = {
      totalGross: allEntries.reduce((s, e) => s + e.grossPay, 0),
      totalDeductions: allEntries.reduce((s, e) => s + e.totalDeductions, 0),
      totalNet: allEntries.reduce((s, e) => s + e.netPay, 0),
      totalEmployees: allEntries.length,
    };
    // Changing any figure invalidates every signature collected so far.
    if (run.status === "APPROVED" || run.status === "UNDER_REVIEW" || (run.approvals?.length ?? 0) > 0) {
      run.status = "DRAFT";
      run.approvals = [];
      run.approvedBy = undefined;
      run.approvedAt = undefined;
    }
    await run.save({ session });

    return entry;
  });
}

/**
 * Kept for older callers; approval now always goes through the two-signature
 * workflow (Business Head, then Managing Partner).
 */
export async function approvePayrollRun(runId: string, user: JWTPayload) {
  const { signApproval } = await import("./approvalService");
  return signApproval("payroll", runId, user, "APPROVED");
}

export async function lockPayrollRun(
  runId: string,
  user: JWTPayload
): Promise<IPayrollRun> {
  const locked = await withTransaction(async (session) => {
    const run = await PayrollRun.findById(runId).session(session ?? null);
    if (!run) throw new Error("Payroll run not found");
    if (run.status === "LOCKED") throw new Error("Payroll run is already locked");
    // Workflow is DRAFT -> APPROVED -> LOCKED; locking an unapproved run would
    // let payslips be finalised without the Managing Partner's sign-off.
    if (run.status !== "APPROVED") {
      throw new Error("Payroll run must be APPROVED before it can be locked");
    }

    run.status = "LOCKED";
    run.lockedBy = new mongoose.Types.ObjectId(user.userId);
    run.lockedAt = new Date();
    await run.save({ session });

    // Book loan / advance recoveries and mark reimbursed claims as paid.
    const entries = await PayrollEntry.find({ payrollRun: run._id }).select("employee hrAuto").session(session ?? null).lean();
    await settleHrOnPayrollLock(`${run.year}-${String(run.month).padStart(2, "0")}`, run._id, entries as any, session);

    // Lock all associated IncentiveLedger documents for that period
    const period = `${run.year}-${String(run.month).padStart(2, "0")}`;
    await IncentiveLedger.updateMany(
      { period },
      { $set: { isLocked: true } },
      { session }
    );

    return run;
  });
  // Salaries are now due: tell Accounts (Payments desk).
  const { notifyRoles } = await import("./notificationService");
  await notifyRoles(
    ["ACCOUNTANT"],
    {
      kind: "payment",
      title: `Salaries ready to pay: ${locked.runCode}`,
      body: `Payroll locked — ${locked.totals?.totalEmployees || 0} staff, net ₹${Math.round((locked.totals?.totalNet || 0) / 100).toLocaleString("en-IN")}. Pay it from Accounts → Payments desk.`,
      href: "/accounts",
    },
    user.userId
  );
  return locked;
}

