import mongoose, { Schema, Document, Model } from "mongoose";

const ref = (m: string, extra: Record<string, any> = {}) => ({ type: Schema.Types.ObjectId, ref: m, ...extra });
const model = <T>(name: string, schema: Schema<T>): Model<T> => (mongoose.models[name] as Model<T>) || mongoose.model<T>(name, schema);

/**
 * Non-vehicle goods: batteries, chargers, spare parts and accessories.
 * Vehicles stay in VehicleModel / Vehicle (one record per chassis).
 */
export type ItemCategory = "BATTERY" | "CHARGER" | "SPARE_PART" | "ACCESSORY";
export const ITEM_CATEGORIES: ItemCategory[] = ["BATTERY", "CHARGER", "SPARE_PART", "ACCESSORY"];
export const ITEM_UNITS = ["PCS", "SET", "PAIR", "NOS", "BOX", "LTR", "MTR", "KG"] as const;

/** Stock condition: GOOD = sellable, DEFECTIVE = company-owned faulty goods, REPAIR = a customer's battery left for repair. */
export type StockCondition = "GOOD" | "DEFECTIVE" | "REPAIR";

export interface RateChange {
  at: Date;
  by?: mongoose.Types.ObjectId;
  byName?: string;
  changes: Array<{ field: string; from: number | string | null; to: number | string | null }>;
  note?: string;
}
export const RateChangeSchema = new Schema<RateChange>(
  {
    at: { type: Date, required: true },
    by: ref("User"),
    byName: String,
    changes: [{ _id: false, field: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed }],
    note: String,
  },
  { _id: false }
);

export interface IItem extends Document {
  code: string; // JKIT-0001
  name: string;
  category: ItemCategory;
  brand?: string;
  partNo?: string;
  unit: string;
  hsnCode: string;
  gstRate: number;
  /** Ex-GST rates in paise. */
  purchasePrice: number;
  sellingPrice: number;
  dealerPrice?: number | null;
  /** Each unit has its own serial number (batteries, chargers). */
  serialTracked: boolean;
  compatibleModels: mongoose.Types.ObjectId[];
  minStock: number;
  description?: string;
  isActive: boolean;
  rateHistory: RateChange[];
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}
const ItemSchema = new Schema<IItem>(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: ITEM_CATEGORIES, required: true, index: true },
    brand: { type: String, trim: true },
    partNo: { type: String, trim: true, uppercase: true },
    unit: { type: String, default: "PCS" },
    hsnCode: { type: String, required: true, trim: true },
    gstRate: { type: Number, required: true, default: 18 },
    purchasePrice: { type: Number, required: true, default: 0, min: 0 },
    sellingPrice: { type: Number, required: true, default: 0, min: 0 },
    dealerPrice: { type: Number, default: null },
    serialTracked: { type: Boolean, default: false },
    compatibleModels: [ref("VehicleModel")],
    minStock: { type: Number, default: 0, min: 0 },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    rateHistory: { type: [RateChangeSchema], default: [] },
    createdBy: ref("User"),
  },
  { timestamps: true }
);
ItemSchema.index({ name: 1, category: 1 }, { unique: true });
export const Item = model<IItem>("Item", ItemSchema);

