import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { chainTree } from "@/services/partnerAdminService";

/** Business chain: company → super distributors → distributors → dealers → sub dealers (+ outlets). */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    return jsonResponse(await chainTree(auth.user));
  } catch (e) {
    return failure(e, "Failed to load the network");
  }
}
