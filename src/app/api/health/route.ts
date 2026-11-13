import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

const DEV_SECRETS = [
  "joykali_jwt_access_secret_super_secure_key_12345",
  "joykali_jwt_refresh_secret_super_secure_key_67890",
];
const strong = (v?: string) => !!v && v.length >= 32 && !DEV_SECRETS.includes(v);

/**
 * Deployment self-check. Public, but reports only yes/no flags — never values.
 * Open https://<your-app>.vercel.app/api/health after deploying.
 */
export async function GET() {
  const checks: Record<string, boolean | string | number> = {
    MONGODB_URI_set: !!process.env.MONGODB_URI,
    JWT_ACCESS_SECRET_ok: strong(process.env.JWT_ACCESS_SECRET),
    JWT_REFRESH_SECRET_ok: strong(process.env.JWT_REFRESH_SECRET),
    secrets_differ: !process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET !== process.env.JWT_REFRESH_SECRET,
    demo_mode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
    CRON_SECRET_set: !!process.env.CRON_SECRET,
  };
  // Not fatal, but the monthly automatic payroll draft needs it.
  const warnings: string[] = [];
  if (!process.env.CRON_SECRET) warnings.push("CRON_SECRET is not set — the automatic monthly payroll draft will not run");
  const problems: string[] = [];
  if (!checks.MONGODB_URI_set) problems.push("MONGODB_URI is missing");
  if (!checks.JWT_ACCESS_SECRET_ok) problems.push("JWT_ACCESS_SECRET missing, too short (<32 chars) or still the public default");
  if (!checks.JWT_REFRESH_SECRET_ok) problems.push("JWT_REFRESH_SECRET missing, too short (<32 chars) or still the public default");
  if (!checks.secrets_differ) problems.push("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different");

  if (checks.MONGODB_URI_set) {
    try {
      await connectToDatabase();
      const hello: any = await mongoose.connection.db!.admin().command({ hello: 1 });
      checks.database_connected = true;
      checks.database_name = mongoose.connection.db!.databaseName;
      // Transactions (sales, purchases, payroll) need a replica set — Atlas always is one.
      checks.transactions_supported = !!hello.setName || hello.msg === "isdbgrid";
      if (!checks.transactions_supported) problems.push("MongoDB is not a replica set — transactions will not work (use MongoDB Atlas)");
      checks.users = await User.countDocuments();
      if (checks.users === 0) problems.push("Database is empty — run `pnpm seed` (demo) or `pnpm setup:admin` (production) from your computer");
    } catch (e: any) {
      checks.database_connected = false;
      const msg = String(e?.message || e);
      problems.push(
        /whitelist|IP|ECONNREFUSED|ServerSelection|timed out/i.test(msg)
          ? "Cannot reach MongoDB — in Atlas → Network Access allow 0.0.0.0/0 (Vercel has no fixed IPs), and check the URI"
          : /auth|password|bad auth/i.test(msg)
          ? "MongoDB rejected the username/password in MONGODB_URI (URL-encode special characters in the password)"
          : "Database connection failed"
      );
    }
  }

  return NextResponse.json(
    { ok: problems.length === 0, problems, warnings, checks },
    { status: problems.length === 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
