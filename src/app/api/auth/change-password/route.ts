import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { hashPassword, comparePassword, signAccessToken, signRefreshToken, setAuthCookies } from "@/lib/auth";
import { authenticateAndAuthorize, jsonResponse, errorResponse } from "@/lib/apiHelper";
import { ChangePasswordSchema } from "@/validators";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const body = await req.json();
    const parseResult = ChangePasswordSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const { currentPassword, newPassword } = parseResult.data;
    const user = await User.findById(auth.user.userId);
    if (!user) return errorResponse("User not found", 404);

    const isMatch = await comparePassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      return errorResponse("Current password is incorrect", 400);
    }

    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    await user.save();

    await logAudit({
      user: auth.user,
      action: "PASSWORD_RESET",
      resource: "AUTH",
      resourceId: String(user._id),
    });

    const payload = {
      userId: String(user._id),
      employeeCode: user.employeeCode,
      email: user.email,
      name: user.name,
      role: user.role,
      reportsTo: user.reportsTo ? String(user.reportsTo) : null,
      mustChangePassword: false,
    };

    const accessToken = await signAccessToken(payload);
    const refreshToken = await signRefreshToken(payload);

    const response = jsonResponse({
      message: "Password changed successfully",
      user: payload,
    });

    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (error: any) {
    return errorResponse(error.message || "Failed to change password", 500);
  }
}

