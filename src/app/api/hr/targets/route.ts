import { handle } from "@/lib/route";
import { setEmployeeTarget } from "@/services/hrService";

export const POST = handle(async ({ req, user }) => setEmployeeTarget(user, await req.json()), "attendance.team");
