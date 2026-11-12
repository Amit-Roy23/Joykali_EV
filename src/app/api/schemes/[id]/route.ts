import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { IncentiveScheme } from "@/models/IncentiveScheme";
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

