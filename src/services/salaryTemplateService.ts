import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import { SalaryTemplate } from "@/models/SalaryTemplate";
import { PayrollRun } from "@/models/PayrollRun";
import { Setting } from "@/models/Setting";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { periodOf } from "@/lib/period";
import {
  breakupFromGross,
  defaultComponents,
  DEFAULT_STATUTORY,
  grossForCtc,
  StatutoryOptions,
  statutoryFromSettings,
  TemplateComponent,
  validateTemplate,
} from "./salaryTemplateEngine";

export class TemplateError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface SalarySetup {
  source: "template" | "default";
  templateId: string | null;
  effectiveFrom: string | null;
  components: TemplateComponent[];
  statutory: StatutoryOptions;
}

const plain = (c: any): TemplateComponent => ({
  key: c.key,
  name: c.name,
  kind: c.kind,
  calc: c.calc,
  value: c.value,
  pfWage: !!c.pfWage,
  prorate: c.prorate !== false,
  active: c.active !== false,
});

/** The approved template in force for a payroll month (YYYY-MM), or null before the first one. */
export async function templateFor(period: string) {
  return SalaryTemplate.findOne({ status: "APPROVED", effectiveFrom: { $lte: period } }).sort({ effectiveFrom: -1, updatedAt: -1 }).lean();
}

/** Columns + statutory options for a month: the approved template, else the company defaults. */
export async function setupFor(period: string): Promise<SalarySetup> {
  const t: any = await templateFor(period);
  if (t) return { source: "template", templateId: String(t._id), effectiveFrom: t.effectiveFrom, components: t.components.map(plain), statutory: { ...DEFAULT_STATUTORY, ...t.statutory } };
  const s: any = await Setting.findOne().lean();
  return {
    source: "default",
    templateId: null,
    effectiveFrom: null,
    components: defaultComponents({ basicPct: 50, hraPctOfBasic: 40, conveyancePaise: 160000, ...(s?.salaryRules || {}) }),
    statutory: statutoryFromSettings(s?.statutoryDeductions),
  };
}

export const currentPeriod = () => {
  const p = periodOf(new Date());
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
};

/** History of templates plus what applies this month. */
export async function templateOverview() {
  const [list, current] = await Promise.all([SalaryTemplate.find().sort({ effectiveFrom: -1, createdAt: -1 }).limit(30).lean(), setupFor(currentPeriod())]);
  return { current, list, period: currentPeriod() };
}

async function canPropose(user: JWTPayload) {
  return (await hasPermission(user.role, "payroll.run")) || (await hasPermission(user.role, "settings.manage")) || (await hasPermission(user.role, "accounts.manage"));
}

/** Propose new salary columns / PF-ESI options from a month. Business Head then Managing Partner approve. */
export async function proposeTemplate(user: JWTPayload, input: { effectiveFrom: string; components: TemplateComponent[]; statutory: StatutoryOptions; reason: string }) {
  if (!(await canPropose(user))) throw new TemplateError("Not allowed", 403);
  if (!/^\d{4}-\d{2}$/.test(input.effectiveFrom || "")) throw new TemplateError("Choose the month it starts from");
  if (input.effectiveFrom < currentPeriod()) throw new TemplateError("A new structure can start this month or later, not in the past");
  const [y, m] = input.effectiveFrom.split("-").map(Number);
  if (await PayrollRun.exists({ year: y, month: m, status: "LOCKED" })) throw new TemplateError(`Payroll for ${input.effectiveFrom} is locked — choose a later month`);
  if (!input.reason?.trim()) throw new TemplateError("Give a reason for the change");
  const components = (input.components || []).map((c) => ({
    ...plain(c),
    name: String(c.name || "").trim(),
    value: c.calc === "FIXED" ? Math.round(Number(c.value)) : Math.round(Number(c.value) * 100) / 100,
  }));
  // Columns added in the editor carry a temporary "new_" key; give them a clean one.
  for (const c of components) {
    if (!c.key.startsWith("new_")) continue;
    let key = c.key.slice(4) || "col";
    let n = 2;
    while (components.some((x) => x !== c && x.key === key)) key = `${c.key.slice(4)}_${n++}`;
    c.key = key;
  }
  const statutory: StatutoryOptions = { ...DEFAULT_STATUTORY, ...(input.statutory || {}) };
  for (const k of Object.keys(DEFAULT_STATUTORY) as Array<keyof StatutoryOptions>) {
    if (typeof DEFAULT_STATUTORY[k] === "number") (statutory as any)[k] = Number((statutory as any)[k]);
    if (typeof DEFAULT_STATUTORY[k] === "boolean") (statutory as any)[k] = !!(statutory as any)[k];
  }
  const problem = validateTemplate(components, statutory);
  if (problem) throw new TemplateError(problem);
  if (await SalaryTemplate.exists({ status: "PENDING_APPROVAL" })) throw new TemplateError("Another salary structure change is already waiting for approval", 409);
  const t = await SalaryTemplate.create({
    effectiveFrom: input.effectiveFrom,
    components,
    statutory,
    status: "PENDING_APPROVAL",
    approvals: [],
    reason: input.reason.trim(),
    proposedBy: new mongoose.Types.ObjectId(user.userId),
    proposedByName: user.name,
  });
  await logAudit({ user, action: "SUBMIT", resource: "SALARY", resourceId: String(t._id), after: { template: input.effectiveFrom, columns: components.map((c) => `${c.name}:${c.calc}:${c.value}`) } });
  return t;
}

export async function withdrawTemplate(user: JWTPayload, id: string) {
  if (!mongoose.isValidObjectId(id)) throw new TemplateError("Not found", 404);
  const t = await SalaryTemplate.findById(id);
  if (!t || t.status !== "PENDING_APPROVAL") throw new TemplateError("Nothing pending to withdraw", 404);
  if (String(t.proposedBy) !== user.userId && !(await hasPermission(user.role, "settings.manage"))) throw new TemplateError("Only the proposer can withdraw it", 403);
  t.status = "REJECTED";
  t.reason = `${t.reason} · withdrawn by ${user.name}`;
  await t.save();
  return t;
}

/** Try a template on a sample salary before proposing it. */
export function previewTemplate(input: { components: TemplateComponent[]; statutory: StatutoryOptions; mode?: "GROSS" | "CTC"; amountRupees: number; flags?: { pf: boolean; esi: boolean; professionalTax: boolean } }) {
  const components = (input.components || []).map(plain);
  const statutory = { ...DEFAULT_STATUTORY, ...(input.statutory || {}) };
  const problem = validateTemplate(components, statutory);
  if (problem) throw new TemplateError(problem);
  const flags = input.flags || { pf: true, esi: true, professionalTax: true };
  const amount = Math.round(Number(input.amountRupees) * 100);
  if (!Number.isFinite(amount) || amount <= 0) throw new TemplateError("Enter a sample salary");
  const gross = input.mode === "CTC" ? grossForCtc(amount, components, statutory, flags) : amount;
  return breakupFromGross(gross, components, statutory, flags);
}
