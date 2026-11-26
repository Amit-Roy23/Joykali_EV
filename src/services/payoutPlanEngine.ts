/** Pure maths of the payout structure (unit-tested). All money in paise. */

export interface PlanTerms {
  salary: number;
  perDealer: number;
  dealerTarget: number;
  dealerPay: "ON_TARGET" | "EVERY";
  vehicleTarget: number;
  perVehicle: number;
  vehiclePay: "ON_TARGET" | "EVERY";
  ta: number;
  headcount?: number;
}

/** The planning sheet row: D×E, G×H, CTC per employee and total payout for the head count. */
export function planRow(p: PlanTerms, head = p.headcount ?? 1) {
  const activationBenefit = p.perDealer * p.dealerTarget;
  const targetIncentive = p.perVehicle * p.vehicleTarget;
  const ctc = p.salary + activationBenefit + targetIncentive + p.ta;
  return { activationBenefit, targetIncentive, ctc, head, totalPayout: ctc * head };
}

export interface PlanFacts {
  dealers: number; // new dealers activated in the month (own or team)
  vehicles: number; // vehicles sold in the month (own or team)
  /** A person's own monthly vehicle target (Targets page) overrides the plan's. */
  vehicleTargetOverride?: number | null;
}

/** What a person earns this month under the plan (incentives only — salary and TA are paid by payroll). */
export function planEarnings(p: PlanTerms, f: PlanFacts) {
  const vTarget = f.vehicleTargetOverride != null && f.vehicleTargetOverride > 0 ? f.vehicleTargetOverride : p.vehicleTarget;
  const dealerMet = p.dealerPay === "EVERY" ? f.dealers > 0 : f.dealers > 0 && f.dealers >= p.dealerTarget;
  const vehicleMet = p.vehiclePay === "EVERY" ? f.vehicles > 0 : f.vehicles > 0 && f.vehicles >= vTarget;
  const activation = dealerMet ? f.dealers * p.perDealer : 0;
  const target = vehicleMet ? f.vehicles * p.perVehicle : 0;
  const rs = (x: number) => `₹${(x / 100).toLocaleString("en-IN")}`;
  return {
    activation,
    target,
    total: activation + target,
    vehicleTarget: vTarget,
    dealerMet,
    vehicleMet,
    activationNote:
      p.dealerPay === "EVERY"
        ? `${f.dealers} new dealer(s) × ${rs(p.perDealer)}`
        : dealerMet
          ? `${f.dealers} new dealer(s) (target ${p.dealerTarget} met) × ${rs(p.perDealer)}`
          : `${f.dealers} of ${p.dealerTarget} new dealers — paid once ${p.dealerTarget} are activated`,
    targetNote:
      p.vehiclePay === "EVERY"
        ? `${f.vehicles} vehicle(s) × ${rs(p.perVehicle)}`
        : vehicleMet
          ? `${f.vehicles} vehicles (target ${vTarget} met) × ${rs(p.perVehicle)}`
          : `${f.vehicles} of ${vTarget} vehicles — paid once the target is met`,
  };
}

/** TA for the month, reduced for unpaid (loss-of-pay) days. */
export function taForMonth(ta: number, workingDays: number, lopDays: number) {
  const wd = Math.max(1, workingDays || 30);
  const paid = Math.max(0, wd - Math.min(wd, Math.max(0, lopDays || 0)));
  return Math.round((ta * paid) / wd);
}
