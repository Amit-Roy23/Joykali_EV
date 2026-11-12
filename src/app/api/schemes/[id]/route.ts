import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { IncentiveScheme } from "@/models/IncentiveScheme";
import { recalculateForScheme } from "@/services/incentiveService";
import { logAudit } from "@/lib/audit";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "scheme.view");
    if (auth.error) return auth.error;

    const { id } = await params;
    const scheme = await IncentiveScheme.findById(id)
      .populate("applicableModels")
      .populate("applicableDealers")
      .populate("approvedBy", "name employeeCode")
      .lean();

    if (!scheme) return errorResponse("Scheme not found", 404);

    return jsonResponse(scheme);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch scheme", 500);
  }
}


/**
 * Archive an ACTIVE or DRAFT scheme. Archiving an active scheme removes its
 * effect from every non-locked month it covered.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "scheme.approve");
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    if (body.status !== "ARCHIVED") {
      return errorResponse("Only status ARCHIVED is supported here", 400);
    }
    const scheme = await IncentiveScheme.findById(id);
    if (!scheme) return errorResponse("Scheme not found", 404);
    if (scheme.status === "ARCHIVED") return errorResponse("Scheme is already archived", 409);

    const wasActive = scheme.status === "ACTIVE";
    scheme.status = "ARCHIVED";
    await scheme.save();
    const periods = wasActive ? await recalculateForScheme(scheme) : [];

    await logAudit({
      user: auth.user,
      action: "UPDATE",
      resource: "SCHEME",
      resourceId: id,
      after: { status: "ARCHIVED", recalculatedPeriods: periods },
    });
    return jsonResponse({ scheme, recalculatedPeriods: periods });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to archive scheme", 500);
  }
}
