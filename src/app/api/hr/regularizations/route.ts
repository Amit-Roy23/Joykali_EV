import { handle } from "@/lib/route";
import { requestRegularization } from "@/services/hrService";

export const POST = handle(async ({ req, user }) => requestRegularization(user, await req.json()), "hr.self");
