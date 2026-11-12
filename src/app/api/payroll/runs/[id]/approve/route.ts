import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { approvePayrollRun } from "@/services/payrollService";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { logAudit } from "@/lib/audit";

// Heavy work (recalculation, PDFs, spreadsheets): allow up to 60s on Vercel.
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "payroll.approve");
    if (auth.error) return auth.error;

    const { id } = await params;
    const run = await approvePayrollRun(id, auth.user);

    await logAudit({
      user: auth.user,
      action: "APPROVE",
      resource: "PAYROLL",
      resourceId: id,
      after: { status: "APPROVED", approvedBy: auth.user.employeeCode },
    });

    return jsonResponse(run);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to approve payroll run", 500);
  }
}

