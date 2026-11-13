import { NextRequest } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { FleetVehicle } from "@/models/FleetVehicle";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { Setting } from "@/models/Setting";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { fleetCompliance } from "@/lib/fleet";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "fleet.view");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Vehicle not found", 404);
    const f: any = await FleetVehicle.findById(id).populate("documents.updatedBy", "name").lean();
    if (!f) return errorResponse("Vehicle not found", 404);
    const s: any = await Setting.findOne().select("logistics").lean();
    const trips = await DeliveryOrder.find({ "loading.fleetVehicle": f._id })
      .select("doCode status partySnapshot.name dispatch.at loading.driverName createdAt")
      .sort({ createdAt: -1 })
      .limit(15)
      .lean();
    return jsonResponse({ vehicle: f, compliance: fleetCompliance(f, new Date(), s?.logistics?.docExpiryWarningDays ?? 15), trips });
  } catch (e) {
    return failure(e, "Failed to load vehicle");
  }
}

/** Update details, activate/deactivate, or place/clear a manual hold: { hold: "reason" | null } */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "fleet.manage");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Vehicle not found", 404);
    const b = await req.json();
    const f = await FleetVehicle.findById(id);
    if (!f) return errorResponse("Vehicle not found", 404);
    for (const k of ["makeModel", "transporterName", "transporterGstin"] as const) if (typeof b[k] === "string") (f as any)[k] = b[k].trim();
    if (b.capacityUnits) f.capacityUnits = Math.max(1, Math.floor(Number(b.capacityUnits)));
    if (b.status && ["ACTIVE", "INACTIVE"].includes(b.status)) f.status = b.status;
    if ("hold" in b) {
      if (b.hold) f.manualHold = { reason: String(b.hold).trim(), by: new mongoose.Types.ObjectId(auth.user.userId), at: new Date() };
      else f.manualHold = null;
    }
    await f.save();
    await logAudit({ user: auth.user, action: "UPDATE", resource: "FLEET", resourceId: id, after: { status: f.status, hold: f.manualHold?.reason || null } });
    return jsonResponse(f);
  } catch (e) {
    return failure(e, "Failed to update vehicle");
  }
}
