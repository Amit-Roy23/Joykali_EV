import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { getScopeFilter } from "@/lib/rbac";
import {
  authenticateAndAuthorize,
  isValidId,
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
    if (!isValidId(id)) return errorResponse("Sale not found", 404);
    // Scoped lookup: an FEC/ASM gets 404 for sales outside their own/team scope.
    const scope = await getScopeFilter(auth.user, "sales");
    const sale = await Sale.findOne({ $and: [{ _id: id }, scope] })
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

