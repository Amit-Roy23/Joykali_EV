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
  /** CASH only: who holds this cash box now (only they move cash in or out of it). */
  custodian?: mongoose.Types.ObjectId | null;
  custodianName?: string;
  /** While someone covers (leave / illness): the regular holder it goes back to, and the planned return date. */
  regularCustodian?: mongoose.Types.ObjectId | null;
  regularCustodianName?: string;
  coverUntil?: string | null;
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
      custodian: ref("User", { default: null, index: true }),
      custodianName: { type: String, default: "" },
      regularCustodian: ref("User", { default: null }),
      regularCustodianName: { type: String, default: "" },
      coverUntil: { type: String, default: null },
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
  /** The approved payment request this voucher carried out. */
  request?: mongoose.Types.ObjectId | null;
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
      request: ref("PaymentRequest", { default: null }),
      createdBy: ref("User", { required: true }),
      createdByName: { type: String, required: true },
    },
    { timestamps: true }
  )
);

/* ---------------- Payment / fund-transfer requests ---------------- */
/**
 * Money going out, or moving between cash and bank, asked for first:
 *   raised (by the cashier or any staff, with what it is for) → approved by the Admin, Business Head or
 *   Managing Partner → carried out by the cashier (a payment or contra voucher) → everyone told.
 * Raised by an approver, it is an instruction: approved at once and waiting for the cashier.
 */
export interface IPaymentRequest extends Document {
  code: string; // JKRQ/2026-27/0001
  type: "PAYMENT" | "TRANSFER";
  amount: number; // paise
  /** What the money is for (required). */
  purpose: string;
  /** Account head: expense category or non-expense head; transfers get the contra head. */
  head: string;
  payee?: string;
  /** PAYMENT: suggested account (the cashier may pay from another). TRANSFER: money leaves this account. */
  account?: mongoose.Types.ObjectId | null;
  /** TRANSFER: money arrives in this account. */
  toAccount?: mongoose.Types.ObjectId | null;
  preferredMode?: string;
  neededBy?: string; // YYYY-MM-DD
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "CANCELLED";
  requestedBy: mongoose.Types.ObjectId;
  requestedByName: string;
  requestedByRole: string;
  decision?: { by: mongoose.Types.ObjectId; byName: string; role: string; at: Date; note?: string } | null;
  payment?: (PaymentStamp & { voucher: mongoose.Types.ObjectId; accountName: string }) | null;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}
export const PaymentRequest = model<IPaymentRequest>(
  "PaymentRequest",
  new Schema<IPaymentRequest>(
    {
      code: { type: String, required: true, unique: true },
      type: { type: String, enum: ["PAYMENT", "TRANSFER"], required: true },
      amount: { type: Number, required: true, min: 1 },
      purpose: { type: String, required: true, trim: true },
      head: { type: String, required: true, trim: true },
      payee: { type: String, trim: true },
      account: ref("MoneyAccount", { default: null }),
      toAccount: ref("MoneyAccount", { default: null }),
      preferredMode: String,
      neededBy: String,
      status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "PAID", "CANCELLED"], default: "PENDING", index: true },
      requestedBy: ref("User", { required: true }),
      requestedByName: { type: String, required: true },
      requestedByRole: { type: String, required: true },
      decision: {
        type: new Schema({ by: ref("User"), byName: String, role: String, at: Date, note: String }, { _id: false }),
        default: null,
      },
      payment: {
        type: new Schema(
          { account: ref("MoneyAccount"), accountName: String, date: String, mode: String, reference: String, by: ref("User"), byName: String, at: Date, voucher: ref("Voucher") },
          { _id: false }
        ),
        default: null,
      },
      cancelReason: String,
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

/* ---------------- Cash handover (change of cashier) ---------------- */
export const HANDOVER_REASONS = ["LEAVE", "SICK", "TRANSFER", "RESIGNED", "SHIFT", "OTHER"] as const;
export interface ICashHandover extends Document {
  code: string;
  account: mongoose.Types.ObjectId;
  accountName: string;
  /** HANDOVER = for good; COVER = someone stands in (leave / illness); RETURN = the cover gives it back. */
  type: "HANDOVER" | "COVER" | "RETURN";
  reason: (typeof HANDOVER_REASONS)[number];
  note?: string;
  from?: mongoose.Types.ObjectId | null;
  fromName: string;
  to: mongoose.Types.ObjectId;
  toName: string;
  expectedReturn?: string | null;
  cover?: mongoose.Types.ObjectId | null;
  startedBy: mongoose.Types.ObjectId;
  startedByName: string;
  /** The outgoing holder was not there to count (e.g. fell ill): started by Admin / BH / MP. */
  outgoingAbsent: boolean;
  bookBalanceAtStart: number;
  countedByFrom?: number | null;
  denominations?: Array<{ note: number; count: number }>;
  status: "PENDING" | "ACCEPTED" | "CANCELLED";
  acceptedAt?: Date;
  bookBalanceAtAccept?: number;
  countedByTo?: number;
  /** countedByTo − book balance at acceptance (negative = short). */
  difference?: number;
  acceptNote?: string;
  cancelledByName?: string;
  cancelReason?: string;
  settlement?: { status: "NONE" | "OPEN" | "WRITTEN_OFF" | "MADE_GOOD"; byName?: string; at?: Date; note?: string; voucher?: mongoose.Types.ObjectId | null };
  createdAt: Date;
}
export const CashHandover = model<ICashHandover>(
  "CashHandover",
  new Schema<ICashHandover>(
    {
      code: { type: String, required: true, unique: true },
      account: ref("MoneyAccount", { required: true, index: true }),
      accountName: { type: String, required: true },
      type: { type: String, enum: ["HANDOVER", "COVER", "RETURN"], required: true },
      reason: { type: String, enum: HANDOVER_REASONS, required: true },
      note: String,
      from: ref("User", { default: null }),
      fromName: { type: String, default: "" },
      to: ref("User", { required: true, index: true }),
      toName: { type: String, required: true },
      expectedReturn: { type: String, default: null },
      cover: ref("CashHandover", { default: null }),
      startedBy: ref("User", { required: true }),
      startedByName: { type: String, required: true },
      outgoingAbsent: { type: Boolean, default: false },
      bookBalanceAtStart: { type: Number, required: true },
      countedByFrom: { type: Number, default: null },
      denominations: { type: [new Schema({ note: Number, count: Number }, { _id: false })], default: [] },
      status: { type: String, enum: ["PENDING", "ACCEPTED", "CANCELLED"], default: "PENDING", index: true },
      acceptedAt: Date,
      bookBalanceAtAccept: Number,
      countedByTo: Number,
      difference: Number,
      acceptNote: String,
      cancelledByName: String,
      cancelReason: String,
      settlement: {
        type: new Schema({ status: { type: String, enum: ["NONE", "OPEN", "WRITTEN_OFF", "MADE_GOOD"], default: "NONE" }, byName: String, at: Date, note: String, voucher: ref("Voucher", { default: null }) }, { _id: false }),
        default: () => ({ status: "NONE" }),
      },
    },
    { timestamps: true }
  )
);
