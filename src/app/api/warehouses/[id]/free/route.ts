import { handle } from "@/lib/route";
import { freeUnits } from "@/services/warehouseService";

export const GET = handle(async ({ params }) => freeUnits(params.id), "warehouse.view");
