import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Purchase } from "@/models/Purchase";
import { Vehicle } from "@/models/Vehicle";
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
    const auth = await authenticateAndAuthorize(req, "purchase.view");
    if (auth.error) return auth.error;

    const { id } = await params;
    const purchase = await Purchase.findById(id)
      .populate("supplier")
      .populate("lineItems.model")
      .populate("createdBy", "name employeeCode")
      .lean();

    if (!purchase) return errorResponse("Purchase not found", 404);

    const vehicles = await Vehicle.find({ purchase: purchase._id })
      .populate("model")
      .lean();

    return jsonResponse({
      purchase,
      vehicles,
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch purchase details", 500);
  }
}

