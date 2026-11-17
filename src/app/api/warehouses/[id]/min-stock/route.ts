import { handle } from "@/lib/route";
import { setMinStock } from "@/services/warehouseService";

/** { rows: [{ modelId, qty }] } */
export const PUT = handle(async ({ req, user, params }) => setMinStock(user, params.id, (await req.json()).rows), "warehouse.transfer");
