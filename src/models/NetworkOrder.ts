import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Secondary order inside the channel network: a dealer orders from its distributor,
 * a distributor from its super distributor, a sub dealer from its dealer.
 * The supplying partner accepts it (credit is checked against the limit THEY gave)
 * and fulfils it with PartnerSales from their own stock.
 * PLACED → ACCEPTED → PARTIALLY_FULFILLED → COMPLETED, or REJECTED / CANCELLED.
 */
export interface INetworkOrderLine {
  model: mongoose.Types.ObjectId;
  modelName: string;
  quantity: number;
  unitPrice: number; // paise ex-GST
  gstRate: number;
  hsnCode: string;
  fulfilledQty: number;
}

export interface INetworkOrder extends Document {
  orderCode: string; // JKNO/2026-27/0001
  buyerType: "DEALER" | "DISTRIBUTOR";
  buyer: mongoose.Types.ObjectId;
  buyerName: string;
  buyerCode: string;
  sellerType: "DEALER" | "DISTRIBUTOR";
  seller: mongoose.Types.ObjectId;
  sellerName: string;
  sellerCode: string;
  lines: INetworkOrderLine[];
  taxableValue: number;
  gstValue: number;
  totalValue: number;
  status: "PLACED" | "ACCEPTED" | "PARTIALLY_FULFILLED" | "COMPLETED" | "REJECTED" | "CANCELLED";
  creditCheck: { limit: number; exposureBefore: number; availableBefore: number };
  notes?: string;
  placedBy: mongoose.Types.ObjectId;
  placedByName: string;
  decidedByName?: string;
  decidedAt?: Date;
  decisionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LineSchema = new Schema<INetworkOrderLine>(
  {
    model: { type: Schema.Types.ObjectId, ref: "VehicleModel", required: true },
    modelName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true },
    hsnCode: { type: String, required: true },
    fulfilledQty: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const NetworkOrderSchema = new Schema<INetworkOrder>(
  {
    orderCode: { type: String, required: true, unique: true },
    buyerType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    buyer: { type: Schema.Types.ObjectId, required: true, index: true },
    buyerName: { type: String, required: true },
    buyerCode: { type: String, required: true },
    sellerType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    seller: { type: Schema.Types.ObjectId, required: true, index: true },
    sellerName: { type: String, required: true },
    sellerCode: { type: String, required: true },
    lines: { type: [LineSchema], validate: (v: unknown[]) => v.length > 0 },
    taxableValue: { type: Number, required: true },
    gstValue: { type: Number, required: true },
    totalValue: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PLACED", "ACCEPTED", "PARTIALLY_FULFILLED", "COMPLETED", "REJECTED", "CANCELLED"],
      default: "PLACED",
      index: true,
    },
    creditCheck: {
      limit: { type: Number, required: true },
      exposureBefore: { type: Number, required: true },
      availableBefore: { type: Number, required: true },
    },
    notes: { type: String, trim: true },
    placedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    placedByName: { type: String, required: true },
    decidedByName: { type: String },
    decidedAt: { type: Date },
    decisionNote: { type: String },
  },
  { timestamps: true }
);

export const NetworkOrder: Model<INetworkOrder> =
  mongoose.models.NetworkOrder || mongoose.model<INetworkOrder>("NetworkOrder", NetworkOrderSchema);
