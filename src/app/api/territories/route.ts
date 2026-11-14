import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { Territory } from "@/models/Territory";
import { createTerritory, territoryTree } from "@/services/partnerAdminService";

/** ?flat=1 for a plain list (pickers); otherwise the zone → district → area tree with partners. */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    if (req.nextUrl.searchParams.get("flat")) {
      return jsonResponse(await Territory.find({ isActive: true }).sort({ kind: 1, name: 1 }).lean());
    }
    return jsonResponse(await territoryTree());
  } catch (e) {
    return failure(e, "Failed to load territories");
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "network.manage");
    if (auth.error) return auth.error;
    return jsonResponse(await createTerritory(auth.user, await req.json()), undefined, 201);
  } catch (e) {
    return failure(e, "Failed to create territory");
  }
}
