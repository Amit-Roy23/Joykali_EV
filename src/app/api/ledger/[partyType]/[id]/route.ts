import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { canAccessParty } from "@/lib/partyAccess";
import { partyLedger, recordPayment } from "@/services/orderService";
import { creditSummary } from "@/services/creditService";

const TYPES = { dealer: "DEALER", distributor: "DISTRIBUTOR" } as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ partyType: string; id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "ledger.view");
    if (auth.error) return auth.error;
    const { partyType, id } = await params;
    const type = TYPES[partyType as keyof typeof TYPES];
    if (!type || !isValidId(id) || !(await canAccessParty(auth.user, type, id))) return errorResponse("Not found", 404);
    const [entries, credit] = await Promise.all([partyLedger(type, id), creditSummary(type, id)]);
    return jsonResponse({ entries: entries.reverse(), credit });
  } catch (e) {
    return failure(e, "Failed to load ledger");
  }
}

/** Record a payment received: { amount (₹), mode, reference, date?, narration? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ partyType: string; id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "ledger.manage");
    if (auth.error) return auth.error;
    const { partyType, id } = await params;
    const type = TYPES[partyType as keyof typeof TYPES];
    if (!type || !isValidId(id)) return errorResponse("Not found", 404);
    const b = await req.json();
    const entry = await recordPayment(
      { partyType: type, partyId: id, amountRupees: b.amount, mode: b.mode, reference: b.reference, date: b.date, narration: b.narration },
      auth.user
    );
    return jsonResponse(entry, undefined, 201);
  } catch (e) {
    return failure(e, "Failed to record payment");
  }
}
