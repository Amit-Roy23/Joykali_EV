import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { cancelSale } from "@/services/salesService";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { SaleCancelSchema } from "@/validators";
import { logAudit } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "sales.cancel");
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await req.json();
    const parseResult = SaleCancelSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const cancelledSale = await cancelSale(id, parseResult.data.reason, auth.user);

    await logAudit({
      user: auth.user,
      action: "CANCEL",
      resource: "SALE",
      resourceId: id,
      after: {
        status: "CANCELLED",
        reason: parseResult.data.reason,
      },
    });

    return jsonResponse(cancelledSale);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to cancel sale", 500);
  }
}

