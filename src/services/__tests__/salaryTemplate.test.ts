import { describe, expect, it } from "vitest";
import {
  breakupFromGross,
  computePayslip,
  defaultComponents,
  DEFAULT_STATUTORY,
  grossForCtc,
  legacyLines,
  splitGross,
  TemplateComponent,
  validateTemplate,
} from "../salaryTemplateEngine";

const R = (r: number) => r * 100;
const flags = { pf: true, esi: true, professionalTax: true };
const withMedical: TemplateComponent[] = [
  ...defaultComponents().slice(0, 3),
  { key: "medical", name: "Medical", kind: "EARNING", calc: "PCT_BASIC", value: 5, pfWage: false, prorate: true, active: true },
  { key: "special", name: "Special", kind: "EARNING", calc: "BALANCE", value: 0, pfWage: false, prorate: true, active: true },
  { key: "welfare", name: "Welfare", kind: "DEDUCTION", calc: "FIXED", value: R(50), pfWage: false, prorate: false, active: true },
];

describe("salary template — columns", () => {
  it("splits the gross into the columns and always adds back to the gross", () => {
    const lines = splitGross(R(25000), withMedical);
    expect(lines.map((l) => [l.key, l.amount])).toEqual([
      ["basic", R(12500)],
      ["hra", R(5000)],
      ["conveyance", R(1600)],
      ["medical", R(625)],
      ["special", R(5275)],
    ]);
    for (const g of [R(9000), R(14321.37), R(87000)]) expect(splitGross(g, withMedical).reduce((s, l) => s + l.amount, 0)).toBe(Math.round(g));
  });

  it("caps columns at what is left, so a small salary never goes over", () => {
    const tight: TemplateComponent[] = [
      { key: "basic", name: "Basic", kind: "EARNING", calc: "PCT_GROSS", value: 60, pfWage: true, prorate: true, active: true },
      { key: "fixed", name: "Fixed", kind: "EARNING", calc: "FIXED", value: R(5000), pfWage: false, prorate: true, active: true },
      { key: "bal", name: "Balance", kind: "EARNING", calc: "BALANCE", value: 0, pfWage: false, prorate: true, active: true },
    ];
    const lines = splitGross(R(8000), tight);
    expect(lines.find((l) => l.key === "fixed")!.amount).toBe(R(3200));
    expect(lines.find((l) => l.key === "bal")!.amount).toBe(0);
  });

  it("ignores deleted (inactive) columns", () => {
    const comps = withMedical.map((c) => (c.key === "medical" ? { ...c, active: false } : c));
    expect(splitGross(R(25000), comps).some((l) => l.key === "medical")).toBe(false);
  });

  it("rejects templates without basic or a balancing column, or over 100%", () => {
    expect(validateTemplate(withMedical, DEFAULT_STATUTORY)).toBeNull();
    expect(validateTemplate(withMedical.filter((c) => c.key !== "special"), DEFAULT_STATUTORY)).toMatch(/balance/i);
    expect(validateTemplate(withMedical.filter((c) => c.key !== "basic"), DEFAULT_STATUTORY)).toMatch(/Basic/);
    const over = withMedical.map((c) => (c.key === "basic" ? { ...c, value: 120 } : c));
    expect(validateTemplate(over, DEFAULT_STATUTORY)).toMatch(/100/);
    const dup = [...withMedical, { ...withMedical[1] }];
    expect(validateTemplate(dup, DEFAULT_STATUTORY)).toMatch(/key/);
  });
});

