import mongoose, { Schema, Document, Model } from "mongoose";
import { IncentiveRuleType } from "@/types";

export interface IIncentiveBreakdownItem {
  schemeId: mongoose.Types.ObjectId;
  schemeName: string;
  ruleType: IncentiveRuleType;
  unitsCount: number;
  revenueCount: number; // in paise
  earnedAmount: number; // in paise
  description: string;
}

export interface IIncentiveLedger extends Document {
  employee: mongoose.Types.ObjectId;
  period: string; // e.g. "2026-11"
  totalEarned: number; // in paise
  totalUnits: number;
  breakdown: IIncentiveBreakdownItem[];
  isLocked: boolean;
  calculatedAt: Date;
}

const IncentiveBreakdownItemSchema = new Schema<IIncentiveBreakdownItem>(
  {
    schemeId: { type: Schema.Types.ObjectId, ref: "IncentiveScheme", required: true },
    schemeName: { type: String, required: true },
    ruleType: { type: String, required: true },
    unitsCount: { type: Number, default: 0 },
    revenueCount: { type: Number, default: 0 },
    earnedAmount: { type: Number, required: true, default: 0 },
    description: { type: String, required: true },
  },
  { _id: false }
);

const IncentiveLedgerSchema = new Schema<IIncentiveLedger>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    period: { type: String, required: true, index: true },
    totalEarned: { type: Number, required: true, default: 0 },
    totalUnits: { type: Number, default: 0 },
    breakdown: [IncentiveBreakdownItemSchema],
    isLocked: { type: Boolean, default: false },
    calculatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

IncentiveLedgerSchema.index({ employee: 1, period: 1 }, { unique: true });

export const IncentiveLedger: Model<IIncentiveLedger> =
  mongoose.models.IncentiveLedger ||
  mongoose.model<IIncentiveLedger>("IncentiveLedger", IncentiveLedgerSchema);

