import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { NetworkOrder } from "@/models/NetworkOrder";
import { PartnerSale } from "@/models/PartnerSale";
import { canSeeNetworkOrder, cancelNetworkOrder, decideNetworkOrder } from "@/services/networkService";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Order not found", 404);
    const order = await NetworkOrder.findById(id).lean();
    if (!order || !(await canSeeNetworkOrder(auth.user, order))) return errorResponse("Order not found", 404);
    const sales = await PartnerSale.find({ order: order._id }).select("saleCode invoiceNo status lines.chassisNumber totalValue saleDate").sort({ createdAt: 1 }).lean();
    return jsonResponse({ order, sales });
  } catch (e) {
    return failure(e, "Failed to load order");
  }
}

/** { action: "accept" | "reject" | "cancel", note } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { id } = await params;
    const b = await req.json();
    if (b.action === "accept") return jsonResponse(await decideNetworkOrder(auth.user, id, "ACCEPT", b.note));
    if (b.action === "reject") return jsonResponse(await decideNetworkOrder(auth.user, id, "REJECT", b.note));
    if (b.action === "cancel") return jsonResponse(await cancelNetworkOrder(auth.user, id, b.note));
    return errorResponse("Unknown action", 400);
  } catch (e) {
    return failure(e, "Failed to update order");
  }
}
