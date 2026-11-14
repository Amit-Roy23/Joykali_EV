import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { isPartnerRole } from "@/types";
import { myParty } from "@/lib/partyAccess";
import { hasPermission } from "@/lib/rbac";
import { PartnerSale } from "@/models/PartnerSale";
import { createPartnerSale } from "@/services/networkService";

/** Partner: my sales (?side=seller) and stock sent to me (?side=buyer). Staff (network.view): all. */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const sp = req.nextUrl.searchParams;
    const side = sp.get("side");
    let q: any = {};
    if (isPartnerRole(auth.user.role)) {
      const me = await myParty(auth.user);
      if (!me) return jsonResponse([]);
      const asSeller = { sellerType: me.type, seller: me.id };
      const asBuyer = { buyerKind: me.type, buyer: me.id };
      q = side === "seller" ? asSeller : side === "buyer" ? asBuyer : { $or: [asSeller, asBuyer] };
    } else if (!(await hasPermission(auth.user.role, "network.view"))) {
      return errorResponse("Forbidden", 403);
    }
    const kind = sp.get("kind");
    if (kind === "retail") q = { $and: [q, { buyerKind: "CUSTOMER" }] };
    if (kind === "channel") q = { $and: [q, { buyerKind: { $ne: "CUSTOMER" } }] };
    return jsonResponse(await PartnerSale.find(q).sort({ saleDate: -1, createdAt: -1 }).limit(300).lean());
  } catch (e) {
    return failure(e, "Failed to load sales");
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "partner.sell");
    if (auth.error) return auth.error;
    return jsonResponse(await createPartnerSale(auth.user, await req.json()), undefined, 201);
  } catch (e) {
    return failure(e, "Failed to record the sale");
  }
}
