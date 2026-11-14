import { handle } from "@/lib/route";
import { rosterWeek, setRoster, todayIst } from "@/services/hrService";

export const GET = handle(async ({ req, user }) => rosterWeek(user, req.nextUrl.searchParams.get("from") || todayIst()), "attendance.team");
export const POST = handle(async ({ req, user }) => setRoster(user, await req.json()), "attendance.team");
