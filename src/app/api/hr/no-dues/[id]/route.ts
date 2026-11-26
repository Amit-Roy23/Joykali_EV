import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { cancelNoDues, decideNoDues, submitNoDues, tickItem } from "@/services/noDuesService";

/** { action: tick, key, status, note } · submit · approve {note} · reject {note} · cancel {reason} */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  if (b.action === "tick") return tickItem(user, params.id, b);
  if (b.action === "submit") return submitNoDues(user, params.id);
  if (b.action === "approve") return decideNoDues(user, params.id, "APPROVE", b.note);
  if (b.action === "reject") return decideNoDues(user, params.id, "REJECT", b.note);
  if (b.action === "cancel") return cancelNoDues(user, params.id, b.reason);
  return errorResponse("Unknown action", 400);
});
