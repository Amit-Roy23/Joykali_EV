import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { acceptHandover, cancelHandover, settleDifference } from "@/services/cashHandoverService";

/** { action: accept, countedRupees, denominations?, note? } · { action: cancel, reason } · { action: settle, how: MADE_GOOD|WRITTEN_OFF, note } */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  if (b.action === "accept") return acceptHandover(user, params.id, b);
  if (b.action === "cancel") return cancelHandover(user, params.id, b.reason);
  if (b.action === "settle") return settleDifference(user, params.id, b);
  return errorResponse("Unknown action", 400);
});
