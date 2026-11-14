import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Dealer } from "@/models/Dealer";
import { Distributor } from "@/models/Distributor";
import { VehicleModel } from "@/models/VehicleModel";
import { Vehicle } from "@/models/Vehicle";
import { authenticateAndAuthorize, errorResponse, failure, jsonResponse } from "@/lib/apiHelper";
import { canAccessParty, myParty, partyScope } from "@/lib/partyAccess";
import { channelPrice, creditSummary, getParty, tierOf } from "@/services/creditService";
import { isPartnerRole } from "@/types";

/**
 * Data for the order form: parties the user may order for, models with the
 * channel price for the chosen party type and live warehouse availability,
 * and (when a party is chosen) its credit position.
 */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "order.create");
    if (auth.error) return auth.error;
    const scope = await partyScope(auth.user);
    const [dealers, distributors] = await Promise.all([
      Dealer.find({ status: "ACTIVE", parentDistributor: null, parentDealer: null, ...(scope ? { _id: { $in: scope.DEALER } } : {}) }).select("name dealerCode city").sort({ name: 1 }).lean(),
      Distributor.find({ status: { $in: ["ACTIVE", "ON_HOLD"] }, parent: null, ...(scope ? { _id: { $in: scope.DISTRIBUTOR } } : {}) })
        .select("name distributorCode city status")
        .sort({ name: 1 })
        .lean(),
    ]);
    const sp = req.nextUrl.searchParams;
    const partner = isPartnerRole(auth.user.role) ? await myParty(auth.user) : null;
    const partyType = partner?.type || (sp.get("partyType") as "DEALER" | "DISTRIBUTOR") || "DEALER";
    const partyId = partner ? String(partner.id) : sp.get("partyId") || "";
    const partyDoc = partyId ? await getParty(partyType, partyId) : null;
    const tier = tierOf(partyType, partyDoc);

    const [models, stock] = await Promise.all([
      VehicleModel.find({ isActive: true }).sort({ category: 1, name: 1 }).lean(),
      Vehicle.aggregate([
        { $match: { status: "IN_STOCK", currentLocationType: "WAREHOUSE" } },
        { $group: { _id: "$model", n: { $sum: 1 } } },
      ]),
    ]);
    let credit = null;
    if (partyId) {
      if (!(await canAccessParty(auth.user, partyType, partyId))) return errorResponse("Not allowed for that party", 403);
      credit = await creditSummary(partyType, partyId).catch(() => null);
    }
    return jsonResponse({
      partyType,
      partyId,
      dealers: dealers.map((d: any) => ({ _id: d._id, name: d.name, code: d.dealerCode, city: d.city })),
      distributors: distributors.map((d: any) => ({ _id: d._id, name: d.name, code: d.distributorCode, city: d.city, status: d.status })),
      models: models.map((m: any) => ({
        _id: m._id,
        name: m.name,
        variant: m.variant,
        category: m.category,
        unitPrice: channelPrice(m, partyType, tier),
        gstRate: m.gstRate ?? 5,
        available: stock.find((s: any) => String(s._id) === String(m._id))?.n || 0,
      })),
      credit,
      lockedParty: !!partner,
    });
  } catch (e) {
    return failure(e, "Failed to load order options");
  }
}
