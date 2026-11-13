import mongoose, { Schema, Document, Model } from "mongoose";

export const FLEET_DOC_TYPES = ["RC", "INSURANCE", "PUC", "FITNESS", "PERMIT", "ROAD_TAX"] as const;
export type FleetDocType = (typeof FLEET_DOC_TYPES)[number];

export interface IFleetDocument {
  _id?: mongoose.Types.ObjectId;
  type: FleetDocType;
  number: string;
  issuedOn?: Date | null;
  /** Null only for documents with lifetime validity (e.g. an RC still within its 15 years). */
  validUpto: Date | null;
  issuer?: string;
  file?: mongoose.Types.ObjectId | null; // StoredFile
  fileName?: string;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt?: Date;
}

/**
 * Company transport / delivery vehicles used to carry stock out of the
 * warehouse. A vehicle with any required document missing or expired is
 * LOCKED and cannot be assigned to (or dispatched on) a Delivery Order.
 */
export interface IFleetVehicle extends Document {
  registrationNo: string;
  vehicleType: "TRUCK" | "MINI_TRUCK" | "PICKUP" | "CONTAINER" | "EV_LOADER";
  makeModel: string;
  fuel: "DIESEL" | "PETROL" | "CNG" | "ELECTRIC";
  capacityUnits: number; // how many 2W-equivalent units it can carry
  ownership: "OWNED" | "HIRED";
  transporterName?: string;
  transporterGstin?: string; // transporter ID for the e-way bill
  documents: IFleetDocument[];
  status: "ACTIVE" | "INACTIVE";
  manualHold?: { reason: string; by: mongoose.Types.ObjectId; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

const FleetDocumentSchema = new Schema<IFleetDocument>({
  type: { type: String, enum: [...FLEET_DOC_TYPES], required: true },
  number: { type: String, required: true, trim: true, uppercase: true },
  issuedOn: { type: Date, default: null },
  validUpto: { type: Date, default: null },
  issuer: { type: String, trim: true },
  file: { type: Schema.Types.ObjectId, ref: "StoredFile", default: null },
  fileName: { type: String },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  updatedAt: { type: Date, default: Date.now },
});

const FleetVehicleSchema = new Schema<IFleetVehicle>(
  {
    registrationNo: { type: String, required: true, unique: true, uppercase: true, trim: true },
    vehicleType: { type: String, enum: ["TRUCK", "MINI_TRUCK", "PICKUP", "CONTAINER", "EV_LOADER"], required: true },
    makeModel: { type: String, required: true, trim: true },
    fuel: { type: String, enum: ["DIESEL", "PETROL", "CNG", "ELECTRIC"], required: true },
    capacityUnits: { type: Number, required: true, min: 1 },
    ownership: { type: String, enum: ["OWNED", "HIRED"], default: "OWNED" },
    transporterName: { type: String, trim: true },
    transporterGstin: { type: String, trim: true, uppercase: true },
    documents: [FleetDocumentSchema],
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    manualHold: {
      type: new Schema({ reason: String, by: { type: Schema.Types.ObjectId, ref: "User" }, at: Date }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true }
);

export const FleetVehicle: Model<IFleetVehicle> =
  mongoose.models.FleetVehicle || mongoose.model<IFleetVehicle>("FleetVehicle", FleetVehicleSchema);
