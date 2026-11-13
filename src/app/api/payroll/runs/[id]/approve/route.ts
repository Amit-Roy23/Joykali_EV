import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, jsonResponse } from "@/lib/apiHelper";
import { signApproval } from "@/services/approvalService";
import { ApprovalError } from "@/lib/approval";

export const maxDuration = 60;

/** Sign a payroll run: Business Head first (→ UNDER_REVIEW), then Managing Partner (→ APPROVED). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    return jsonResponse(await signApproval("payroll", id, auth.user, body.decision === "REJECTED" ? "REJECTED" : "APPROVED", body.note));
  } catch (error: any) {
    return errorResponse(error.message || "Failed to approve payroll", error instanceof ApprovalError ? error.status : 500);
  }
}
