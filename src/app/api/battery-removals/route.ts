import { handle } from "@/lib/route";
import { batteryRemovals, BATTERY_REMOVAL_REASONS } from "@/services/itemService";

/** Register of batteries taken out of vehicles. ?status=REMOVED|REFITTED &reason= &q= */
export const GET = handle(async ({ req }) => {
  const p = req.nextUrl.searchParams;
  return {
    reasons: BATTERY_REMOVAL_REASONS,
    list: await batteryRemovals({ status: p.get("status") || undefined, reason: p.get("reason") || undefined, q: p.get("q") || undefined }),
  };
}, "inventory.view");
