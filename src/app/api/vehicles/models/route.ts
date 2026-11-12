import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { VehicleModel } from "@/models/VehicleModel";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { VehicleModelSchema } from "@/validators";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const activeOnly = searchParams.get("activeOnly") === "true";

    const query: any = {};
    if (category) query.category = category;
    if (activeOnly) query.isActive = true;

    const models = await VehicleModel.find(query).sort({ name: 1, variant: 1 }).lean();
    return jsonResponse(models);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch vehicle models", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "inventory.manage");
    if (auth.error) return auth.error;

    const body = await req.json();
    const parseResult = VehicleModelSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const data = parseResult.data;

    const existing = await VehicleModel.findOne({
      name: data.name.trim(),
      variant: data.variant.trim(),
    });
    if (existing) {
      return errorResponse("A model with this name and variant already exists", 400);
    }

    const model = await VehicleModel.create({
      name: data.name.trim(),
      variant: data.variant.trim(),
      category: data.category,
      batteryType: data.batteryType.trim(),
      rangeKm: data.rangeKm,
      purchasePrice: rupeesToPaise(data.purchasePrice),
      sellingPrice: rupeesToPaise(data.sellingPrice),
      gstRate: data.gstRate ?? 5,
      hsnCode: data.hsnCode || "870380",
      isActive: data.isActive ?? true,
      createdBy: new mongoose.Types.ObjectId(auth.user.userId),
    });

    await logAudit({
      user: auth.user,
      action: "CREATE",
      resource: "VEHICLE",
      resourceId: String(model._id),
      after: { name: model.name, variant: model.variant },
    });

    return jsonResponse(model, undefined, 201);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to create vehicle model", 500);
  }
}

