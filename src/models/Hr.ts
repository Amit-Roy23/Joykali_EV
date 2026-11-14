import mongoose, { Schema, Document, Model } from "mongoose";
import { ApprovalSignature, ApprovalSignatureSchema } from "@/lib/approval";

const ref = (m: string, extra: Record<string, any> = {}) => ({ type: Schema.Types.ObjectId, ref: m, ...extra });
const model = <T,>(name: string, schema: Schema<T>): Model<T> => (mongoose.models[name] as Model<T>) || mongoose.model<T>(name, schema);

/* ---------------- Departments ---------------- */
export interface IDepartment extends Document {
  name: string;
  code: string;
  head?: mongoose.Types.ObjectId | null;
  isActive: boolean;
}
export const Department = model<IDepartment>(
  "Department",
  new Schema<IDepartment>(
    {
      name: { type: String, required: true, trim: true },
      code: { type: String, required: true, unique: true, uppercase: true, trim: true },
      head: ref("User", { default: null }),
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
  )
);

/* ---------------- Holiday calendar ---------------- */
export interface IHoliday extends Document {
  date: string; // YYYY-MM-DD (IST)
  name: string;
  kind: "NATIONAL" | "FESTIVAL" | "OPTIONAL";
}
const HolidaySchema = new Schema<IHoliday>(
  {
    date: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    name: { type: String, required: true, trim: true },
    kind: { type: String, enum: ["NATIONAL", "FESTIVAL", "OPTIONAL"], default: "FESTIVAL" },
  },
  { timestamps: true }
);
export const Holiday = model<IHoliday>("Holiday", HolidaySchema);

/* ---------------- Shifts & roster ---------------- */
export interface IShift extends Document {
  name: string;
  code: string;
  start: string;
  end: string;
  graceMinutes: number;
  halfDayMinutes: number;
  fullDayMinutes: number;
  weeklyOffs: number[];
  isDefault: boolean;
}
export const Shift = model<IShift>(
  "Shift",
  new Schema<IShift>(
    {
      name: { type: String, required: true, trim: true },
      code: { type: String, required: true, unique: true, uppercase: true },
      start: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
      end: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
      graceMinutes: { type: Number, default: 10, min: 0, max: 120 },
      halfDayMinutes: { type: Number, default: 240 },
      fullDayMinutes: { type: Number, default: 480 },
      weeklyOffs: { type: [Number], default: [0] },
      isDefault: { type: Boolean, default: false },
    },
    { timestamps: true }
  )
);

/** One employee, one date: a different shift, a rostered day off, and/or the duty assigned. */
export interface IRosterEntry extends Document {
  employee: mongoose.Types.ObjectId;
  date: string;
  shift?: mongoose.Types.ObjectId | null;
  off: boolean;
  duty?: string;
  location?: string;
  assignedBy: mongoose.Types.ObjectId;
  assignedByName: string;
}
const RosterSchema = new Schema<IRosterEntry>(
  {
    employee: ref("User", { required: true }),
    date: { type: String, required: true },
    shift: ref("Shift", { default: null }),
    off: { type: Boolean, default: false },
    duty: { type: String, trim: true },
    location: { type: String, trim: true },
    assignedBy: ref("User", { required: true }),
    assignedByName: { type: String, required: true },
  },
  { timestamps: true }
);
RosterSchema.index({ employee: 1, date: 1 }, { unique: true });
export const RosterEntry = model<IRosterEntry>("RosterEntry", RosterSchema);

/* ---------------- Attendance ---------------- */
export interface IAttendancePunch extends Document {
  employee: mongoose.Types.ObjectId;
  at: Date;
  date: string; // IST day
  type: "IN" | "OUT";
  source: "MOBILE" | "WEB" | "BIOMETRIC" | "MANUAL";
  location?: { lat: number; lng: number; accuracy?: number } | null;
  distanceM?: number | null;
  photo?: mongoose.Types.ObjectId | null;
  device?: string;
  note?: string;
  createdBy?: mongoose.Types.ObjectId;
}
const PunchSchema = new Schema<IAttendancePunch>(
  {
    employee: ref("User", { required: true }),
    at: { type: Date, required: true },
    date: { type: String, required: true },
    type: { type: String, enum: ["IN", "OUT"], required: true },
    source: { type: String, enum: ["MOBILE", "WEB", "BIOMETRIC", "MANUAL"], required: true },
    location: { type: new Schema({ lat: Number, lng: Number, accuracy: Number }, { _id: false }), default: null },
    distanceM: { type: Number, default: null },
    photo: ref("StoredFile", { default: null }),
    device: { type: String },
    note: { type: String },
    createdBy: ref("User"),
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
PunchSchema.index({ employee: 1, date: 1, at: 1 });
PunchSchema.index({ employee: 1, at: 1, source: 1 }, { unique: true });
export const AttendancePunch = model<IAttendancePunch>("AttendancePunch", PunchSchema);

/** Per-day decisions that are not punches: overtime approval. */
export interface IAttendanceDay extends Document {
  employee: mongoose.Types.ObjectId;
  date: string;
  otApprovedMin: number;
  otApprovedBy?: mongoose.Types.ObjectId | null;
  otApprovedByName?: string;
}
const DaySchema = new Schema<IAttendanceDay>(
  {
    employee: ref("User", { required: true }),
    date: { type: String, required: true },
    otApprovedMin: { type: Number, default: 0 },
    otApprovedBy: ref("User", { default: null }),
    otApprovedByName: { type: String },
  },
  { timestamps: true }
);
DaySchema.index({ employee: 1, date: 1 }, { unique: true });
export const AttendanceDay = model<IAttendanceDay>("AttendanceDay", DaySchema);

/** Missed / wrong punch correction: raised by the employee, decided by their manager or HR. */
export interface IRegularization extends Document {
  employee: mongoose.Types.ObjectId;
  employeeName: string;
  date: string;
  inTime?: string;
  outTime?: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  decidedBy?: mongoose.Types.ObjectId | null;
  decidedByName?: string;
  decidedAt?: Date;
  remarks?: string;
}
export const Regularization = model<IRegularization>(
  "Regularization",
  new Schema<IRegularization>(
    {
      employee: ref("User", { required: true, index: true }),
      employeeName: { type: String, required: true },
      date: { type: String, required: true },
      inTime: { type: String },
      outTime: { type: String },
      reason: { type: String, required: true, trim: true },
      status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
      decidedBy: ref("User", { default: null }),
      decidedByName: { type: String },
      decidedAt: { type: Date },
      remarks: { type: String },
    },
    { timestamps: true }
  )
);

/* ---------------- Leave ---------------- */
export interface ILeaveType extends Document {
  code: string;
  name: string;
  annualQuota: number;
  carryForwardMax: number;
  paid: boolean;
  encashable: boolean;
  halfDayAllowed: boolean;
  isActive: boolean;
}
export const LeaveType = model<ILeaveType>(
  "LeaveType",
  new Schema<ILeaveType>(
    {
      code: { type: String, required: true, unique: true, uppercase: true },
      name: { type: String, required: true },
      annualQuota: { type: Number, required: true, min: 0 },
      carryForwardMax: { type: Number, default: 0 },
      paid: { type: Boolean, default: true },
      encashable: { type: Boolean, default: false },
      halfDayAllowed: { type: Boolean, default: true },
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
  )
);

/** Balance carried in from the previous year (or migrated). */
export interface ILeaveOpening extends Document {
  employee: mongoose.Types.ObjectId;
  year: number;
  leaveType: mongoose.Types.ObjectId;
  days: number;
}
const LeaveOpeningSchema = new Schema<ILeaveOpening>({
  employee: ref("User", { required: true }),
  year: { type: Number, required: true },
  leaveType: ref("LeaveType", { required: true }),
  days: { type: Number, required: true, min: 0 },
});
LeaveOpeningSchema.index({ employee: 1, year: 1, leaveType: 1 }, { unique: true });
export const LeaveOpening = model<ILeaveOpening>("LeaveOpening", LeaveOpeningSchema);

export interface ILeaveRequest extends Document {
  employee: mongoose.Types.ObjectId;
  employeeName: string;
  leaveType: mongoose.Types.ObjectId;
  leaveCode: string;
  paid: boolean;
  from: string;
  to: string;
  half: boolean;
  days: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  decidedBy?: mongoose.Types.ObjectId | null;
  decidedByName?: string;
  decidedAt?: Date;
  remarks?: string;
  createdAt: Date;
}
export const LeaveRequest = model<ILeaveRequest>(
  "LeaveRequest",
  new Schema<ILeaveRequest>(
    {
      employee: ref("User", { required: true, index: true }),
      employeeName: { type: String, required: true },
      leaveType: ref("LeaveType", { required: true }),
      leaveCode: { type: String, required: true },
      paid: { type: Boolean, required: true },
      from: { type: String, required: true },
      to: { type: String, required: true },
      half: { type: Boolean, default: false },
      days: { type: Number, required: true },
      reason: { type: String, required: true, trim: true },
      status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "CANCELLED"], default: "PENDING", index: true },
      decidedBy: ref("User", { default: null }),
      decidedByName: { type: String },
      decidedAt: { type: Date },
      remarks: { type: String },
    },
    { timestamps: true }
  )
);

/* ---------------- Salary advance & loan ---------------- */
export interface IAdvanceLoan extends Document {
  code: string;
  employee: mongoose.Types.ObjectId;
  employeeName: string;
  kind: "ADVANCE" | "LOAN";
  amount: number;
  emi: number;
  tenureMonths: number;
  reason: string;
  status: "PENDING_APPROVAL" | "ACTIVE" | "CLOSED" | "REJECTED" | "CANCELLED";
  approvals: ApprovalSignature[];
  startPeriod?: string; // first payroll month that recovers
  balance: number;
  recoveries: Array<{ period: string; amount: number; payrollRun?: mongoose.Types.ObjectId; at: Date; note?: string }>;
  createdAt: Date;
}
export const AdvanceLoan = model<IAdvanceLoan>(
  "AdvanceLoan",
  new Schema<IAdvanceLoan>(
    {
      code: { type: String, required: true, unique: true },
      employee: ref("User", { required: true, index: true }),
      employeeName: { type: String, required: true },
      kind: { type: String, enum: ["ADVANCE", "LOAN"], required: true },
      amount: { type: Number, required: true, min: 1 },
      emi: { type: Number, required: true, min: 1 },
      tenureMonths: { type: Number, required: true, min: 1 },
      reason: { type: String, required: true },
      status: { type: String, enum: ["PENDING_APPROVAL", "ACTIVE", "CLOSED", "REJECTED", "CANCELLED"], default: "PENDING_APPROVAL", index: true },
      approvals: [ApprovalSignatureSchema],
      startPeriod: { type: String },
      balance: { type: Number, required: true },
      recoveries: [
        new Schema(
          { period: String, amount: Number, payrollRun: { type: Schema.Types.ObjectId, ref: "PayrollRun" }, at: Date, note: String },
          { _id: false }
        ),
      ],
    },
    { timestamps: true }
  )
);

/* ---------------- Expense claims ---------------- */
export interface IExpenseClaim extends Document {
  code: string;
  employee: mongoose.Types.ObjectId;
  employeeName: string;
  date: string;
  category: "TRAVEL" | "FUEL" | "FOOD" | "LODGING" | "MOBILE" | "CUSTOMER_DEMO" | "OTHER";
  amount: number;
  description: string;
  kmTravelled?: number;
  bill?: mongoose.Types.ObjectId | null;
  /** Manager check, then BH → MP sign; paid through the next unlocked payroll. */
  status: "SUBMITTED" | "VERIFIED" | "APPROVED" | "PAID" | "REJECTED";
  verifiedBy?: mongoose.Types.ObjectId | null;
  verifiedByName?: string;
  approvals: ApprovalSignature[];
  paidInPeriod?: string;
  rejectReason?: string;
  createdAt: Date;
}
export const ExpenseClaim = model<IExpenseClaim>(
  "ExpenseClaim",
  new Schema<IExpenseClaim>(
    {
      code: { type: String, required: true, unique: true },
      employee: ref("User", { required: true, index: true }),
      employeeName: { type: String, required: true },
      date: { type: String, required: true },
      category: { type: String, enum: ["TRAVEL", "FUEL", "FOOD", "LODGING", "MOBILE", "CUSTOMER_DEMO", "OTHER"], required: true },
      amount: { type: Number, required: true, min: 1 },
      description: { type: String, required: true },
      kmTravelled: { type: Number },
      bill: ref("StoredFile", { default: null }),
      status: { type: String, enum: ["SUBMITTED", "VERIFIED", "APPROVED", "PAID", "REJECTED"], default: "SUBMITTED", index: true },
      verifiedBy: ref("User", { default: null }),
      verifiedByName: { type: String },
      approvals: [ApprovalSignatureSchema],
      paidInPeriod: { type: String },
      rejectReason: { type: String },
    },
    { timestamps: true }
  )
);

/* ---------------- Employee documents ---------------- */
export const EMPLOYEE_DOC_TYPES = ["PHOTO", "AADHAAR", "PAN", "OFFER_LETTER", "APPOINTMENT_LETTER", "EDUCATION", "EXPERIENCE", "BANK_PROOF", "POLICE_VERIFICATION", "OTHER"] as const;
export interface IEmployeeDocument extends Document {
  employee: mongoose.Types.ObjectId;
  docType: (typeof EMPLOYEE_DOC_TYPES)[number];
  number?: string;
  file?: mongoose.Types.ObjectId | null;
  fileName?: string;
  verified: boolean;
  verifiedByName?: string;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}
export const EmployeeDocument = model<IEmployeeDocument>(
  "EmployeeDocument",
  new Schema<IEmployeeDocument>(
    {
      employee: ref("User", { required: true, index: true }),
      docType: { type: String, enum: EMPLOYEE_DOC_TYPES as unknown as string[], required: true },
      number: { type: String, trim: true },
      file: ref("StoredFile", { default: null }),
      fileName: { type: String },
      verified: { type: Boolean, default: false },
      verifiedByName: { type: String },
      uploadedBy: ref("User", { required: true }),
    },
    { timestamps: true }
  )
);

/* ---------------- Resignation & final settlement ---------------- */
export interface IResignation extends Document {
  employee: mongoose.Types.ObjectId;
  employeeName: string;
  reason: string;
  submittedAt: Date;
  requestedLwd: string;
  noticeDays: number;
  acceptedLwd?: string;
  noticeWaived: boolean;
  status: "SUBMITTED" | "ACCEPTED" | "WITHDRAWN" | "SETTLEMENT_PENDING" | "SETTLED" | "REJECTED";
  acceptedByName?: string;
  settlement?: { lines: Array<{ label: string; amount: number }>; earnings: number; deductions: number; net: number; computedAt: Date; inputs: any } | null;
  approvals: ApprovalSignature[];
  settledAt?: Date;
}
export const Resignation = model<IResignation>(
  "Resignation",
  new Schema<IResignation>(
    {
      employee: ref("User", { required: true, index: true }),
      employeeName: { type: String, required: true },
      reason: { type: String, required: true },
      submittedAt: { type: Date, required: true },
      requestedLwd: { type: String, required: true },
      noticeDays: { type: Number, required: true },
      acceptedLwd: { type: String },
      noticeWaived: { type: Boolean, default: false },
      status: { type: String, enum: ["SUBMITTED", "ACCEPTED", "WITHDRAWN", "SETTLEMENT_PENDING", "SETTLED", "REJECTED"], default: "SUBMITTED", index: true },
      acceptedByName: { type: String },
      settlement: { type: Schema.Types.Mixed, default: null },
      approvals: [ApprovalSignatureSchema],
      settledAt: { type: Date },
    },
    { timestamps: true }
  )
);

/* ---------------- Employee targets ---------------- */
export interface IEmployeeTarget extends Document {
  employee: mongoose.Types.ObjectId;
  period: string;
  targetUnits: number;
  setByName: string;
}
const EmployeeTargetSchema = new Schema<IEmployeeTarget>(
  {
    employee: ref("User", { required: true }),
    period: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    targetUnits: { type: Number, required: true, min: 0 },
    setByName: { type: String, required: true },
  },
  { timestamps: true }
);
EmployeeTargetSchema.index({ employee: 1, period: 1 }, { unique: true });
export const EmployeeTarget = model<IEmployeeTarget>("EmployeeTarget", EmployeeTargetSchema);
