import mongoose, { Schema, Document, Model } from "mongoose";
import { ApprovalSignature, ApprovalSignatureSchema } from "@/lib/approval";

/**
 * Company salary structure: the columns of the monthly salary sheet and the PF / ESI / PT options.
 * Versioned by month; a new version applies to payroll from `effectiveFrom` once the Business Head
 * and the Managing Partner approve it.
 */
export type ComponentCalc = "PCT_GROSS" | "PCT_BASIC" | "FIXED" | "BALANCE";

export interface ISalaryComponent {
  key: string; // stable id: basic, hra, conveyance, medical, …
  name: string;
  kind: "EARNING" | "DEDUCTION";
  calc: ComponentCalc;
  /** Percent for PCT_*, rupees (paise) for FIXED, unused for BALANCE. */
  value: number;
  /** Counts towards PF wages (Basic + DA). */
  pfWage: boolean;
  /** Reduced for loss-of-pay days. */
  prorate: boolean;
  active: boolean;
}

export interface IStatutoryOptions {
  pfEnabled: boolean;
  pfEmployeeRate: number; // % of PF wage
  pfEmployerRate: number; // % of PF wage (EPS + EPF)
  epsRate: number; // % of PF wage up to the ceiling, inside the employer share
  edliRate: number; // employer, % of PF wage up to the ceiling
  pfAdminRate: number; // employer, % of PF wage
  pfCapAtCeiling: boolean;
  pfCeilingPaise: number; // ₹15,000
  esiEnabled: boolean;
  esiEmployeeRate: number; // 0.75
  esiEmployerRate: number; // 3.25
  esiCeilingPaise: number; // ₹21,000 gross: above this ESI does not apply
  ptEnabled: boolean;
  ptMode: "WB_SLAB" | "FLAT";
  ptFlatPaise: number;
}

export interface ISalaryTemplate extends Document {
  effectiveFrom: string; // YYYY-MM
  components: ISalaryComponent[];
  statutory: IStatutoryOptions;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  approvals: ApprovalSignature[];
  reason?: string;
  proposedBy: mongoose.Types.ObjectId;
  proposedByName: string;
  createdAt: Date;
}

const ComponentSchema = new Schema<ISalaryComponent>(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ["EARNING", "DEDUCTION"], required: true },
    calc: { type: String, enum: ["PCT_GROSS", "PCT_BASIC", "FIXED", "BALANCE"], required: true },
    value: { type: Number, default: 0 },
    pfWage: { type: Boolean, default: false },
    prorate: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const StatutorySchema = new Schema<IStatutoryOptions>(
  {
    pfEnabled: { type: Boolean, default: true },
    pfEmployeeRate: { type: Number, default: 12 },
    pfEmployerRate: { type: Number, default: 12 },
    epsRate: { type: Number, default: 8.33 },
    edliRate: { type: Number, default: 0.5 },
    pfAdminRate: { type: Number, default: 0.5 },
    pfCapAtCeiling: { type: Boolean, default: true },
    pfCeilingPaise: { type: Number, default: 1500000 },
    esiEnabled: { type: Boolean, default: true },
    esiEmployeeRate: { type: Number, default: 0.75 },
    esiEmployerRate: { type: Number, default: 3.25 },
    esiCeilingPaise: { type: Number, default: 2100000 },
    ptEnabled: { type: Boolean, default: true },
    ptMode: { type: String, enum: ["WB_SLAB", "FLAT"], default: "WB_SLAB" },
    ptFlatPaise: { type: Number, default: 20000 },
  },
  { _id: false }
);

const SalaryTemplateSchema = new Schema<ISalaryTemplate>(
  {
    effectiveFrom: { type: String, required: true, index: true },
    components: [ComponentSchema],
    statutory: { type: StatutorySchema, required: true },
    status: { type: String, enum: ["PENDING_APPROVAL", "APPROVED", "REJECTED", "SUPERSEDED"], default: "PENDING_APPROVAL", index: true },
    approvals: [ApprovalSignatureSchema],
    reason: String,
    proposedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    proposedByName: { type: String, required: true },
  },
  { timestamps: true }
);

export const SalaryTemplate: Model<ISalaryTemplate> =
  mongoose.models.SalaryTemplate || mongoose.model<ISalaryTemplate>("SalaryTemplate", SalaryTemplateSchema);
