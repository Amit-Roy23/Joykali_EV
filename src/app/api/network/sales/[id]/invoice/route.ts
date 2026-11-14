import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId } from "@/lib/apiHelper";
import { PartnerSale } from "@/models/PartnerSale";
import { Vehicle } from "@/models/Vehicle";
import { canSeePartnerSale } from "@/services/networkService";
import { getParty } from "@/services/creditService";
import { generateChannelDocPDF } from "@/services/channelDocPdf";

export const maxDuration = 60;

/** The selling partner's tax invoice for a network or retail sale (same layout as company invoices). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Not found", 404);
    const s: any = await PartnerSale.findById(id).lean();
    if (!s || !(await canSeePartnerSale(auth.user, s))) return errorResponse("Not found", 404);
    const seller: any = await getParty(s.sellerType, s.seller);
    const buyer: any = s.buyer ? await getParty(s.buyerKind, s.buyer) : null;
    const vehicles = await Vehicle.find({ _id: { $in: s.lines.map((l: any) => l.vehicle) } }).select("chassisNumber motorNumber batteryNumber model").lean();
    const grouped = new Map<string, any>();
    for (const l of s.lines) {
      const k = `${l.model}|${l.unitPrice}`;
      const g = grouped.get(k) || { model: l.model, modelName: l.modelName, hsnCode: l.hsnCode, quantity: 0, unitPrice: l.unitPrice, gstRate: l.gstRate };
      g.quantity += 1;
      grouped.set(k, g);
    }
    const pdf = await generateChannelDocPDF({
      company: {
        name: seller?.name || s.sellerName,
        address: seller?.address || "",
        city: seller?.city || "",
        state: seller?.state || "",
        pincode: seller?.pincode || "",
        stateCode: s.sellerStateCode,
        gstin: s.sellerGstin,
        pan: (s.sellerGstin || "").slice(2, 12),
        phone: seller?.phone,
        email: seller?.email,
      },
      d: {
        doCode: s.saleCode,
        orderCode: s.saleCode,
        document: { kind: "TAX_INVOICE", number: s.invoiceNo || s.saleCode, date: s.saleDate },
        partySnapshot: {
          name: s.buyerName,
          code: s.buyerCode || s.customer?.phone || "",
          address: buyer?.address || s.customer?.address || "",
          city: buyer?.city || "",
          pincode: buyer?.pincode || "",
          gstin: s.buyerGstin || "Unregistered",
          stateCode: s.buyerStateCode,
        },
        lines: [...grouped.values()],
        vehicles: vehicles.map((v: any) => ({ ...v, model: v.model })),
        ewayBill: null,
        loading: null,
      },
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${String(s.invoiceNo || s.saleCode).replace(/[\\/]/g, "_")}.pdf"`,
      },
    });
  } catch (e) {
    return failure(e, "Failed to generate invoice");
  }
}
