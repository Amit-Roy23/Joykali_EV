import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISetting extends Document {
  companyName: string;
  brandTagline?: string;
  logoUrl?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  stateCode: string; // e.g. "19" for West Bengal
  gstin: string;
  pan: string;
  phone: string;
  email: string;
  website?: string;
  invoiceTerms: string[];
  codePrefixes: {
    employee: string;
    dealer: string;
    sale: string;
    purchase: string;
    payroll: string;
    payslip: string;
  };
  statutoryDeductions: {
    pfRate: number; // e.g. 12%
    esiRate: number; // e.g. 0.75%
    ptMonthlyPaise: number; // e.g. ₹200 = 20000 paise
    pfEnabled: boolean;
    esiEnabled: boolean;
    ptEnabled: boolean;
    ptMode?: "WB_SLAB" | "FLAT";
    /** Statutory PF wage ceiling (₹15,000) — PF is 12% of min(basic, ceiling) when capped. */
    pfWageCeilingPaise?: number;
    pfCapAtCeiling?: boolean;
    employerEsiRate?: number;
  };
  /** How a gross salary is split automatically into components. */
  salaryRules?: {
    basicPct: number; // % of gross
    hraPctOfBasic: number; // % of basic
    conveyancePaise: number; // fixed monthly
  };
  logistics?: {
    /** Consignments at or above this value need an e-way bill before dispatch. */
    ewayBillThresholdPaise: number;
    /** The person who loads a DO may not also dispatch it. */
    requireSeparateDispatcher: boolean;
    /** Warn this many days before a fleet document expires. */
    docExpiryWarningDays: number;
  };
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SettingSchema = new Schema<ISetting>(
  {
    companyName: { type: String, required: true, default: "Joykali EV Mobility" },
    brandTagline: { type: String, default: "Driving the Green Future" },
    logoUrl: { type: String, default: "" },
    address: { type: String, required: true, default: "NH-34, EV Hub, Barasat" },
    city: { type: String, required: true, default: "Kolkata" },
    state: { type: String, required: true, default: "West Bengal" },
    pincode: { type: String, required: true, default: "700124" },
    stateCode: { type: String, required: true, default: "19" },
    gstin: { type: String, required: true, default: "19AAACJ1234F1Z5" },
    pan: { type: String, required: true, default: "AAACJ1234F" },
    phone: { type: String, required: true, default: "+91 98765 43210" },
    email: { type: String, required: true, default: "contact@joykaliev.in" },
    website: { type: String, default: "https://joykaliev.in" },
    invoiceTerms: [
      {
        type: String,
        default: [
          "Goods once sold will not be taken back without authorization.",
          "Warranty as per OEM manufacturer terms & conditions.",
          "Disputes subject to Kolkata jurisdiction only.",
        ],
      },
    ],
    codePrefixes: {
      employee: { type: String, default: "JKE" },
      dealer: { type: String, default: "JKD" },
      sale: { type: String, default: "JKS" },
      purchase: { type: String, default: "JKP" },
      payroll: { type: String, default: "PR" },
      payslip: { type: String, default: "PS" },
    },
    statutoryDeductions: {
      pfRate: { type: Number, default: 12 },
      esiRate: { type: Number, default: 0.75 },
      ptMonthlyPaise: { type: Number, default: 20000 }, // ₹200
      pfEnabled: { type: Boolean, default: true },
      esiEnabled: { type: Boolean, default: true },
      ptEnabled: { type: Boolean, default: true },
      // WB_SLAB = West Bengal slab table on gross; FLAT = ptMonthlyPaise for everyone
      ptMode: { type: String, enum: ["WB_SLAB", "FLAT"], default: "WB_SLAB" },
      pfWageCeilingPaise: { type: Number, default: 1500000 },
      pfCapAtCeiling: { type: Boolean, default: true },
      employerEsiRate: { type: Number, default: 3.25 },
    },
    salaryRules: {
      basicPct: { type: Number, default: 50 },
      hraPctOfBasic: { type: Number, default: 40 },
      conveyancePaise: { type: Number, default: 160000 },
    },
    logistics: {
      ewayBillThresholdPaise: { type: Number, default: 5000000 },
      requireSeparateDispatcher: { type: Boolean, default: true },
      docExpiryWarningDays: { type: Number, default: 15 },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Setting: Model<ISetting> =
  mongoose.models.Setting || mongoose.model<ISetting>("Setting", SettingSchema);

