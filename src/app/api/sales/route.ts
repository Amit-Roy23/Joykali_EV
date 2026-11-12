import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Sale } from "@/models/Sale";
import { createSale } from "@/services/salesService";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { SaleCreateSchema } from "@/validators";
import { getScopeFilter } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

// Heavy work (recalculation, PDFs, spreadsheets): allow up to 60s on Vercel.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "15")));
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status");
    const paymentMode = searchParams.get("paymentMode");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // Enforce data scoping
    const scopeFilter = await getScopeFilter(auth.user, "sales");
    const query: any = { ...scopeFilter };

    if (search) {
      query.$or = [
        { saleCode: { $regex: search, $options: "i" } },
        { "customer.name": { $regex: search, $options: "i" } },
        { "customer.phone": { $regex: search, $options: "i" } },
      ];
    }

    if (status) query.status = status;
    if (paymentMode) query.paymentMode = paymentMode;

    if (startDate || endDate) {
      query.saleDate = {};
      if (startDate) query.saleDate.$gte = new Date(startDate);
      if (endDate) query.saleDate.$lte = new Date(endDate);
    }

    const total = await Sale.countDocuments(query);
    const sales = await Sale.find(query)
      .populate({
        path: "vehicle",
        populate: { path: "model" },
      })
      .populate("soldBy", "name employeeCode role")
      .populate("dealer", "name dealerCode city")
      .sort({ saleDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return jsonResponse(sales, {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch sales", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "sales.create");
    if (auth.error) return auth.error;

    const body = await req.json();
    const parseResult = SaleCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const sale = await createSale(parseResult.data, auth.user);

    await logAudit({
      user: auth.user,
      action: "CREATE",
      resource: "SALE",
      resourceId: String(sale._id),
      after: {
        saleCode: sale.saleCode,
        customer: sale.customer.name,
        totalAmount: sale.totalAmount,
      },
    });

    return jsonResponse(sale, undefined, 201);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to record sale", 500);
  }
}

