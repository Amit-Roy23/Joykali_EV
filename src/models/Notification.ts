import mongoose, { Schema, Document, Model } from "mongoose";

/** One in-app notice for one login (shown under the bell). */
export interface INotification extends Document {
  user: mongoose.Types.ObjectId;
  kind: string; // ORDER, DISPATCH, INVOICE, GRN, PAYMENT, NETWORK …
  title: string;
  body?: string;
  href?: string;
  read: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String },
    href: { type: String },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
NotificationSchema.index({ user: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  mongoose.models.Notification || mongoose.model<INotification>("Notification", NotificationSchema);
