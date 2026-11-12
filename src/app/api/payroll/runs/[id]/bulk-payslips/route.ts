import { NextRequest, NextResponse } from "next/server";
import { getScopeFilter, hasPermission } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import { PayrollRun } from "@/models/PayrollRun";
import { PayrollEntry } from "@/models/PayrollEntry";
import { Setting } from "@/models/Setting";
import { generateBulkPayslipsZIP, PayslipPDFProps } from "@/services/pdfService";
import { authenticateAndAuthorize, errorResponse, isValidId } from "@/lib/apiHelper";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "payslip.download");
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Payroll run not found", 404);
    const run = await PayrollRun.findById(id).lean();
    if (!run) return errorResponse("Payroll run not found", 404);
    if (!["APPROVED", "LOCKED"].includes(run.status) && !(await hasPermission(auth.user.role, "payroll.view"))) {
      return errorResponse("Payslips for this run are not released yet", 403);
    }

    // Only include payslips the caller is allowed to see (own / team / all).
    const scope = await getScopeFilter(auth.user, "payslips");
    const entries = await PayrollEntry.find({ payrollRun: run._id, ...scope })
      .populate("employee")
      .lean();

    if (entries.length === 0) return errorResponse("No payslips available for you in this run", 404);

    const dbSetting = await Setting.findOne().lean();
    const company = {
      name: dbSetting?.companyName || "Joykali EV Mobility",
      address: dbSetting?.address || "NH-34, EV Hub, Barasat",
      city: dbSetting?.city || "Kolkata",
      state: dbSetting?.state || "West Bengal",
      pincode: dbSetting?.pincode || "700124",
      gstin: dbSetting?.gstin || "19AAACJ1234F1Z5",
      pan: dbSetting?.pan || "AAACJ1234F",
    };

    const payslipInputs: PayslipPDFProps[] = entries.map((entry: any) => {
      const emp = entry.employee;
      const snap = entry.salaryStructureSnapshot || {};
      return {
        company,
        employee: {
          name: emp.name,
          employeeCode: emp.employeeCode,
          designation: emp.designation,
          pan: snap.pan || emp.pan || "N/A",
          bankName: snap.bankDetails?.bankName || "N/A",
          accountNo: snap.bankDetails?.accountNo || "",
          ifsc: snap.bankDetails?.ifsc || "N/A",
        },
        payroll: {
          runCode: run.runCode,
          payslipCode: entry.payslipCode,
          month: run.month,
          year: run.year,
          workingDays: entry.workingDays,
          paidDays: entry.paidDays,
          lopDays: entry.lopDays,
        },
        earnings: entry.earnings,
        deductions: entry.deductions,
        grossPay: entry.grossPay,
        totalDeductions: entry.totalDeductions,
        netPay: entry.netPay,
      };
    });

    const zipBuffer = await generateBulkPayslipsZIP(payslipInputs, run.runCode);

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Payslips_${run.runCode}.zip"`,
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to generate bulk payslips ZIP", 500);
  }
}
