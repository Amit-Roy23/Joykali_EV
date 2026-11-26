import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * No dues certificate for a leaving employee.
 * HR opens it → the system checks money, cash, areas and team; HR ticks what was handed back →
 * sent for approval → the Business Head OR the Managing Partner approves → certificate issued (PDF + public check).
 */
export const HANDBACK_ITEMS: Array<{ key: string; label: string }> = [
  { key: "ID_CARD", label: "Company ID card returned" },
  { key: "DEVICES", label: "Phone / laptop / SIM / tablet returned" },
  { key: "KEYS", label: "Keys returned (office, cash box, store, vehicle)" },
  { key: "DOCS", label: "Files, dealer documents and samples handed over" },
  { key: "VEHICLE", label: "Demo / company vehicle returned" },
];

export interface INoDues extends Document {
  code?: string;
  employee: mongoose.Types.ObjectId;
  employeeName: string;
  employeeCode: string;
  designation: string;
  joiningDate?: Date;
  lastWorkingDay: string;
  resignation: mongoose.Types.ObjectId;
  status: "OPEN" | "PENDING_APPROVAL" | "ISSUED" | "REJECTED" | "CANCELLED";
  items: Array<{ key: string; label: string; status: "PENDING" | "CLEARED" | "NA"; byName?: string; at?: Date; note?: string }>;
  /** The system checks as they stood when it was sent for approval and when it was issued. */
  checksAtSubmit?: any[];
  checksAtIssue?: any[];
  openedByName: string;
  submittedByName?: string;
  submittedAt?: Date;
  decision?: { by: mongoose.Types.ObjectId; byName: string; role: string; at: Date; note?: string } | null;
  issuedAt?: Date;
  remarks?: string;
  createdAt: Date;
}

const NoDuesSchema = new Schema<INoDues>(
  {
    code: { type: String, unique: true, sparse: true },
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    employeeName: { type: String, required: true },
    employeeCode: { type: String, required: true },
    designation: { type: String, default: "" },
    joiningDate: Date,
    lastWorkingDay: { type: String, required: true },
    resignation: { type: Schema.Types.ObjectId, ref: "Resignation", required: true },
    status: { type: String, enum: ["OPEN", "PENDING_APPROVAL", "ISSUED", "REJECTED", "CANCELLED"], default: "OPEN", index: true },
    items: [
      new Schema(
        { key: String, label: String, status: { type: String, enum: ["PENDING", "CLEARED", "NA"], default: "PENDING" }, byName: String, at: Date, note: String },
        { _id: false }
      ),
    ],
    checksAtSubmit: { type: Schema.Types.Mixed, default: null },
    checksAtIssue: { type: Schema.Types.Mixed, default: null },
    openedByName: { type: String, required: true },
    submittedByName: String,
    submittedAt: Date,
    decision: {
      type: new Schema({ by: { type: Schema.Types.ObjectId, ref: "User" }, byName: String, role: String, at: Date, note: String }, { _id: false }),
      default: null,
    },
    issuedAt: Date,
    remarks: String,
  },
  { timestamps: true }
);

export const NoDues: Model<INoDues> = mongoose.models.NoDues || mongoose.model<INoDues>("NoDues", NoDuesSchema);
