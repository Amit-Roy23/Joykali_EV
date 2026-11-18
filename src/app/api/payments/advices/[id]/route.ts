import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { hasPermission } from "@/lib/rbac";
import { isPartnerRole } from "@/types";
import { rejectAdvice, verifyAdvice, withdrawAdvice } from "@/services/paymentService";

/** { action: "verify", accountId, date? } | { action: "reject", reason } | { action: "withdraw" } (partner) */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  if (b.action === "withdraw" && isPartnerRole(user.role)) return withdrawAdvice(user, params.id);
  if (!(await hasPermission(user.role, "ledger.manage"))) return errorResponse("Only Accounts can confirm or reject a payment", 403);
  if (b.action === "verify") return verifyAdvice(user, params.id, b);
  if (b.action === "reject") return rejectAdvice(user, params.id, b.reason);
  return errorResponse("Unknown action", 400);
});
