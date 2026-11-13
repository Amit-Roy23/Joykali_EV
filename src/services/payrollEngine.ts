import { numberToWordsINR, paiseToRupees } from "@/lib/money";

/**
 * West Bengal Professional Tax schedule (monthly, on gross salary). The
 * previous flat ₹200 overcharged everyone earning ₹40,000 or less.
 * Amounts in paise; `upTo` is an inclusive upper bound in paise (null = no cap).
 */
export interface PtSlab {
  upTo: number | null;
  amount: number;
}

export const WEST_BENGAL_PT_SLABS: PtSlab[] = [
  { upTo: 1000000, amount: 0 }, // up to ₹10,000: nil
  { upTo: 1500000, amount: 11000 }, // ₹10,001 – ₹15,000: ₹110
  { upTo: 2500000, amount: 13000 }, // ₹15,001 – ₹25,000: ₹130
  { upTo: 4000000, amount: 15000 }, // ₹25,001 – ₹40,000: ₹150
  { upTo: null, amount: 20000 }, // above ₹40,000: ₹200
];

export function professionalTaxFor(grossPaise: number, slabs: PtSlab[]): number {
  for (const slab of slabs) {
    if (slab.upTo == null || grossPaise <= slab.upTo) return slab.amount;
  }
  return 0;
}

export interface SalaryStructureInput {
  basic: number; // in paise
  hra: number; // in paise
  conveyance: number; // in paise
  otherAllowances: number; // in paise
  fixedDeductions: {
    pf: boolean;
    esi: boolean;
    professionalTax: boolean;
  };
}

export interface PayrollCalculationParams {
  salary: SalaryStructureInput;
  workingDays: number;
  lopDays: number;
  incentives: number; // in paise
  incentiveBreakdown?: Array<{
    schemeId: string;
    schemeName: string;
    amount: number;
  }>;
  adjustments?: Array<{
    amount: number; // in paise (positive adds to gross, negative adds to deductions/adjustments)
    reason: string;
  }>;
  tds?: number; // in paise
  advanceRecovery?: number; // in paise
  settings?: {
    pfRate?: number; // default 12%
    esiRate?: number; // default 0.75%
    ptMonthlyPaise?: number; // default 20000 paise (₹200)
    pfEnabled?: boolean;
    esiEnabled?: boolean;
    ptEnabled?: boolean;
    /** When provided, PT is looked up from these slabs on gross pay instead of the flat amount. */
    ptSlabs?: PtSlab[];
    /** Cap PF at pfRate × min(basic, ceiling). Ceiling in paise (₹15,000 = 1500000). */
    pfWageCeilingPaise?: number;
  };
}

export interface PayrollCalculationOutput {
  workingDays: number;
  lopDays: number;
  paidDays: number;
  earnings: {
    basic: number;
    hra: number;
    conveyance: number;
    otherAllowances: number;
    incentives: number;
    incentiveBreakdown: Array<{
      schemeId: string;
      schemeName: string;
      amount: number;
    }>;
  };
  deductions: {
    pf: number;
    esi: number;
    professionalTax: number;
    tds: number;
    advanceRecovery: number;
    other: number;
  };
  adjustmentsTotal: number;
  grossPay: number;
  totalDeductions: number;
  netPay: number;
  netPayInWords: string;
}

/**
 * Pure calculation function for an individual employee's payroll entry
 */
