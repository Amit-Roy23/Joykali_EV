import { handle } from "@/lib/route";
import { removeHoliday } from "@/services/hrService";

export const DELETE = handle(async ({ user, params }) => removeHoliday(user, params.id), "hr.manage");
