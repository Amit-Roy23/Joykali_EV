import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { PayrollRun } from "@/models/PayrollRun";
import { generateDraftPayrollRun } from "@/services/payrollService";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { PayrollRunCreateSchema } from "@/validators";
import { logAudit } from "@/lib/audit";

// Heavy work (recalculation, PDFs, spreadsheets): allow up to 60s on Vercel.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "payroll.view");
    if (auth.error) return auth.error;

    const runs = await PayrollRun.find()
      .populate("createdBy", "name employeeCode")
      .populate("approvedBy", "name employeeCode")
      .sort({ year: -1, month: -1 })
      .lean();

    return jsonResponse(runs);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch payroll runs", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "payroll.run");
    if (auth.error) return auth.error;

    const body = await req.json();
    const parseResult = PayrollRunCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const { year, month, notes } = parseResult.data;

    const run = await generateDraftPayrollRun(year, month, auth.user, notes);

    await logAudit({
      user: auth.user,
      action: "CREATE",
      resource: "PAYROLL",
      resourceId: String(run._id),
      after: { runCode: run.runCode, status: run.status },
    });

    return jsonResponse(run, undefined, 201);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to generate payroll run", 500);
  }
}

