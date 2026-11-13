import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase, withTransaction } from "@/lib/db";
import { Distributor } from "@/models/Distributor";
import { User } from "@/models/User";
import { CreditLimitChange } from "@/models/CreditLimitChange";
import { authenticateAndAuthorize, errorResponse, failure, jsonResponse } from "@/lib/apiHelper";
import { generateDistributorCode } from "@/lib/codeGenerator";
import { hashPassword } from "@/lib/auth";
import { partyScope } from "@/lib/partyAccess";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import { creditSummary } from "@/services/creditService";

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "distributor.view");
    if (auth.error) return auth.error;
    const scope = await partyScope(auth.user);
    const q = req.nextUrl.searchParams.get("search")?.trim();
    const filter: Record<string, any> = scope ? { _id: { $in: scope.DISTRIBUTOR } } : {};
    if (q) filter.$or = ["name", "distributorCode", "city", "ownerName"].map((f) => ({ [f]: { $regex: q, $options: "i" } }));
    const list = await Distributor.find(filter).populate("assignedASM", "name employeeCode").sort({ name: 1 }).lean();
    const pending = await CreditLimitChange.find({ partyType: "DISTRIBUTOR", status: "PENDING" }).select("party toLimit").lean();
    const withCredit = await Promise.all(
      list.map(async (d: any) => ({
        ...d,
        credit: await creditSummary("DISTRIBUTOR", d._id).catch(() => null),
        pendingCredit: pending.find((p) => String(p.party) === String(d._id)) || null,
      }))
    );
    return jsonResponse(withCredit);
  } catch (e) {
    return failure(e, "Failed to load distributors");
  }
}

/**
 * Onboard a distributor. Optional: create their portal login, and request an
 * opening credit limit (applied only after BH + MP approval — it starts at ₹0).
 */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "distributor.manage");
    if (auth.error) return auth.error;
    const b = await req.json();
    const required = ["name", "ownerName", "phone", "email", "address", "city", "pincode", "gstin"];
    for (const f of required) if (!String(b[f] || "").trim()) return errorResponse(`${f} is required`, 400);
    const gstin = String(b.gstin).toUpperCase().trim();
    if (!GSTIN.test(gstin)) return errorResponse("Invalid GSTIN", 400);
    if (!/^\d{6}$/.test(String(b.pincode))) return errorResponse("Pincode must be 6 digits", 400);
    if (!/^[6-9]\d{9}$/.test(String(b.phone))) return errorResponse("Phone must be a 10-digit mobile number", 400);
    if (await Distributor.findOne({ gstin })) return errorResponse("A distributor with this GSTIN already exists", 409);
    if (b.login?.password && String(b.login.password).length < 8) return errorResponse("Login password must be at least 8 characters", 400);
    const loginEmail = String(b.login?.email || b.email).toLowerCase().trim();
    if (b.login?.password && (await User.findOne({ email: loginEmail }))) return errorResponse("That login email is already in use", 409);
    if (b.assignedASM && !mongoose.isValidObjectId(b.assignedASM)) return errorResponse("Invalid ASM", 400);

    const result = await withTransaction(async (session) => {
      const code = await generateDistributorCode(session);
      const [dist] = await Distributor.create(
        [
          {
            distributorCode: code,
            name: b.name.trim(),
            ownerName: b.ownerName.trim(),
            phone: String(b.phone).trim(),
            email: String(b.email).toLowerCase().trim(),
            address: b.address.trim(),
            city: b.city.trim(),
            state: b.state?.trim() || "West Bengal",
            stateCode: gstin.slice(0, 2), // GST state code is the first two digits of the GSTIN
            pincode: String(b.pincode),
            gstin,
            creditLimit: 0,
            creditDays: Math.min(180, Math.max(0, Number(b.creditDays ?? 30))),
            assignedASM: b.assignedASM || null,
            status: "ACTIVE",
            createdBy: new mongoose.Types.ObjectId(auth.user.userId),
          },
        ],
        { session }
      );
      let login = null;
      if (b.login?.password) {
        const [u] = await User.create(
          [
            {
              employeeCode: code,
              name: b.ownerName.trim(),
              email: loginEmail,
              phone: String(b.phone).trim(),
              role: "DISTRIBUTOR",
              distributor: dist._id,
              designation: `Distributor — ${b.name.trim()}`,
              joiningDate: new Date(),
              status: "ACTIVE",
              passwordHash: await hashPassword(String(b.login.password)),
              mustChangePassword: true,
            },
          ],
          { session }
        );
        login = { employeeCode: u.employeeCode, email: u.email };
      }
      if (Number(b.requestedCreditLimit) > 0) {
        await CreditLimitChange.create(
          [
            {
              partyType: "DISTRIBUTOR",
              party: dist._id,
              partyName: dist.name,
              partyCode: code,
              fromLimit: 0,
              toLimit: rupeesToPaise(Number(b.requestedCreditLimit)),
              creditDays: dist.creditDays,
              reason: "Opening credit limit at onboarding",
              status: "PENDING",
              approvals: [],
              requestedBy: new mongoose.Types.ObjectId(auth.user.userId),
            },
          ],
          { session }
        );
      }
      return { distributor: dist, login };
    });
    await logAudit({
      user: auth.user,
      action: "CREATE",
      resource: "DISTRIBUTOR",
      resourceId: String(result.distributor._id),
      after: { code: result.distributor.distributorCode, name: result.distributor.name, login: !!result.login },
    });
    return jsonResponse(result, undefined, 201);
  } catch (e) {
    return failure(e, "Failed to onboard distributor");
  }
}
