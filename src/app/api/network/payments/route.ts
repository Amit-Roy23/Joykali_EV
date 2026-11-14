import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { recordNetworkPayment } from "@/services/networkService";

/** Supplier records a payment from its own buyer. */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "partner.sell");
    if (auth.error) return auth.error;
    return jsonResponse(await recordNetworkPayment(auth.user, await req.json()), undefined, 201);
  } catch (e) {
    return failure(e, "Failed to record payment");
  }
}