/** Quantity on hand per item, warehouse and condition. */
export interface IItemStock extends Document {
  item: mongoose.Types.ObjectId;
  warehouse: mongoose.Types.ObjectId;
  condition: StockCondition;
  qty: number;
}
const ItemStockSchema = new Schema<IItemStock>(
  {
    item: ref("Item", { required: true }),
    warehouse: ref("Warehouse", { required: true }),
    condition: { type: String, enum: ["GOOD", "DEFECTIVE", "REPAIR"], default: "GOOD" },
    qty: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);
ItemStockSchema.index({ item: 1, warehouse: 1, condition: 1 }, { unique: true });
export const ItemStock = model<IItemStock>("ItemStock", ItemStockSchema);

/** One serial-numbered unit (battery / charger). */
export type SerialStatus = "IN_STOCK" | "SOLD" | "ISSUED" | "RETURNED_TO_CUSTOMER" | "SENT_TO_SUPPLIER" | "SCRAPPED" | "FITTED";
export interface IItemSerial extends Document {
  item: mongoose.Types.ObjectId;
  serialNo: string;
  status: SerialStatus;
  condition: StockCondition;
  warehouse?: mongoose.Types.ObjectId | null;
  /** How it came in: PURCHASE, VEHICLE (battery taken off a vehicle sold without it), CUSTOMER (repair), OPENING … */
  source: string;
  vehicle?: mongoose.Types.ObjectId | null;
  lastReference?: string;
  updatedAt: Date;
}
const ItemSerialSchema = new Schema<IItemSerial>(
  {
    item: ref("Item", { required: true }),
    serialNo: { type: String, required: true, uppercase: true, trim: true },
    status: { type: String, enum: ["IN_STOCK", "SOLD", "ISSUED", "RETURNED_TO_CUSTOMER", "SENT_TO_SUPPLIER", "SCRAPPED", "FITTED"], default: "IN_STOCK", index: true },
    condition: { type: String, enum: ["GOOD", "DEFECTIVE", "REPAIR"], default: "GOOD" },
    warehouse: ref("Warehouse", { default: null }),
    source: { type: String, default: "PURCHASE" },
    vehicle: ref("Vehicle", { default: null }),
    lastReference: String,
  },
  { timestamps: true }
);
ItemSerialSchema.index({ item: 1, serialNo: 1 }, { unique: true });
ItemSerialSchema.index({ serialNo: 1 });
export const ItemSerial = model<IItemSerial>("ItemSerial", ItemSerialSchema);

/** Every change to item stock (signed quantity). */
export type ItemMoveType =
  | "PURCHASE"
  | "SALE"
  | "SALE_CANCEL"
  | "STOCK_IN"
  | "STOCK_OUT"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "BATTERY_FROM_VEHICLE"
  | "BATTERY_TO_VEHICLE"
  | "REPAIR_IN"
  | "REPAIR_RETURN"
  | "REPLACEMENT_OUT"
  | "CONDITION_CHANGE"
  | "RETURN_TO_SUPPLIER"
  | "SCRAP";
export interface IItemMovement extends Document {
  item: mongoose.Types.ObjectId;
  warehouse: mongoose.Types.ObjectId;
  condition: StockCondition;
  qty: number; // + in, − out
  serials: string[];
  type: ItemMoveType;
  reason?: string;
  reference?: string;
  party?: string;
  unitCost?: number;
  notes?: string;
  by?: mongoose.Types.ObjectId;
  byName?: string;
  at: Date;
}
const ItemMovementSchema = new Schema<IItemMovement>(
  {
    item: ref("Item", { required: true, index: true }),
    warehouse: ref("Warehouse", { required: true }),
    condition: { type: String, enum: ["GOOD", "DEFECTIVE", "REPAIR"], default: "GOOD" },
    qty: { type: Number, required: true },
    serials: { type: [String], default: [] },
    type: { type: String, required: true, index: true },
    reason: String,
    reference: String,
    party: String,
    unitCost: Number,
    notes: String,
    by: ref("User"),
    byName: String,
    at: { type: Date, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
export const ItemMovement = model<IItemMovement>("ItemMovement", ItemMovementSchema);

/** An invoice line for an item (used on vehicle sales and parts sales). Amounts in paise. */
export interface IItemLine {
  item: mongoose.Types.ObjectId;
  name: string;
  category: ItemCategory;
  hsnCode: string;
  unit: string;
  qty: number;
  rate: number; // ex-GST, per unit
  discount: number; // on the line
  gstRate: number;
  taxable: number;
  gst: number;
  amount: number; // taxable + gst
  unitCost: number; // purchase cost per unit at sale time (for profit)
  serials: string[];
  warehouse: mongoose.Types.ObjectId;
}
export const ItemLineSchema = new Schema<IItemLine>(
  {
    item: ref("Item", { required: true }),
    name: { type: String, required: true },
    category: { type: String, required: true },
    hsnCode: { type: String, required: true },
    unit: { type: String, default: "PCS" },
    qty: { type: Number, required: true, min: 1 },
    rate: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    gstRate: { type: Number, required: true },
    taxable: { type: Number, required: true },
    gst: { type: Number, required: true },
    amount: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    serials: { type: [String], default: [] },
    warehouse: ref("Warehouse", { required: true }),
  },
  { _id: false }
);

/** Counter sale of parts / accessories / batteries (no vehicle). */
export interface IPartsSale extends Document {
  saleCode: string; // JKSP/2026-27/0001
  saleDate: Date;
  customer: { name: string; phone: string; address?: string; gstin?: string; stateCode?: string };
  lines: IItemLine[];
  subTotal: number; // taxable
  gstAmount: number;
  totalAmount: number;
  interState: boolean;
  paymentMode: "CASH" | "UPI" | "BANK" | "CREDIT";
  payments: Array<{ amount: number; date: Date; mode: string; reference?: string }>;
  status: "DELIVERED" | "CANCELLED";
  source: "COUNTER" | "BATTERY_JOB";
  batteryJob?: mongoose.Types.ObjectId | null;
  chassisNumber?: string;
  notes?: string;
  soldBy: mongoose.Types.ObjectId;
  soldByName?: string;
  cancellationReason?: string;
  cancelledAt?: Date | null;
  cancelledByName?: string;
  createdAt: Date;
}
const PartsSaleSchema = new Schema<IPartsSale>(
  {
    saleCode: { type: String, required: true, unique: true },
    saleDate: { type: Date, required: true, index: true },
    customer: {
      type: new Schema({ name: { type: String, required: true }, phone: { type: String, required: true }, address: String, gstin: String, stateCode: String }, { _id: false }),
      required: true,
    },
    lines: { type: [ItemLineSchema], default: [] },
    subTotal: { type: Number, required: true },
    gstAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    interState: { type: Boolean, default: false },
    paymentMode: { type: String, enum: ["CASH", "UPI", "BANK", "CREDIT"], default: "CASH" },
    payments: [{ _id: false, amount: Number, date: Date, mode: String, reference: String }],
    status: { type: String, enum: ["DELIVERED", "CANCELLED"], default: "DELIVERED", index: true },
    source: { type: String, enum: ["COUNTER", "BATTERY_JOB"], default: "COUNTER" },
    batteryJob: ref("BatteryJob", { default: null }),
    chassisNumber: { type: String, uppercase: true, trim: true },
    notes: String,
    soldBy: ref("User", { required: true }),
    soldByName: String,
    cancellationReason: String,
    cancelledAt: { type: Date, default: null },
    cancelledByName: String,
  },
  { timestamps: true }
);
export const PartsSale = model<IPartsSale>("PartsSale", PartsSaleSchema);

/**
 * Battery service: a customer's battery received for repair, then returned repaired
 * or replaced from stock (the old one becomes the company's defective stock).
 */
export interface IBatteryJob extends Document {
  code: string; // JKBJ/2026-27/0001
  customer: { name: string; phone: string };
  chassisNumber?: string;
  vehicle?: mongoose.Types.ObjectId | null;
  item: mongoose.Types.ObjectId; // battery item received
  serialNo: string;
  warehouse: mongoose.Types.ObjectId;
  complaint: string;
  status: "IN_REPAIR" | "RETURNED" | "REPLACED";
  replacement?: { item: mongoose.Types.ObjectId; serialNo?: string; warranty: boolean; charge: number; partsSale?: mongoose.Types.ObjectId | null } | null;
  resolution?: string;
  receivedAt: Date;
  closedAt?: Date | null;
  createdBy?: mongoose.Types.ObjectId;
  createdByName?: string;
  closedByName?: string;
}
const BatteryJobSchema = new Schema<IBatteryJob>(
  {
    code: { type: String, required: true, unique: true },
    customer: { type: new Schema({ name: { type: String, required: true }, phone: { type: String, required: true } }, { _id: false }), required: true },
    chassisNumber: { type: String, uppercase: true, trim: true },
    vehicle: ref("Vehicle", { default: null }),
    item: ref("Item", { required: true }),
    serialNo: { type: String, uppercase: true, trim: true, default: "" },
    warehouse: ref("Warehouse", { required: true }),
    complaint: { type: String, required: true },
    status: { type: String, enum: ["IN_REPAIR", "RETURNED", "REPLACED"], default: "IN_REPAIR", index: true },
    replacement: {
      type: new Schema(
        { item: ref("Item"), serialNo: String, warranty: Boolean, charge: Number, partsSale: ref("PartsSale", { default: null }) },
        { _id: false }
      ),
      default: null,
    },
    resolution: String,
    receivedAt: { type: Date, required: true },
    closedAt: { type: Date, default: null },
    createdBy: ref("User"),
    createdByName: String,
    closedByName: String,
  },
  { timestamps: true }
);
export const BatteryJob = model<IBatteryJob>("BatteryJob", BatteryJobSchema);

/**
 * Battery taken out of a vehicle — why, by whom, where it went — and whether it was put back.
 * One open (REMOVED) record per vehicle at a time; the vehicle carries batteryRemoved = true meanwhile.
 */
export const BATTERY_REMOVAL_REASONS = {
  CUSTOMER_NO_BATTERY: "Customer buying the vehicle without battery",
  FAULTY: "Battery faulty / weak — for check, repair or warranty claim",
  NEEDED_ELSEWHERE: "Battery needed for another vehicle or a battery sale",
  DISPLAY: "Showroom display vehicle (battery kept separately)",
  STORAGE: "Long storage / safety — battery stored separately",
  OTHER: "Other",
} as const;
export type BatteryRemovalReason = keyof typeof BATTERY_REMOVAL_REASONS;

export interface IBatteryRemoval extends Document {
  vehicle: mongoose.Types.ObjectId;
  chassisNumber: string;
  modelName: string;
  item: mongoose.Types.ObjectId;
  serialNo?: string;
  warehouse: mongoose.Types.ObjectId;
  condition: StockCondition;
  reason: BatteryRemovalReason;
  notes: string;
  status: "REMOVED" | "REFITTED";
  sale?: mongoose.Types.ObjectId | null;
  saleCode?: string;
  removedAt: Date;
  removedBy: mongoose.Types.ObjectId;
  removedByName: string;
  refit?: { at: Date; byName: string; item: mongoose.Types.ObjectId; serialNo?: string; warehouse: mongoose.Types.ObjectId; notes?: string } | null;
}
const BatteryRemovalSchema = new Schema<IBatteryRemoval>(
  {
    vehicle: ref("Vehicle", { required: true, index: true }),
    chassisNumber: { type: String, required: true },
    modelName: { type: String, default: "" },
    item: ref("Item", { required: true }),
    serialNo: { type: String, uppercase: true, trim: true },
    warehouse: ref("Warehouse", { required: true }),
    condition: { type: String, enum: ["GOOD", "DEFECTIVE", "REPAIR"], default: "GOOD" },
    reason: { type: String, enum: Object.keys(BATTERY_REMOVAL_REASONS), required: true },
    notes: { type: String, required: true, trim: true },
    status: { type: String, enum: ["REMOVED", "REFITTED"], default: "REMOVED", index: true },
    sale: ref("Sale", { default: null }),
    saleCode: String,
    removedAt: { type: Date, required: true, index: true },
    removedBy: ref("User", { required: true }),
    removedByName: { type: String, required: true },
    refit: {
      type: new Schema({ at: Date, byName: String, item: ref("Item"), serialNo: String, warehouse: ref("Warehouse"), notes: String }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true }
);
export const BatteryRemoval = model<IBatteryRemoval>("BatteryRemoval", BatteryRemovalSchema);
