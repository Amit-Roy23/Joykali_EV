import mongoose, { Schema, Document, Model } from "mongoose";

export type PartyType = "DEALER" | "DISTRIBUTOR";

/**
 * Party account ledger (dealers & distributors). Debit = the party owes more
 * (tax invoice); credit = owes less (payment received, credit note).
 * Balance = Σdebit − Σcredit.
 */
export interface ILedgerEntry extends Document {
  /**
   * Whose books the entry sits in. null = the company's books. For network (secondary)
   * trade it is the supplying partner, e.g. a distributor's account for its dealer.
   */
  bookType?: PartyType | null;
  book?: mongoose.Types.ObjectId | null;
  partyType: PartyType;
  party: mongoose.Types.ObjectId;
  date: Date;
  type: "OPENING" | "INVOICE" | "PAYMENT" | "CREDIT_NOTE" | "ADJUSTMENT";
  reference: string; // invoice / receipt / credit-note number
  debit: number; // paise
  credit: number; // paise
  narration?: string;
  deliveryOrder?: mongoose.Types.ObjectId | null;
  partnerSale?: mongoose.Types.ObjectId | null;
  paymentMode?: "CASH" | "UPI" | "NEFT" | "RTGS" | "IMPS" | "BANK" | "CHEQUE";
  /** Company cash / bank account the money went into. */
  account?: mongoose.Types.ObjectId | null;
  /** UTR / UPI reference / cheque number — must be unique across receipts. */
  utr?: string;
  payerBank?: string;
  /** The partner's payment advice this receipt confirms. */
  advice?: mongoose.Types.ObjectId | null;
  /** Bank reconciliation: seen on the bank statement. */
  cleared?: { at: Date; statementDate: string; byName: string } | null;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>(
  {
    bookType: { type: String, enum: ["DEALER", "DISTRIBUTOR", null], default: null },
    book: { type: Schema.Types.ObjectId, default: null, index: true },
    partyType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    party: { type: Schema.Types.ObjectId, required: true, index: true },
    date: { type: Date, required: true, default: Date.now, index: true },
    type: { type: String, enum: ["OPENING", "INVOICE", "PAYMENT", "CREDIT_NOTE", "ADJUSTMENT"], required: true },
    reference: { type: String, required: true },
    debit: { type: Number, required: true, default: 0, min: 0 },
    credit: { type: Number, required: true, default: 0, min: 0 },
    narration: { type: String },
    deliveryOrder: { type: Schema.Types.ObjectId, ref: "DeliveryOrder", default: null },
    partnerSale: { type: Schema.Types.ObjectId, ref: "PartnerSale", default: null },
    paymentMode: { type: String, enum: ["CASH", "UPI", "NEFT", "RTGS", "IMPS", "BANK", "CHEQUE"] },
    account: { type: Schema.Types.ObjectId, ref: "MoneyAccount", default: null },
    utr: { type: String, trim: true, uppercase: true, index: true },
    payerBank: { type: String, trim: true },
    advice: { type: Schema.Types.ObjectId, ref: "PaymentAdvice", default: null },
    cleared: { type: new Schema({ at: Date, statementDate: String, byName: String }, { _id: false }), default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
LedgerEntrySchema.index({ partyType: 1, party: 1, date: 1 });

export const LedgerEntry: Model<ILedgerEntry> =
  mongoose.models.LedgerEntry || mongoose.model<ILedgerEntry>("LedgerEntry", LedgerEntrySchema);
