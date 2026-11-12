import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import {
  REFRESH_COOKIE_NAME,
  clearAuthCookies,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "@/lib/auth";
import { JWTPayload } from "@/types";

/** Only allow redirects back into this app (no open redirect). */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/api/auth/refresh")) return "/";
  return raw;
}

/**
 * Silent session renewal. The middleware sends any request whose 15-minute
 * access token has expired here (307, so POST bodies survive); we re-check the
 * user in the database — a deactivated user or changed role takes effect —
 * issue a fresh token pair and bounce straight back to the original URL.
 */
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const isApi = next.startsWith("/api/");

  const fail = () => {
    const res = isApi
      ? NextResponse.json({ success: false, error: "Session expired" }, { status: 401 })
      : NextResponse.redirect(new URL(`/login?from=${encodeURIComponent(next)}`, req.url));
    clearAuthCookies(res);
    return res;
  };

  const token = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!token) return fail();
  const claims = await verifyRefreshToken(token);
  if (!claims) return fail();

  await connectToDatabase();
  const user = await User.findById(claims.userId).lean();
  if (!user || user.status !== "ACTIVE") return fail();

  const payload: JWTPayload = {
    userId: String(user._id),
    employeeCode: user.employeeCode,
    email: user.email,
    name: user.name,
    role: user.role,
    reportsTo: user.reportsTo ? String(user.reportsTo) : null,
    mustChangePassword: user.mustChangePassword,
  };

  const res = NextResponse.redirect(new URL(next, req.url), 307);
  setAuthCookies(res, await signAccessToken(payload), await signRefreshToken(payload));
  return res;
}

export const POST = GET;
