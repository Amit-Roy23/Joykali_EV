import { describe, it, expect } from "vitest";
import {
  WEST_BENGAL_PT_SLABS,
  calculatePayrollEntry,
  professionalTaxFor,
  statutorySettingsFrom,
} from "../payrollEngine";
import { formatRupeesShort } from "@/lib/money";

const rupees = (r: number) => r * 100;

describe("West Bengal professional tax", () => {
  it.each([
    [10000, 0],
    [10001, 110],
    [15000, 110],
    [15001, 130],
    [25000, 130],
    [25001, 150],
    [40000, 150],
    [40001, 200],
  ])("gross ₹%i → PT ₹%i", (gross, pt) => {
    expect(professionalTaxFor(rupees(gross), WEST_BENGAL_PT_SLABS)).toBe(rupees(pt));
  });

  it("is applied by default from company settings, and FLAT mode keeps ₹200", () => {
    const salary = {
      basic: rupees(9000),
      hra: rupees(3600),
      conveyance: rupees(1600),
      otherAllowances: rupees(1800),
      fixedDeductions: { pf: true, esi: true, professionalTax: true },
    };
    const slab = calculatePayrollEntry({ salary, workingDays: 30, lopDays: 0, incentives: 0, settings: statutorySettingsFrom(null) });
    expect(slab.deductions.professionalTax).toBe(rupees(130)); // gross ₹16,000
    const flat = calculatePayrollEntry({
      salary,
      workingDays: 30,
      lopDays: 0,
      incentives: 0,
      settings: statutorySettingsFrom({ ptMode: "FLAT", ptMonthlyPaise: 20000 }),
    });
    expect(flat.deductions.professionalTax).toBe(rupees(200));
  });

  it("matches a hand-checked FEC payslip (1 LOP day, incentives, ESI)", () => {
    const r = calculatePayrollEntry({
      salary: {
        basic: rupees(9500),
        hra: rupees(3600),
        conveyance: rupees(1600),
        otherAllowances: rupees(1800),
        fixedDeductions: { pf: true, esi: true, professionalTax: true },
      },
      workingDays: 30,
      lopDays: 1,
      incentives: rupees(2300),
      settings: statutorySettingsFrom(null),
    });
    expect(r.grossPay).toBe(1825000); // ₹18,250.00
    expect(r.deductions.pf).toBe(110200); // 12% of prorated basic ₹9,183.33
    expect(r.deductions.esi).toBe(13688); // 0.75% of gross
    expect(r.deductions.professionalTax).toBe(13000);
    expect(r.netPay).toBe(1688112); // ₹16,881.12
  });
});

describe("compact rupee formatting", () => {
  it("uses Indian lakh/crore notation", () => {
    expect(formatRupeesShort(950)).toBe("₹950");
    expect(formatRupeesShort(45200)).toBe("₹45.2K");
    expect(formatRupeesShort(318000)).toBe("₹3.18 L");
    expect(formatRupeesShort(3177032)).toBe("₹31.8 L");
    expect(formatRupeesShort(12500000)).toBe("₹1.25 Cr");
  });
});
