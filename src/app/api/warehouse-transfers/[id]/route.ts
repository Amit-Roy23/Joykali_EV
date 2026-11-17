import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { cancelWarehouseTransfer, getWarehouseTransfer, receiveWarehouseTransfer } from "@/services/warehouseService";

export const GET = handle(async ({ user, params }) => getWarehouseTransfer(user, params.id), "warehouse.view");

/** { action: "receive", items?: [{ vehicleId, condition, remarks }] } | { action: "cancel", reason } */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  if (b.action === "receive") return receiveWarehouseTransfer(user, params.id, b.items);
  if (b.action === "cancel") return cancelWarehouseTransfer(user, params.id, b.reason);
  return errorResponse("Unknown action", 400);
}, "warehouse.transfer");
