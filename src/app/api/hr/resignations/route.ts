import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { Resignation } from "@/models/Hr";
import { teamScope } from "@/services/hrService";
import { submitResignation } from "@/services/hrMoneyService";

export const GET = handle(async ({ user }) => {
  const all = (await hasPermission(user.role, "hr.manage")) || (await hasPermission(user.role, "approvals.sign"));
  const scope = all ? null : await teamScope(user);
  return Resignation.find(scope ? { employee: { $in: scope } } : {}).sort({ createdAt: -1 }).lean();
}, "hr.self");
export const POST = handle(async ({ req, user }) => submitResignation(user, await req.json()), "hr.self");
