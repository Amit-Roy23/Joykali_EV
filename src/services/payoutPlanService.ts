import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import { PayoutPlan, IPayoutPlan } from "@/models/PayoutPlan";
import { User } from "@/models/User";
import { Sale } from "@/models/Sale";
import { Dealer } from "@/models/Dealer";
import { EmployeeTarget } from "@/models/Hr";
import { SalaryStructure } from "@/models/SalaryStructure";
import { IncentiveLedger } from "@/models/IncentiveLedger";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { getCurrentPeriod, getPeriodBounds } from "@/lib/period";
import { planEarnings, planRow, PlanTerms } from "./payoutPlanEngine";

export class PlanError extends Error {
  status: number;
  constructor(m: string, status = 400) {
    super(m);
    this.status = status;
  }
}
export const PLAN_ROLES = ["ASM", "FEC"] as const;
export const PLAN_LABEL: Record<string, string> = { ASM: "Area Sales Manager", FEC: "Field Sales Executive" };

/** The plan in force for a role in a month (latest version starting on or before it). */
export async function planFor(role: string, period: string): Promise<IPayoutPlan | null> {
  if (!PLAN_ROLES.includes(role as any)) return null;
  return PayoutPlan.findOne({ role, effectiveFrom: { $lte: period } }).sort({ effectiveFrom: -1 }).lean() as any;
}

/**
 * Dealers activated and vehicles sold in the month for each person, measured the way their plan says:
 * SELF = their own; TEAM = their own + everyone reporting to them (and sales booked under them as ASM).
 */
export async function planFacts(employeeIds: any[], period: string) {
  const { start, end } = getPeriodBounds(period);
  const ids = employeeIds.map((x) => String(x));
  const emps = await User.find({ _id: { $in: ids } }).select("role reportsTo").lean();
  const plans = new Map<string, IPayoutPlan | null>();
  for (const r of PLAN_ROLES) plans.set(r, await planFor(r, period));
  const teamOf = new Map<string, string[]>();
  const leaders = emps.filter((e) => plans.get(e.role)?.measure === "TEAM").map((e) => e._id);
  const reports = leaders.length ? await User.find({ reportsTo: { $in: leaders }, role: "FEC", status: "ACTIVE" }).select("reportsTo").lean() : [];
  for (const e of emps) {
    const team = plans.get(e.role)?.measure === "TEAM" ? [String(e._id), ...reports.filter((r) => String(r.reportsTo) === String(e._id)).map((r) => String(r._id))] : [String(e._id)];
    teamOf.set(String(e._id), team);
  }
  const everyone = [...new Set([...teamOf.values()].flat())].map((x) => new mongoose.Types.ObjectId(x));
  const [sales, dealers, targets] = await Promise.all([
    Sale.find({ status: "DELIVERED", saleDate: { $gte: start, $lte: end }, $or: [{ soldBy: { $in: everyone } }, { asmAtSale: { $in: everyone } }] }).select("soldBy asmAtSale").lean(),
    Dealer.find({ recruitedBy: { $in: everyone }, status: "ACTIVE", onboardingDate: { $gte: start, $lte: end } }).select("recruitedBy").lean(),
    EmployeeTarget.find({ employee: { $in: ids }, period }).lean(),
  ]);
  const out = new Map<string, { role: string; plan: IPayoutPlan | null; dealers: number; vehicles: number; target: number | null; teamSize: number }>();
  for (const e of emps) {
    const id = String(e._id);
    const plan = plans.get(e.role) || null;
    const team = new Set(teamOf.get(id));
    const vehicles = (sales as any[]).filter((s) => team.has(String(s.soldBy)) || (plan?.measure === "TEAM" && String(s.asmAtSale) === id)).length;
    const dealerCount = (dealers as any[]).filter((d) => team.has(String(d.recruitedBy))).length;
    const t: any = (targets as any[]).find((x) => String(x.employee) === id);
    out.set(id, { role: e.role, plan, dealers: dealerCount, vehicles, target: t ? t.targetUnits : null, teamSize: team.size });
  }
  return out;
}

