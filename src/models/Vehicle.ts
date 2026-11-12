import mongoose, { Schema, Document, Model } from "mongoose";
import { VehicleStatus } from "@/types";

export interface IVehicle {
  _id?: mongoose.Types.ObjectId;
  chassisNumber: string;
  motorNumber: string;
  batteryNumber: string;
  chargerNumber?: string;
  color: string;
  model: mongoose.Types.ObjectId;
  status: VehicleStatus;
  currentLocationType: "WAREHOUSE" | "DEALER";
  currentLocationDealer?: mongoose.Types.ObjectId | null;
  purchase?: mongoose.Types.ObjectId | null;
  sale?: mongoose.Types.ObjectId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const VehicleSchema = new Schema<IVehicle>(
  {
    chassisNumber: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    motorNumber: { type: String, required: true, uppercase: true, trim: true },
    batteryNumber: { type: String, required: true, uppercase: true, trim: true },
    chargerNumber: { type: String, uppercase: true, trim: true },
    color: { type: String, required: true, trim: true },
    model: { type: Schema.Types.ObjectId, ref: "VehicleModel", required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ["IN_STOCK", "ALLOCATED_TO_DEALER", "SOLD", "RETURNED"],
      default: "IN_STOCK",
      index: true,
    },
    currentLocationType: {
      type: String,
      enum: ["WAREHOUSE", "DEALER"],
      default: "WAREHOUSE",
      index: true,
    },
    currentLocationDealer: { type: Schema.Types.ObjectId, ref: "Dealer", default: null, index: true },
    purchase: { type: Schema.Types.ObjectId, ref: "Purchase", default: null },
    sale: { type: Schema.Types.ObjectId, ref: "Sale", default: null },
  },
  { timestamps: true }
);

export const Vehicle: Model<IVehicle> =
  mongoose.models.Vehicle || mongoose.model<IVehicle>("Vehicle", VehicleSchema);

