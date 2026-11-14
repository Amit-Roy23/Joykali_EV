import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { catalogueFor } from "@/services/networkService";

/** Models at the partner's buying price with the supplier's live stock. */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "portal.access");
    if (auth.error) return auth.error;
    return jsonResponse(await catalogueFor(auth.user));
  } catch (e) {
    return failure(e, "Failed to load the catalogue");
  }
}
