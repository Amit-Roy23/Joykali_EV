import { numberToWordsINR, paiseToRupees } from "@/lib/money";

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
    pfDeduction = Math.round(proratedBasic * (pfRate / 100));
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
    ptDeduction = ptDefault;
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

