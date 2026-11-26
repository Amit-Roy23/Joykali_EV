import { handle } from "@/lib/route";
import { assignmentHistory, coveredOn } from "@/services/territoryAssignService";

/** ?territory=<id>[&on=YYYY-MM-DD] — who covered it (on a date, or all spells). ?employee=<id> for one person. */
export const GET = handle(async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const territory = sp.get("territory") || undefined;
  const on = sp.get("on");
  if (territory && on && /^\d{4}-\d{2}-\d{2}$/.test(on)) return coveredOn(territory, new Date(`${on}T23:59:59+05:30`));
  return assignmentHistory({ territoryId: territory, employeeId: sp.get("employee") || undefined });
}, "network.view");
