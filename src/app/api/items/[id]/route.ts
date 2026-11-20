import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { errorResponse } from "@/lib/apiHelper";
import { itemDetail, updateItem } from "@/services/itemService";

export const GET = handle(async ({ user, params }) => {
  if (!(await hasPermission(user.role, "inventory.view")) && !(await hasPermission(user.role, "parts.sell"))) return errorResponse("Not allowed", 403);
  return itemDetail(params.id);
});

/** Edit details (inventory.manage) and/or rates (price.manage — kept in the rate history). */
export const PUT = handle(async ({ req, user, params }) => {
  if (!(await hasPermission(user.role, "inventory.manage")) && !(await hasPermission(user.role, "price.manage"))) return errorResponse("Not allowed", 403);
  return updateItem(user, params.id, await req.json());
});
