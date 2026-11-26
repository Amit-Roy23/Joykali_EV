import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Joykali's monthly payout structure per field post (ASM / FSE):
 *   salary + activation benefit (₹ per new dealer × dealers activated)
 *          + target incentive (₹ per vehicle × vehicles) + TA  =  CTC per employee.
 * Versioned by month: a change applies from `effectiveFrom` and never rewrites an earlier month.
 */
export interface IPayoutPlan extends Document {
  role: "ASM" | "FEC";
  effectiveFrom: string; // YYYY-MM
  salary: number; // paise / month (the planned gross; each person's own salary structure is what is paid)
  perDealer: number; // paise per new dealer activated
  dealerTarget: number; // dealers to activate per month
  /** ON_TARGET: paid on every dealer once the monthly number is reached. EVERY: paid from the first dealer. */
  dealerPay: "ON_TARGET" | "EVERY";
  vehicleTarget: number; // vehicles per month
  perVehicle: number; // paise per vehicle
  vehiclePay: "ON_TARGET" | "EVERY";
  ta: number; // paise / month travel allowance
  /** SELF: own dealers and sales. TEAM: own + everyone reporting to them (an ASM's FSEs). */
  measure: "SELF" | "TEAM";
  headcount: number; // planned people in this post
  note?: string;
  updatedByName?: string;
  createdAt: Date;
}

const PayoutPlanSchema = new Schema<IPayoutPlan>(
  {
    role: { type: String, enum: ["ASM", "FEC"], required: true },
    effectiveFrom: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    salary: { type: Number, required: true, min: 0 },
    perDealer: { type: Number, required: true, min: 0 },
    dealerTarget: { type: Number, required: true, min: 0 },
    dealerPay: { type: String, enum: ["ON_TARGET", "EVERY"], default: "ON_TARGET" },
    vehicleTarget: { type: Number, required: true, min: 0 },
    perVehicle: { type: Number, required: true, min: 0 },
    vehiclePay: { type: String, enum: ["ON_TARGET", "EVERY"], default: "ON_TARGET" },
    ta: { type: Number, required: true, min: 0 },
    measure: { type: String, enum: ["SELF", "TEAM"], default: "SELF" },
    headcount: { type: Number, default: 1, min: 0 },
    note: String,
    updatedByName: String,
  },
  { timestamps: true }
);
PayoutPlanSchema.index({ role: 1, effectiveFrom: 1 }, { unique: true });

export const PayoutPlan: Model<IPayoutPlan> = mongoose.models.PayoutPlan || mongoose.model<IPayoutPlan>("PayoutPlan", PayoutPlanSchema);
