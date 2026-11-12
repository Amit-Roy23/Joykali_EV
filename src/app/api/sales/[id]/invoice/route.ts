import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { getScopeFilter } from "@/lib/rbac";
import { Setting } from "@/models/Setting";
import { generateInvoicePDF } from "@/services/pdfService";
import { authenticateAndAuthorize, errorResponse, isValidId } from "@/lib/apiHelper";

// Heavy work (recalculation, PDFs, spreadsheets): allow up to 60s on Vercel.
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Sale not found", 404);
    // Scoped lookup: an FEC/ASM gets 404 for sales outside their own/team scope.
    const scope = await getScopeFilter(auth.user, "sales");
    const sale = await Sale.findOne({ $and: [{ _id: id }, scope] })
      .populate({
        path: "vehicle",
        populate: { path: "model" },
      })
      .populate("dealer")
      .lean();

    if (!sale) return errorResponse("Sale not found", 404);

    const dbSetting = await Setting.findOne().lean();
    const company = {
      name: dbSetting?.companyName || "Joykali EV Mobility",
      address: dbSetting?.address || "NH-34, EV Hub, Barasat",
      city: dbSetting?.city || "Kolkata",
      state: dbSetting?.state || "West Bengal",
      pincode: dbSetting?.pincode || "700124",
      gstin: dbSetting?.gstin || "19AAACJ1234F1Z5",
      pan: dbSetting?.pan || "AAACJ1234F",
      phone: dbSetting?.phone || "+91 98765 43210",
      email: dbSetting?.email || "contact@joykaliev.in",
      invoiceTerms: dbSetting?.invoiceTerms || [
        "Goods once sold will not be taken back without authorization.",
        "Warranty as per OEM manufacturer terms & conditions.",
        "Disputes subject to Kolkata jurisdiction only.",
      ],
    };

    const v = sale.vehicle as any;
    const m = v?.model as any;
    const d = sale.dealer as any;

    const pdfBuffer = await generateInvoicePDF({
      company,
      sale: {
        saleCode: sale.saleCode,
        saleDate: sale.saleDate,
        paymentMode: sale.paymentMode,
        customer: sale.customer,
        vehicle: {
          modelName: m?.name || "EV Model",
          variant: m?.variant || "Standard",
          category: m?.category || "2W",
          color: v?.color || "Standard",
          chassisNumber: v?.chassisNumber || "N/A",
          motorNumber: v?.motorNumber || "N/A",
          batteryNumber: v?.batteryNumber || "N/A",
          chargerNumber: v?.chargerNumber,
        },
        dealer: d
          ? {
              name: d.name,
              gstin: d.gstin,
              address: `${d.address}, ${d.city}`,
            }
          : null,
        priceBreakdown: sale.priceBreakdown,
        totalAmount: sale.totalAmount,
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Invoice_${sale.saleCode.replace(/\//g, "_")}.pdf"`,
      },
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to generate invoice", 500);
  }
}
