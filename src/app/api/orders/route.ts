import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { ChannelOrder } from "@/models/ChannelOrder";
import { authenticateAndAuthorize, failure, jsonResponse } from "@/lib/apiHelper";
import { partyFilter } from "@/lib/partyAccess";
import { approvalState, LEVEL_LABEL } from "@/lib/approval";
import { placeOrder } from "@/services/orderService";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "order.view");
    if (auth.error) return auth.error;
    const sp = req.nextUrl.searchParams;
    const query: Record<string, any> = { ...(await partyFilter(auth.user)) };
    if (sp.get("status")) query.status = sp.get("status");
    if (sp.get("partyType")) query.partyType = sp.get("partyType");
    const q = sp.get("search")?.trim();
    if (q) query.$and = [{ $or: [{ orderCode: { $regex: q, $options: "i" } }, { partyName: { $regex: q, $options: "i" } }] }];
    const orders = await ChannelOrder.find(query).sort({ createdAt: -1 }).limit(200).lean();
    return jsonResponse(
      orders.map((o) => {
        const st = approvalState(o.approvals);
        return {
          ...o,
          units: o.lines.reduce((s, l) => s + l.quantity, 0),
          scheduled: o.lines.reduce((s, l) => s + (l.dispatchedQty || 0), 0),
          waitingFor: o.status === "PENDING_APPROVAL" && st.next ? LEVEL_LABEL[st.next] : null,
        };
      })
    );
  } catch (e) {
    return failure(e, "Failed to load orders");
  }
}

/** Place an order: { partyType, partyId, lines: [{ modelId, quantity }], notes } */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "order.create");
    if (auth.error) return auth.error;
    const b = await req.json();
    const order = await placeOrder({ partyType: b.partyType, partyId: b.partyId, lines: b.lines, notes: b.notes }, auth.user);
    return jsonResponse(order, undefined, 201);
  } catch (e) {
    return failure(e, "Failed to place order");
  }
}
