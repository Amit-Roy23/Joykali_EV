import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, jsonResponse } from "@/lib/apiHelper";
import { listPending } from "@/services/approvalService";

/** Approvals inbox. BH and MP see what they can sign; Admin sees everything (read-only). */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    if (!["BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"].includes(auth.user.role)) {
      return errorResponse("Forbidden", 403);
    }
    return jsonResponse(await listPending(auth.user));
  } catch (error: any) {
    return errorResponse(error.message || "Failed to load approvals", 500);
  }
}
