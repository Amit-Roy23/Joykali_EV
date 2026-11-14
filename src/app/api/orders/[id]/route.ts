import { isPartnerRole } from "@/types";
import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { ChannelOrder } from "@/models/ChannelOrder";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { canAccessParty } from "@/lib/partyAccess";
import { approvalState, LEVEL_LABEL } from "@/lib/approval";
import { cancelOrder, orderDetail } from "@/services/orderService";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "order.view");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Order not found", 404);
    const head = await ChannelOrder.findById(id).select("partyType party").lean();
    if (!head || !(await canAccessParty(auth.user, head.partyType, head.party))) return errorResponse("Order not found", 404);
    const detail = await orderDetail(id);
    const st = approvalState(detail!.order.approvals);
    return jsonResponse({
      ...detail,
      approval: { status: detail!.order.status === "PENDING_APPROVAL" ? st.status : detail!.order.status, next: st.next, nextLabel: st.next ? LEVEL_LABEL[st.next] : null },
    });
  } catch (e) {
    return failure(e, "Failed to load order");
  }
}

/** { action: "cancel", reason } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "order.view");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Order not found", 404);
    const b = await req.json();
    if (b.action !== "cancel") return errorResponse("Unknown action", 400);
    if (!isPartnerRole(auth.user.role) && !["BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN", "ASM"].includes(auth.user.role)) {
      return errorResponse("Forbidden", 403);
    }
    return jsonResponse(await cancelOrder(id, b.reason, auth.user));
  } catch (e) {
    return failure(e, "Failed to update order");
  }
}
