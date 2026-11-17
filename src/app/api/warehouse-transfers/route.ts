import { handle } from "@/lib/route";
import { createWarehouseTransfer, listWarehouseTransfers } from "@/services/warehouseService";

export const GET = handle(
  async ({ req, user }) =>
    listWarehouseTransfers(user, {
      status: req.nextUrl.searchParams.get("status") || undefined,
      warehouseId: req.nextUrl.searchParams.get("warehouse") || undefined,
    }),
  "warehouse.view"
);

/** { fromId, toId, vehicleIds? | lines?: [{ modelId, quantity }], transport, remarks } */
export const POST = handle(async ({ req, user }) => createWarehouseTransfer(user, await req.json()), "warehouse.transfer");
