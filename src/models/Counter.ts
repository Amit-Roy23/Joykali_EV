import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICounter extends Document {
  key: string;
  sequenceValue: number;
}

const CounterSchema = new Schema<ICounter>(
  {
    key: { type: String, required: true, unique: true, index: true },
    sequenceValue: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

export const Counter: Model<ICounter> =
  mongoose.models.Counter || mongoose.model<ICounter>("Counter", CounterSchema);

