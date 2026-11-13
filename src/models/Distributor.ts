import mongoose, { Schema, Document, Model } from "mongoose";

export interface IDistributor extends Document {
  distributorCode: string; // JKDB-0001
  name: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  stateCode: string; // GST state code, "19" = West Bengal
  pincode: string;
  gstin: string;
  /** Approved credit limit (paise). Changes go through BH + MP approval. */
  creditLimit: number;
  creditDays: number;
  assignedASM?: mongoose.Types.ObjectId | null;
  status: "ACTIVE" | "INACTIVE" | "ON_HOLD";
  onboardingDate: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DistributorSchema = new Schema<IDistributor>(
  {
    distributorCode: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true, default: "West Bengal" },
    stateCode: { type: String, required: true, default: "19" },
    pincode: { type: String, required: true, trim: true },
    gstin: { type: String, required: true, uppercase: true, trim: true },
    creditLimit: { type: Number, required: true, default: 0 },
    creditDays: { type: Number, required: true, default: 30 },
    assignedASM: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE", "ON_HOLD"], default: "ACTIVE", index: true },
    onboardingDate: { type: Date, required: true, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Distributor: Model<IDistributor> =
  mongoose.models.Distributor || mongoose.model<IDistributor>("Distributor", DistributorSchema);
