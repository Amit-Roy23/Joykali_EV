import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Internal branch transfer of company stock: main warehouse → outlet, or outlet → warehouse.
 * No invoice (same GSTIN); a delivery challan number is issued. Vehicles are IN_TRANSIT
 * until the receiving side confirms.
 */
export interface IStockTransfer extends Document {
  transferCode: string; // JKST/2026-27/0001
  direction: "TO_OUTLET" | "TO_WAREHOUSE";
  outlet: mongoose.Types.ObjectId;
  outletName: string;
  vehicles: Array<{ vehicle: mongoose.Types.ObjectId; chassisNumber: string; modelName: string }>;
  status: "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  receivedByName?: string;
  receivedAt?: Date;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StockTransferSchema = new Schema<IStockTransfer>(
  {
    transferCode: { type: String, required: true, unique: true },
    direction: { type: String, enum: ["TO_OUTLET", "TO_WAREHOUSE"], required: true },
    outlet: { type: Schema.Types.ObjectId, ref: "Outlet", required: true, index: true },
    outletName: { type: String, required: true },
    vehicles: [
      new Schema(
        {
          vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
          chassisNumber: { type: String, required: true },
          modelName: { type: String, required: true },
        },
        { _id: false }
      ),
    ],
    status: { type: String, enum: ["IN_TRANSIT", "RECEIVED", "CANCELLED"], default: "IN_TRANSIT", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, required: true },
    receivedByName: { type: String },
    receivedAt: { type: Date },
    remarks: { type: String },
  },
  { timestamps: true }
);

export const StockTransfer: Model<IStockTransfer> =
  mongoose.models.StockTransfer || mongoose.model<IStockTransfer>("StockTransfer", StockTransferSchema);
