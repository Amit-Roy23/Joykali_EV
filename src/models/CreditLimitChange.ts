import mongoose, { Schema, Document, Model } from "mongoose";
import { ApprovalSignature, ApprovalSignatureSchema } from "@/lib/approval";

/** A request to change a dealer's or distributor's credit limit (BH + MP must approve). */
export interface ICreditLimitChange extends Document {
  partyType: "DEALER" | "DISTRIBUTOR";
  party: mongoose.Types.ObjectId;
  partyName: string;
  partyCode: string;
  fromLimit: number; // paise
  toLimit: number; // paise
  creditDays?: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvals: ApprovalSignature[];
  requestedBy: mongoose.Types.ObjectId;
  appliedAt?: Date | null;
  createdAt: Date;
}

const CreditLimitChangeSchema = new Schema<ICreditLimitChange>(
  {
    partyType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    party: { type: Schema.Types.ObjectId, required: true, index: true },
    partyName: { type: String, required: true },
    partyCode: { type: String, required: true },
    fromLimit: { type: Number, required: true },
    toLimit: { type: Number, required: true, min: 0 },
    creditDays: { type: Number },
    reason: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
    approvals: [ApprovalSignatureSchema],
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    appliedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const CreditLimitChange: Model<ICreditLimitChange> =
  mongoose.models.CreditLimitChange ||
  mongoose.model<ICreditLimitChange>("CreditLimitChange", CreditLimitChangeSchema);
