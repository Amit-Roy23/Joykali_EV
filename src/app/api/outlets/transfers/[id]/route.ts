import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { receiveStockTransfer } from "@/services/partnerAdminService";

/** Confirm receipt of a branch transfer. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "outlet.view");
    if (auth.error) return auth.error;
    const { id } = await params;
    return jsonResponse(await receiveStockTransfer(auth.user, id));
  } catch (e) {
    return failure(e, "Failed to receive transfer");
  }
}
