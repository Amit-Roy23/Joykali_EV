import { handle } from "@/lib/route";
import { performanceBoard, todayIst } from "@/services/hrService";

export const GET = handle(async ({ req, user }) => {
  const period = req.nextUrl.searchParams.get("period") || todayIst().slice(0, 7);
  return { period, rows: await performanceBoard(user, period) };
}, "attendance.team");
