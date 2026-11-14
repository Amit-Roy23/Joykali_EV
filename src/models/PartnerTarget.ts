import mongoose, { Schema, Document, Model } from "mongoose";
import { ApprovalSignature, ApprovalSignatureSchema } from "@/lib/approval";

/**
 * Monthly purchase target for a channel partner, with an optional commission per unit
 * earned once the target is reached. Set by company staff (for company-supplied partners)
 * or by the supplying partner for its own downline.
 */
export interface IPartnerTarget extends Document {
  partyType: "DEALER" | "DISTRIBUTOR";
  party: mongoose.Types.ObjectId;
  period: string; // YYYY-MM (IST)
  targetUnits: number;
  targetValue: number; // paise incl. GST, 0 = not set
  commissionPerUnit: number; // paise per unit bought in the month, paid only when the unit target is met
  setByType: "COMPANY" | "DEALER" | "DISTRIBUTOR";
  setBy?: mongoose.Types.ObjectId | null; // partner id when set by a partner
  setByUser: mongoose.Types.ObjectId;
  /** Commission settled as a credit note (company targets need BH + MP approval). */
  settlement?: {
    status: "PENDING_APPROVAL" | "SETTLED" | "REJECTED";
    amount: number;
    units: number;
    approvals: ApprovalSignature[];
    creditNote?: string;
    settledAt?: Date;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

const PartnerTargetSchema = new Schema<IPartnerTarget>(
  {
    partyType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    party: { type: Schema.Types.ObjectId, required: true, index: true },
    period: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    targetUnits: { type: Number, required: true, min: 0 },
    targetValue: { type: Number, default: 0, min: 0 },
    commissionPerUnit: { type: Number, default: 0, min: 0 },
    setByType: { type: String, enum: ["COMPANY", "DEALER", "DISTRIBUTOR"], required: true },
    setBy: { type: Schema.Types.ObjectId, default: null },
    setByUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    settlement: {
      type: new Schema(
        {
          status: { type: String, enum: ["PENDING_APPROVAL", "SETTLED", "REJECTED"], required: true },
          amount: { type: Number, required: true },
          units: { type: Number, required: true },
          approvals: { type: [ApprovalSignatureSchema], default: [] },
          creditNote: { type: String },
          settledAt: { type: Date },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
);
PartnerTargetSchema.index({ partyType: 1, party: 1, period: 1 }, { unique: true });

export const PartnerTarget: Model<IPartnerTarget> =
  mongoose.models.PartnerTarget || mongoose.model<IPartnerTarget>("PartnerTarget", PartnerTargetSchema);
