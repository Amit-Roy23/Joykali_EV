import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { errorResponse } from "@/lib/apiHelper";
import { planSheet, savePlan } from "@/services/payoutPlanService";

/** The planning sheet. Payroll / HR / MP / Admin see every post; others only their own post's row. */
export const GET = handle(async ({ req, user }) => {
  if (!(await hasPermission(user.role, "scheme.view")) && !(await hasPermission(user.role, "payroll.view"))) return errorResponse("Not allowed", 403);
  const period = req.nextUrl.searchParams.get("period") || undefined;
  const s = await planSheet(period);
  const all = (await hasPermission(user.role, "payroll.view")) || (await hasPermission(user.role, "payslip.view.all"));
  const canEdit = await hasPermission(user.role, "payroll.lock");
  if (all) return { ...s, canEdit, all: true };
  return { period: s.period, sheet: s.sheet.filter((r: any) => r.role === user.role), versions: [], grandTotalNow: 0, canEdit: false, all: false };
});

/** Change the structure for a post from a month on (MP / Admin). */
export const PUT = handle(async ({ req, user }) => savePlan(user, await req.json()));