export function calculatePayrollEntry(
  params: PayrollCalculationParams
): PayrollCalculationOutput {
  const {
    salary,
    workingDays = 30,
    lopDays = 0,
    incentives = 0,
    incentiveBreakdown = [],
    adjustments = [],
    tds = 0,
    advanceRecovery = 0,
    settings = {},
  } = params;

  const pfRate = settings.pfRate ?? 12;
  const esiRate = settings.esiRate ?? 0.75;
  const ptDefault = settings.ptMonthlyPaise ?? 20000; // ₹200
  const pfGlobalEnabled = settings.pfEnabled ?? true;
  const esiGlobalEnabled = settings.esiEnabled ?? true;
  const ptGlobalEnabled = settings.ptEnabled ?? true;

  const validWorkingDays = Math.max(1, workingDays);
  const safeLopDays = Math.min(validWorkingDays, Math.max(0, lopDays));
  const paidDays = validWorkingDays - safeLopDays;
  const factor = paidDays / validWorkingDays;

  // Pro-rate fixed earnings
  const proratedBasic = Math.round((salary.basic || 0) * factor);
  const proratedHra = Math.round((salary.hra || 0) * factor);
  const proratedConveyance = Math.round((salary.conveyance || 0) * factor);
  const proratedOther = Math.round((salary.otherAllowances || 0) * factor);

  const fixedEarnings =
    proratedBasic + proratedHra + proratedConveyance + proratedOther;

  // Process adjustments
  let positiveAdjustments = 0;
  let negativeAdjustments = 0;
  for (const adj of adjustments) {
    if (adj.amount > 0) {
      positiveAdjustments += adj.amount;
    } else {
      negativeAdjustments += Math.abs(adj.amount);
    }
  }

  const grossPay = fixedEarnings + incentives + positiveAdjustments;

  // Statutory Deductions
  let pfDeduction = 0;
  if (pfGlobalEnabled && salary.fixedDeductions?.pf) {
    // 12% of basic
    const pfWage =
      settings.pfWageCeilingPaise && settings.pfWageCeilingPaise > 0
        ? Math.min(proratedBasic, settings.pfWageCeilingPaise)
        : proratedBasic;
    pfDeduction = Math.round(pfWage * (pfRate / 100));
  }

  let esiDeduction = 0;
  // In India, ESI applies if gross wage <= ₹21,000 (2,100,000 paise)
  if (
    esiGlobalEnabled &&
    salary.fixedDeductions?.esi &&
    grossPay <= 2100000 &&
    grossPay > 0
  ) {
    esiDeduction = Math.round(grossPay * (esiRate / 100));
  }

  let ptDeduction = 0;
  if (ptGlobalEnabled && salary.fixedDeductions?.professionalTax && paidDays > 0) {
    ptDeduction =
      settings.ptSlabs && settings.ptSlabs.length > 0
        ? professionalTaxFor(grossPay, settings.ptSlabs)
        : ptDefault;
  }

  const totalDeductions =
    pfDeduction +
    esiDeduction +
    ptDeduction +
    tds +
    advanceRecovery +
    negativeAdjustments;

  const netPay = Math.max(0, grossPay - totalDeductions);

  return {
    workingDays: validWorkingDays,
    lopDays: safeLopDays,
    paidDays,
    earnings: {
      basic: proratedBasic,
      hra: proratedHra,
      conveyance: proratedConveyance,
      otherAllowances: proratedOther,
      incentives,
      incentiveBreakdown,
    },
    deductions: {
      pf: pfDeduction,
      esi: esiDeduction,
      professionalTax: ptDeduction,
      tds,
      advanceRecovery,
      other: negativeAdjustments,
    },
    adjustmentsTotal: positiveAdjustments - negativeAdjustments,
    grossPay,
    totalDeductions,
    netPay,
    netPayInWords: numberToWordsINR(netPay),
  };
}


/** Map the stored company settings onto the engine's statutory settings. */
export function statutorySettingsFrom(
  sd?: {
    pfRate?: number;
    esiRate?: number;
    ptMonthlyPaise?: number;
    pfEnabled?: boolean;
    esiEnabled?: boolean;
    ptEnabled?: boolean;
    ptMode?: "WB_SLAB" | "FLAT";
    pfWageCeilingPaise?: number;
    pfCapAtCeiling?: boolean;
  } | null
): PayrollCalculationParams["settings"] {
  if (!sd) return { ptSlabs: WEST_BENGAL_PT_SLABS, pfWageCeilingPaise: 1500000 };
  return {
    pfRate: sd.pfRate,
    esiRate: sd.esiRate,
    ptMonthlyPaise: sd.ptMonthlyPaise,
    pfEnabled: sd.pfEnabled,
    esiEnabled: sd.esiEnabled,
    ptEnabled: sd.ptEnabled,
    ptSlabs: sd.ptMode === "FLAT" ? undefined : WEST_BENGAL_PT_SLABS,
    pfWageCeilingPaise: sd.pfCapAtCeiling === false ? undefined : sd.pfWageCeilingPaise ?? 1500000,
  };
}

