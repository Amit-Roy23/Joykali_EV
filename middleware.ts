import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ACCESS_SECRET = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET || "joykali_jwt_access_secret_super_secure_key_12345"
);

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/refresh",
  "/favicon.ico",
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
    const { payload } = await jwtVerify(token, ACCESS_SECRET);

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
  } catch (err) {
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

