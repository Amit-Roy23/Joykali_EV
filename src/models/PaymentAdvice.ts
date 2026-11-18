import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A dealer / distributor telling the company "I have paid": amount, mode and UTR / cheque,
 * with a screenshot or slip. Accounts checks it against the bank and confirms it, which posts
 * the receipt to the partner's account; or rejects it with a reason.
 */
export interface IPaymentAdvice extends Document {
  code: string; // JKPA/2026-27/0001
  partyType: "DEALER" | "DISTRIBUTOR";
  party: mongoose.Types.ObjectId;
  partyName: string;
  amount: number; // paise
  date: string; // YYYY-MM-DD paid on
  mode: "UPI" | "NEFT" | "RTGS" | "IMPS" | "CHEQUE" | "CASH";
  utr: string;
  payerBank?: string;
  note?: string;
  proof?: mongoose.Types.ObjectId | null;
  status: "SUBMITTED" | "VERIFIED" | "REJECTED" | "WITHDRAWN";
  receipt?: mongoose.Types.ObjectId | null; // LedgerEntry
  receiptNo?: string;
  decidedByName?: string;
  decidedAt?: Date;
  rejectReason?: string;
  submittedBy: mongoose.Types.ObjectId;
  submittedByName: string;
  createdAt: Date;
}

const PaymentAdviceSchema = new Schema<IPaymentAdvice>(
  {
    code: { type: String, required: true, unique: true },
    partyType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    party: { type: Schema.Types.ObjectId, required: true, index: true },
    partyName: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    date: { type: String, required: true },
    mode: { type: String, enum: ["UPI", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH"], required: true },
    utr: { type: String, trim: true, uppercase: true, default: "" },
    payerBank: { type: String, trim: true },
    note: { type: String, trim: true },
    proof: { type: Schema.Types.ObjectId, ref: "StoredFile", default: null },
    status: { type: String, enum: ["SUBMITTED", "VERIFIED", "REJECTED", "WITHDRAWN"], default: "SUBMITTED", index: true },
    receipt: { type: Schema.Types.ObjectId, ref: "LedgerEntry", default: null },
    receiptNo: { type: String },
    decidedByName: { type: String },
    decidedAt: { type: Date },
    rejectReason: { type: String },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    submittedByName: { type: String, required: true },
  },
  { timestamps: true }
);

export const PaymentAdvice: Model<IPaymentAdvice> =
  mongoose.models.PaymentAdvice || mongoose.model<IPaymentAdvice>("PaymentAdvice", PaymentAdviceSchema);
