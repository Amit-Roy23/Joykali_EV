import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { PayrollEntry } from "@/models/PayrollEntry";
import { PayrollRun } from "@/models/PayrollRun";
import { Setting } from "@/models/Setting";
import { generatePayslipPDF } from "@/services/pdfService";
import { authenticateAndAuthorize, errorResponse, isValidId } from "@/lib/apiHelper";
import { getScopeFilter, hasPermission } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Payslip entry not found", 404);
    // Scoped lookup: own payslip, downline payslips (ASM), or all (BH and above).
    const scope = await getScopeFilter(auth.user, "payslips");
    const entry = await PayrollEntry.findOne({ $and: [{ _id: id }, scope] })
      .populate("employee")
      .populate("payrollRun")
      .lean();

    if (!entry) return errorResponse("Payslip entry not found", 404);

    const emp = entry.employee as any;
    const run = entry.payrollRun as any;

    // Employees without payroll access can't download a payslip that is still a draft.
    if (!["APPROVED", "LOCKED"].includes(run?.status) && !(await hasPermission(auth.user.role, "payroll.view"))) {
      return errorResponse("This payslip is not released yet", 403);
    }

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

    const snap = entry.salaryStructureSnapshot || {};

    const pdfBuffer = await generatePayslipPDF({
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
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Payslip_${entry.payslipCode.replace(/\//g, "_")}.pdf"`,
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to generate payslip PDF", 500);
  }
}
