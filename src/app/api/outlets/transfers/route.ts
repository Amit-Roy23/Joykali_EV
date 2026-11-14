import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { createStockTransfer } from "@/services/partnerAdminService";

/** { outletId, direction: TO_OUTLET | TO_WAREHOUSE, vehicleIds, remarks } */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "outlet.view");
    if (auth.error) return auth.error;
    return jsonResponse(await createStockTransfer(auth.user, await req.json()), undefined, 201);
  } catch (e) {
    return failure(e, "Failed to create transfer");
  }
}
