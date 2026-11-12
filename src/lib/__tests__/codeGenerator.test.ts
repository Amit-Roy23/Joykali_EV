import { describe, it, expect } from "vitest";
import {
  getFinancialYear,
  generatePayrollRunCode,
  generatePayslipCode,
} from "../codeGenerator";

describe("Code Generator Functions", () => {
  it("calculates Indian Financial Year correctly across calendar boundary", () => {
    // April 2026 -> 2026-27
    expect(getFinancialYear(new Date("2026-04-01"))).toBe("2026-27");
    // Nov 2026 -> 2026-27
    expect(getFinancialYear(new Date("2026-11-12"))).toBe("2026-27");
    // Jan 2027 -> 2026-27 (before April)
    expect(getFinancialYear(new Date("2027-01-15"))).toBe("2026-27");
    // March 2027 -> 2026-27
    expect(getFinancialYear(new Date("2027-03-31"))).toBe("2026-27");
    // April 2027 -> 2027-28
    expect(getFinancialYear(new Date("2027-04-01"))).toBe("2027-28");
  });

  it("generates deterministic payroll and payslip codes", () => {
    expect(generatePayrollRunCode(2026, 11)).toBe("PR-2026-11");
    expect(generatePayrollRunCode(2027, 3)).toBe("PR-2027-03");

    expect(generatePayslipCode(2026, 11, "JKE-FEC-0001")).toBe(
      "PS/2026-11/JKE-FEC-0001"
    );
  });
});

