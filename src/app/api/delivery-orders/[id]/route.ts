import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { FleetVehicle } from "@/models/FleetVehicle";
import { Setting } from "@/models/Setting";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { canAccessParty, distributorOf } from "@/lib/partyAccess";
import { hasPermission } from "@/lib/rbac";
import { fleetCompliance } from "@/lib/fleet";
import {
  autoPick,
  cancelDO,
  completeLoading,
  dispatchDO,
  doReadiness,
  generateDocument,
  pickVehicle,
  recordEwayBill,
  recordGRN,
  startLoading,
  submitDO,
  unpickVehicle,
} from "@/services/dispatchService";

export const maxDuration = 60;

async function canSee(user: any, d: any) {
  if (user.role === "DISTRIBUTOR") {
    const own = await distributorOf(user);
    return d.partyType === "DISTRIBUTOR" && !!own && String(own) === String(d.party);
  }
  return canAccessParty(user, d.partyType, d.party);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "dispatch.view");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Delivery order not found", 404);
    const d = await DeliveryOrder.findById(id);
    if (!d || !(await canSee(auth.user, d))) return errorResponse("Delivery order not found", 404);
    const readiness = await doReadiness(d);
    let fleet: any[] = [];
    if (["SUBMITTED"].includes(d.status) && (await hasPermission(auth.user.role, "dispatch.manage"))) {
      const s: any = await Setting.findOne().lean();
      const busy = await DeliveryOrder.find({ status: { $in: ["LOADING", "LOADED", "DISPATCHED"] } }).select("loading.fleetVehicle doCode").lean();
      fleet = (await FleetVehicle.find({ status: "ACTIVE" }).sort({ registrationNo: 1 }).lean()).map((f: any) => {
        const c = fleetCompliance(f, new Date(), s?.logistics?.docExpiryWarningDays ?? 15);
        const onDO = busy.find((b: any) => String(b.loading?.fleetVehicle) === String(f._id));
        return {
          _id: f._id,
          registrationNo: f.registrationNo,
          makeModel: f.makeModel,
          capacityUnits: f.capacityUnits,
          locked: c.locked || !!onDO,
          reasons: [...c.reasons, ...(onDO ? [`On trip with ${onDO.doCode}`] : [])],
        };
      });
    }
    const s: any = await Setting.findOne().select("logistics").lean();
    return jsonResponse({
      deliveryOrder: d.toObject(),
      readiness,
      fleet,
      settings: { separateDispatcher: s?.logistics?.requireSeparateDispatcher ?? true },
      can: {
        manage: await hasPermission(auth.user.role, "dispatch.manage"),
        grn: await hasPermission(auth.user.role, "grn.record"),
      },
    });
  } catch (e) {
    return failure(e, "Failed to load delivery order");
  }
}

/**
 * Workflow actions: { action, ...payload }
 *  submit · start-loading · pick · unpick · auto-pick · complete-loading ·
 *  generate-document · eway-bill · dispatch · cancel   (dispatch.manage)
 *  grn                                                 (grn.record)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "dispatch.view");
    if (auth.error) return auth.error;
    const { id } = await params;
    if (!isValidId(id)) return errorResponse("Delivery order not found", 404);
    const head = await DeliveryOrder.findById(id).select("partyType party").lean();
    if (!head || !(await canSee(auth.user, head))) return errorResponse("Delivery order not found", 404);
    const b = await req.json();
    const u = auth.user;

    if (b.action === "grn") {
      if (!(await hasPermission(u.role, "grn.record"))) return errorResponse("Forbidden: cannot record receipts", 403);
      return jsonResponse(await recordGRN(id, { items: b.items, remarks: b.remarks }, u));
    }
    if (!(await hasPermission(u.role, "dispatch.manage"))) return errorResponse("Forbidden: warehouse dispatch permission required", 403);
    switch (b.action) {
      case "submit":
        return jsonResponse(await submitDO(id, u));
      case "start-loading":
        return jsonResponse(await startLoading(id, b, u));
      case "pick":
        return jsonResponse(await pickVehicle(id, b.chassisNumber, u));
      case "unpick":
        return jsonResponse(await unpickVehicle(id, b.vehicleId, u));
      case "auto-pick":
        return jsonResponse(await autoPick(id, u));
      case "complete-loading":
        return jsonResponse(await completeLoading(id, b.checklist, u));
      case "generate-document":
        return jsonResponse(await generateDocument(id, u));
      case "eway-bill":
        return jsonResponse(await recordEwayBill(id, b, u));
      case "dispatch":
        return jsonResponse(await dispatchDO(id, u));
      case "cancel":
        return jsonResponse(await cancelDO(id, b.reason, u));
      default:
        return errorResponse("Unknown action", 400);
    }
  } catch (e) {
    return failure(e, "Action failed");
  }
}
