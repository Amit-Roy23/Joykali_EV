import { handle } from "@/lib/route";
import { approveOvertime } from "@/services/hrService";

export const POST = handle(async ({ req, user }) => {
  const b = await req.json();
  return approveOvertime(user, b.employeeId, b.dates || []);
}, "attendance.team");
