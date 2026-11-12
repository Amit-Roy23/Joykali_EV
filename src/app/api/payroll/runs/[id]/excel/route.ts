import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { generatePayrollRegisterExcel } from "@/services/reportService";
import { authenticateAndAuthorize, errorResponse } from "@/lib/apiHelper";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "payroll.view");
    if (auth.error) return auth.error;

    const { id } = await params;
    const excelBuffer = await generatePayrollRegisterExcel(id);

    return new NextResponse(new Uint8Array(excelBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Payroll_Register_${id}.xlsx"`,
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to generate Excel", 500);
  }
}

