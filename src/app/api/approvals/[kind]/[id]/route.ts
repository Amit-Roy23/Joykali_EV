import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, jsonResponse } from "@/lib/apiHelper";
import { APPROVAL_KINDS, ApprovalKind, signApproval } from "@/services/approvalService";
import { ApprovalError } from "@/lib/approval";

export const maxDuration = 60;

/** Approve or reject: body { decision: "APPROVED" | "REJECTED", note?: string } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { kind, id } = await params;
    if (!APPROVAL_KINDS.includes(kind as ApprovalKind)) return errorResponse("Unknown approval type", 404);
    const body = await req.json().catch(() => ({}));
    const decision = body.decision === "REJECTED" ? "REJECTED" : body.decision === "APPROVED" ? "APPROVED" : null;
    if (!decision) return errorResponse("decision must be APPROVED or REJECTED", 400);
    const result = await signApproval(kind as ApprovalKind, id, auth.user, decision, body.note);
    return jsonResponse(result);
  } catch (error: any) {
    return errorResponse(error.message || "Approval failed", error instanceof ApprovalError ? error.status : 500);
  }
}
