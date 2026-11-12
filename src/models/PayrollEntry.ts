import mongoose, { Schema, Document, Model } from "mongoose";

export interface IEarningsBreakdown {
  basic: number; // in paise
  hra: number;
  conveyance: number;
  otherAllowances: number;
  incentives: number;
  incentiveBreakdown: Array<{
    schemeId: mongoose.Types.ObjectId;
    schemeName: string;
    amount: number;
  }>;
}

export interface IDeductionsBreakdown {
  pf: number; // in paise
  esi: number;
  professionalTax: number;
  tds: number;
  advanceRecovery: number;
  other: number;
}

export interface IAdjustment {
  amount: number; // in paise (can be positive or negative)
  reason: string;
  addedBy: mongoose.Types.ObjectId;
  addedAt: Date;
}

export interface IPayrollEntry extends Document {
  payrollRun: mongoose.Types.ObjectId;
  employee: mongoose.Types.ObjectId;
  payslipCode: string; // PS/2026-11/JKE-FEC-0001
  salaryStructureSnapshot: any;
  workingDays: number;
  lopDays: number; // Loss of pay days
  paidDays: number; // workingDays - lopDays
  earnings: IEarningsBreakdown;
  deductions: IDeductionsBreakdown;
  adjustments: IAdjustment[];
  grossPay: number; // in paise
  totalDeductions: number; // in paise
  netPay: number; // in paise
  createdAt: Date;
  updatedAt: Date;
}

const AdjustmentSchema = new Schema<IAdjustment>(
  {
    amount: { type: Number, required: true },
    reason: { type: String, required: true },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PayrollEntrySchema = new Schema<IPayrollEntry>(
  {
    payrollRun: { type: Schema.Types.ObjectId, ref: "PayrollRun", required: true, index: true },
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    payslipCode: { type: String, required: true, unique: true, index: true },
    salaryStructureSnapshot: { type: Schema.Types.Mixed, required: true },
    workingDays: { type: Number, required: true, default: 30 },
    lopDays: { type: Number, required: true, default: 0 },
    paidDays: { type: Number, required: true, default: 30 },
    earnings: {
      basic: { type: Number, required: true, default: 0 },
      hra: { type: Number, required: true, default: 0 },
      conveyance: { type: Number, required: true, default: 0 },
      otherAllowances: { type: Number, required: true, default: 0 },
      incentives: { type: Number, required: true, default: 0 },
      incentiveBreakdown: [
        {
          schemeId: { type: Schema.Types.ObjectId, ref: "IncentiveScheme" },
          schemeName: { type: String },
          amount: { type: Number },
        },
      ],
    },
    deductions: {
      pf: { type: Number, required: true, default: 0 },
      esi: { type: Number, required: true, default: 0 },
      professionalTax: { type: Number, required: true, default: 0 },
      tds: { type: Number, required: true, default: 0 },
      advanceRecovery: { type: Number, required: true, default: 0 },
      other: { type: Number, required: true, default: 0 },
    },
    adjustments: [AdjustmentSchema],
    grossPay: { type: Number, required: true, default: 0 },
    totalDeductions: { type: Number, required: true, default: 0 },
    netPay: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

PayrollEntrySchema.index({ payrollRun: 1, employee: 1 }, { unique: true });

export const PayrollEntry: Model<IPayrollEntry> =
  mongoose.models.PayrollEntry ||
  mongoose.model<IPayrollEntry>("PayrollEntry", PayrollEntrySchema);

