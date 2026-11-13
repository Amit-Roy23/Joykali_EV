import mongoose, { Schema, Document, Model } from "mongoose";

export type PartyType = "DEALER" | "DISTRIBUTOR";

/**
 * Party account ledger (dealers & distributors). Debit = the party owes more
 * (tax invoice); credit = owes less (payment received, credit note).
 * Balance = Σdebit − Σcredit.
 */
export interface ILedgerEntry extends Document {
  partyType: PartyType;
  party: mongoose.Types.ObjectId;
  date: Date;
  type: "OPENING" | "INVOICE" | "PAYMENT" | "CREDIT_NOTE" | "ADJUSTMENT";
  reference: string; // invoice / receipt / credit-note number
  debit: number; // paise
  credit: number; // paise
  narration?: string;
  deliveryOrder?: mongoose.Types.ObjectId | null;
  paymentMode?: "CASH" | "UPI" | "BANK" | "CHEQUE";
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>(
  {
    partyType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    party: { type: Schema.Types.ObjectId, required: true, index: true },
    date: { type: Date, required: true, default: Date.now, index: true },
    type: { type: String, enum: ["OPENING", "INVOICE", "PAYMENT", "CREDIT_NOTE", "ADJUSTMENT"], required: true },
    reference: { type: String, required: true },
    debit: { type: Number, required: true, default: 0, min: 0 },
    credit: { type: Number, required: true, default: 0, min: 0 },
    narration: { type: String },
    deliveryOrder: { type: Schema.Types.ObjectId, ref: "DeliveryOrder", default: null },
    paymentMode: { type: String, enum: ["CASH", "UPI", "BANK", "CHEQUE"] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
LedgerEntrySchema.index({ partyType: 1, party: 1, date: 1 });

export const LedgerEntry: Model<ILedgerEntry> =
  mongoose.models.LedgerEntry || mongoose.model<ILedgerEntry>("LedgerEntry", LedgerEntrySchema);
