import { handle, fileFrom } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { hasPermission } from "@/lib/rbac";
import { isPartnerRole } from "@/types";
import { adviceList, submitAdvice } from "@/services/paymentService";

export const GET = handle(async ({ req, user }) => {
  if (!isPartnerRole(user.role) && !(await hasPermission(user.role, "ledger.view")) && !(await hasPermission(user.role, "accounts.view"))) return errorResponse("Not allowed", 403);
  return adviceList(user, req.nextUrl.searchParams.get("status") || undefined);
});

/** Partner reports a payment. multipart: amount, date, mode, utr, payerBank, note, proof */
export const POST = handle(async ({ req, user }) => {
  if (!isPartnerRole(user.role)) return errorResponse("Only dealers and distributors report payments here", 403);
  const f = await req.formData();
  const s = (k: string) => (f.get(k) as string | null) || "";
  return submitAdvice(user, { amountRupees: Number(s("amount")), date: s("date"), mode: s("mode"), utr: s("utr"), payerBank: s("payerBank"), note: s("note"), proof: await fileFrom(f, "proof") });
}, "portal.access");
