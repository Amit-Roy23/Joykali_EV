import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { PartnerSale } from "@/models/PartnerSale";
import { canSeePartnerSale as canSeeSale, cancelPartnerSale, receivePartnerSale } from "@/services/networkService";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Sale not found", 404);
    const sale = await PartnerSale.findById(id).lean();
    if (!sale || !(await canSeeSale(auth.user, sale))) return errorResponse("Sale not found", 404);
    return jsonResponse(sale);
  } catch (e) {
    return failure(e, "Failed to load sale");
  }
}

/** { action: "receive", remarks, shortVehicleIds } | { action: "cancel", reason } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { id } = await params;
    const b = await req.json();
    if (b.action === "receive") return jsonResponse(await receivePartnerSale(auth.user, id, b));
    if (b.action === "cancel") return jsonResponse(await cancelPartnerSale(auth.user, id, b.reason));
    return errorResponse("Unknown action", 400);
  } catch (e) {
    return failure(e, "Failed to update sale");
  }
}
