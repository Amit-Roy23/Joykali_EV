import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { hasPermission } from "@/lib/rbac";
import { userCan } from "@/lib/grants";
import { CashHandover } from "@/models/Accounts";
import { handoverDesk, startHandover } from "@/services/cashHandoverService";

/** Cash boxes, who holds them, the handover log. Anyone a handover is waiting for may see it. */
export const GET = handle(async ({ user }) => {
  const full = (await userCan(user, "accounts.view")) || (await hasPermission(user.role, "payment.approve"));
  const desk = await handoverDesk(user);
  if (full) return { ...desk, full: true };
  if (!(await CashHandover.exists({ to: user.userId, status: "PENDING" }))) return errorResponse("Nothing here for you", 403);
  return { full: false, forMe: desk.forMe, boxes: [], log: desk.log.filter((h: any) => String(h.to) === user.userId), staff: [], openDifferences: [], canStartAny: false, me: user.userId };
});

/** Start: { accountId, type: HANDOVER|COVER|RETURN, toUserId, reason, expectedReturn?, countedRupees, denominations?, note? } */
export const POST = handle(async ({ req, user }) => startHandover(user, await req.json()));
