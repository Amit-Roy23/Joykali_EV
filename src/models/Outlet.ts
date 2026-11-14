import mongoose, { Schema, Document, Model } from "mongoose";

/** A company-owned showroom. It holds its own stock (vehicles AT_OUTLET) and bills customers at the counter. */
export interface IOutlet extends Document {
  outletCode: string; // JKOT-01
  name: string;
  address: string;
  city: string;
  pincode: string;
  phone: string;
  territory?: mongoose.Types.ObjectId | null;
  manager?: mongoose.Types.ObjectId | null;
  status: "ACTIVE" | "INACTIVE";
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OutletSchema = new Schema<IOutlet>(
  {
    outletCode: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    pincode: { type: String, default: "", trim: true },
    phone: { type: String, default: "", trim: true },
    territory: { type: Schema.Types.ObjectId, ref: "Territory", default: null },
    manager: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Outlet: Model<IOutlet> = mongoose.models.Outlet || mongoose.model<IOutlet>("Outlet", OutletSchema);
