import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { accessSecret } from "@/lib/secrets";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/health",
  "/api/cron/",
  "/api/verify-id/",
  "/api/hr/biometric",
  "/verify/",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/icons/",
  "/_next",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public assets and static Next.js files
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("joykali_access_token")?.value;
  const hasRefresh = Boolean(request.cookies.get("joykali_refresh_token")?.value);

  // Access token missing/expired but a refresh token exists: renew silently.
  // 307 keeps the method and body, so in-flight POSTs survive the hop.
  const renew = () => {
    const url = new URL("/api/auth/refresh", request.url);
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(url, 307);
  };

  if (!token && hasRefresh) return renew();

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized access: Token required" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, accessSecret());

    // If user must change password, redirect away from dashboard to change-password
    if (
      payload.mustChangePassword &&
      !pathname.startsWith("/change-password") &&
      !pathname.startsWith("/api/auth/")
    ) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            success: false,
            error: "Password change required before accessing system",
            mustChangePassword: true,
          },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/change-password", request.url));
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", String(payload.userId));
    requestHeaders.set("x-user-role", String(payload.role));
    requestHeaders.set("x-user-code", String(payload.employeeCode));

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    if (hasRefresh) return renew();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { success: false, error: "Session expired or invalid" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

