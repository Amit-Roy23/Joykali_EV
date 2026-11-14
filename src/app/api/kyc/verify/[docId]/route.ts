import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { verifyPartyDocument } from "@/services/partnerAdminService";

/** { decision: "VERIFIED" | "REJECTED", remarks } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "kyc.verify");
    if (auth.error) return auth.error;
    const { docId } = await params;
    const b = await req.json();
    if (b.decision !== "VERIFIED" && b.decision !== "REJECTED") return errorResponse("Choose verify or reject", 400);
    return jsonResponse(await verifyPartyDocument(auth.user, docId, b.decision, b.remarks));
  } catch (e) {
    return failure(e, "Failed to verify document");
  }
}