/** Ledger lines for the payout structure (used by the incentive recalculation). */
export async function planIncentiveLines(employeeIds: any[], period: string) {
  const facts = await planFacts(employeeIds, period);
  const lines = new Map<string, any[]>();
  for (const [id, f] of facts) {
    if (!f.plan) continue;
    const e = planEarnings(f.plan as any, { dealers: f.dealers, vehicles: f.vehicles, vehicleTargetOverride: f.target });
    const name = `Payout structure — ${PLAN_LABEL[f.role]}${f.plan.measure === "TEAM" ? " (team)" : ""}`;
    lines.set(id, [
      { schemeId: f.plan._id, schemeName: name, ruleType: "PLAN_ACTIVATION", unitsCount: f.dealers, revenueCount: 0, earnedAmount: e.activation, description: `Activation benefit: ${e.activationNote}` },
      { schemeId: f.plan._id, schemeName: name, ruleType: "PLAN_TARGET", unitsCount: f.vehicles, revenueCount: 0, earnedAmount: e.target, description: `Target incentive: ${e.targetNote}` },
    ]);
  }
  return lines;
}

const P = (r: any, label: string) => {
  const n = Math.round(Number(r) * 100);
  if (!Number.isFinite(n) || n < 0) throw new PlanError(`Enter ${label}`);
  return n;
};
const N = (v: any, label: string) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) throw new PlanError(`Enter ${label}`);
  return n;
};

/** MP / Admin change the structure from a month onward (this month or later — past months stay as paid). */
export async function savePlan(user: JWTPayload, input: any) {
  if (!(await hasPermission(user.role, "payroll.lock"))) throw new PlanError("Only the Managing Partner or Admin can change the payout structure", 403);
  const role = String(input.role);
  if (!PLAN_ROLES.includes(role as any)) throw new PlanError("Choose ASM or FSE");
  const effectiveFrom = String(input.effectiveFrom || getCurrentPeriod());
  if (!/^\d{4}-\d{2}$/.test(effectiveFrom)) throw new PlanError("Choose the month it starts");
  if (effectiveFrom < getCurrentPeriod()) throw new PlanError("A change can start this month or later — earlier months are already worked out");
  const doc = {
    role,
    effectiveFrom,
    salary: P(input.salaryRupees, "the salary"),
    perDealer: P(input.perDealerRupees, "₹ per new dealer"),
    dealerTarget: N(input.dealerTarget, "the monthly dealer activation number"),
    dealerPay: input.dealerPay === "EVERY" ? "EVERY" : "ON_TARGET",
    vehicleTarget: N(input.vehicleTarget, "the monthly vehicle target"),
    perVehicle: P(input.perVehicleRupees, "₹ per vehicle"),
    vehiclePay: input.vehiclePay === "EVERY" ? "EVERY" : "ON_TARGET",
    ta: P(input.taRupees, "the TA"),
    measure: input.measure === "TEAM" ? "TEAM" : "SELF",
    headcount: N(input.headcount ?? 1, "the head count"),
    note: input.note?.trim() || "",
    updatedByName: user.name,
  };
  if (doc.dealerPay === "ON_TARGET" && doc.perDealer > 0 && doc.dealerTarget === 0) throw new PlanError("Set the monthly dealer number, or pay on every dealer");
  if (doc.vehiclePay === "ON_TARGET" && doc.perVehicle > 0 && doc.vehicleTarget === 0) throw new PlanError("Set the monthly vehicle target, or pay on every vehicle");
  const before = await planFor(role, effectiveFrom);
  const saved = await PayoutPlan.findOneAndUpdate({ role, effectiveFrom }, { $set: doc }, { upsert: true, new: true });
  await logAudit({ user, action: "UPDATE", resource: "SETTINGS", resourceId: String(saved._id), before: before ? planRow(before as any) : undefined, after: { ...doc } });
  // Re-work this month's incentives for everyone in that post if the change starts now.
  if (effectiveFrom === getCurrentPeriod()) {
    const people = await User.find({ role, status: "ACTIVE" }).select("_id").lean();
    const { recalculateIncentivesForPeriod } = await import("./incentiveService");
    await recalculateIncentivesForPeriod(people.map((p) => p._id as any), getPeriodBounds(effectiveFrom).start);
  }
  return saved;
}

