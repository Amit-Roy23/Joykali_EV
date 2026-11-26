import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { errorResponse } from "@/lib/apiHelper";
import { batteryRemovals, refitBattery, removeBattery } from "@/services/itemService";

/** Battery history of one vehicle. */
export const GET = handle(async ({ params }) => batteryRemovals({ vehicleId: params.id }), "inventory.view");

/**
 * { action: "remove", reason, notes, batteryItemId?, warehouseId?, condition? }
 * { action: "refit", itemId?, serialNo?, warehouseId?, notes? }
 * Allowed for stock managers (inventory.manage) and store managers for their own warehouse.
 */
export const POST = handle(async ({ req, user, params }) => {
  if (!(await hasPermission(user.role, "inventory.manage")) && !(await hasPermission(user.role, "warehouse.transfer"))) return errorResponse("Not allowed", 403);
  const b = await req.json();
  if (b.action === "remove") {
    const r = await removeBattery(user, { ...b, vehicleId: params.id });
    return { removal: r.record };
  }
  if (b.action === "refit") {
    const r = await refitBattery(user, { ...b, vehicleId: params.id });
    return { removal: r.record };
  }
  return errorResponse("Unknown action", 400);
});
