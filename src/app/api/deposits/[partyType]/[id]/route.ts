import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { listDeposits, recordDeposit } from "@/services/partnerAdminService";

type P = { params: Promise<{ partyType: string; id: string }> };
const ok = (t: string) => t === "DEALER" || t === "DISTRIBUTOR";

export async function GET(req: NextRequest, { params }: P) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { partyType, id } = await params;
    if (!ok(partyType) || !isValidId(id)) return errorResponse("Not found", 404);
    return jsonResponse(await listDeposits(auth.user, partyType as any, id));
  } catch (e) {
    return failure(e, "Failed to load deposits");
  }
}

/** { type: RECEIVED|REFUNDED|ADJUSTED, amountRupees, mode, reference, narration, date } */
export async function POST(req: NextRequest, { params }: P) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { partyType, id } = await params;
    if (!ok(partyType) || !isValidId(id)) return errorResponse("Not found", 404);
    return jsonResponse(await recordDeposit(auth.user, partyType as any, id, await req.json()), undefined, 201);
  } catch (e) {
    return failure(e, "Failed to record deposit");
  }
}
