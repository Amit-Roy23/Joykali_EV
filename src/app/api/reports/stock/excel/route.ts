import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { generateStockReportExcel } from "@/services/reportService";
import { authenticateAndAuthorize, errorResponse } from "@/lib/apiHelper";

// Heavy work (recalculation, PDFs, spreadsheets): allow up to 60s on Vercel.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "reports.view");
    if (auth.error) return auth.error;

    const excelBuffer = await generateStockReportExcel();

    return new NextResponse(new Uint8Array(excelBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Stock_Report_${Date.now()}.xlsx"`,
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to generate Stock Excel", 500);
  }
}

