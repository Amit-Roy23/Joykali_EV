import mongoose, { Schema, Document, Model } from "mongoose";
import { ApprovalSignature, ApprovalSignatureSchema } from "@/lib/approval";
import { PayrollRunStatus } from "@/types";

export interface IPayrollRunTotals {
  totalGross: number; // in paise
  totalDeductions: number; // in paise
  totalNet: number; // in paise
  totalEmployees: number;
}

export interface IPayrollRun extends Document {
  runCode: string; // PR-2026-11
  month: number; // 1 - 12
  year: number; // e.g. 2026
  status: PayrollRunStatus;
  totals: IPayrollRunTotals;
  createdBy: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId | null;
  approvedBy?: mongoose.Types.ObjectId | null;
  /** Business Head then Managing Partner signatures. */
  approvals?: ApprovalSignature[];
  approvedAt?: Date | null;
  lockedBy?: mongoose.Types.ObjectId | null;
  lockedAt?: Date | null;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollRunTotalsSchema = new Schema<IPayrollRunTotals>(
  {
    totalGross: { type: Number, required: true, default: 0 },
    totalDeductions: { type: Number, required: true, default: 0 },
    totalNet: { type: Number, required: true, default: 0 },
    totalEmployees: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const PayrollRunSchema = new Schema<IPayrollRun>(
  {
    runCode: { type: String, required: true, unique: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    status: {
      type: String,
      enum: ["DRAFT", "UNDER_REVIEW", "APPROVED", "LOCKED"],
      default: "DRAFT",
      index: true,
    },
    totals: { type: PayrollRunTotalsSchema, default: () => ({}) },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvals: [ApprovalSignatureSchema],
    approvedAt: { type: Date, default: null },
    lockedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    lockedAt: { type: Date, default: null },
    notes: { type: String },
  },
  { timestamps: true }
);

PayrollRunSchema.index({ year: 1, month: 1 }, { unique: true });

export const PayrollRun: Model<IPayrollRun> =
  mongoose.models.PayrollRun ||
  mongoose.model<IPayrollRun>("PayrollRun", PayrollRunSchema);

