import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { setChildCredit } from "@/services/networkService";

/** Supplier partner sets its own buyer's credit limit. Body: { limitRupees, creditDays, reason } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ partyType: string; id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "partner.appoint");
    if (auth.error) return auth.error;
    const { partyType, id } = await params;
    if ((partyType !== "DEALER" && partyType !== "DISTRIBUTOR") || !isValidId(id)) return errorResponse("Not found", 404);
    return jsonResponse(await setChildCredit(auth.user, partyType, id, await req.json()));
  } catch (e) {
    return failure(e, "Failed to set credit limit");
  }
}
