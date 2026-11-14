import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { Outlet } from "@/models/Outlet";
import { User } from "@/models/User";
import { StockTransfer } from "@/models/StockTransfer";
import { canSeeOutlet, outletDay } from "@/services/partnerAdminService";

/** Outlet detail with the counter summary of one day (?date=YYYY-MM-DD, IST). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "outlet.view");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id) || !(await canSeeOutlet(auth.user, id))) return errorResponse("Outlet not found", 404);
    const outlet = await Outlet.findById(id).populate("territory", "name").lean();
    if (!outlet) return errorResponse("Outlet not found", 404);
    const [day, staff, transfers] = await Promise.all([
      outletDay(id, req.nextUrl.searchParams.get("date") || undefined),
      User.find({ outlet: id }).select("name employeeCode role status").lean(),
      StockTransfer.find({ outlet: id }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    return jsonResponse({ outlet, ...day, staff, transfers });
  } catch (e) {
    return failure(e, "Failed to load outlet");
  }
}
