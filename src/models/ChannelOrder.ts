import mongoose, { Schema, Document, Model } from "mongoose";
import { ApprovalSignature, ApprovalSignatureSchema } from "@/lib/approval";

/**
 * A vehicle order from a channel partner:
 *  - DISTRIBUTOR orders are placed by the distributor (portal) or by staff on their behalf
 *    and are sold to them on a tax invoice at dispatch;
 *  - DEALER orders are placed by the ASM/BH and move stock to the dealer on consignment
 *    (delivery challan).
 * Lifecycle: PENDING_APPROVAL → (BH, then MP) → APPROVED → PARTIALLY_DISPATCHED → COMPLETED
 *            or REJECTED / CANCELLED.
 */
export interface IOrderLine {
  model: mongoose.Types.ObjectId;
  modelName: string;
  quantity: number;
  unitPrice: number; // paise, ex-GST channel price
  gstRate: number;
  hsnCode: string;
  dispatchedQty: number; // units moved onto dispatched/active DOs
}

export interface IChannelOrder extends Document {
  orderCode: string; // JKO/2026-27/0001
  partyType: "DEALER" | "DISTRIBUTOR";
  party: mongoose.Types.ObjectId;
  partyName: string;
  partyCode: string;
  lines: IOrderLine[];
  taxableValue: number;
  gstValue: number;
  totalValue: number;
  status: "PENDING_APPROVAL" | "APPROVED" | "PARTIALLY_DISPATCHED" | "COMPLETED" | "REJECTED" | "CANCELLED";
  approvals: ApprovalSignature[];
  /** Credit position at the moment the order was placed (paise). */
  creditCheck: { limit: number; exposureBefore: number; availableBefore: number };
  notes?: string;
  placedBy: mongoose.Types.ObjectId;
  placedByName: string;
  cancelledReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OrderLineSchema = new Schema<IOrderLine>(
  {
    model: { type: Schema.Types.ObjectId, ref: "VehicleModel", required: true },
    modelName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true },
    hsnCode: { type: String, required: true },
    dispatchedQty: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false }
);

const ChannelOrderSchema = new Schema<IChannelOrder>(
  {
    orderCode: { type: String, required: true, unique: true, index: true },
    partyType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    party: { type: Schema.Types.ObjectId, required: true, index: true },
    partyName: { type: String, required: true },
    partyCode: { type: String, required: true },
    lines: { type: [OrderLineSchema], validate: (v: unknown[]) => v.length > 0 },
    taxableValue: { type: Number, required: true },
    gstValue: { type: Number, required: true },
    totalValue: { type: Number, required: true },
    status: {
      type: String,
      enum: ["PENDING_APPROVAL", "APPROVED", "PARTIALLY_DISPATCHED", "COMPLETED", "REJECTED", "CANCELLED"],
      default: "PENDING_APPROVAL",
      index: true,
    },
    approvals: [ApprovalSignatureSchema],
    creditCheck: {
      limit: { type: Number, required: true },
      exposureBefore: { type: Number, required: true },
      availableBefore: { type: Number, required: true },
    },
    notes: { type: String },
    placedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    placedByName: { type: String, required: true },
    cancelledReason: { type: String },
  },
  { timestamps: true }
);

export const ChannelOrder: Model<IChannelOrder> =
  mongoose.models.ChannelOrder || mongoose.model<IChannelOrder>("ChannelOrder", ChannelOrderSchema);
