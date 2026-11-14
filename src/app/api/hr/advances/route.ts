import mongoose from "mongoose";
import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { AdvanceLoan, ExpenseClaim } from "@/models/Hr";
import { requestAdvance } from "@/services/hrMoneyService";
import { teamScope } from "@/services/hrService";

/** Advances/loans and claims I can see: mine, my team's (managers), everyone's (HR / approvers). */
export const GET = handle(async ({ user }) => {
  const all = (await hasPermission(user.role, "hr.manage")) || (await hasPermission(user.role, "approvals.sign"));
  const scope = all ? null : await teamScope(user);
  const f = scope ? { employee: { $in: scope } } : {};
  const [advances, claims] = await Promise.all([
    AdvanceLoan.find(f).sort({ createdAt: -1 }).limit(200).lean(),
    ExpenseClaim.find(f).sort({ createdAt: -1 }).limit(300).select("-__v").lean(),
  ]);
  return { advances, claims, me: new mongoose.Types.ObjectId(user.userId) };
}, "hr.self");

export const POST = handle(async ({ req, user }) => requestAdvance(user, await req.json()), "hr.self");
