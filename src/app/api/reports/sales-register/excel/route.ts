import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { generateSalesRegisterExcel } from "@/services/reportService";
import { authenticateAndAuthorize, errorResponse } from "@/lib/apiHelper";
import { getScopeFilter } from "@/lib/rbac";

// Heavy work (recalculation, PDFs, spreadsheets): allow up to 60s on Vercel.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "reports.view");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const scopeFilter = await getScopeFilter(auth.user, "sales");
    const query: any = { ...scopeFilter };

    if (startDate || endDate) {
      query.saleDate = {};
      if (startDate) query.saleDate.$gte = new Date(startDate);
      if (endDate) query.saleDate.$lte = new Date(endDate);
    }

    const excelBuffer = await generateSalesRegisterExcel(query);

    return new NextResponse(new Uint8Array(excelBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Sales_Register_${Date.now()}.xlsx"`,
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to generate Sales Excel", 500);
  }
}

