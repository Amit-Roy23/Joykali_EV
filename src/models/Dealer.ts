import mongoose, { Schema, Document, Model } from "mongoose";

export type DealerTier = "DEALER" | "SUB_DEALER";

export interface IDealer extends Document {
  dealerCode: string; // JKD-… (sub dealers: JKSB-0001)
  tier: DealerTier;
  /**
   * Who supplies this dealer. Dealers with neither parent are company dealers (stock on
   * consignment). A dealer under a distributor buys from that distributor; a sub dealer buys
   * from its parent dealer, or from its distributor when it has no parent dealer.
   */
  parentDistributor?: mongoose.Types.ObjectId | null;
  parentDealer?: mongoose.Types.ObjectId | null;
  territory?: mongoose.Types.ObjectId | null;
  name: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  gstin: string;
  assignedASM?: mongoose.Types.ObjectId | null;
  /** Approved credit limit in paise — covers consignment stock + open orders. Changes need BH + MP. */
  creditLimit: number;
  creditDays: number;
  stateCode: string;
  pincode: string;
  status: "PENDING" | "ACTIVE" | "INACTIVE";
  onboardingDate: Date;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DealerSchema = new Schema<IDealer>(
  {
    dealerCode: { type: String, required: true, unique: true, index: true },
    tier: { type: String, enum: ["DEALER", "SUB_DEALER"], default: "DEALER", index: true },
    parentDistributor: { type: Schema.Types.ObjectId, ref: "Distributor", default: null, index: true },
    parentDealer: { type: Schema.Types.ObjectId, ref: "Dealer", default: null, index: true },
    territory: { type: Schema.Types.ObjectId, ref: "Territory", default: null },
    name: { type: String, required: true, trim: true },
    ownerName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    gstin: { type: String, required: true, uppercase: true, trim: true },
    assignedASM: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    creditLimit: { type: Number, required: true, default: 0 },
    creditDays: { type: Number, required: true, default: 30 },
    stateCode: { type: String, required: true, default: "19" },
    pincode: { type: String, default: "" },
    status: { type: String, enum: ["PENDING", "ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
    onboardingDate: { type: Date, required: true, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Dealer: Model<IDealer> =
  mongoose.models.Dealer || mongoose.model<IDealer>("Dealer", DealerSchema);

