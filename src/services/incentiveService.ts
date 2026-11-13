import mongoose from "mongoose";
import { IncentiveScheme } from "@/models/IncentiveScheme";
import { IncentiveLedger } from "@/models/IncentiveLedger";
import { Sale } from "@/models/Sale";
import { User } from "@/models/User";
import { PayrollRun } from "@/models/PayrollRun";
import { PayrollEntry } from "@/models/PayrollEntry";
import { Setting } from "@/models/Setting";
import { computeIncentives } from "./incentiveEngine";
import { calculatePayrollEntry, statutorySettingsFrom } from "./payrollEngine";
import { periodOf, periodsBetween } from "@/lib/period";
import { UserRole } from "@/types";

export interface RecalcOptions {
  /**
   * Push the new incentive figures into any open (DRAFT / UNDER_REVIEW)
   * payroll run for the same month, so payouts update automatically.
   * Approved and locked runs are never touched.
   */
  syncPayroll?: boolean;
}

/**
 * Recalculate and persist the IncentiveLedger of the given employees for the
 * IST month containing `date`. Locked ledgers (paid out in a locked payroll
 * run) are left untouched.
 */
export async function recalculateIncentivesForPeriod(
  employeeIds: Array<string | mongoose.Types.ObjectId>,
  date: Date,
  options: RecalcOptions = { syncPayroll: true }
): Promise<void> {
  const { period, start: periodStart, end: periodEnd } = periodOf(date);

  const activeSchemes = await IncentiveScheme.find({
    status: { $in: ["ACTIVE", "EXPIRED"] },
    validFrom: { $lte: periodEnd },
    validTo: { $gte: periodStart },
  }).lean();

  const monthSales = await Sale.find({
    saleDate: { $gte: periodStart, $lte: periodEnd },
    status: "DELIVERED",
  })
    .populate("vehicle")
    .lean();

  const formattedSales = monthSales.map((s: any) => ({
    _id: String(s._id),
    saleCode: s.saleCode,
    saleDate: s.saleDate,
    soldBy: String(s.soldBy),
    asmAtSale: s.asmAtSale ? String(s.asmAtSale) : null,
    modelId: String(s.vehicle?.model || ""),
    dealerId: s.dealer ? String(s.dealer) : null,
    exShowroom: s.priceBreakdown?.exShowroom || 0,
    totalAmount: s.totalAmount || 0,
    status: s.status,
  }));

  const updated: mongoose.Types.ObjectId[] = [];

  for (const empId of employeeIds) {
    if (!empId) continue;
    const employee = await User.findById(empId).lean();
    if (!employee) continue;

    const existingLedger = await IncentiveLedger.findOne({
      employee: employee._id,
      period,
    }).lean();
    if (existingLedger?.isLocked) continue;

    const output = computeIncentives(
      {
        _id: String(employee._id),
        employeeCode: employee.employeeCode,
        name: employee.name,
        role: employee.role as UserRole,
        reportsTo: employee.reportsTo ? String(employee.reportsTo) : null,
      },
      formattedSales,
      activeSchemes,
      periodStart,
      periodEnd
    );

    const breakdownItems: any[] = [];
    const countedSales = new Set<string>();
    for (const sc of output.schemes) {
      for (const r of sc.rulesBreakdown) {
        breakdownItems.push({
          schemeId: new mongoose.Types.ObjectId(sc.schemeId),
          schemeName: sc.schemeName,
          ruleType: r.ruleType,
          unitsCount: r.qualifyingUnits,
          revenueCount: r.qualifyingRevenue,
          earnedAmount: r.earnedAmount,
          description: r.description,
        });
        // A sale that qualifies under several rules is still one unit.
        r.qualifyingSaleCodes.forEach((c) => countedSales.add(c));
      }
    }

    await IncentiveLedger.findOneAndUpdate(
      { employee: employee._id, period },
      {
        employee: employee._id,
        period,
        totalEarned: output.totalIncentiveEarned,
        totalUnits: countedSales.size,
        breakdown: breakdownItems,
        isLocked: false,
        calculatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
    updated.push(employee._id as mongoose.Types.ObjectId);
  }

  if (options.syncPayroll !== false && updated.length > 0) {
    await syncOpenPayrollIncentives(period, updated);
  }
}

/**
 * Recalculate every active employee's ledger for each month a scheme covers,
 * up to the current month. Used when a scheme is approved or archived.
 */
export async function recalculateForScheme(scheme: {
  validFrom: Date;
  validTo: Date;
}): Promise<string[]> {
  const now = new Date();
  const to = scheme.validTo < now ? scheme.validTo : now;
  if (scheme.validFrom > to) return [];
  const employees = await User.find({ status: "ACTIVE", role: { $ne: "DISTRIBUTOR" } }, { _id: 1 }).lean();
  const ids = employees.map((e: any) => e._id);
  const periods = periodsBetween(scheme.validFrom, to);
  for (const p of periods) {
    await recalculateIncentivesForPeriod(ids, p.start);
  }
  return periods.map((p) => p.period);
}

/**
 * Re-price the incentive line of open payroll entries for a month from the
 * latest ledger, keeping any manual adjustments, LOP and TDS already entered.
 */
export async function syncOpenPayrollIncentives(
  period: string,
  employeeIds: mongoose.Types.ObjectId[]
): Promise<number> {
  const [year, month] = period.split("-").map(Number);
  const run = await PayrollRun.findOne({
    year,
    month,
    status: { $in: ["DRAFT", "UNDER_REVIEW"] },
  });
  if (!run) return 0;

  const setting = await Setting.findOne().lean();
  const statutory = statutorySettingsFrom(setting?.statutoryDeductions);

  const entries = await PayrollEntry.find({
    payrollRun: run._id,
    employee: { $in: employeeIds },
  });

  for (const entry of entries) {
    const ledger = await IncentiveLedger.findOne({
      employee: entry.employee,
      period,
    }).lean();
    const snap = entry.salaryStructureSnapshot || {};
    const calc = calculatePayrollEntry({
      salary: {
        basic: snap.basic || 0,
        hra: snap.hra || 0,
        conveyance: snap.conveyance || 0,
        otherAllowances: snap.otherAllowances || 0,
        fixedDeductions: snap.fixedDeductions || {},
      },
      workingDays: entry.workingDays,
      lopDays: entry.lopDays,
      incentives: ledger?.totalEarned || 0,
      incentiveBreakdown: (ledger?.breakdown || []).map((b: any) => ({
        schemeId: String(b.schemeId),
        schemeName: b.schemeName,
        amount: b.earnedAmount,
      })),
      adjustments: (entry.adjustments || []).map((a) => ({
        amount: a.amount,
        reason: a.reason,
      })),
      tds: entry.deductions?.tds || 0,
      advanceRecovery: entry.deductions?.advanceRecovery || 0,
      settings: statutory,
    });
    entry.earnings = calc.earnings as any;
    entry.deductions = calc.deductions;
    entry.grossPay = calc.grossPay;
    entry.totalDeductions = calc.totalDeductions;
    entry.netPay = calc.netPay;
    await entry.save();
  }

  const all = await PayrollEntry.find({ payrollRun: run._id }).lean();
  run.totals = {
    totalGross: all.reduce((s, e) => s + e.grossPay, 0),
    totalDeductions: all.reduce((s, e) => s + e.totalDeductions, 0),
    totalNet: all.reduce((s, e) => s + e.netPay, 0),
    totalEmployees: all.length,
  };
  await run.save();
  return entries.length;
}
