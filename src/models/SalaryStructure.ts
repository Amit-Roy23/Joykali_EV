import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISalaryStructure extends Document {
  employee: mongoose.Types.ObjectId;
  basic: number; // in paise
  hra: number; // in paise
  conveyance: number; // in paise
  otherAllowances: number; // in paise
  fixedDeductions: {
    pf: boolean;
    esi: boolean;
    professionalTax: boolean;
  };
  bankDetails: {
    accountNo: string;
    ifsc: string;
    bankName: string;
  };
  pan: string;
  effectiveFrom: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SalaryStructureSchema = new Schema<ISalaryStructure>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    basic: { type: Number, required: true, default: 0 },
    hra: { type: Number, required: true, default: 0 },
    conveyance: { type: Number, required: true, default: 0 },
    otherAllowances: { type: Number, required: true, default: 0 },
    fixedDeductions: {
      pf: { type: Boolean, default: true },
      esi: { type: Boolean, default: true },
      professionalTax: { type: Boolean, default: true },
    },
    bankDetails: {
      accountNo: { type: String, required: true, trim: true },
      ifsc: { type: String, required: true, trim: true },
      bankName: { type: String, required: true, trim: true },
    },
    pan: { type: String, required: true, uppercase: true, trim: true },
    effectiveFrom: { type: Date, required: true, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const SalaryStructure: Model<ISalaryStructure> =
  mongoose.models.SalaryStructure ||
  mongoose.model<ISalaryStructure>("SalaryStructure", SalaryStructureSchema);

