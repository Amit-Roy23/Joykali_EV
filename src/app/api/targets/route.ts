import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { getCurrentPeriod } from "@/lib/period";
import { setTarget, targetBoard } from "@/services/partnerAdminService";

/** Target vs achievement board, ranked. ?period=YYYY-MM */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const period = req.nextUrl.searchParams.get("period") || getCurrentPeriod();
    return jsonResponse({ period, rows: await targetBoard(auth.user, period) });
  } catch (e) {
    return failure(e, "Failed to load targets");
  }
}

/** { partyType, partyId, period, targetUnits, targetValueRupees, commissionPerUnitRupees } */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    return jsonResponse(await setTarget(auth.user, await req.json()), undefined, 201);
  } catch (e) {
    return failure(e, "Failed to set target");
  }
}
