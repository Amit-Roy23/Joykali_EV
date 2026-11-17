/**
 * Salary engine driven by the company's salary template (editable columns with percentages)
 * and its PF / ESI / PT options. Pure and deterministic; every amount is integer paise.
 */
import { numberToWordsINR } from "@/lib/money";
import { professionalTaxFor, WEST_BENGAL_PT_SLABS } from "./payrollEngine";

export type ComponentCalc = "PCT_GROSS" | "PCT_BASIC" | "FIXED" | "BALANCE";

export interface TemplateComponent {
  key: string;
  name: string;
  kind: "EARNING" | "DEDUCTION";
  calc: ComponentCalc;
  value: number; // % or paise (FIXED)
  pfWage: boolean;
  prorate: boolean;
  active: boolean;
}

export interface StatutoryOptions {
  pfEnabled: boolean;
  pfEmployeeRate: number;
  pfEmployerRate: number;
  epsRate: number;
  edliRate: number;
  pfAdminRate: number;
  pfCapAtCeiling: boolean;
  pfCeilingPaise: number;
  esiEnabled: boolean;
  esiEmployeeRate: number;
  esiEmployerRate: number;
  esiCeilingPaise: number;
  ptEnabled: boolean;
  ptMode: "WB_SLAB" | "FLAT";
  ptFlatPaise: number;
}

export const DEFAULT_STATUTORY: StatutoryOptions = {
  pfEnabled: true,
  pfEmployeeRate: 12,
  pfEmployerRate: 12,
  epsRate: 8.33,
  edliRate: 0.5,
  pfAdminRate: 0.5,
  pfCapAtCeiling: true,
  pfCeilingPaise: 1500000,
  esiEnabled: true,
  esiEmployeeRate: 0.75,
  esiEmployerRate: 3.25,
  esiCeilingPaise: 2100000,
  ptEnabled: true,
  ptMode: "WB_SLAB",
  ptFlatPaise: 20000,
};

/** The four classic columns, from the older percentage rules. */
export function defaultComponents(rules: { basicPct: number; hraPctOfBasic: number; conveyancePaise: number } = { basicPct: 50, hraPctOfBasic: 40, conveyancePaise: 160000 }): TemplateComponent[] {
  return [
    { key: "basic", name: "Basic", kind: "EARNING", calc: "PCT_GROSS", value: rules.basicPct, pfWage: true, prorate: true, active: true },
    { key: "hra", name: "HRA", kind: "EARNING", calc: "PCT_BASIC", value: rules.hraPctOfBasic, pfWage: false, prorate: true, active: true },
    { key: "conveyance", name: "Conveyance", kind: "EARNING", calc: "FIXED", value: rules.conveyancePaise, pfWage: false, prorate: true, active: true },
    { key: "special", name: "Special allowance", kind: "EARNING", calc: "BALANCE", value: 0, pfWage: false, prorate: true, active: true },
  ];
}

/** Map the older company statutory settings onto template options. */
export function statutoryFromSettings(sd?: any | null): StatutoryOptions {
  if (!sd) return { ...DEFAULT_STATUTORY };
  return {
    ...DEFAULT_STATUTORY,
    pfEnabled: sd.pfEnabled ?? true,
    pfEmployeeRate: sd.pfRate ?? 12,
    pfEmployerRate: sd.pfRate ?? 12,
    pfCapAtCeiling: sd.pfCapAtCeiling ?? true,
    pfCeilingPaise: sd.pfWageCeilingPaise ?? 1500000,
    esiEnabled: sd.esiEnabled ?? true,
    esiEmployeeRate: sd.esiRate ?? 0.75,
    esiEmployerRate: sd.employerEsiRate ?? 3.25,
    ptEnabled: sd.ptEnabled ?? true,
    ptMode: sd.ptMode === "FLAT" ? "FLAT" : "WB_SLAB",
    ptFlatPaise: sd.ptMonthlyPaise ?? 20000,
  };
}

const KEY = /^[a-z][a-z0-9_]{1,23}$/;

