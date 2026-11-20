import { handle } from "@/lib/route";
import { purchaseWarehouses } from "@/services/purchaseService";

/** Warehouses this user may receive purchases into (store managers: only their own). */
export const GET = handle(async ({ user }) => ({ warehouses: await purchaseWarehouses(user) }));
