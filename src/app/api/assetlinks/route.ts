import { NextResponse } from "next/server";

/**
 * Digital Asset Links for the Android app (served at /.well-known/assetlinks.json via a rewrite).
 * Proves the Play Store / APK app and this website belong together, so the app opens full-screen
 * without a browser bar. Set in Vercel → Settings → Environment Variables:
 *   TWA_PACKAGE_NAME  e.g. in.joykaliev.app
 *   TWA_SHA256        the SHA-256 signing fingerprint(s) from PWABuilder / Play Console, comma-separated
 */
export const dynamic = "force-dynamic";

export function GET() {
  const pkg = (process.env.TWA_PACKAGE_NAME || "in.joykaliev.app").trim();
  const prints = (process.env.TWA_SHA256 || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  const body = prints.length
    ? [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: prints } }]
    : [];
  return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=3600" } });
}
