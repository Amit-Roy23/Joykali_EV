import { handle } from "@/lib/route";
import { HrError } from "@/services/hrService";
import { acceptResignation, computeSettlement, withdrawResignation } from "@/services/hrMoneyService";

/** { action: "withdraw" } | { action: "accept", lwd, noticeWaived } | { action: "compute", otherDeductionsRupees } */
export const POST = handle(async ({ req, user, params }) => {
  const b = await req.json();
  if (b.action === "withdraw") return withdrawResignation(user, params.id);
  if (b.action === "accept") return acceptResignation(user, params.id, b);
  if (b.action === "compute") return computeSettlement(user, params.id, b);
  throw new HrError("Unknown action");
}, "hr.self");
