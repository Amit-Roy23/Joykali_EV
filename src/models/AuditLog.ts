import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAuditLog extends Document {
  user?: mongoose.Types.ObjectId | null;
  userEmail?: string;
  userName?: string;
  action: string; // e.g. "CREATE", "UPDATE", "DELETE", "APPROVE", "LOCK", "LOGIN"
  resource: string; // e.g. "SALE", "PURCHASE", "EMPLOYEE", "PAYROLL", "SCHEME"
  resourceId?: string;
  before?: any;
  after?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    userEmail: { type: String },
    userName: { type: String },
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true },
    resourceId: { type: String, index: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    timestamp: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);

