import { NextRequest } from "next/server";
import { creditSummary } from "@/services/creditService";
import { requestCreditChange } from "@/services/orderService";
import { connectToDatabase } from "@/lib/db";
import { Dealer } from "@/models/Dealer";
import { Vehicle } from "@/models/Vehicle";
import { Sale } from "@/models/Sale";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { DealerSchema } from "@/validators";
import { generateDealerCode } from "@/lib/codeGenerator";
import { getScopeFilter } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "dealer.view");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status");

    const scopeFilter = await getScopeFilter(auth.user, "dealers");
    const query: any = { ...scopeFilter };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { dealerCode: { $regex: search, $options: "i" } },
        { ownerName: { $regex: search, $options: "i" } },
        { city: { $regex: search, $options: "i" } },
      ];
    }
    if (status) query.status = status;

    const dealers = await Dealer.find(query)
      .populate("assignedASM", "name employeeCode")
      .sort({ createdAt: -1 })
      .lean();

    // Attach live counts: vehicles in stock and vehicles sold through dealer
    const dealerIds = dealers.map((d: any) => d._id);

    const stockCounts = await Vehicle.aggregate([
      {
        $match: {
          currentLocationDealer: { $in: dealerIds },
          status: "ALLOCATED_TO_DEALER",
        },
      },
      {
        $group: {
          _id: "$currentLocationDealer",
          count: { $sum: 1 },
        },
      },
    ]);

    const soldCounts = await Sale.aggregate([
      {
        $match: {
          dealer: { $in: dealerIds },
          status: "DELIVERED",
        },
      },
      {
        $group: {
          _id: "$dealer",
          count: { $sum: 1 },
        },
      },
    ]);

    const stockMap = new Map(stockCounts.map((s: any) => [String(s._id), s.count]));
    const soldMap = new Map(soldCounts.map((s: any) => [String(s._id), s.count]));

    const enriched = await Promise.all(
      dealers.map(async (d: any) => ({
        ...d,
        stockCount: stockMap.get(String(d._id)) || 0,
        soldCount: soldMap.get(String(d._id)) || 0,
        credit: await creditSummary("DEALER", d._id).catch(() => null),
      }))
    );

    return jsonResponse(enriched);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch dealers", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "dealer.manage");
    if (auth.error) return auth.error;

    const body = await req.json();
    const parseResult = DealerSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const data = parseResult.data;
    const dealerCode = await generateDealerCode();

    const dealer = await Dealer.create({
      dealerCode,
      name: data.name.trim(),
      ownerName: data.ownerName.trim(),
      phone: data.phone.trim(),
      email: data.email.toLowerCase().trim(),
      address: data.address.trim(),
      city: data.city.trim(),
      state: data.state.trim(),
      gstin: data.gstin.toUpperCase().trim(),
      stateCode: data.gstin.toUpperCase().trim().slice(0, 2) || "19",
      pincode: String(body.pincode || "").trim(),
      creditLimit: 0, // set only through an approved credit request
      creditDays: Math.min(180, Math.max(0, Number(body.creditDays ?? 30))),
      assignedASM: data.assignedASM ? new mongoose.Types.ObjectId(data.assignedASM) : null,
      status: data.status || "ACTIVE",
      onboardingDate: new Date(),
      createdBy: new mongoose.Types.ObjectId(auth.user.userId),
    });

    if (Number(body.requestedCreditLimit) > 0) {
      await requestCreditChange(
        {
          partyType: "DEALER",
          partyId: String(dealer._id),
          toLimitRupees: Number(body.requestedCreditLimit),
          creditDays: dealer.creditDays,
          reason: "Opening credit limit at onboarding",
        },
        auth.user
      );
    }

    await logAudit({
      user: auth.user,
      action: "CREATE",
      resource: "DEALER",
      resourceId: String(dealer._id),
      after: { dealerCode: dealer.dealerCode, name: dealer.name },
    });

    return jsonResponse(dealer, undefined, 201);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to create dealer", 500);
  }
}

