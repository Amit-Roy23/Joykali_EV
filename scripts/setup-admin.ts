/**
 * Production bootstrap — safe to run on a live database (it never deletes).
 *
 * Creates, only if missing: the role-permission matrix, company settings, and
 * the first Admin account. The Admin must change the password on first login.
 *
 *   pnpm setup:admin --email=you@company.in --password='Str0ng-Pass!' --name="Your Name"
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { useReliableDnsForSrv } from "./dns-fix";
import { connectToDatabase } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { DEFAULT_ROLE_PERMISSIONS } from "../src/lib/rbac";
import { generateEmployeeCode } from "../src/lib/codeGenerator";
import { RolePermission, Setting, User } from "../src/models";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const email = (arg("email") || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = arg("password") || process.env.ADMIN_PASSWORD || "";
  const name = arg("name") || process.env.ADMIN_NAME || "System Administrator";
  const phone = arg("phone") || "9000000000";

  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI in .env (your Atlas connection string) first.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Pass a valid --email=...");
  if (password.length < 8) throw new Error("Pass --password=... with at least 8 characters");

  useReliableDnsForSrv(process.env.MONGODB_URI);
  await connectToDatabase();

  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const r = await RolePermission.updateOne({ role }, { $setOnInsert: { role, permissions } }, { upsert: true });
    if (r.upsertedCount) console.log(`• Role permissions created: ${role}`);
  }

  if (!(await Setting.findOne())) {
    await Setting.create({
      companyName: "Joykali EV Mobility",
      address: "Update in Settings",
      city: "Kolkata",
      state: "West Bengal",
      pincode: "700001",
      stateCode: "19",
      gstin: "19AAAAA0000A1Z5",
      pan: "AAAAA0000A",
      phone: "+91 00000 00000",
      email,
      codePrefixes: { employee: "JKE", dealer: "JKD", sale: "JKS", purchase: "JKP", payroll: "PR", payslip: "PS" },
      statutoryDeductions: { pfRate: 12, esiRate: 0.75, ptMonthlyPaise: 20000, pfEnabled: true, esiEnabled: true, ptEnabled: true, ptMode: "WB_SLAB" },
    });
    console.log("• Company settings created — update GSTIN, PAN and address in Settings after login");
  }

  const existing = await User.findOne({ role: "ADMIN" }).lean();
  if (existing) {
    console.log(`• An Admin already exists (${existing.employeeCode}, ${existing.email}) — nothing changed.`);
  } else {
    if (await User.findOne({ email })) throw new Error(`A user with ${email} already exists`);
    const admin = await User.create({
      employeeCode: await generateEmployeeCode("ADMIN"),
      name,
      email,
      phone,
      role: "ADMIN",
      designation: "System Administrator",
      joiningDate: new Date(),
      status: "ACTIVE",
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    });
    console.log(`• Admin created: ${admin.employeeCode} / ${admin.email} (must change password on first login)`);
  }

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(`\n  ${e.message}\n`);
  await mongoose.disconnect();
  process.exit(1);
});
