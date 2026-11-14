import { isPartnerRole } from "@/types";
import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Distributor } from "@/models/Distributor";
import { User } from "@/models/User";
import { ChannelOrder } from "@/models/ChannelOrder";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { CreditLimitChange } from "@/models/CreditLimitChange";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { canAccessParty } from "@/lib/partyAccess";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { creditSummary } from "@/services/creditService";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Distributor not found", 404);
    const allowed =
      (isPartnerRole(auth.user.role) || (await hasPermission(auth.user.role, "distributor.view"))) &&
      (await canAccessParty(auth.user, "DISTRIBUTOR", id));
    if (!allowed) return errorResponse("Distributor not found", 404);
    const distributor = await Distributor.findById(id).populate("assignedASM", "name employeeCode").lean();
    if (!distributor) return errorResponse("Distributor not found", 404);
    const [credit, orders, deliveries, logins, creditChanges] = await Promise.all([
      creditSummary("DISTRIBUTOR", id),
      ChannelOrder.find({ partyType: "DISTRIBUTOR", party: id }).sort({ createdAt: -1 }).limit(20).lean(),
      DeliveryOrder.find({ partyType: "DISTRIBUTOR", party: id })
        .select("doCode status lines document vehicles.chassisNumber dispatch grn.grnNo createdAt")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      isPartnerRole(auth.user.role) ? [] : User.find({ distributor: id }).select("name email employeeCode status lastLoginAt").lean(),
      CreditLimitChange.find({ partyType: "DISTRIBUTOR", party: id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    return jsonResponse({ distributor, credit, orders, deliveries, logins, creditChanges });
  } catch (e) {
    return failure(e, "Failed to load distributor");
  }
}

/** Update contact details / status. Credit limits are changed only via an approved request. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "distributor.manage");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Distributor not found", 404);
    const b = await req.json();
    if ("creditLimit" in b) return errorResponse("Credit limits change only through an approved credit request", 400);
    const allowed = ["name", "ownerName", "phone", "email", "address", "city", "pincode", "status", "assignedASM"];
    const update: Record<string, any> = {};
    for (const k of allowed) if (b[k] !== undefined) update[k] = typeof b[k] === "string" ? b[k].trim() : b[k];
    if (update.status && !["ACTIVE", "INACTIVE", "ON_HOLD"].includes(update.status)) return errorResponse("Invalid status", 400);
    const before = await Distributor.findById(id).lean();
    if (!before) return errorResponse("Distributor not found", 404);
    const after = await Distributor.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    // Deactivating a distributor also blocks its portal logins.
    if (update.status === "INACTIVE") await User.updateMany({ distributor: id }, { $set: { status: "INACTIVE" } });
    await logAudit({ user: auth.user, action: "UPDATE", resource: "DISTRIBUTOR", resourceId: id, before, after });
    return jsonResponse(after);
  } catch (e) {
    return failure(e, "Failed to update distributor");
  }
}
