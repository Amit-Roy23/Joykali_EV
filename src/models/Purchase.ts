import mongoose, { Schema, Document, Model } from "mongoose";
import { PaymentStatus, PaymentMode } from "@/types";

export interface IPurchaseItem {
  model: mongoose.Types.ObjectId;
  quantity: number;
  unitCost: number; // in paise
  gstRate: number; // e.g. 5
  totalCost: number; // in paise
}

export interface IPaymentRecord {
  amount: number; // in paise
  date: Date;
  mode: PaymentMode;
  reference?: string;
  notes?: string;
}

export interface IPurchase extends Document {
  purchaseCode: string;
  supplier: mongoose.Types.ObjectId;
  invoiceNumber: string;
  invoiceDate: Date;
  lineItems: IPurchaseItem[];
  subTotal: number; // in paise
  gstAmount: number; // in paise
  totalAmount: number; // in paise
  paymentStatus: PaymentStatus;
  payments: IPaymentRecord[];
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseItemSchema = new Schema<IPurchaseItem>(
  {
    model: { type: Schema.Types.ObjectId, ref: "VehicleModel", required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitCost: { type: Number, required: true },
    gstRate: { type: Number, required: true, default: 5 },
    totalCost: { type: Number, required: true },
  },
  { _id: false }
);

const PaymentRecordSchema = new Schema<IPaymentRecord>(
  {
    amount: { type: Number, required: true },
    date: { type: Date, required: true, default: Date.now },
    mode: { type: String, enum: ["CASH", "UPI", "BANK", "FINANCE"], required: true },
    reference: { type: String },
    notes: { type: String },
  },
  { _id: false }
);

const PurchaseSchema = new Schema<IPurchase>(
  {
    purchaseCode: { type: String, required: true, unique: true, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
    invoiceNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, required: true, default: Date.now },
    lineItems: [PurchaseItemSchema],
    subTotal: { type: Number, required: true, default: 0 },
    gstAmount: { type: Number, required: true, default: 0 },
    totalAmount: { type: Number, required: true, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "PARTIAL", "PAID"],
      default: "UNPAID",
      index: true,
    },
    payments: [PaymentRecordSchema],
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const Purchase: Model<IPurchase> =
  mongoose.models.Purchase || mongoose.model<IPurchase>("Purchase", PurchaseSchema);

