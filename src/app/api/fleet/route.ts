import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { FleetVehicle } from "@/models/FleetVehicle";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { Setting } from "@/models/Setting";
import { authenticateAndAuthorize, errorResponse, failure, jsonResponse } from "@/lib/apiHelper";
import { fleetCompliance } from "@/lib/fleet";
import { logAudit } from "@/lib/audit";

const REG = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "fleet.view");
    if (auth.error) return auth.error;
    const s: any = await Setting.findOne().select("logistics").lean();
    const warn = s?.logistics?.docExpiryWarningDays ?? 15;
    const [list, busy] = await Promise.all([
      FleetVehicle.find().sort({ status: 1, registrationNo: 1 }).lean(),
      DeliveryOrder.find({ status: { $in: ["LOADING", "LOADED", "DISPATCHED"] } }).select("doCode status loading.fleetVehicle partySnapshot.name").lean(),
    ]);
    return jsonResponse(
      list.map((f: any) => ({
        ...f,
        compliance: fleetCompliance(f, new Date(), warn),
        trip: busy.find((b: any) => String(b.loading?.fleetVehicle) === String(f._id)) || null,
      }))
    );
  } catch (e) {
    return failure(e, "Failed to load fleet");
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "fleet.manage");
    if (auth.error) return auth.error;
    const b = await req.json();
    const reg = String(b.registrationNo || "").toUpperCase().replace(/[\s-]/g, "");
    if (!REG.test(reg)) return errorResponse("Enter a valid registration number, e.g. WB25K4521", 400);
    if (await FleetVehicle.findOne({ registrationNo: reg })) return errorResponse("That vehicle is already registered", 409);
    const cap = Math.floor(Number(b.capacityUnits));
    if (!cap || cap < 1 || cap > 100) return errorResponse("Capacity must be 1–100 units", 400);
    const f = await FleetVehicle.create({
      registrationNo: reg,
      vehicleType: b.vehicleType,
      makeModel: String(b.makeModel || "").trim(),
      fuel: b.fuel,
      capacityUnits: cap,
      ownership: b.ownership === "HIRED" ? "HIRED" : "OWNED",
      transporterName: b.transporterName?.trim(),
      transporterGstin: b.transporterGstin?.trim(),
      documents: [],
      status: "ACTIVE",
    });
    await logAudit({ user: auth.user, action: "CREATE", resource: "FLEET", resourceId: String(f._id), after: { reg } });
    return jsonResponse(f, undefined, 201);
  } catch (e) {
    return failure(e, "Failed to add vehicle");
  }
}
