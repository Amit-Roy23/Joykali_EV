import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Small uploaded documents (fleet papers) kept in MongoDB, because Vercel has no
 * persistent disk. Limited to 2 MB per file in the upload route.
 */
export interface IStoredFile extends Document {
  name: string;
  contentType: string;
  size: number;
  data: Buffer;
  uploadedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const StoredFileSchema = new Schema<IStoredFile>(
  {
    name: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const StoredFile: Model<IStoredFile> =
  mongoose.models.StoredFile || mongoose.model<IStoredFile>("StoredFile", StoredFileSchema);
