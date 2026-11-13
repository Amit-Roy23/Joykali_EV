import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, jsonResponse } from "@/lib/apiHelper";
import { signApproval } from "@/services/approvalService";
import { ApprovalError } from "@/lib/approval";

// Approval recalculates every month the scheme covers.
export const maxDuration = 60;

/** Sign a DRAFT scheme. It activates only after the Business Head AND the Managing Partner approve. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return jsonResponse(await signApproval("scheme", id, auth.user, body.decision === "REJECTED" ? "REJECTED" : "APPROVED", body.note));
  } catch (error: any) {
    return errorResponse(error.message || "Failed to approve scheme", error instanceof ApprovalError ? error.status : 500);
  }
}
