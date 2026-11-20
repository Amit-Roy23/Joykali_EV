import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { errorResponse } from "@/lib/apiHelper";
import { markRepaired, stockBoard, stockIn, stockOut, transferItems } from "@/services/itemService";

/** Stock board for parts, accessories, batteries and chargers. */
export const GET = handle(async ({ req }) => {
  const p = req.nextUrl.searchParams;
  return stockBoard({ warehouse: p.get("warehouse") || undefined, category: p.get("category") || undefined, q: p.get("q") || undefined });
}, "inventory.view");

/** Stock actions: { action: "in" | "out" | "repaired" | "transfer", ... }. Warehouse rights are checked per warehouse. */
export const POST = handle(async ({ req, user }) => {
  if (!(await hasPermission(user.role, "inventory.manage")) && !(await hasPermission(user.role, "warehouse.transfer"))) return errorResponse("Not allowed", 403);
  const b = await req.json();
  if (b.action === "in") return stockIn(user, b);
  if (b.action === "out") return stockOut(user, b);
  if (b.action === "repaired") return markRepaired(user, b);
  if (b.action === "transfer") return transferItems(user, b);
  return errorResponse("Unknown action", 400);
});
