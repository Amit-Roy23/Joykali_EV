import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Purchase } from "@/models/Purchase";
import { createPurchase } from "@/services/purchaseService";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { PurchaseCreateSchema } from "@/validators";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "purchase.view");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "15")));
    const search = searchParams.get("search")?.trim() || "";

    const query: any = {};
    if (search) {
      query.$or = [
        { purchaseCode: { $regex: search, $options: "i" } },
        { invoiceNumber: { $regex: search, $options: "i" } },
      ];
    }

    const total = await Purchase.countDocuments(query);
    const purchases = await Purchase.find(query)
      .populate("supplier", "name gstin")
      .populate("lineItems.model", "name variant category")
      .populate("createdBy", "name employeeCode")
      .sort({ invoiceDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return jsonResponse(purchases, {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch purchases", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "purchase.manage");
    if (auth.error) return auth.error;

    const body = await req.json();
    const parseResult = PurchaseCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const purchase = await createPurchase(parseResult.data, auth.user);

    await logAudit({
      user: auth.user,
      action: "CREATE",
      resource: "PURCHASE",
      resourceId: String(purchase._id),
      after: {
        purchaseCode: purchase.purchaseCode,
        invoiceNumber: purchase.invoiceNumber,
        totalAmount: purchase.totalAmount,
      },
    });

    return jsonResponse(purchase, undefined, 201);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to create purchase", 500);
  }
}

