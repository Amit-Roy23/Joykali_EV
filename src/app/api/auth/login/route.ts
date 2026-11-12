import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import {
  comparePassword,
  signAccessToken,
  signRefreshToken,
  setAuthCookies,
} from "@/lib/auth";
import { jsonResponse, errorResponse, checkRateLimit } from "@/lib/apiHelper";
import { LoginSchema } from "@/validators";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();

    const parseResult = LoginSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const { identifier, password } = parseResult.data;
    const ip = (req.headers.get("x-forwarded-for") || "127.0.0.1").split(",")[0].trim();

    // Rate limiting per IP + account (a whole showroom often shares one IP, so
    // a per-IP-only limit locked out colleagues). Per-account lockout below
    // still stops password guessing.
    if (
      !checkRateLimit(`login_${ip}_${identifier.trim().toLowerCase()}`, 8, 60 * 1000) ||
      !checkRateLimit(`login_ip_${ip}`, 60, 60 * 1000)
    ) {
      return errorResponse(
        "Too many login attempts. Please wait a minute and try again.",
        429
      );
    }

    // Find user by either email (case-insensitive) or employeeCode (case-insensitive)
    const normalizedIdentifier = identifier.trim();
    const user = await User.findOne({
      $or: [
        { email: normalizedIdentifier.toLowerCase() },
        { employeeCode: normalizedIdentifier.toUpperCase() },
      ],
    });

    if (!user) {
      return errorResponse("Invalid employee code/email or password", 401);
    }

    // Check account lockout
    if (user.lockUntil && user.lockUntil > new Date()) {
      const waitMins = Math.ceil((user.lockUntil.getTime() - Date.now()) / (60 * 1000));
      return errorResponse(
        `Account is temporarily locked due to repeated failed logins. Please try again in ${waitMins} minute(s).`,
        403
      );
    }

    if (user.status !== "ACTIVE") {
      return errorResponse("Your account has been deactivated. Please contact Admin.", 403);
    }

    const isMatch = await comparePassword(password, user.passwordHash);

    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15-minute lock
      }
      await user.save();
      return errorResponse("Invalid employee code/email or password", 401);
    }

    // Reset failed login counter on success
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastLoginAt = new Date();
    await user.save();

    const payload = {
      userId: String(user._id),
      employeeCode: user.employeeCode,
      email: user.email,
      name: user.name,
      role: user.role,
      reportsTo: user.reportsTo ? String(user.reportsTo) : null,
      mustChangePassword: user.mustChangePassword,
    };

    const accessToken = await signAccessToken(payload);
    const refreshToken = await signRefreshToken(payload);

    await logAudit({
      user: payload,
      action: "LOGIN",
      resource: "AUTH",
      resourceId: String(user._id),
      ipAddress: ip,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    const response = jsonResponse({
      user: payload,
      mustChangePassword: user.mustChangePassword,
    });

    setAuthCookies(response, accessToken, refreshToken);
    return response;
  } catch (error: any) {
    console.error("Login Error:", error);
    return errorResponse(error.message || "Internal server error", 500);
  }
}

