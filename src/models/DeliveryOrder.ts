import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Warehouse Delivery Order (DO) — the controlled path for every vehicle that
 * leaves the warehouse for a dealer or distributor.
 *
 *   CREATED ─submit─▶ SUBMITTED ─start loading─▶ LOADING ─complete─▶ LOADED
 *      ─dispatch─▶ DISPATCHED ─GRN─▶ DELIVERED | DELIVERED_WITH_ISSUES
 *   (CANCELLED is possible any time before DISPATCHED; reservations are released.)
 */
export const DO_STATUSES = [
  "CREATED",
  "SUBMITTED",
  "LOADING",
  "LOADED",
  "DISPATCHED",
  "DELIVERED",
  "DELIVERED_WITH_ISSUES",
  "CANCELLED",
] as const;
export type DOStatus = (typeof DO_STATUSES)[number];

export interface IDOLine {
  model: mongoose.Types.ObjectId;
  modelName: string;
  quantity: number;
  unitPrice: number; // paise ex-GST
  gstRate: number;
  hsnCode: string;
}

export interface IDOVehicle {
  vehicle: mongoose.Types.ObjectId;
  model: mongoose.Types.ObjectId;
  modelName: string;
  chassisNumber: string;
  motorNumber: string;
  batteryNumber: string;
  color: string;
  pickedBy: mongoose.Types.ObjectId;
  pickedAt: Date;
}

export interface IGrnItem {
  vehicle: mongoose.Types.ObjectId;
  chassisNumber: string;
  condition: "RECEIVED" | "DAMAGED" | "SHORT";
  remarks?: string;
}

