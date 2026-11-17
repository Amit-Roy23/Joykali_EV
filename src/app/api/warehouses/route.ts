import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { errorResponse } from "@/lib/apiHelper";
import { isPartnerRole } from "@/types";
import { Warehouse } from "@/models/Warehouse";
import { mainWarehouse, myWarehouseIds, saveWarehouse, warehouseBoard } from "@/services/warehouseService";

/** ?simple=1 → active warehouses for pickers (any staff login); otherwise the full stock board. */
export const GET = handle(async ({ req, user }) => {
  if (isPartnerRole(user.role)) return errorResponse("Not allowed", 403);
  if (req.nextUrl.searchParams.get("simple")) {
    await mainWarehouse();
    const list = await Warehouse.find({ status: "ACTIVE" }).select("code name city stateCode isMain").sort({ isMain: -1, name: 1 }).lean();
    return { warehouses: list, mine: await myWarehouseIds(user) };
  }
  if (!(await hasPermission(user.role, "warehouse.view"))) return errorResponse("Not allowed", 403);
  return {
    warehouses: await warehouseBoard(),
    mine: await myWarehouseIds(user),
    canManage: await hasPermission(user.role, "warehouse.manage"),
    canTransfer: await hasPermission(user.role, "warehouse.transfer"),
  };
});

export const POST = handle(async ({ req, user }) => saveWarehouse(user, await req.json()), "warehouse.manage");
