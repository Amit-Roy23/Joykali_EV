import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { adjustPayrollEntry } from "@/services/payrollService";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { PayrollAdjustSchema } from "@/validators";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "payroll.adjust");
    if (auth.error) return auth.error;

    const body = await req.json();
    const parseResult = PayrollAdjustSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const { entryId, workingDays, lopDays, adjustment, tds, advanceRecovery } =
      parseResult.data;

    const updated = await adjustPayrollEntry(
      entryId,
      { workingDays, lopDays, adjustment, tds, advanceRecovery },
      auth.user
    );

    await logAudit({
      user: auth.user,
      action: "UPDATE",
      resource: "PAYROLL",
      resourceId: entryId,
      after: {
        workingDays: updated.workingDays,
        lopDays: updated.lopDays,
        grossPay: updated.grossPay,
        netPay: updated.netPay,
      },
    });

    return jsonResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to adjust payroll entry", 500);
  }
}

