import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { bulkAllocateVehiclesToDealer } from "@/services/inventoryService";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { VehicleAllocateSchema } from "@/validators";
import { logAudit } from "@/lib/audit";

// Heavy work (recalculation, PDFs, spreadsheets): allow up to 60s on Vercel.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "inventory.manage");
    if (auth.error) return auth.error;

    const body = await req.json();
    const parseResult = VehicleAllocateSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const { vehicleIds, dealerId, notes } = parseResult.data;

    const result = await bulkAllocateVehiclesToDealer(
      vehicleIds,
      dealerId,
      auth.user,
      notes
    );

    await logAudit({
      user: auth.user,
      action: "UPDATE",
      resource: "VEHICLE",
      resourceId: dealerId,
      after: { allocatedVehiclesCount: result.count, vehicleIds },
    });

    return jsonResponse(result);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to allocate vehicles", 500);
  }
}

