import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { IncentiveScheme } from "@/models/IncentiveScheme";
import { User } from "@/models/User";
import { recalculateIncentivesForPeriod } from "@/services/salesService";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

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

    scheme.status = "ACTIVE";
    scheme.approvedBy = new mongoose.Types.ObjectId(auth.user.userId);
    scheme.approvedAt = new Date();
    await scheme.save();

    // Recompute current month's incentive projections for all active employees
    const allEmps = await User.find({ status: "ACTIVE" }, { _id: 1 }).lean();
    setTimeout(() => {
      recalculateIncentivesForPeriod(
        allEmps.map((e: any) => e._id),
        new Date()
      ).catch(console.error);
    }, 50);

    await logAudit({
      user: auth.user,
      action: "APPROVE",
      resource: "SCHEME",
      resourceId: id,
      after: { status: "ACTIVE", approvedBy: auth.user.employeeCode },
    });

    return jsonResponse(scheme);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to approve scheme", 500);
  }
}

