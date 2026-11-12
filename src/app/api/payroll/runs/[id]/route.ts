import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { PayrollRun } from "@/models/PayrollRun";
import { PayrollEntry } from "@/models/PayrollEntry";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { getScopeFilter } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const { id } = await params;
    const run = await PayrollRun.findById(id)
      .populate("createdBy", "name employeeCode")
      .populate("approvedBy", "name employeeCode")
      .lean();

    if (!run) return errorResponse("Payroll run not found", 404);

    const scopeFilter = await getScopeFilter(auth.user, "payslips");
    const query: any = { payrollRun: run._id, ...scopeFilter };

    const entries = await PayrollEntry.find(query)
      .populate("employee", "name employeeCode role designation email phone")
      .sort({ "employee.role": 1, "employee.name": 1 })
      .lean();

    return jsonResponse({
      run,
      entries,
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch payroll details", 500);
  }
}

