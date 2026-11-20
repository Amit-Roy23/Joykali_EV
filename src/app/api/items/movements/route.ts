import { handle } from "@/lib/route";
import { movementRegister } from "@/services/itemService";

export const GET = handle(async ({ req }) => {
  const p = req.nextUrl.searchParams;
  return movementRegister({ itemId: p.get("item") || undefined, warehouseId: p.get("warehouse") || undefined, type: p.get("type") || undefined, from: p.get("from") || undefined, to: p.get("to") || undefined });
}, "inventory.view");
