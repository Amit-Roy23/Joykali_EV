import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { generatePurchaseRegisterExcel } from "@/services/reportService";
import { authenticateAndAuthorize, errorResponse } from "@/lib/apiHelper";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "reports.view");
    if (auth.error) return auth.error;

    const excelBuffer = await generatePurchaseRegisterExcel();

    return new NextResponse(new Uint8Array(excelBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Purchase_Register_${Date.now()}.xlsx"`,
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to generate Purchase Excel", 500);
  }
}

