import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A post (job position / designation) the company can create at any time: Showroom Manager,
 * Regional Manager, Clerk, Personal Assistant … Each post carries an access level (one of the
 * system roles) that decides what its holders can see and do, and its own employee-ID prefix.
 */
export interface IPost extends Document {
  name: string;
  /** Employee ID prefix: JKE-<code>-0001. 2–4 capital letters. */
  code: string;
  accessRole: string;
  department?: mongoose.Types.ObjectId | null;
  description?: string;
  active: boolean;
  createdByName?: string;
  createdAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    accessRole: { type: String, required: true, index: true },
    department: { type: Schema.Types.ObjectId, ref: "Department", default: null },
    description: { type: String, trim: true },
    active: { type: Boolean, default: true },
    createdByName: String,
  },
  { timestamps: true }
);
PostSchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export const Post: Model<IPost> = mongoose.models.Post || mongoose.model<IPost>("Post", PostSchema);
