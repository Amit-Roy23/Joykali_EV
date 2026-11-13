import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStockMovement extends Document {
  vehicle: mongoose.Types.ObjectId;
  movementType:
    | "INWARD"
    | "DEALER_ALLOCATION"
    | "TRANSFER"
    | "SALE"
    | "RETURN"
    | "DO_RESERVE"
    | "DO_RELEASE"
    | "DISPATCH"
    | "DELIVERY"
    | "SHORTAGE";
  fromLocation: string;
  toLocation: string;
  performedBy: mongoose.Types.ObjectId;
  reference?: string; // Purchase code, Sale code, or allocation batch
  notes?: string;
  timestamp: Date;
}

const StockMovementSchema = new Schema<IStockMovement>(
  {
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true, index: true },
    movementType: {
      type: String,
      required: true,
      enum: ["INWARD", "DEALER_ALLOCATION", "TRANSFER", "SALE", "RETURN", "DO_RESERVE", "DO_RELEASE", "DISPATCH", "DELIVERY", "SHORTAGE"],
      index: true,
    },
    fromLocation: { type: String, required: true },
    toLocation: { type: String, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reference: { type: String },
    notes: { type: String },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

export const StockMovement: Model<IStockMovement> =
  mongoose.models.StockMovement ||
  mongoose.model<IStockMovement>("StockMovement", StockMovementSchema);