export interface IDeliveryOrder extends Document {
  doCode: string; // JKDO/2026-27/0001
  order: mongoose.Types.ObjectId;
  orderCode: string;
  partyType: "DEALER" | "DISTRIBUTOR";
  party: mongoose.Types.ObjectId;
  partySnapshot: {
    name: string;
    code: string;
    gstin: string;
    address: string;
    city: string;
    stateCode: string;
    pincode: string;
  };
  lines: IDOLine[];
  vehicles: IDOVehicle[];
  status: DOStatus;
  loading?: {
    fleetVehicle: mongoose.Types.ObjectId;
    registrationNo: string;
    driverName: string;
    driverPhone: string;
    driverLicence: string;
    checklist: {
      physicalInspection: boolean;
      chassisVerified: boolean;
      batteryChargerKeys: boolean;
      securedForTransit: boolean;
    };
    startedBy: mongoose.Types.ObjectId;
    startedAt: Date;
    loadedBy?: mongoose.Types.ObjectId;
    loadedByName?: string;
    loadedAt?: Date;
  };
  /** Tax invoice (distributor) or delivery challan (dealer consignment), issued at dispatch. */
  document?: {
    kind: "TAX_INVOICE" | "DELIVERY_CHALLAN";
    number: string;
    date: Date;
    interState: boolean;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalValue: number;
  };
  ewayBill: {
    required: boolean;
    distanceKm?: number;
    ewbNo?: string;
    ewbDate?: Date;
    validUpto?: Date;
    enteredBy?: mongoose.Types.ObjectId;
  };
  dispatch?: { by: mongoose.Types.ObjectId; byName: string; at: Date };
  grn?: {
    grnNo: string;
    receivedBy: mongoose.Types.ObjectId;
    receivedByName: string;
    at: Date;
    items: IGrnItem[];
    remarks?: string;
    creditNoteNo?: string;
    creditNoteValue?: number;
  };
  timeline: Array<{ status: string; by: mongoose.Types.ObjectId; byName: string; at: Date; note?: string }>;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DOLineSchema = new Schema<IDOLine>(
  {
    model: { type: Schema.Types.ObjectId, ref: "VehicleModel", required: true },
    modelName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    gstRate: { type: Number, required: true },
    hsnCode: { type: String, required: true },
  },
  { _id: false }
);

const DOVehicleSchema = new Schema<IDOVehicle>(
  {
    vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
    model: { type: Schema.Types.ObjectId, ref: "VehicleModel", required: true },
    modelName: { type: String, required: true },
    chassisNumber: { type: String, required: true },
    motorNumber: { type: String, required: true },
    batteryNumber: { type: String, required: true },
    color: { type: String, required: true },
    pickedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    pickedAt: { type: Date, required: true },
  },
  { _id: false }
);

const DeliveryOrderSchema = new Schema<IDeliveryOrder>(
  {
    doCode: { type: String, required: true, unique: true, index: true },
    order: { type: Schema.Types.ObjectId, ref: "ChannelOrder", required: true, index: true },
    orderCode: { type: String, required: true },
    partyType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    party: { type: Schema.Types.ObjectId, required: true, index: true },
    partySnapshot: {
      name: String,
      code: String,
      gstin: String,
      address: String,
      city: String,
      stateCode: String,
      pincode: String,
    },
    lines: { type: [DOLineSchema], validate: (v: unknown[]) => v.length > 0 },
    vehicles: [DOVehicleSchema],
    status: { type: String, enum: [...DO_STATUSES], default: "CREATED", index: true },
    loading: {
      type: new Schema(
        {
          fleetVehicle: { type: Schema.Types.ObjectId, ref: "FleetVehicle", required: true },
          registrationNo: { type: String, required: true },
          driverName: { type: String, required: true },
          driverPhone: { type: String, required: true },
          driverLicence: { type: String, required: true },
          checklist: {
            physicalInspection: { type: Boolean, default: false },
            chassisVerified: { type: Boolean, default: false },
            batteryChargerKeys: { type: Boolean, default: false },
            securedForTransit: { type: Boolean, default: false },
          },
          startedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
          startedAt: { type: Date, required: true },
          loadedBy: { type: Schema.Types.ObjectId, ref: "User" },
          loadedByName: String,
          loadedAt: Date,
        },
        { _id: false }
      ),
      default: undefined,
    },
    document: {
      type: new Schema(
        {
          kind: { type: String, enum: ["TAX_INVOICE", "DELIVERY_CHALLAN"], required: true },
          number: { type: String, required: true },
          date: { type: Date, required: true },
          interState: { type: Boolean, required: true },
          taxableValue: Number,
          cgst: Number,
          sgst: Number,
          igst: Number,
          totalValue: Number,
        },
        { _id: false }
      ),
      default: undefined,
    },
    ewayBill: {
      required: { type: Boolean, default: true },
      distanceKm: Number,
      ewbNo: String,
      ewbDate: Date,
      validUpto: Date,
      enteredBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    dispatch: {
      type: new Schema({ by: { type: Schema.Types.ObjectId, ref: "User" }, byName: String, at: Date }, { _id: false }),
      default: undefined,
    },
    grn: {
      type: new Schema(
        {
          grnNo: { type: String, required: true },
          receivedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
          receivedByName: String,
          at: Date,
          items: [
            new Schema(
              {
                vehicle: { type: Schema.Types.ObjectId, ref: "Vehicle" },
                chassisNumber: String,
                condition: { type: String, enum: ["RECEIVED", "DAMAGED", "SHORT"] },
                remarks: String,
              },
              { _id: false }
            ),
          ],
          remarks: String,
          creditNoteNo: String,
          creditNoteValue: Number,
        },
        { _id: false }
      ),
      default: undefined,
    },
    timeline: [
      new Schema(
        { status: String, by: { type: Schema.Types.ObjectId, ref: "User" }, byName: String, at: Date, note: String },
        { _id: false }
      ),
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export const DeliveryOrder: Model<IDeliveryOrder> =
  mongoose.models.DeliveryOrder || mongoose.model<IDeliveryOrder>("DeliveryOrder", DeliveryOrderSchema);
