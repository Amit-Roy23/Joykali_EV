import mongoose, { Schema, Document, Model } from "mongoose";
import { PaymentMode, SaleStatus } from "@/types";

export interface ICustomer {
  name: string;
  phone: string;
  email?: string;
  address: string;
  idProofType?: string; // Aadhaar, PAN, Voter ID
  idProofNumber?: string;
}

export interface IPriceBreakdown {
  exShowroom: number; // in paise
  discount: number; // in paise
  gst: number; // in paise
  registration: number; // in paise
  insurance: number; // in paise
  accessories: number; // in paise
}

export interface IFinancierDetails {
  financierName: string;
  loanAmount: number; // in paise
  downPayment: number; // in paise
  loanAccountNo?: string;
}

export interface ISalePayment {
  amount: number; // in paise
  date: Date;
  mode: PaymentMode;
  reference?: string;
}

export interface ISale extends Document {
  saleCode: string;
  saleDate: Date;
  customer: ICustomer;
  vehicle: mongoose.Types.ObjectId;
  dealer?: mongoose.Types.ObjectId | null;
  soldBy: mongoose.Types.ObjectId; // FEC/Employee
  asmAtSale?: mongoose.Types.ObjectId | null; // ASM derived at sale time
  priceBreakdown: IPriceBreakdown;
  totalAmount: number; // in paise
  paymentMode: PaymentMode;
  financierDetails?: IFinancierDetails;
  payments: ISalePayment[];
  status: SaleStatus;
  cancellationReason?: string;
  cancelledBy?: mongoose.Types.ObjectId | null;
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: { type: String, required: true, trim: true },
    idProofType: { type: String, trim: true },
    idProofNumber: { type: String, trim: true },
  },
  { _id: false }
);

const PriceBreakdownSchema = new Schema<IPriceBreakdown>(
  {
    exShowroom: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    gst: { type: Number, required: true, default: 0 },
    registration: { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    accessories: { type: Number, default: 0 },
  },
  { _id: false }
);

const FinancierDetailsSchema = new Schema<IFinancierDetails>(
  {
    financierName: { type: String, required: true },
    loanAmount: { type: Number, required: true },
    downPayment: { type: Number, required: true },
    loanAccountNo: { type: String },
  },
  { _id: false }
);

const SalePaymentSchema = new Schema<ISalePayment>(
  {
    amount: { type: Number, required: true },
    date: { type: Date, required: true, default: Date.now },
    mode: { type: String, enum: ["CASH", "UPI", "BANK", "FINANCE"], required: true },
    reference: { type: String },
  },
  { _id: false }
);

const SaleSchema = new Schema<ISale>(
  {
    saleCode: { type: String, required: true, unique: true, index: true },
    saleDate: { type: Date, required: true, default: Date.now, index: true },
    customer: { type: CustomerSchema, required: true },
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
    dealer: { type: Schema.Types.ObjectId, ref: "Dealer", default: null, index: true },
    soldBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    asmAtSale: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    priceBreakdown: { type: PriceBreakdownSchema, required: true },
    totalAmount: { type: Number, required: true },
    paymentMode: {
      type: String,
      enum: ["CASH", "UPI", "BANK", "FINANCE"],
      required: true,
    },
    financierDetails: { type: FinancierDetailsSchema },
    payments: [SalePaymentSchema],
    status: {
      type: String,
      enum: ["BOOKED", "DELIVERED", "CANCELLED"],
      default: "DELIVERED",
      index: true,
    },
    cancellationReason: { type: String },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Sale: Model<ISale> =
  mongoose.models.Sale || mongoose.model<ISale>("Sale", SaleSchema);

