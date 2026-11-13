import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { Setting } from "@/models/Setting";
import { authenticateAndAuthorize, errorResponse, failure, isValidId } from "@/lib/apiHelper";
import { canAccessParty, distributorOf } from "@/lib/partyAccess";
import { generateChannelDocPDF } from "@/services/channelDocPdf";

export const maxDuration = 60;

/** Tax invoice (distributor) or delivery challan (dealer) PDF. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "dispatch.view");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Not found", 404);
    const d: any = await DeliveryOrder.findById(id).lean();
    if (!d) return errorResponse("Not found", 404);
    if (auth.user.role === "DISTRIBUTOR") {
      const own = await distributorOf(auth.user);
      if (d.partyType !== "DISTRIBUTOR" || String(own) !== String(d.party)) return errorResponse("Not found", 404);
    } else if (!(await canAccessParty(auth.user, d.partyType, d.party))) return errorResponse("Not found", 404);
    if (!d.document?.number) return errorResponse("The invoice/challan has not been generated yet", 409);
    const s: any = await Setting.findOne().lean();
    const pdf = await generateChannelDocPDF({
      company: {
        name: s?.companyName || "Joykali EV Mobility",
        address: s?.address || "",
        city: s?.city || "Kolkata",
        state: s?.state || "West Bengal",
        pincode: s?.pincode || "",
        stateCode: s?.stateCode || "19",
        gstin: s?.gstin || "",
        pan: s?.pan || "",
        phone: s?.phone,
        email: s?.email,
      },
      d,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${d.document.number.replace(/\//g, "_")}.pdf"`,
      },
    });
  } catch (e) {
    return failure(e, "Failed to generate document");
  }
}