describe("salary template — PF / ESI / PT", () => {
  it("PF on basic up to the ₹15,000 ceiling, employer split into EPS and EPF", () => {
    const r = computePayslip({ earnings: splitGross(R(40000), withMedical), deductions: [], statutory: DEFAULT_STATUTORY, flags, workingDays: 30, lopDays: 0 });
    // basic 20,000 → PF wage capped at 15,000
    expect(r.pfWage).toBe(R(15000));
    expect(r.deductions.pf).toBe(R(1800));
    expect(r.employer.pf).toBe(R(1800));
    expect(r.employer.eps).toBe(R(1250));
    expect(r.employer.epf).toBe(R(550));
    expect(r.employer.edli).toBe(R(75));
    expect(r.employer.pfAdmin).toBe(R(75));
    // gross 40,000 > 21,000 → no ESI; WB PT ₹150 for 25,001–40,000
    expect(r.deductions.esi).toBe(0);
    expect(r.deductions.professionalTax).toBe(R(150));
  });

  it("PF on full wage when the ceiling cap is switched off", () => {
    const r = computePayslip({ earnings: splitGross(R(40000), withMedical), deductions: [], statutory: { ...DEFAULT_STATUTORY, pfCapAtCeiling: false }, flags, workingDays: 30, lopDays: 0 });
    expect(r.deductions.pf).toBe(R(2400));
    expect(r.employer.eps).toBe(R(1250)); // pension stays on the ceiling
  });

  it("ESI on wages paid incl. overtime but not reimbursements, rounded up to the rupee", () => {
    const r = computePayslip({
      earnings: splitGross(R(18000), withMedical),
      deductions: [],
      statutory: DEFAULT_STATUTORY,
      flags,
      workingDays: 30,
      lopDays: 0,
      adjustments: [
        { amount: R(1000), reason: "Overtime" },
        { amount: R(500), reason: "Reimbursement JKEC/1", wage: false },
      ],
    });
    expect(r.esiWage).toBe(R(19000));
    expect(r.deductions.esi).toBe(R(143)); // 142.5 → 143
    expect(r.employer.esi).toBe(R(618)); // 617.5 → 618
    expect(r.grossPay).toBe(R(19500));
  });

  it("no ESI when the fixed gross is above ₹21,000 even if the month is short", () => {
    const r = computePayslip({ earnings: splitGross(R(24000), withMedical), deductions: [], statutory: DEFAULT_STATUTORY, flags, workingDays: 30, lopDays: 10 });
    expect(r.deductions.esi).toBe(0);
  });

  it("loss of pay reduces the columns and the PF wage; fixed welfare is not cut", () => {
    const r = computePayslip({ earnings: splitGross(R(20000), withMedical), deductions: withMedical, statutory: DEFAULT_STATUTORY, flags, workingDays: 30, lopDays: 3 });
    expect(r.paidDays).toBe(27);
    expect(r.earnings.basic).toBe(R(9000));
    expect(r.deductions.pf).toBe(R(1080));
    expect(r.deductionLines).toEqual([{ key: "welfare", name: "Welfare", amount: R(50) }]);
    expect(r.netPay).toBe(r.grossPay - r.totalDeductions);
  });

  it("person-level opt-outs switch PF / ESI / PT off", () => {
    const r = computePayslip({ earnings: splitGross(R(15000), withMedical), deductions: [], statutory: DEFAULT_STATUTORY, flags: { pf: false, esi: false, professionalTax: false }, workingDays: 30, lopDays: 0 });
    expect(r.deductions.pf + r.deductions.esi + r.deductions.professionalTax).toBe(0);
    expect(r.employer.total).toBe(0);
  });

  it("legacy fixed amounts pass through unchanged", () => {
    const lines = legacyLines({ basic: R(18000), hra: R(7200), conveyance: R(2400), otherAllowances: R(4400) });
    const r = computePayslip({ earnings: lines, deductions: [], statutory: DEFAULT_STATUTORY, flags, workingDays: 30, lopDays: 0 });
    expect(r.grossPay).toBe(R(32000));
    expect(r.earnings.otherAllowances).toBe(R(4400));
  });

  it("CTC → gross round-trips", () => {
    const gross = grossForCtc(R(360000), withMedical, DEFAULT_STATUTORY, flags);
    const b = breakupFromGross(gross, withMedical, DEFAULT_STATUTORY, flags);
    expect(b.annualCtc).toBeLessThanOrEqual(R(360000));
    expect(breakupFromGross(gross + 1, withMedical, DEFAULT_STATUTORY, flags).annualCtc).toBeGreaterThan(R(360000) - 1);
  });
});
