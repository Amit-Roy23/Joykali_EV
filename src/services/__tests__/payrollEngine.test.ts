import { describe, it, expect } from "vitest";
import { calculatePayrollEntry, SalaryStructureInput } from "../payrollEngine";
import { numberToWordsINR, formatINR } from "@/lib/money";

describe("Payroll Calculation Engine", () => {
  const sampleSalary: SalaryStructureInput = {
    basic: 1500000, // ₹15,000 = 1500000 paise
    hra: 600000, // ₹6,000
    conveyance: 300000, // ₹3,000
    otherAllowances: 100000, // ₹1,000
    fixedDeductions: {
      pf: true,
      esi: false, // Gross > 21k
      professionalTax: true,
    },
  };

  it("calculates full month salary without LOP", () => {
    const res = calculatePayrollEntry({
      salary: sampleSalary,
      workingDays: 30,
      lopDays: 0,
      incentives: 500000, // ₹5,000
    });

    // Basic 15000 + HRA 6000 + Conv 3000 + Other 1000 = 25000
    // + Incentives 5000 = Gross 30000 = 3000000 paise
    expect(res.grossPay).toBe(3000000);
    expect(res.paidDays).toBe(30);

    // PF 12% of 15000 = 1800 = 180000 paise
    expect(res.deductions.pf).toBe(180000);

    // PT = 200 = 20000 paise
    expect(res.deductions.professionalTax).toBe(20000);

    // Total deductions = 1800 + 200 = 2000 = 200000 paise
    expect(res.totalDeductions).toBe(200000);

    // Net pay = 30000 - 2000 = ₹28,000 = 2800000 paise
    expect(res.netPay).toBe(2800000);
    expect(res.netPayInWords).toBe("Rupees Twenty-Eight Thousand Only");
  });

  it("pro-rates fixed pay correctly when LOP days are present", () => {
    const res = calculatePayrollEntry({
      salary: sampleSalary,
      workingDays: 30,
      lopDays: 10, // 20 paid days
      incentives: 0,
    });

    expect(res.paidDays).toBe(20);
    // Basic: 15000 * (20/30) = 10000 = 1000000 paise
    expect(res.earnings.basic).toBe(1000000);
    // HRA: 6000 * (20/30) = 4000 = 400000 paise
    expect(res.earnings.hra).toBe(400000);

    // PF 12% of pro-rated basic (10000) = 1200 = 120000 paise
    expect(res.deductions.pf).toBe(120000);
  });

  it("handles manual positive and negative adjustments", () => {
    const res = calculatePayrollEntry({
      salary: sampleSalary,
      workingDays: 30,
      lopDays: 0,
      incentives: 0,
      adjustments: [
        { amount: 100000, reason: "Festival bonus" }, // +₹1,000
        { amount: -50000, reason: "Penalty" }, // -₹500
      ],
      advanceRecovery: 200000, // ₹2,000
    });

    // Fixed = 25000 + 1000 (bonus) = 26000 = 2600000 paise
    expect(res.grossPay).toBe(2600000);

    // Deductions: PF (1800) + PT (200) + penalty (500) + advance (2000) = ₹4,500 = 450000 paise
    expect(res.totalDeductions).toBe(450000);

    // Net: 26000 - 4500 = ₹21,500 = 2150000 paise
    expect(res.netPay).toBe(2150000);
    expect(res.netPayInWords).toBe("Rupees Twenty-One Thousand Five Hundred Only");
  });

  it("formats Indian currency correctly with commas and decimals", () => {
    expect(formatINR(12345600)).toBe("₹1,23,456.00");
    expect(formatINR(50000)).toBe("₹500.00");
    expect(formatINR(1000000000)).toBe("₹1,00,00,000.00"); // 1 Crore
  });
});

