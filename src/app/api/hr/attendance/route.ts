import { handle } from "@/lib/route";
import { HrError, monthAttendance, teamScope, todayIst } from "@/services/hrService";

/** One employee's month: ?employeeId= (default me) &period=YYYY-MM */
export const GET = handle(async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("employeeId") || user.userId;
  const scope = await teamScope(user);
  if (scope && !scope.some((s) => String(s) === id)) throw new HrError("Not in your team", 403);
  return monthAttendance(id, sp.get("period") || todayIst().slice(0, 7));
}, "hr.self");
