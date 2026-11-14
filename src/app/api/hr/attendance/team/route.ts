import { handle } from "@/lib/route";
import { pendingForApprover, teamToday, todayIst } from "@/services/hrService";

/** Who is in today (or ?date=), plus what is waiting for my decision. */
export const GET = handle(async ({ req, user }) => {
  const date = req.nextUrl.searchParams.get("date") || todayIst();
  const [team, pending] = await Promise.all([teamToday(user, date), pendingForApprover(user)]);
  return { ...team, pending };
}, "attendance.team");