/** Problems with a template, or null when it is usable. */
export function validateTemplate(components: TemplateComponent[], st: StatutoryOptions): string | null {
  const active = components.filter((c) => c.active !== false);
  const keys = new Set<string>();
  for (const c of components) {
    if (!c.name?.trim()) return "Every column needs a name";
    if (!KEY.test(c.key)) return `Column "${c.name}" has an invalid key`;
    if (keys.has(c.key)) return `Two columns use the key "${c.key}"`;
    keys.add(c.key);
    if (!["EARNING", "DEDUCTION"].includes(c.kind)) return `Column "${c.name}": choose earning or deduction`;
    if (!["PCT_GROSS", "PCT_BASIC", "FIXED", "BALANCE"].includes(c.calc)) return `Column "${c.name}": choose how it is calculated`;
    if (!Number.isFinite(c.value) || c.value < 0) return `Column "${c.name}": the value cannot be negative`;
    if ((c.calc === "PCT_GROSS" || c.calc === "PCT_BASIC") && c.value > 100) return `Column "${c.name}": a percentage cannot exceed 100`;
    if (c.kind === "DEDUCTION" && c.calc === "BALANCE") return `Deduction "${c.name}" cannot be the balancing column`;
  }
  const basic = active.find((c) => c.key === "basic");
  if (!basic || basic.kind !== "EARNING") return "Basic must be an active earning column";
  if (basic.calc === "PCT_BASIC" || basic.calc === "BALANCE") return "Basic must be a percentage of gross or a fixed amount";
  const balancing = active.filter((c) => c.kind === "EARNING" && c.calc === "BALANCE");
  if (balancing.length !== 1) return "Exactly one earning column must take the balance, so the columns always add up to the gross";
  const pctGross = active.filter((c) => c.kind === "EARNING" && c.calc === "PCT_GROSS").reduce((s, c) => s + c.value, 0);
  if (pctGross > 100) return "Earning columns as % of gross add up to more than 100%";
  if (active.filter((c) => c.kind === "EARNING").length > 15 || active.filter((c) => c.kind === "DEDUCTION").length > 10) return "Too many columns";
  const r = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max;
  if (!r(st.pfEmployeeRate, 20) || !r(st.pfEmployerRate, 20) || !r(st.epsRate, st.pfEmployerRate) || !r(st.edliRate, 5) || !r(st.pfAdminRate, 5)) return "PF rates look wrong";
  if (!r(st.esiEmployeeRate, 10) || !r(st.esiEmployerRate, 10)) return "ESI rates look wrong";
  if (!(st.pfCeilingPaise > 0) || !(st.esiCeilingPaise > 0)) return "Ceilings must be above zero";
  return null;
}

export interface Line {
  key: string;
  name: string;
  amount: number;
  pfWage?: boolean;
  prorate?: boolean;
}

/**
 * Split a monthly gross into the earning columns. Columns are filled in template order
 * (Basic first); each is capped at what is left of the gross, and the balancing column
 * takes the remainder, so the lines always add up to the gross exactly.
 */
export function splitGross(grossPaise: number, components: TemplateComponent[]): Line[] {
  const gross = Math.max(0, Math.round(grossPaise));
  const earn = components.filter((c) => c.active !== false && c.kind === "EARNING");
  const basicC = earn.find((c) => c.key === "basic")!;
  const ordered = [basicC, ...earn.filter((c) => c !== basicC)];
  let left = gross;
  const amounts = new Map<string, number>();
  const basicAmt = Math.min(left, Math.round(basicC.calc === "FIXED" ? basicC.value : (gross * basicC.value) / 100));
  amounts.set("basic", basicAmt);
  left -= basicAmt;
  for (const c of ordered.slice(1)) {
    if (c.calc === "BALANCE") continue;
    const want = c.calc === "FIXED" ? c.value : c.calc === "PCT_BASIC" ? (basicAmt * c.value) / 100 : (gross * c.value) / 100;
    const amt = Math.min(left, Math.round(want));
    amounts.set(c.key, amt);
    left -= amt;
  }
  const bal = earn.find((c) => c.calc === "BALANCE");
  if (bal) amounts.set(bal.key, left);
  return earn.map((c) => ({ key: c.key, name: c.name, amount: amounts.get(c.key) || 0, pfWage: c.pfWage, prorate: c.prorate !== false }));
}

