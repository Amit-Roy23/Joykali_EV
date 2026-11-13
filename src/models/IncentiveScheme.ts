import mongoose, { Schema, Document, Model } from "mongoose";
import { ApprovalSignature, ApprovalSignatureSchema } from "@/lib/approval";
import {
  IncentiveRuleType,
  SchemeStatus,
  SlabApplicationType,
  UserRole,
} from "@/types";

export interface ISlabTier {
  minUnits: number;
  maxUnits?: number | null; // null means unbounded (e.g. 11+)
  amountPerUnit: number; // in paise
}

export interface IModelSpecificAmount {
  model: mongoose.Types.ObjectId;
  amount: number; // in paise
}

export interface IIncentiveRule {
  ruleType: IncentiveRuleType;
  // For PER_UNIT
  perUnitAmount?: number; // default paise per unit
  modelSpecificAmounts?: IModelSpecificAmount[];
  // For SLAB
  slabs?: ISlabTier[];
  slabApplication?: SlabApplicationType; // "ALL_UNITS" | "INCREMENTAL"
  // For TARGET_BONUS
  targetUnits?: number;
  targetRevenue?: number; // in paise
  targetBonusAmount?: number; // in paise
  // For PERCENTAGE
  percentageRate?: number; // e.g. 1.5%
  // For TEAM_OVERRIDE
  teamOverridePerUnit?: number; // in paise per team unit
  teamOverridePercentage?: number; // % of team revenue
}

export interface IIncentiveScheme extends Document {
  name: string;
  description?: string;
  status: SchemeStatus;
  validFrom: Date;
  validTo: Date;
  applicableRoles: UserRole[];
  applicableEmployees?: mongoose.Types.ObjectId[];
  applicableModels?: mongoose.Types.ObjectId[];
  applicableDealers?: mongoose.Types.ObjectId[];
  rules: IIncentiveRule[];
  approvedBy?: mongoose.Types.ObjectId | null;
  /** Business Head then Managing Partner signatures. */
  approvals?: ApprovalSignature[];
  approvedAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const SlabTierSchema = new Schema<ISlabTier>(
  {
    minUnits: { type: Number, required: true },
    maxUnits: { type: Number, default: null },
    amountPerUnit: { type: Number, required: true },
  },
  { _id: false }
);

const ModelSpecificAmountSchema = new Schema<IModelSpecificAmount>(
  {
    model: { type: Schema.Types.ObjectId, ref: "VehicleModel", required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const IncentiveRuleSchema = new Schema<IIncentiveRule>(
  {
    ruleType: {
      type: String,
      enum: ["PER_UNIT", "SLAB", "TARGET_BONUS", "PERCENTAGE", "TEAM_OVERRIDE"],
      required: true,
    },
    perUnitAmount: { type: Number },
    modelSpecificAmounts: [ModelSpecificAmountSchema],
    slabs: [SlabTierSchema],
    slabApplication: {
      type: String,
      enum: ["ALL_UNITS", "INCREMENTAL"],
      default: "ALL_UNITS",
    },
    targetUnits: { type: Number },
    targetRevenue: { type: Number },
    targetBonusAmount: { type: Number },
    percentageRate: { type: Number },
    teamOverridePerUnit: { type: Number },
    teamOverridePercentage: { type: Number },
  },
  { _id: false }
);

const IncentiveSchemeSchema = new Schema<IIncentiveScheme>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      enum: ["DRAFT", "ACTIVE", "EXPIRED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    validFrom: { type: Date, required: true, index: true },
    validTo: { type: Date, required: true, index: true },
    applicableRoles: [
      {
        type: String,
        enum: ["FEC", "ASM", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"],
      },
    ],
    applicableEmployees: [{ type: Schema.Types.ObjectId, ref: "User" }],
    applicableModels: [{ type: Schema.Types.ObjectId, ref: "VehicleModel" }],
    applicableDealers: [{ type: Schema.Types.ObjectId, ref: "Dealer" }],
    rules: [IncentiveRuleSchema],
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvals: [ApprovalSignatureSchema],
    approvedAt: { type: Date, default: null },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export const IncentiveScheme: Model<IIncentiveScheme> =
  mongoose.models.IncentiveScheme ||
  mongoose.model<IIncentiveScheme>("IncentiveScheme", IncentiveSchemeSchema);

