import { handle } from "@/lib/route";
import { Holiday } from "@/models/Hr";
import { addHoliday } from "@/services/hrService";

export const GET = handle(async ({ req }) => {
  const y = req.nextUrl.searchParams.get("year") || String(new Date().getFullYear());
  return Holiday.find({ date: { $gte: `${y}-01-01`, $lte: `${y}-12-31` } }).sort({ date: 1 }).lean();
});
export const POST = handle(async ({ req, user }) => addHoliday(user, await req.json()), "hr.manage");
