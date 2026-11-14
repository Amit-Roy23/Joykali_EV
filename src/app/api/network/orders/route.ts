import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { isPartnerRole } from "@/types";
import { myParty } from "@/lib/partyAccess";
import { hasPermission } from "@/lib/rbac";
import { NetworkOrder } from "@/models/NetworkOrder";
import { placeNetworkOrder } from "@/services/networkService";

/** Partner: orders I placed (?side=buyer) and orders from my network (?side=seller). Staff: all. */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const side = req.nextUrl.searchParams.get("side");
    let q: any = {};
    if (isPartnerRole(auth.user.role)) {
      const me = await myParty(auth.user);
      if (!me) return jsonResponse([]);
      const asBuyer = { buyerType: me.type, buyer: me.id };
      const asSeller = { sellerType: me.type, seller: me.id };
      q = side === "buyer" ? asBuyer : side === "seller" ? asSeller : { $or: [asBuyer, asSeller] };
    } else if (!(await hasPermission(auth.user.role, "network.view"))) {
      return errorResponse("Forbidden", 403);
    }
    return jsonResponse(await NetworkOrder.find(q).sort({ createdAt: -1 }).limit(200).lean());
  } catch (e) {
    return failure(e, "Failed to load orders");
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "order.create");
    if (auth.error) return auth.error;
    const b = await req.json();
    return jsonResponse(await placeNetworkOrder(auth.user, b), undefined, 201);
  } catch (e) {
    return failure(e, "Failed to place order");
  }
}
