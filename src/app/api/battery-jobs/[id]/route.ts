import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { replaceBattery, returnBattery } from "@/services/itemService";

/** { action: "return", resolution } | { action: "replace", itemId, serialNo, warranty, chargeRupees, paymentMode, resolution } */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  if (b.action === "return") return returnBattery(user, params.id, b.resolution);
  if (b.action === "replace") return replaceBattery(user, params.id, b);
  return errorResponse("Unknown action", 400);
}, "parts.sell");
