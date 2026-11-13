import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Distributor } from "@/models/Distributor";
import { User } from "@/models/User";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

/** Create an additional portal login for a distributor (staff at the distributor). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "distributor.manage");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Distributor not found", 404);
    const dist = await Distributor.findById(id).lean();
    if (!dist) return errorResponse("Distributor not found", 404);
    const b = await req.json();
    const email = String(b.email || "").toLowerCase().trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return errorResponse("Valid email required", 400);
    if (!String(b.name || "").trim()) return errorResponse("Name required", 400);
    if (String(b.password || "").length < 8) return errorResponse("Password must be at least 8 characters", 400);
    if (await User.findOne({ email })) return errorResponse("That email is already in use", 409);
    const count = await User.countDocuments({ distributor: dist._id });
    const user = await User.create({
      employeeCode: count === 0 ? dist.distributorCode : `${dist.distributorCode}-${count + 1}`,
      name: b.name.trim(),
      email,
      phone: String(b.phone || dist.phone),
      role: "DISTRIBUTOR",
      distributor: dist._id,
      designation: `Distributor — ${dist.name}`,
      joiningDate: new Date(),
      status: "ACTIVE",
      passwordHash: await hashPassword(String(b.password)),
      mustChangePassword: true,
    });
    await logAudit({ user: auth.user, action: "CREATE", resource: "DISTRIBUTOR", resourceId: id, after: { login: user.employeeCode, email } });
    return jsonResponse({ employeeCode: user.employeeCode, email: user.email }, undefined, 201);
  } catch (e) {
    return failure(e, "Failed to create login");
  }
}
