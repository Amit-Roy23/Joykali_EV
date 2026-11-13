import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { authenticateAndAuthorize, failure, jsonResponse } from "@/lib/apiHelper";
import { partyFilter } from "@/lib/partyAccess";
import { createDeliveryOrder } from "@/services/dispatchService";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "dispatch.view");
    if (auth.error) return auth.error;
    const sp = req.nextUrl.searchParams;
    const query: Record<string, any> = { ...(await partyFilter(auth.user)) };
    if (sp.get("status")) query.status = { $in: sp.get("status")!.split(",") };
    if (sp.get("order")) query.order = sp.get("order");
    const list = await DeliveryOrder.find(query)
      .select("doCode orderCode partyType partySnapshot.name partySnapshot.city lines status loading.registrationNo document.number document.totalValue ewayBill dispatch grn.grnNo vehicles.chassisNumber createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .limit(300)
      .lean();
    return jsonResponse(
      list.map((d: any) => ({ ...d, units: d.lines.reduce((s: number, l: any) => s + l.quantity, 0), picked: d.vehicles?.length || 0 }))
    );
  } catch (e) {
    return failure(e, "Failed to load delivery orders");
  }
}

/** Raise a DO against an approved order: { orderId, lines: [{ modelId, quantity }] } */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "dispatch.manage");
    if (auth.error) return auth.error;
    const b = await req.json();
    return jsonResponse(await createDeliveryOrder(b.orderId, b.lines, auth.user), undefined, 201);
  } catch (e) {
    return failure(e, "Failed to create delivery order");
  }
}
