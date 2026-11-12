import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { authenticateAndAuthorize, jsonResponse, errorResponse } from "@/lib/apiHelper";
import { getPermissionsForRole } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const user = await User.findById(auth.user.userId)
      .populate("reportsTo", "name employeeCode role")
      .populate("dealer", "name dealerCode")
      .select("-passwordHash")
      .lean();

    if (!user) {
      return errorResponse("User not found", 404);
    }

    const permissions = await getPermissionsForRole(user.role);

    return jsonResponse({
      user,
      permissions,
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch user profile", 500);
  }
}

