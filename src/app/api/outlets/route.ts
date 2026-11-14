import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { Outlet } from "@/models/Outlet";
import { Vehicle } from "@/models/Vehicle";
import { Sale } from "@/models/Sale";
import { User } from "@/models/User";
import { hasPermission } from "@/lib/rbac";
import { createOutlet, outletOfUser } from "@/services/partnerAdminService";
import { getCurrentPeriod, getPeriodBounds } from "@/lib/period";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "outlet.view");
    if (auth.error) return auth.error;
    const q: any = {};
    if (!(await hasPermission(auth.user.role, "outlet.manage")) && auth.user.role === "OUTLET") q._id = (await outletOfUser(auth.user)) || null;
    const outlets = await Outlet.find(q).populate("territory", "name").sort({ name: 1 }).lean();
    const { start, end } = getPeriodBounds(getCurrentPeriod());
    const rows = await Promise.all(
      outlets.map(async (o: any) => ({
        ...o,
        stock: await Vehicle.countDocuments({ status: "AT_OUTLET", currentLocationOutlet: o._id }),
        monthSales: await Sale.countDocuments({ outlet: o._id, status: { $ne: "CANCELLED" }, saleDate: { $gte: start, $lte: end } }),
        staff: await User.countDocuments({ outlet: o._id, status: "ACTIVE" }),
      }))
    );
    return jsonResponse(rows);
  } catch (e) {
    return failure(e, "Failed to load outlets");
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "outlet.manage");
    if (auth.error) return auth.error;
    return jsonResponse(await createOutlet(auth.user, await req.json()), undefined, 201);
  } catch (e) {
    return failure(e, "Failed to create outlet");
  }
}
