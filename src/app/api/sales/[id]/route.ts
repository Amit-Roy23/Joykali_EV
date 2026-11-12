import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Sale } from "@/models/Sale";
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
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const { id } = await params;
    const sale = await Sale.findById(id)
      .populate({
        path: "vehicle",
        populate: { path: "model" },
      })
      .populate("soldBy", "name employeeCode role phone email")
      .populate("asmAtSale", "name employeeCode role")
      .populate("dealer", "name dealerCode city address gstin phone")
      .lean();

    if (!sale) return errorResponse("Sale not found", 404);

    return jsonResponse(sale);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch sale details", 500);
  }
}

