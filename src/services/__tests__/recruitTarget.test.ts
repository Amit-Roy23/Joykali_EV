import { describe, it, expect } from "vitest";
import { computeIncentives, SaleItemForIncentive } from "../incentiveEngine";

const start = new Date("2026-11-01T00:00:00Z");
const end = new Date("2026-11-30T23:59:59Z");
const fse = { _id: "fse", employeeCode: "JKE-FSE-0001", name: "FSE", role: "FEC" as const };
const sales = (n: number, model = "m1"): SaleItemForIncentive[] =>
  Array.from({ length: n }, (_, i) => ({
    _id: `s${i}`,
    saleCode: `S${i}`,
    saleDate: new Date(Date.UTC(2026, 10, 1 + i)),
    soldBy: "fse",
    modelId: model,
    exShowroom: 8500000,
    totalAmount: 8925000,
    status: "DELIVERED",
  }));
const scheme = (rules: any[]) => [{ _id: "sc", name: "FSE", status: "ACTIVE", validFrom: start, validTo: end, applicableRoles: ["FEC"], rules }];
const recruit = (dealers: number, subDealers = 0, distributors = 0) => ({ recruits: { dealers, subDealers, distributors, codes: [] } });

describe("Dealer recruitment rule", () => {
  const rule = { ruleType: "DEALER_RECRUITMENT", minRecruits: 5, perRecruitAmount: 100000, perDistributorAmount: 0, countSubDealers: true };
  it("pays nothing below the minimum", () => {
    const out = computeIncentives(fse, [], scheme([rule]), start, end, recruit(4));
    expect(out.totalIncentiveEarned).toBe(0);
  });
  it("pays every dealer once the minimum is reached", () => {
    expect(computeIncentives(fse, [], scheme([rule]), start, end, recruit(5)).totalIncentiveEarned).toBe(500000);
    expect(computeIncentives(fse, [], scheme([rule]), start, end, recruit(7)).totalIncentiveEarned).toBe(700000);
  });
  it("counts sub dealers unless excluded, and distributors only when priced", () => {
    expect(computeIncentives(fse, [], scheme([rule]), start, end, recruit(3, 2, 1)).totalIncentiveEarned).toBe(500000);
    expect(computeIncentives(fse, [], scheme([{ ...rule, countSubDealers: false }]), start, end, recruit(3, 2)).totalIncentiveEarned).toBe(0);
    expect(computeIncentives(fse, [], scheme([{ ...rule, perDistributorAmount: 300000 }]), start, end, recruit(4, 0, 1)).totalIncentiveEarned).toBe(700000);
  });
});

describe("Target commission rule", () => {
  const rule = { ruleType: "TARGET_COMMISSION", perUnitAmount: 50000, targetUnits: 10, targetPayout: "ALL_WHEN_MET" };
  it("pays on all units only when the personal target is met", () => {
    expect(computeIncentives(fse, sales(7), scheme([rule]), start, end, { monthTargetUnits: 8 }).totalIncentiveEarned).toBe(0);
    expect(computeIncentives(fse, sales(8), scheme([rule]), start, end, { monthTargetUnits: 8 }).totalIncentiveEarned).toBe(400000);
  });
  it("falls back to the rule's default target when none is set", () => {
    expect(computeIncentives(fse, sales(9), scheme([rule]), start, end, { monthTargetUnits: null }).totalIncentiveEarned).toBe(0);
    expect(computeIncentives(fse, sales(10), scheme([rule]), start, end, { monthTargetUnits: null }).totalIncentiveEarned).toBe(500000);
  });
  it("can pay only on units above target, with model rates", () => {
    const above = { ...rule, targetPayout: "ABOVE_TARGET", modelSpecificAmounts: [{ model: "m2", amount: 80000 }] };
    expect(computeIncentives(fse, sales(12), scheme([above]), start, end, { monthTargetUnits: 10 }).totalIncentiveEarned).toBe(100000);
    expect(computeIncentives(fse, sales(12, "m2"), scheme([above]), start, end, { monthTargetUnits: 10 }).totalIncentiveEarned).toBe(160000);
  });
  it("combines with recruitment in one scheme", () => {
    const both = scheme([{ ruleType: "DEALER_RECRUITMENT", minRecruits: 5, perRecruitAmount: 100000 }, rule]);
    const out = computeIncentives(fse, sales(10), both, start, end, { ...recruit(5), monthTargetUnits: 10 });
    expect(out.totalIncentiveEarned).toBe(500000 + 500000);
    expect(out.schemes[0].rulesBreakdown).toHaveLength(2);
  });
});
