import mongoose, { Schema, Document, Model } from "mongoose";

/** KYC and agreement papers of a distributor / dealer. Company staff verify them. */
export const KYC_DOC_TYPES = ["GST", "PAN", "AADHAAR", "TRADE_LICENSE", "CANCELLED_CHEQUE", "AGREEMENT", "PHOTO", "OTHER"] as const;
export type KycDocType = (typeof KYC_DOC_TYPES)[number];
/** Needed before a partner account can be activated. */
export const REQUIRED_KYC: KycDocType[] = ["GST", "PAN", "AGREEMENT"];

export interface IPartyDocument extends Document {
  partyType: "DEALER" | "DISTRIBUTOR";
  party: mongoose.Types.ObjectId;
  docType: KycDocType;
  number?: string;
  validTill?: Date | null;
  file?: mongoose.Types.ObjectId | null;
  fileName?: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  remarks?: string;
  uploadedBy: mongoose.Types.ObjectId;
  verifiedBy?: mongoose.Types.ObjectId | null;
  verifiedByName?: string;
  verifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PartyDocumentSchema = new Schema<IPartyDocument>(
  {
    partyType: { type: String, enum: ["DEALER", "DISTRIBUTOR"], required: true },
    party: { type: Schema.Types.ObjectId, required: true, index: true },
    docType: { type: String, enum: KYC_DOC_TYPES as unknown as string[], required: true },
    number: { type: String, trim: true, uppercase: true },
    validTill: { type: Date, default: null },
    file: { type: Schema.Types.ObjectId, ref: "StoredFile", default: null },
    fileName: { type: String },
    status: { type: String, enum: ["PENDING", "VERIFIED", "REJECTED"], default: "PENDING", index: true },
    remarks: { type: String, trim: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    verifiedByName: { type: String },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const PartyDocument: Model<IPartyDocument> =
  mongoose.models.PartyDocument || mongoose.model<IPartyDocument>("PartyDocument", PartyDocumentSchema);
