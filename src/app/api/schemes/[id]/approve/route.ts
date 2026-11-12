import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { IncentiveScheme } from "@/models/IncentiveScheme";
import { recalculateForScheme } from "@/services/incentiveService";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

/**
 * Approve a DRAFT scheme. Activation immediately recalculates incentive
 * ledgers for every month the scheme covers (up to today) and pushes the new
 * figures into any open payroll run, so payouts update automatically.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "scheme.approve");
    if (auth.error) return auth.error;

    const { id } = await params;
    const scheme = await IncentiveScheme.findById(id);
    if (!scheme) return errorResponse("Scheme not found", 404);
    if (scheme.status !== "DRAFT") {
      return errorResponse(`Only DRAFT schemes can be approved (current: ${scheme.status})`, 409);
    }
    if (new Date(scheme.validTo) < new Date(scheme.validFrom)) {
      return errorResponse("Scheme validity end date is before its start date", 400);
    }

    scheme.status = "ACTIVE";
    scheme.approvedBy = new mongoose.Types.ObjectId(auth.user.userId);
    scheme.approvedAt = new Date();
    await scheme.save();

    const periods = await recalculateForScheme(scheme);

    await logAudit({
      user: auth.user,
      action: "APPROVE",
      resource: "SCHEME",
      resourceId: id,
      after: { status: "ACTIVE", approvedBy: auth.user.employeeCode, recalculatedPeriods: periods },
    });

    return jsonResponse({ scheme, recalculatedPeriods: periods });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to approve scheme", 500);
  }
}
