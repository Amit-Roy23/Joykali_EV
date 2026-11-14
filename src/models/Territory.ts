import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Sales geography: ZONE → DISTRICT → AREA.
 * Super distributors are allocated districts; distributors are allocated areas inside them;
 * dealers, sub dealers and outlets sit in one area (or district).
 */
export type TerritoryKind = "ZONE" | "DISTRICT" | "AREA";

export interface ITerritory extends Document {
  kind: TerritoryKind;
  name: string;
  code: string;
  parent?: mongoose.Types.ObjectId | null;
  state: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TerritorySchema = new Schema<ITerritory>(
  {
    kind: { type: String, enum: ["ZONE", "DISTRICT", "AREA"], required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    parent: { type: Schema.Types.ObjectId, ref: "Territory", default: null, index: true },
    state: { type: String, required: true, trim: true, default: "West Bengal" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
TerritorySchema.index({ kind: 1, parent: 1, name: 1 }, { unique: true });

export const Territory: Model<ITerritory> =
  mongoose.models.Territory || mongoose.model<ITerritory>("Territory", TerritorySchema);
