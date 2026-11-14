import { handle } from "@/lib/route";
import { LeaveType } from "@/models/Hr";
import { applyLeave, HrError, leaveBalances, teamScope } from "@/services/hrService";

/** Leave types + balances (?employeeId= for managers/HR). */
export const GET = handle(async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("employeeId") || user.userId;
  const scope = await teamScope(user);
  if (scope && !scope.some((s) => String(s) === id)) throw new HrError("Not in your team", 403);
  const year = Number(sp.get("year") || new Date().getFullYear());
  return { types: await LeaveType.find({ isActive: true }).sort({ code: 1 }).lean(), balances: await leaveBalances(id, year) };
}, "hr.self");

export const POST = handle(async ({ req, user }) => applyLeave(user, await req.json()), "hr.self");
