import mongoose, { Schema, Document, Model } from "mongoose";
import { VehicleCategory } from "@/types";

export interface IVehicleModel extends Document {
  name: string;
  variant: string;
  category: VehicleCategory;
  batteryType: string;
  rangeKm: number;
  purchasePrice: number; // in paise
  sellingPrice: number; // in paise (ex-showroom)
  /** Ex-GST channel prices in paise. Missing values fall back to a % of the ex-showroom price. */
  dealerPrice?: number;
  distributorPrice?: number;
  gstRate: number; // percentage, e.g. 5
  hsnCode: string;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const VehicleModelSchema = new Schema<IVehicleModel>(
  {
    name: { type: String, required: true, trim: true },
    variant: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ["2W", "3W", "4W", "E_RICKSHAW", "LOADER"],
      default: "2W",
    },
    batteryType: { type: String, required: true, trim: true }, // e.g., Lithium-ion, LFP
    rangeKm: { type: Number, required: true },
    purchasePrice: { type: Number, required: true, default: 0 },
    sellingPrice: { type: Number, required: true, default: 0 },
    dealerPrice: { type: Number },
    distributorPrice: { type: Number },
    gstRate: { type: Number, required: true, default: 5 }, // 5% standard EV GST in India
    hsnCode: { type: String, required: true, default: "870380" },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

VehicleModelSchema.index({ name: 1, variant: 1 }, { unique: true });

export const VehicleModel: Model<IVehicleModel> =
  mongoose.models.VehicleModel ||
  mongoose.model<IVehicleModel>("VehicleModel", VehicleModelSchema);

