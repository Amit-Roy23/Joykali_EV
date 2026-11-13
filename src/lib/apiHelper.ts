import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifyAccessToken, getTokenFromRequest } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { Permission, JWTPayload, ApiResponse } from "@/types";
import mongoose from "mongoose";

/** Guard route params so malformed IDs return 404 instead of a 500 CastError. */
export function isValidId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}

export function jsonResponse<T>(
  data?: T,
  meta?: { total?: number; page?: number; limit?: number; pages?: number },
  status = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta,
    },
    { status }
  );
}

export function errorResponse(
  message: string,
  status = 400,
  extra?: Record<string, any>
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...extra,
    },
    { status }
  );
}

/**
 * Authenticates request and optionally checks for a required permission
 */
export async function authenticateAndAuthorize(
  req: NextRequest,
  requiredPermission?: Permission
): Promise<
  | { user: JWTPayload; error: null }
  | { user: null; error: NextResponse<ApiResponse> }
> {
  const token = getTokenFromRequest(req);
  if (!token) {
    return {
      user: null,
      error: errorResponse("Authentication required", 401),
    };
  }

  const user = await verifyAccessToken(token);
  if (!user) {
    return {
      user: null,
      error: errorResponse("Invalid or expired session", 401),
    };
  }

  if (requiredPermission) {
    const permitted = await hasPermission(user.role, requiredPermission);
    if (!permitted) {
      return {
        user: null,
        error: errorResponse(
          `Forbidden: Missing permission '${requiredPermission}'`,
          403
        ),
      };
    }
  }

  return { user, error: null };
}

// In-memory rate limiting map (IP / Identifier -> { count, resetTime })
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 60 * 1000
): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count += 1;
  return true;
}


/** Turn a thrown business-rule error (which carries .status) into an API error response. */
export function failure(error: any, fallback = "Request failed"): NextResponse<ApiResponse> {
  const status = typeof error?.status === "number" ? error.status : 500;
  if (status >= 500) console.error(error);
  return errorResponse(error?.message || fallback, status);
}