/** Fixed lines from an older salary structure (before templates). */
export function legacyLines(s: { basic: number; hra: number; conveyance: number; otherAllowances: number }): Line[] {
  return [
    { key: "basic", name: "Basic", amount: s.basic || 0, pfWage: true, prorate: true },
    { key: "hra", name: "HRA", amount: s.hra || 0, pfWage: false, prorate: true },
    { key: "conveyance", name: "Conveyance", amount: s.conveyance || 0, pfWage: false, prorate: true },
    { key: "special", name: "Special allowance", amount: s.otherAllowances || 0, pfWage: false, prorate: true },
  ];
}

/** Older code reads four fixed fields; everything that is not basic / HRA / conveyance is "other". */
export function legacyFields(lines: Line[]) {
  const get = (k: string) => lines.find((l) => l.key === k)?.amount || 0;
  const basic = get("basic");
  const hra = get("hra");
  const conveyance = get("conveyance");
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return { basic, hra, conveyance, otherAllowances: total - basic - hra - conveyance };
}

const toRupee = (p: number) => Math.round(p / 100) * 100;
const upToRupee = (p: number) => Math.ceil(p / 100) * 100;

export interface PayslipInput {
  earnings: Line[]; // full-month amounts
  deductions: TemplateComponent[]; // custom deduction columns
  statutory: StatutoryOptions;
  flags: { pf: boolean; esi: boolean; professionalTax: boolean };
  workingDays: number;
  lopDays: number;
  incentives?: number;
  incentiveBreakdown?: Array<{ schemeId: string; schemeName: string; amount: number }>;
  /** Positive = paid on top (overtime, reimbursement); negative = recovered. `wage: false` keeps it out of ESI wages. */
  adjustments?: Array<{ amount: number; reason: string; wage?: boolean }>;
  tds?: number;
  advanceRecovery?: number;
}

export interface Employer {
  pf: number; // total employer PF share
  eps: number;
  epf: number;
  edli: number;
  pfAdmin: number;
  esi: number;
  total: number;
}

/**
 * One month's payslip: pro-rated columns, custom deductions, PF (employee + employer split
 * into EPS / EPF, EDLI, admin), ESI on wages, professional tax, TDS and recoveries.
 */