/* ------------------------------------------------------------------ */
/* Automatic salary structure                                          */
/* ------------------------------------------------------------------ */
export interface SalaryRules {
  basicPct: number; // % of gross
  hraPctOfBasic: number; // % of basic
  conveyancePaise: number; // fixed monthly
}
export const DEFAULT_SALARY_RULES: SalaryRules = { basicPct: 50, hraPctOfBasic: 40, conveyancePaise: 160000 };

export interface SalaryBreakup {
  gross: number;
  basic: number;
  hra: number;
  conveyance: number;
  otherAllowances: number;
  employee: { pf: number; esi: number; professionalTax: number; total: number };
  employer: { pf: number; esi: number; total: number };
  netTakeHome: number;
  monthlyCtc: number;
  annualCtc: number;
}

/**
 * Split a monthly gross salary into components using the company's rules,
 * then compute statutory deductions, employer contributions, take-home and CTC.
 * Pure and deterministic — every amount is integer paise and the components
 * always add back up to the gross exactly (rounding goes to other allowances).
 */
export function buildSalaryFromGross(
  grossPaise: number,
  flags: { pf: boolean; esi: boolean; professionalTax: boolean },
  rules: SalaryRules = DEFAULT_SALARY_RULES,
  statutory: PayrollCalculationParams["settings"] & { employerEsiRate?: number } = statutorySettingsFrom(null)!
): SalaryBreakup {
  const gross = Math.max(0, Math.round(grossPaise));
  const basic = Math.round((gross * rules.basicPct) / 100);
  const hra = Math.min(gross - basic, Math.round((basic * rules.hraPctOfBasic) / 100));
  const conveyance = Math.min(gross - basic - hra, rules.conveyancePaise);
  const otherAllowances = gross - basic - hra - conveyance;
  return costSalary({ basic, hra, conveyance, otherAllowances }, flags, statutory);
}

/** Deductions, employer cost and CTC for given monthly components (paise). */
export function costSalary(
  c: { basic: number; hra: number; conveyance: number; otherAllowances: number },
  flags: { pf: boolean; esi: boolean; professionalTax: boolean },
  statutory: PayrollCalculationParams["settings"] & { employerEsiRate?: number } = statutorySettingsFrom(null)!
): SalaryBreakup {
  const gross = c.basic + c.hra + c.conveyance + c.otherAllowances;
  const calc = calculatePayrollEntry({
    salary: { ...c, fixedDeductions: flags },
    workingDays: 30,
    lopDays: 0,
    incentives: 0,
    settings: statutory,
  });
  // Employer matches 12% of the same PF wage; employer ESI only where employee ESI applies.
  const employerPf = calc.deductions.pf;
  const employerEsi = calc.deductions.esi > 0 ? Math.round((gross * (statutory?.employerEsiRate ?? 3.25)) / 100) : 0;
  const employeeTotal = calc.deductions.pf + calc.deductions.esi + calc.deductions.professionalTax;
  const monthlyCtc = gross + employerPf + employerEsi;
  return {
    gross,
    ...c,
    employee: { pf: calc.deductions.pf, esi: calc.deductions.esi, professionalTax: calc.deductions.professionalTax, total: employeeTotal },
    employer: { pf: employerPf, esi: employerEsi, total: employerPf + employerEsi },
    netTakeHome: gross - employeeTotal,
    monthlyCtc,
    annualCtc: monthlyCtc * 12,
  };
}

/** Inverse: the monthly gross that produces a given annual CTC (binary search, ±1 paise). */
export function grossFromAnnualCtc(
  annualCtcPaise: number,
  flags: { pf: boolean; esi: boolean; professionalTax: boolean },
  rules: SalaryRules = DEFAULT_SALARY_RULES,
  statutory: PayrollCalculationParams["settings"] & { employerEsiRate?: number } = statutorySettingsFrom(null)!
): number {
  let lo = 0;
  let hi = Math.ceil(annualCtcPaise / 12);
  for (let i = 0; i < 60 && lo < hi; i++) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (buildSalaryFromGross(mid, flags, rules, statutory).annualCtc <= annualCtcPaise) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
