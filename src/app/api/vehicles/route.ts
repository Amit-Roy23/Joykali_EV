import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Vehicle } from "@/models/Vehicle";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { getScopeFilter } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "inventory.view");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "15")));
    const search = searchParams.get("search")?.trim() || "";
    const model = searchParams.get("model");
    const status = searchParams.get("status");
    const locationType = searchParams.get("locationType");
    const dealerId = searchParams.get("dealerId");

    const scopeFilter = await getScopeFilter(auth.user, "inventory");
    const query: any = { ...scopeFilter };

    if (search) {
      query.$or = [
        { chassisNumber: { $regex: search, $options: "i" } },
        { motorNumber: { $regex: search, $options: "i" } },
        { batteryNumber: { $regex: search, $options: "i" } },
      ];
    }

    if (model) query.model = model;
    if (status) query.status = status;
    if (locationType) query.currentLocationType = locationType;
    if (dealerId) query.currentLocationDealer = dealerId;

    const total = await Vehicle.countDocuments(query);
    const vehicles = await Vehicle.find(query)
      .populate("model")
      .populate("currentLocationDealer", "name dealerCode city")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return jsonResponse(vehicles, {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch vehicles", 500);
  }
}

