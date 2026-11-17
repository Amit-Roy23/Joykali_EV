import mongoose, { Schema, Document, Model } from "mongoose";
import { ApprovalSignature, ApprovalSignatureSchema } from "@/lib/approval";

const ref = (m: string, extra: Record<string, any> = {}) => ({ type: Schema.Types.ObjectId, ref: m, ...extra });
const model = <T>(name: string, schema: Schema<T>): Model<T> => (mongoose.models[name] as Model<T>) || mongoose.model<T>(name, schema);

/* ---------------- Cash and bank accounts ---------------- */
export interface IMoneyAccount extends Document {
  name: string; // "Cash in hand", "HDFC current a/c"
  kind: "CASH" | "BANK";
  bankName?: string;
  accountNo?: string;
  ifsc?: string;
  /** Balance on the opening date (paise; negative = overdraft). */
  openingBalance: number;
  openingDate: string; // YYYY-MM-DD
  /** Receipts/payments recorded only with a mode (cash, UPI, bank) land in the default account of that kind. */
  isDefault: boolean;
  status: "ACTIVE" | "CLOSED";
  createdAt: Date;
}
export const MoneyAccount = model<IMoneyAccount>(
  "MoneyAccount",
  new Schema<IMoneyAccount>(
    {
      name: { type: String, required: true, trim: true },
      kind: { type: String, enum: ["CASH", "BANK"], required: true },
      bankName: { type: String, trim: true },
      accountNo: { type: String, trim: true },
      ifsc: { type: String, trim: true, uppercase: true },
      openingBalance: { type: Number, default: 0 },
      openingDate: { type: String, required: true },
      isDefault: { type: Boolean, default: false },
      status: { type: String, enum: ["ACTIVE", "CLOSED"], default: "ACTIVE" },
    },
    { timestamps: true }
  )
);

export interface PaymentStamp {
  account: mongoose.Types.ObjectId;
  date: string; // YYYY-MM-DD
  mode?: string;
  reference?: string;
  by?: mongoose.Types.ObjectId;
  byName?: string;
  at?: Date;
}
export const PaymentStampSchema = new Schema<PaymentStamp>(
  {
    account: ref("MoneyAccount", { required: true }),
    date: { type: String, required: true },
    mode: String,
    reference: String,
    by: ref("User"),
    byName: String,
    at: Date,
  },
  { _id: false }
);

/* ---------------- Company expenses ---------------- */
export interface IExpense extends Document {
  code: string; // JKEX/2026-27/0001
  date: string; // YYYY-MM-DD (bill date)
  category: string;
  description: string;
  vendor?: string;
  billNo?: string;
  amount: number; // paise, before GST
  gstAmount: number; // paise
  total: number; // paise
  /** GST on the bill can be claimed as input credit, so the P&L carries only the amount before GST. */
  gstInput: boolean;
  /** Where it was spent: "Head office", a warehouse or a showroom. */
  costCentre?: string;
  bill?: mongoose.Types.ObjectId | null;
  status: "PENDING_APPROVAL" | "APPROVED" | "PAID" | "REJECTED" | "CANCELLED";
  approvalRequired: boolean;
  approvals: ApprovalSignature[];
  rejectReason?: string;
  payment?: PaymentStamp | null;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  createdAt: Date;
}
export const Expense = model<IExpense>(
  "Expense",
  new Schema<IExpense>(
    {
      code: { type: String, required: true, unique: true },
      date: { type: String, required: true, index: true },
      category: { type: String, required: true, index: true },
      description: { type: String, required: true, trim: true },
      vendor: { type: String, trim: true },
      billNo: { type: String, trim: true },
      amount: { type: Number, required: true, min: 0 },
      gstAmount: { type: Number, default: 0, min: 0 },
      total: { type: Number, required: true, min: 1 },
      gstInput: { type: Boolean, default: false },
      costCentre: { type: String, trim: true },
      bill: ref("StoredFile", { default: null }),
      status: { type: String, enum: ["PENDING_APPROVAL", "APPROVED", "PAID", "REJECTED", "CANCELLED"], required: true, index: true },
      approvalRequired: { type: Boolean, default: false },
      approvals: [ApprovalSignatureSchema],
      rejectReason: String,
      payment: { type: PaymentStampSchema, default: null },
      createdBy: ref("User", { required: true }),
      createdByName: { type: String, required: true },
    },
    { timestamps: true }
  )
);

/* ---------------- Manual vouchers ---------------- */
export interface IVoucher extends Document {
  code: string; // JKV/2026-27/0001
  type: "RECEIPT" | "PAYMENT" | "CONTRA";
  date: string; // YYYY-MM-DD
  /** RECEIPT / PAYMENT: the cash or bank account. CONTRA: money leaves `account` and arrives in `toAccount`. */
  account: mongoose.Types.ObjectId;
  toAccount?: mongoose.Types.ObjectId | null;
  amount: number; // paise
  /** Account head, e.g. "Interest income", "Capital introduced", "Rent", "Bank charges". */
  head: string;
  narration: string;
  reference?: string;
  status: "POSTED" | "CANCELLED";
  cancelReason?: string;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  createdAt: Date;
}
export const Voucher = model<IVoucher>(
  "Voucher",
  new Schema<IVoucher>(
    {
      code: { type: String, required: true, unique: true },
      type: { type: String, enum: ["RECEIPT", "PAYMENT", "CONTRA"], required: true },
      date: { type: String, required: true, index: true },
      account: ref("MoneyAccount", { required: true }),
      toAccount: ref("MoneyAccount", { default: null }),
      amount: { type: Number, required: true, min: 1 },
      head: { type: String, required: true, trim: true },
      narration: { type: String, required: true, trim: true },
      reference: { type: String, trim: true },
      status: { type: String, enum: ["POSTED", "CANCELLED"], default: "POSTED", index: true },
      cancelReason: String,
      createdBy: ref("User", { required: true }),
      createdByName: { type: String, required: true },
    },
    { timestamps: true }
  )
);

/* ---------------- Monthly budget per expense head ---------------- */
export interface IBudget extends Document {
  period: string; // YYYY-MM
  head: string;
  amount: number; // paise
  updatedByName?: string;
}
const BudgetSchema = new Schema<IBudget>(
  {
    period: { type: String, required: true, index: true },
    head: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    updatedByName: String,
  },
  { timestamps: true }
);
BudgetSchema.index({ period: 1, head: 1 }, { unique: true });
export const Budget = model<IBudget>("Budget", BudgetSchema);
