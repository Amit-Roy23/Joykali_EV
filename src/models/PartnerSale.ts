import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A sale made BY a channel partner, from stock it owns:
 *  - to its own downline partner (secondary sale / stock transfer): the vehicles travel
 *    IN_TRANSIT until the buyer confirms receipt, and the invoice is posted in the
 *    seller's books (LedgerEntry.book = seller);
 *  - to a retail customer: the vehicle is SOLD at once.
 * The document records the partner's own invoice; tax follows the two GST state codes.
 */
export interface IPartnerSaleLine {
  vehicle: mongoose.Types.ObjectId;
  chassisNumber: string;
  batteryNumber?: string;
  model: mongoose.Types.ObjectId;
  modelName: string;
  unitPrice: number; // paise ex-GST, after discount
  gstRate: number;
  hsnCode: string;
}

export interface IPartnerSale extends Document {
  saleCode: string; // JKPS/2026-27/0001
  invoiceNo?: string; // the partner's own invoice number, if different
  sellerType: "DEALER" | "DISTRIBUTOR";
  seller: mongoose.Types.ObjectId;
  sellerName: string;
  sellerCode: string;
  sellerGstin: string;
  sellerStateCode: string;
  buyerKind: "DEALER" | "DISTRIBUTOR" | "CUSTOMER";
  buyer?: mongoose.Types.ObjectId | null;
  buyerName: string;
  buyerCode?: string;
  buyerGstin?: string;
  buyerStateCode: string;
  customer?: { name: string; phone: string; address: string; email?: string } | null;
  order?: mongoose.Types.ObjectId | null;
  lines: IPartnerSaleLine[];
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalValue: number;
  /** Retail only: amount collected at the counter. */
  amountReceived: number;
  paymentMode?: "CASH" | "UPI" | "BANK" | "FINANCE" | "CREDIT";
  status: "IN_TRANSIT" | "RECEIVED" | "COMPLETED" | "CANCELLED";
  saleDate: Date;
  received?: { at: Date; byName: string; remarks?: string } | null;
  cancelledReason?: string;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const LineSchema = new Schema<IPartnerSaleLine>(
  {
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    chassisNumber: { type: String, required: true },
    batteryNumber: { type: String },
    model: { type: Schema.Types.ObjectId, ref: "VehicleModel", required: true },
    modelName: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true },
    hsnCode: { type: String, required: true },
  },
  { _id: false }
);

const PartnerSaleSchema = new Schema<IPartnerSale>(
  {
    saleCode: { type: String, required: true, unique: true },
    invoiceNo: { type: String, trim: true },
    sellerType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    seller: { type: Schema.Types.ObjectId, required: true, index: true },
    sellerName: { type: String, required: true },
    sellerCode: { type: String, required: true },
    sellerGstin: { type: String, default: "" },
    sellerStateCode: { type: String, required: true },
    buyerKind: { type: String, enum: ["DEALER", "DISTRIBUTOR", "CUSTOMER"], required: true, index: true },
    buyer: { type: Schema.Types.ObjectId, default: null, index: true },
    buyerName: { type: String, required: true },
    buyerCode: { type: String },
    buyerGstin: { type: String },
    buyerStateCode: { type: String, required: true },
    customer: {
      type: new Schema(
        { name: String, phone: String, address: String, email: String },
        { _id: false }
      ),
      default: null,
    },
    order: { type: Schema.Types.ObjectId, ref: "NetworkOrder", default: null, index: true },
    lines: { type: [LineSchema], validate: (v: unknown[]) => v.length > 0 },
    taxableValue: { type: Number, required: true },
    cgst: { type: Number, required: true },
    sgst: { type: Number, required: true },
    igst: { type: Number, required: true },
    totalValue: { type: Number, required: true },
    amountReceived: { type: Number, default: 0 },
    paymentMode: { type: String, enum: ["CASH", "UPI", "BANK", "FINANCE", "CREDIT"] },
    status: { type: String, enum: ["IN_TRANSIT", "RECEIVED", "COMPLETED", "CANCELLED"], required: true, index: true },
    saleDate: { type: Date, required: true, index: true },
    received: {
      type: new Schema({ at: Date, byName: String, remarks: String }, { _id: false }),
      default: null,
    },
    cancelledReason: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, required: true },
  },
  { timestamps: true }
);

export const PartnerSale: Model<IPartnerSale> =
  mongoose.models.PartnerSale || mongoose.model<IPartnerSale>("PartnerSale", PartnerSaleSchema);
