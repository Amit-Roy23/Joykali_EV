import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { PayrollRun } from "@/models/PayrollRun";
import { PayrollEntry } from "@/models/PayrollEntry";
import { Setting } from "@/models/Setting";
import { generateBulkPayslipsZIP, PayslipPDFProps } from "@/services/pdfService";
import { authenticateAndAuthorize, errorResponse } from "@/lib/apiHelper";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "payslip.download");
    if (auth.error) return auth.error;

    const { id } = await params;
    const run = await PayrollRun.findById(id).lean();
    if (!run) return errorResponse("Payroll run not found", 404);

    const entries = await PayrollEntry.find({ payrollRun: run._id })
      .populate("employee")
      .lean();

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
