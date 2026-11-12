import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Vehicle } from "@/models/Vehicle";
import { User } from "@/models/User";
import { Dealer } from "@/models/Dealer";
import { authenticateAndAuthorize, errorResponse, jsonResponse } from "@/lib/apiHelper";
import { getTeamUserIds } from "@/lib/rbac";

/**
 * Everything the "Record a sale" form needs, scoped to the caller:
 *  - sellable vehicles (warehouse + the dealers they cover)
 *  - who the sale can be attributed to
 *  - dealers a warehouse sale can be booked through
 * Gated by sales.create only, so FECs can sell without inventory/dealer admin rights.
 */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "sales.create");
    if (auth.error) return auth.error;
    const uid = new mongoose.Types.ObjectId(auth.user.userId);
    const role = auth.user.role;

    let dealerFilter: Record<string, any> = { status: "ACTIVE" };
    let sellerFilter: Record<string, any> = { status: "ACTIVE", role: { $in: ["FEC", "ASM"] } };

    if (role === "FEC") {
      const me = await User.findById(uid).lean();
      dealerFilter = me?.dealer ? { _id: me.dealer } : { _id: null };
      sellerFilter = { _id: uid };
    } else if (role === "ASM") {
      dealerFilter = { status: "ACTIVE", assignedASM: uid };
      sellerFilter = { _id: { $in: [uid, ...(await getTeamUserIds(uid))] }, status: "ACTIVE" };
    }

    const dealers = await Dealer.find(dealerFilter).select("name city dealerCode").sort({ name: 1 }).lean();
    const vehicles = await Vehicle.find({
      $or: [
        { status: "IN_STOCK" },
        { status: "ALLOCATED_TO_DEALER", currentLocationDealer: { $in: dealers.map((d: any) => d._id) } },
      ],
    })
      .populate("model", "name variant category sellingPrice gstRate rangeKm batteryType")
      .populate("currentLocationDealer", "name city")
      .select("chassisNumber color status model currentLocationDealer currentLocationType")
      .sort({ createdAt: 1 })
      .lean();
    const sellers = await User.find(sellerFilter).select("name employeeCode role").sort({ role: 1, name: 1 }).lean();

    return jsonResponse({ vehicles, sellers, dealers });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to load sale options", 500);
  }
}
