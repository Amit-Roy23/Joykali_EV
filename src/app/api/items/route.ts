import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { errorResponse } from "@/lib/apiHelper";
import { createItem, listItems } from "@/services/itemService";

const canSee = async (role: any) =>
  (await hasPermission(role, "inventory.view")) || (await hasPermission(role, "sales.create")) || (await hasPermission(role, "parts.sell")) || (await hasPermission(role, "purchase.create"));

/** Item master with stock on hand. ?category= ?q= ?active=1 ?warehouse= */
export const GET = handle(async ({ req, user }) => {
  if (!(await canSee(user.role))) return errorResponse("Not allowed", 403);
  const p = req.nextUrl.searchParams;
  return listItems({ category: p.get("category") || undefined, q: p.get("q") || undefined, active: p.get("active") || undefined, warehouse: p.get("warehouse") || undefined });
});

export const POST = handle(async ({ req, user }) => createItem(user, await req.json()), "inventory.manage");