/** The planning sheet (as Joykali writes it) + every version. */
export async function planSheet(period = getCurrentPeriod()) {
  const [rows, versions, counts] = await Promise.all([
    Promise.all(PLAN_ROLES.map((r) => planFor(r, period))),
    PayoutPlan.find().sort({ role: 1, effectiveFrom: -1 }).lean(),
    User.aggregate([{ $match: { role: { $in: [...PLAN_ROLES] }, status: "ACTIVE" } }, { $group: { _id: "$role", n: { $sum: 1 } } }]),
  ]);
  const people = (r: string) => counts.find((c: any) => c._id === r)?.n || 0;
  const sheet = PLAN_ROLES.map((role, i) => {
    const p: any = rows[i];
    if (!p) return { role, label: PLAN_LABEL[role], plan: null };
    const one = planRow(p as PlanTerms, 1);
    const now = planRow(p as PlanTerms, people(role));
    return { role, label: PLAN_LABEL[role], plan: p, ...one, people: people(role), totalPayoutNow: now.totalPayout, totalPayoutPlanned: planRow(p as PlanTerms, p.headcount).totalPayout };
  });
  return { period, sheet, versions, grandTotalNow: sheet.reduce((s: number, r: any) => s + (r.totalPayoutNow || 0), 0) };
}

/** Each person's month against the plan: salary, dealers, vehicles, what is earned, TA, total. */
export async function planStatement(user: JWTPayload, period = getCurrentPeriod()) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new PlanError("Choose a month");
  const all = (await hasPermission(user.role, "payroll.view")) || (await hasPermission(user.role, "payslip.view.all"));
  const f: any = { role: { $in: [...PLAN_ROLES] }, status: "ACTIVE" };
  if (!all) f.$or = [{ _id: user.userId }, { reportsTo: user.userId }];
  const people = await User.find(f).select("name employeeCode role reportsTo territories").populate("territories", "name").sort({ role: 1, name: 1 }).lean();
  const facts = await planFacts(people.map((p) => p._id), period);
  const { start } = getPeriodBounds(period);
  const [salaries, ledgers] = await Promise.all([
    SalaryStructure.find({ employee: { $in: people.map((p) => p._id) }, status: { $in: ["APPROVED", null] }, effectiveFrom: { $lte: start } }).sort({ effectiveFrom: -1 }).lean(),
    IncentiveLedger.find({ employee: { $in: people.map((p) => p._id) }, period }).lean(),
  ]);
  const rows = people.map((p: any) => {
    const id = String(p._id);
    const fx = facts.get(id)!;
    const plan: any = fx?.plan;
    const s: any = salaries.find((x: any) => String(x.employee) === id);
    const salary = s ? s.grossMonthly || s.basic + s.hra + s.conveyance + s.otherAllowances : 0;
    const e = plan ? planEarnings(plan, { dealers: fx.dealers, vehicles: fx.vehicles, vehicleTargetOverride: fx.target }) : null;
    const led: any = ledgers.find((l: any) => String(l.employee) === id);
    const otherSchemes = (led?.breakdown || []).filter((b: any) => !String(b.ruleType).startsWith("PLAN_")).reduce((t: number, b: any) => t + (b.earnedAmount || 0), 0);
    const ta = plan?.ta || 0;
    return {
      _id: p._id,
      name: p.name,
      employeeCode: p.employeeCode,
      role: p.role,
      area: (p.territories || []).map((t: any) => t.name).join(", "),
      measure: plan?.measure || "SELF",
      teamSize: fx?.teamSize || 1,
      salary,
      dealers: fx?.dealers || 0,
      dealerTarget: plan?.dealerTarget || 0,
      activation: e?.activation || 0,
      activationNote: e?.activationNote || "No payout structure",
      vehicles: fx?.vehicles || 0,
      vehicleTarget: e?.vehicleTarget || 0,
      targetIncentive: e?.target || 0,
      targetNote: e?.targetNote || "",
      otherSchemes,
      ta,
      total: salary + (e?.total || 0) + otherSchemes + ta,
      planCtc: plan ? planRow(plan).ctc : 0,
    };
  });
  return { period, rows, totals: rows.reduce((t: any, r: any) => ({ salary: t.salary + r.salary, activation: t.activation + r.activation, targetIncentive: t.targetIncentive + r.targetIncentive, ta: t.ta + r.ta, total: t.total + r.total }), { salary: 0, activation: 0, targetIncentive: 0, ta: 0, total: 0 }) };
}
