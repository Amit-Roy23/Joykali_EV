import { handle } from "@/lib/route";
import { saveWarehouse } from "@/services/warehouseService";

export const PATCH = handle(async ({ req, user, params }) => saveWarehouse(user, { ...(await req.json()), id: params.id }), "warehouse.manage");
