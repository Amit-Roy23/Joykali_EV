import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A company stock location (godown). Exactly one is the main warehouse; vehicles
 * that predate multi-warehouse support (no `warehouse` set) belong to it.
 */
export interface IWarehouse extends Document {
  code: string; // JKWH-01
  name: string;
  address: string;
  city: string;
  state: string;
  stateCode: string; // GST state code, e.g. "19"
  pincode: string;
  phone: string;
  /** Store manager in charge; may send and receive transfers for this warehouse. */
  manager?: mongoose.Types.ObjectId | null;
  isMain: boolean;
  status: "ACTIVE" | "INACTIVE";
  /** Minimum free units per model; below this the warehouse shows a low-stock alert. */
  minStock: Array<{ model: mongoose.Types.ObjectId; qty: number }>;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WarehouseSchema = new Schema<IWarehouse>(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true, default: "West Bengal" },
    stateCode: { type: String, required: true, trim: true, default: "19" },
    pincode: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    manager: { type: Schema.Types.ObjectId, ref: "User", default: null },
    isMain: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    minStock: [
      new Schema(
        { model: { type: Schema.Types.ObjectId, ref: "VehicleModel", required: true }, qty: { type: Number, required: true, min: 0 } },
        { _id: false }
      ),
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Warehouse: Model<IWarehouse> = mongoose.models.Warehouse || mongoose.model<IWarehouse>("Warehouse", WarehouseSchema);
