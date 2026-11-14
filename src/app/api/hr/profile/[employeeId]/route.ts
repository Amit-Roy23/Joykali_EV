import { handle } from "@/lib/route";
import { updateProfile } from "@/services/hrMoneyService";

export const PUT = handle(async ({ req, user, params }) => updateProfile(user, params.employeeId, await req.json()), "hr.self");
