import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Security deposit held from a partner. It is a liability, kept apart from the trading
 * ledger: RECEIVED adds to the amount held, REFUNDED and ADJUSTED (set off against dues) reduce it.
 */
export interface ISecurityDeposit extends Document {
  partyType: "DEALER" | "DISTRIBUTOR";
  party: mongoose.Types.ObjectId;
  type: "RECEIVED" | "REFUNDED" | "ADJUSTED";
  amount: number; // paise, always positive
  date: Date;
  mode: "CASH" | "UPI" | "BANK" | "CHEQUE" | "LEDGER";
  reference?: string;
  narration?: string;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  createdAt: Date;
}

const SecurityDepositSchema = new Schema<ISecurityDeposit>(
  {
    partyType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    party: { type: Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, enum: ["RECEIVED", "REFUNDED", "ADJUSTED"], required: true },
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    mode: { type: String, enum: ["CASH", "UPI", "BANK", "CHEQUE", "LEDGER"], required: true },
    reference: { type: String, trim: true },
    narration: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const SecurityDeposit: Model<ISecurityDeposit> =
  mongoose.models.SecurityDeposit || mongoose.model<ISecurityDeposit>("SecurityDeposit", SecurityDepositSchema);
