import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { lockPayrollRun } from "@/services/payrollService";
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
    const auth = await authenticateAndAuthorize(req, "payroll.lock");
    if (auth.error) return auth.error;

    const { id } = await params;
    const run = await lockPayrollRun(id, auth.user);

    await logAudit({
      user: auth.user,
      action: "LOCK",
      resource: "PAYROLL",
      resourceId: id,
      after: { status: "LOCKED", lockedAt: run.lockedAt },
    });

    return jsonResponse(run);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to lock payroll run", 500);
  }
}