export function computePayslip(p: PayslipInput) {
  const st = p.statutory;
  const workingDays = Math.max(1, p.workingDays || 30);
  const lopDays = Math.min(workingDays, Math.max(0, p.lopDays || 0));
  const paidDays = workingDays - lopDays;
  const factor = paidDays / workingDays;

  const earned: Line[] = p.earnings.map((l) => ({ ...l, amount: l.prorate === false ? l.amount : Math.round(l.amount * factor) }));
  const fixedEarned = earned.reduce((s, l) => s + l.amount, 0);
  const fullGross = p.earnings.reduce((s, l) => s + l.amount, 0);
  const basicEarned = earned.find((l) => l.key === "basic")?.amount || 0;
  const incentives = p.incentives || 0;
  let plus = 0;
  let plusWage = 0;
  let minus = 0;
  for (const a of p.adjustments || []) {
    if (a.amount > 0) {
      plus += a.amount;
      if (a.wage !== false) plusWage += a.amount;
    } else minus += -a.amount;
  }
  const grossPay = fixedEarned + incentives + plus;

  // Custom deduction columns (welfare fund, canteen, uniform …)
  const custom: Line[] = p.deductions
    .filter((c) => c.active !== false && c.kind === "DEDUCTION")
    .map((c) => {
      const raw = c.calc === "FIXED" ? (c.prorate === false ? c.value : c.value * factor) : c.calc === "PCT_BASIC" ? (basicEarned * c.value) / 100 : (fixedEarned * c.value) / 100;
      return { key: c.key, name: c.name, amount: Math.round(raw) };
    })
    .filter((l) => l.amount > 0);

  // PF
  const pfWageRaw = earned.filter((l) => l.pfWage).reduce((s, l) => s + l.amount, 0);
  const pfOn = st.pfEnabled && p.flags.pf && pfWageRaw > 0;
  const pfWage = pfOn ? (st.pfCapAtCeiling ? Math.min(pfWageRaw, st.pfCeilingPaise) : pfWageRaw) : 0;
  const statWage = Math.min(pfWage, st.pfCeilingPaise); // EPS / EDLI are always on wages up to the ceiling
  const pfEmployee = pfOn ? toRupee((pfWage * st.pfEmployeeRate) / 100) : 0;
  const employerPf = pfOn ? toRupee((pfWage * st.pfEmployerRate) / 100) : 0;
  const eps = pfOn ? Math.min(employerPf, toRupee((statWage * st.epsRate) / 100)) : 0;
  const edli = pfOn ? toRupee((statWage * st.edliRate) / 100) : 0;
  const pfAdmin = pfOn ? toRupee((pfWage * st.pfAdminRate) / 100) : 0;

  // ESI: applies when the fixed monthly gross is within the ceiling; contribution on wages actually paid.
  const esiWage = fixedEarned + incentives + plusWage;
  const esiOn = st.esiEnabled && p.flags.esi && fullGross <= st.esiCeilingPaise && esiWage > 0;
  const esiEmployee = esiOn ? upToRupee((esiWage * st.esiEmployeeRate) / 100) : 0;
  const esiEmployer = esiOn ? upToRupee((esiWage * st.esiEmployerRate) / 100) : 0;

  // Professional tax
  const pt = st.ptEnabled && p.flags.professionalTax && paidDays > 0 ? (st.ptMode === "FLAT" ? st.ptFlatPaise : professionalTaxFor(grossPay, WEST_BENGAL_PT_SLABS)) : 0;

  const tds = p.tds || 0;
  const advanceRecovery = p.advanceRecovery || 0;
  const customTotal = custom.reduce((s, l) => s + l.amount, 0);
  const totalDeductions = pfEmployee + esiEmployee + pt + tds + advanceRecovery + minus + customTotal;
  const netPay = Math.max(0, grossPay - totalDeductions);
  const employer: Employer = { pf: employerPf, eps, epf: employerPf - eps, edli, pfAdmin, esi: esiEmployer, total: employerPf + edli + pfAdmin + esiEmployer };

  return {
    workingDays,
    lopDays,
    paidDays,
    earningLines: earned.map(({ key, name, amount }) => ({ key, name, amount })),
    deductionLines: custom,
    earnings: { ...legacyFields(earned), incentives, incentiveBreakdown: p.incentiveBreakdown || [] },
    deductions: { pf: pfEmployee, esi: esiEmployee, professionalTax: pt, tds, advanceRecovery, other: minus + customTotal },
    employer,
    pfWage,
    pfWageRaw: pfOn ? pfWageRaw : 0,
    esiWage: esiOn ? esiWage : 0,
    adjustmentsTotal: plus - minus,
    grossPay,
    totalDeductions,
    netPay,
    netPayInWords: numberToWordsINR(netPay),
    ctc: grossPay + employer.total,
  };
}

/** Full-month breakup for an offer / revision: columns, deductions, take-home and CTC. */
export function breakupFromGross(grossPaise: number, components: TemplateComponent[], st: StatutoryOptions, flags: { pf: boolean; esi: boolean; professionalTax: boolean }) {
  const lines = splitGross(grossPaise, components);
  const r = computePayslip({ earnings: lines, deductions: components, statutory: st, flags, workingDays: 30, lopDays: 0 });
  const employeeTotal = r.deductions.pf + r.deductions.esi + r.deductions.professionalTax + r.deductionLines.reduce((s, l) => s + l.amount, 0);
  const monthlyCtc = r.grossPay + r.employer.total;
  return {
    gross: r.grossPay,
    ...legacyFields(lines),
    lines: r.earningLines,
    deductionLines: r.deductionLines,
    employee: { pf: r.deductions.pf, esi: r.deductions.esi, professionalTax: r.deductions.professionalTax, total: employeeTotal },
    employer: r.employer,
    netTakeHome: r.grossPay - employeeTotal,
    monthlyCtc,
    annualCtc: monthlyCtc * 12,
  };
}

/** Monthly gross that gives an annual CTC (binary search to the paisa). */
export function grossForCtc(annualCtcPaise: number, components: TemplateComponent[], st: StatutoryOptions, flags: { pf: boolean; esi: boolean; professionalTax: boolean }) {
  let lo = 0;
  let hi = Math.ceil(annualCtcPaise / 12);
  for (let i = 0; i < 60 && lo < hi; i++) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (breakupFromGross(mid, components, st, flags).annualCtc <= annualCtcPaise) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
