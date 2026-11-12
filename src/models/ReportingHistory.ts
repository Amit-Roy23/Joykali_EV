import mongoose, { Schema, Document, Model } from "mongoose";

export interface IReportingHistory extends Document {
  employee: mongoose.Types.ObjectId;
  previousManager?: mongoose.Types.ObjectId | null;
  newManager: mongoose.Types.ObjectId;
  changedBy: mongoose.Types.ObjectId;
  changedAt: Date;
  reason?: string;
}

const ReportingHistorySchema = new Schema<IReportingHistory>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    previousManager: { type: Schema.Types.ObjectId, ref: "User", default: null },
    newManager: { type: Schema.Types.ObjectId, ref: "User", required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    changedAt: { type: Date, required: true, default: Date.now, index: true },
    reason: { type: String, trim: true },
  },
  { timestamps: true }
);

export const ReportingHistory: Model<IReportingHistory> =
  mongoose.models.ReportingHistory ||
  mongoose.model<IReportingHistory>("ReportingHistory", ReportingHistorySchema);

