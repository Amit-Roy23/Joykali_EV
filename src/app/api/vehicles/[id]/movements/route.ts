import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Vehicle } from "@/models/Vehicle";
import { StockMovement } from "@/models/StockMovement";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "inventory.view");
    if (auth.error) return auth.error;

    const { id } = await params;
    const vehicle = await Vehicle.findById(id)
      .populate("model")
      .populate("currentLocationDealer")
      .lean();

    if (!vehicle) return errorResponse("Vehicle not found", 404);

    const movements = await StockMovement.find({ vehicle: vehicle._id })
      .populate("performedBy", "name employeeCode")
      .sort({ timestamp: -1 })
      .lean();

    return jsonResponse({
      vehicle,
      movements,
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch vehicle history", 500);
  }
}

