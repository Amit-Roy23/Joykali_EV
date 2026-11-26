import { handle } from "@/lib/route";
import { planStatement } from "@/services/payoutPlanService";
import { errorResponse } from "@/lib/apiHelper";
import { hasPermission } from "@/lib/rbac";

/** Each ASM / FSE's month against the structure (all for payroll; an ASM sees their team; an FSE themself). */
export const GET = handle(async ({ req, user }) => {
  if (!(await hasPermission(user.role, "scheme.view")) && !(await hasPermission(user.role, "payroll.view"))) return errorResponse("Not allowed", 403);
  return planStatement(user, req.nextUrl.searchParams.get("period") || undefined);
});
