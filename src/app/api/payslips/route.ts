import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { PayrollEntry } from "@/models/PayrollEntry";
import { PayrollRun } from "@/models/PayrollRun";
import { authenticateAndAuthorize, errorResponse, jsonResponse } from "@/lib/apiHelper";
import { getScopeFilter, hasPermission } from "@/lib/rbac";

/**
 * Payslips visible to the caller: their own, their team's (ASM) or everyone's
 * (BH and above). Staff without payroll access only ever see payslips from
 * APPROVED or LOCKED runs — never figures that are still being edited.
 */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "payslip.view.own");
    if (auth.error) return auth.error;

    const scope = await getScopeFilter(auth.user, "payslips");
    const canSeeDrafts = await hasPermission(auth.user.role, "payroll.view");
    const runFilter: Record<string, any> = canSeeDrafts ? {} : { status: { $in: ["APPROVED", "LOCKED"] } };
    const runs = await PayrollRun.find(runFilter).select("_id").lean();

    const mine = req.nextUrl.searchParams.get("mine") === "1";
    const query: Record<string, any> = {
      $and: [scope, { payrollRun: { $in: runs.map((r: any) => r._id) } }],
    };
    if (mine) query.$and.push({ employee: auth.user.userId });

    const entries = await PayrollEntry.find(query)
      .populate("payrollRun", "runCode month year status")
      .populate("employee", "name employeeCode role designation")
      .select("payslipCode grossPay netPay totalDeductions earnings.incentives paidDays workingDays payrollRun employee")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    return jsonResponse(entries);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to load payslips", 500);
  }
}
