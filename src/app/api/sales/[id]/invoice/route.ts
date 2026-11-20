import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { getScopeFilter } from "@/lib/rbac";
import { authenticateAndAuthorize, errorResponse, isValidId } from "@/lib/apiHelper";
import { generateGstInvoicePDF, loadCompany, retailInvoiceData } from "@/services/invoicePdf";

// Heavy work (recalculation, PDFs, spreadsheets): allow up to 60s on Vercel.
export const maxDuration = 60;

/** GST invoice for a retail vehicle sale (with any accessories / parts billed on it). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Sale not found", 404);
    // Scoped lookup: an FSE/ASM gets 404 for sales outside their own/team scope.
    const scope = await getScopeFilter(auth.user, "sales");
    const sale = await Sale.findOne({ $and: [{ _id: id }, scope] })
      .populate({ path: "vehicle", populate: { path: "model" } })
      .populate("dealer", "name dealerCode")
      .populate("soldBy", "name employeeCode")
      .lean();
    if (!sale) return errorResponse("Sale not found", 404);

    const pdf = await generateGstInvoicePDF(retailInvoiceData(await loadCompany(), sale));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Invoice_${sale.saleCode.replace(/\//g, "_")}.pdf"`,
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to generate invoice", 500);
  }
}
