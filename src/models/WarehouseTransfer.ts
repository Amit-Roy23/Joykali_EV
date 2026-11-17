import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Warehouse → warehouse stock transfer. Company stock stays company stock (no sale);
 * goods travel on a delivery challan, with an e-way bill above the threshold.
 *
 *   IN_TRANSIT ─receive─▶ RECEIVED | RECEIVED_SHORT
 *   IN_TRANSIT ─cancel (sender, before receipt)─▶ CANCELLED (units back at source)
 */
export interface IWarehouseTransfer extends Document {
  transferCode: string; // JKWT/2026-27/0001
  from: mongoose.Types.ObjectId;
  fromName: string;
  fromStateCode: string;
  to: mongoose.Types.ObjectId;
  toName: string;
  toStateCode: string;
  /** Different GST state: the move is a taxable branch supply and needs a tax invoice. */
  interState: boolean;
  vehicles: Array<{
    vehicle: mongoose.Types.ObjectId;
    chassisNumber: string;
    modelName: string;
    value: number; // paise, at cost
    condition?: "RECEIVED" | "SHORT";
    remarks?: string;
  }>;
  totalValue: number; // paise
  transport: { vehicleNo?: string; driverName?: string; driverPhone?: string; ewayBillNo?: string; invoiceNo?: string };
  status: "IN_TRANSIT" | "RECEIVED" | "RECEIVED_SHORT" | "CANCELLED";
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  receivedBy?: mongoose.Types.ObjectId;
  receivedByName?: string;
  receivedAt?: Date;
  cancelledByName?: string;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WarehouseTransferSchema = new Schema<IWarehouseTransfer>(
  {
    transferCode: { type: String, required: true, unique: true },
    from: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true, index: true },
    fromName: { type: String, required: true },
    fromStateCode: { type: String, default: "" },
    to: { type: Schema.Types.ObjectId, ref: "Warehouse", required: true, index: true },
    toName: { type: String, required: true },
    toStateCode: { type: String, default: "" },
    interState: { type: Boolean, default: false },
    vehicles: [
      new Schema(
        {
          vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
          chassisNumber: { type: String, required: true },
          modelName: { type: String, required: true },
          value: { type: Number, default: 0 },
          condition: { type: String, enum: ["RECEIVED", "SHORT"] },
          remarks: { type: String },
        },
        { _id: false }
      ),
    ],
    totalValue: { type: Number, default: 0 },
    transport: {
      vehicleNo: { type: String, trim: true, uppercase: true },
      driverName: { type: String, trim: true },
      driverPhone: { type: String, trim: true },
      ewayBillNo: { type: String, trim: true },
      invoiceNo: { type: String, trim: true },
    },
    status: { type: String, enum: ["IN_TRANSIT", "RECEIVED", "RECEIVED_SHORT", "CANCELLED"], default: "IN_TRANSIT", index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: { type: String, required: true },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
    receivedByName: { type: String },
    receivedAt: { type: Date },
    cancelledByName: { type: String },
    remarks: { type: String },
  },
  { timestamps: true }
);

export const WarehouseTransfer: Model<IWarehouseTransfer> =
  mongoose.models.WarehouseTransfer || mongoose.model<IWarehouseTransfer>("WarehouseTransfer", WarehouseTransferSchema);
