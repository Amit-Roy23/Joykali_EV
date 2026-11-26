import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Who covered which territory, and when. One row per (employee, territory) spell:
 * `to` is null while the spell is current. ASMs hold districts; FSEs hold areas.
 * The employee's current set is also kept on User.territories for fast lookups.
 */
export interface ITerritoryAssignment extends Document {
  employee: mongoose.Types.ObjectId;
  employeeName: string;
  employeeCode: string;
  role: string;
  territory: mongoose.Types.ObjectId;
  territoryName: string;
  territoryCode: string;
  kind: "ZONE" | "DISTRICT" | "AREA";
  from: Date;
  to: Date | null;
  assignedByName: string;
  endedByName?: string;
  note?: string;
}

const TerritoryAssignmentSchema = new Schema<ITerritoryAssignment>(
  {
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    employeeName: { type: String, required: true },
    employeeCode: { type: String, default: "" },
    role: { type: String, required: true },
    territory: { type: Schema.Types.ObjectId, ref: "Territory", required: true, index: true },
    territoryName: { type: String, required: true },
    territoryCode: { type: String, default: "" },
    kind: { type: String, enum: ["ZONE", "DISTRICT", "AREA"], required: true },
    from: { type: Date, required: true, default: Date.now },
    to: { type: Date, default: null, index: true },
    assignedByName: { type: String, default: "" },
    endedByName: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);
TerritoryAssignmentSchema.index({ employee: 1, territory: 1, to: 1 });

export const TerritoryAssignment: Model<ITerritoryAssignment> =
  mongoose.models.TerritoryAssignment || mongoose.model<ITerritoryAssignment>("TerritoryAssignment", TerritoryAssignmentSchema);
