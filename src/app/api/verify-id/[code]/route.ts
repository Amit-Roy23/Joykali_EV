import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { errorResponse, jsonResponse } from "@/lib/apiHelper";
import { User } from "@/models/User";
import { EMPLOYEE_ROLES } from "@/types";

/** Public ID-card check (from the QR on the card): only name, designation and whether the card is valid. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  await connectToDatabase();
  const { code } = await params;
  if (!/^[A-Z0-9-]{4,20}$/i.test(code)) return errorResponse("Not found", 404);
  const u: any = await User.findOne({ employeeCode: code.toUpperCase(), role: { $in: [...EMPLOYEE_ROLES] } }).select("name designation status profile.photo").lean();
  if (!u) return errorResponse("No employee with this code", 404);
  return jsonResponse({ code: code.toUpperCase(), name: u.name, designation: u.designation, valid: u.status === "ACTIVE", hasPhoto: !!u.profile?.photo });
}
