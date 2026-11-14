import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { isPartnerRole } from "@/types";
import { myParty } from "@/lib/partyAccess";
import { canActOnParty } from "@/services/networkService";
import { partnerStock } from "@/services/partnerAdminService";

/** Stock a partner owns (and, for company dealers, consignment stock). Default: my own. */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const sp = req.nextUrl.searchParams;
    let type = sp.get("partyType") as "DEALER" | "DISTRIBUTOR" | null;
    let id = sp.get("partyId");
    if (!type || !id) {
      if (!isPartnerRole(auth.user.role)) return errorResponse("Choose a partner", 400);
      const me = await myParty(auth.user);
      if (!me) return errorResponse("Not linked to a partner", 403);
      type = me.type;
      id = String(me.id);
    }
    if ((type !== "DEALER" && type !== "DISTRIBUTOR") || !isValidId(id)) return errorResponse("Not found", 404);
    const access = await canActOnParty(auth.user, type, id);
    if (!access.ok) return errorResponse("Not found", 404);
    return jsonResponse(await partnerStock(type, id));
  } catch (e) {
    return failure(e, "Failed to load stock");
  }
}
