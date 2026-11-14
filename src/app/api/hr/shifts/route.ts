import { handle } from "@/lib/route";
import { Shift } from "@/models/Hr";
import { upsertShift } from "@/services/hrService";

export const GET = handle(async () => Shift.find().sort({ start: 1 }).lean());
export const POST = handle(async ({ req, user }) => upsertShift(user, await req.json()), "hr.manage");
