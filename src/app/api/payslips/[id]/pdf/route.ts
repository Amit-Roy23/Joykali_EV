import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { PayrollEntry } from "@/models/PayrollEntry";
import { PayrollRun } from "@/models/PayrollRun";
import { Setting } from "@/models/Setting";
import { generatePayslipPDF } from "@/services/pdfService";
import { authenticateAndAuthorize, errorResponse } from "@/lib/apiHelper";
import { hasPermission } from "@/lib/rbac";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const { id } = await params;
    const entry = await PayrollEntry.findById(id)
      .populate("employee")
      .populate("payrollRun")
      .lean();

    if (!entry) return errorResponse("Payslip entry not found", 404);

    const emp = entry.employee as any;
    const run = entry.payrollRun as any;

    // Permissions check: user can view own; with team permission can view downline; admin/MP can view all
    const isOwn = String(emp._id) === String(auth.user.userId);
    const canViewAll = await hasPermission(auth.user.role, "payslip.view.all");
    const canViewTeam = await hasPermission(auth.user.role, "payslip.view.team");

    if (!isOwn && !canViewAll && !canViewTeam) {
      return errorResponse("Forbidden: You cannot view this payslip", 403);
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
