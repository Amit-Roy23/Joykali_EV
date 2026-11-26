import { describe, expect, it } from "vitest";
import { planEarnings, planRow, taForMonth } from "../payoutPlanEngine";

const R = (r: number) => r * 100;
const ASM = { salary: R(26000), perDealer: R(500), dealerTarget: 40, dealerPay: "ON_TARGET" as const, vehicleTarget: 600, perVehicle: R(60), vehiclePay: "ON_TARGET" as const, ta: R(2000), headcount: 1 };
const FSE = { salary: R(18000), perDealer: R(1000), dealerTarget: 5, dealerPay: "ON_TARGET" as const, vehicleTarget: 75, perVehicle: R(180), vehiclePay: "ON_TARGET" as const, ta: R(3000), headcount: 1 };

describe("Joykali payout structure", () => {
  it("matches the client's sheet: ASM CTC 84,000", () => {
    const r = planRow(ASM);
    expect(r.activationBenefit).toBe(R(20000));
    expect(r.targetIncentive).toBe(R(36000));
    expect(r.ctc).toBe(R(84000));
    expect(r.totalPayout).toBe(R(84000));
  });
  it("matches the client's sheet: FSE CTC 39,500", () => {
    const r = planRow(FSE);
    expect(r.activationBenefit).toBe(R(5000));
    expect(r.targetIncentive).toBe(R(13500));
    expect(r.ctc).toBe(R(39500));
    expect(planRow(FSE, 10).totalPayout).toBe(R(395000));
  });
  it("FSE: dealer benefit only once 5 are activated, then on all of them", () => {
    expect(planEarnings(FSE, { dealers: 4, vehicles: 0 }).activation).toBe(0);
    expect(planEarnings(FSE, { dealers: 5, vehicles: 0 }).activation).toBe(R(5000));
    expect(planEarnings(FSE, { dealers: 7, vehicles: 0 }).activation).toBe(R(7000));
  });
  it("FSE: vehicle incentive once 75 are sold, on every vehicle", () => {
    expect(planEarnings(FSE, { dealers: 0, vehicles: 74 }).target).toBe(0);
    expect(planEarnings(FSE, { dealers: 0, vehicles: 75 }).target).toBe(R(13500));
    expect(planEarnings(FSE, { dealers: 0, vehicles: 80 }).target).toBe(R(14400));
  });
  it("a person's own target replaces the plan's", () => {
    const e = planEarnings(FSE, { dealers: 0, vehicles: 10, vehicleTargetOverride: 10 });
    expect(e.vehicleTarget).toBe(10);
    expect(e.target).toBe(R(1800));
  });
  it("EVERY pays from the first unit", () => {
    const e = planEarnings({ ...ASM, dealerPay: "EVERY", vehiclePay: "EVERY" }, { dealers: 3, vehicles: 100 });
    expect(e.activation).toBe(R(1500));
    expect(e.target).toBe(R(6000));
    expect(e.total).toBe(R(7500));
  });
  it("TA is cut for unpaid days", () => {
    expect(taForMonth(R(3000), 30, 0)).toBe(R(3000));
    expect(taForMonth(R(3000), 30, 3)).toBe(R(2700));
    expect(taForMonth(R(3000), 30, 40)).toBe(0);
  });
});
