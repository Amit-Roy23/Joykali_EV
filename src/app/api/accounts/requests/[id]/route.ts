import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { cancelRequest, decideRequest, payRequest } from "@/services/paymentRequestService";

/** { action: approve|reject, note } · { action: pay, accountId, date, reference } · { action: cancel, reason } */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  if (b.action === "approve") return decideRequest(user, params.id, "APPROVED", b.note);
  if (b.action === "reject") return decideRequest(user, params.id, "REJECTED", b.note);
  if (b.action === "pay") return payRequest(user, params.id, b);
  if (b.action === "cancel") return cancelRequest(user, params.id, b.reason);
  return errorResponse("Unknown action", 400);
});
