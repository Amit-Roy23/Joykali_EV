import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { PayrollRun } from "@/models/PayrollRun";
import { IncentiveScheme } from "@/models/IncentiveScheme";
import { User } from "@/models/User";
import { periodOf, periodFor } from "@/lib/period";
import { generateDraftPayrollRun } from "@/services/payrollService";
import { activateSalaryStructures } from "@/services/approvalService";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily job (Vercel Cron, see vercel.json). Idempotent:
 *  - switches salary structures whose effective month has arrived;
 *  - expires finished incentive schemes;
 *  - from the 1st of each month, drafts the previous month's payroll if it
 *    doesn't exist yet (salary + incentives calculated automatically). The draft
 *    still needs Business Head and Managing Partner approval.
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectToDatabase();
    const report: Record<string, unknown> = {};

    const employees = await User.find({ role: { $ne: "DISTRIBUTOR" } }).select("_id").lean();
    for (const e of employees) await activateSalaryStructures(e._id as any);
    report.salaryStructuresChecked = employees.length;

    const expired = await IncentiveScheme.updateMany({ status: "ACTIVE", validTo: { $lt: new Date() } }, { $set: { status: "EXPIRED" } });
    report.schemesExpired = expired.modifiedCount;

    const cur = periodOf(new Date());
    const prev = cur.month === 1 ? periodFor(cur.year - 1, 12) : periodFor(cur.year, cur.month - 1);
    const exists = await PayrollRun.findOne({ year: prev.year, month: prev.month }).select("runCode status").lean();
    if (exists) {
      report.payroll = `${exists.runCode} already exists (${exists.status})`;
    } else {
      const owner =
        (await User.findOne({ role: "BUSINESS_HEAD", status: "ACTIVE" }).lean()) ||
        (await User.findOne({ role: "ADMIN", status: "ACTIVE" }).lean());
      if (!owner) {
        report.payroll = "skipped — no active Business Head or Admin to own the run";
      } else {
        const run = await generateDraftPayrollRun(
          prev.year,
          prev.month,
          {
            userId: String(owner._id),
            employeeCode: owner.employeeCode,
            email: owner.email,
            name: owner.name,
            role: owner.role as any,
          },
          "Auto-generated on the 1st by the monthly payroll job — review, then BH and MP approve."
        );
        report.payroll = `${run.runCode} drafted for ${run.totals.totalEmployees} employees`;
      }
    }
    return NextResponse.json({ ok: true, ...report });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
