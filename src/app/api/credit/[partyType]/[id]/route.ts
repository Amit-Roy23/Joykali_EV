import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { CreditLimitChange } from "@/models/CreditLimitChange";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { canAccessParty } from "@/lib/partyAccess";
import { creditSummary } from "@/services/creditService";
import { requestCreditChange } from "@/services/orderService";

const TYPES = { dealer: "DEALER", distributor: "DISTRIBUTOR" } as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ partyType: string; id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { partyType, id } = await params;
    const type = TYPES[partyType as keyof typeof TYPES];
    if (!type || !isValidId(id) || !(await canAccessParty(auth.user, type, id))) return errorResponse("Not found", 404);
    const [summary, history] = await Promise.all([
      creditSummary(type, id),
      CreditLimitChange.find({ partyType: type, party: id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    return jsonResponse({ summary, history });
  } catch (e) {
    return failure(e, "Failed to load credit");
  }
}

/** Request a new limit: { toLimit (₹), creditDays?, reason } — applied after BH + MP approval. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ partyType: string; id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "credit.request");
    if (auth.error) return auth.error;
    const { partyType, id } = await params;
    const type = TYPES[partyType as keyof typeof TYPES];
    if (!type || !isValidId(id)) return errorResponse("Not found", 404);
    const b = await req.json();
    const change = await requestCreditChange(
      { partyType: type, partyId: id, toLimitRupees: b.toLimit, creditDays: b.creditDays, reason: b.reason },
      auth.user
    );
    return jsonResponse(change, undefined, 201);
  } catch (e) {
    return failure(e, "Failed to request credit change");
  }
}
