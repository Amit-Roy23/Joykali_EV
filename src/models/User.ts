import mongoose, { Schema, Document, Model } from "mongoose";
import { UserRole } from "@/types";

export interface IUser extends Document {
  employeeCode: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  reportsTo?: mongoose.Types.ObjectId | IUser | null;
  dealer?: mongoose.Types.ObjectId | null;
  designation: string;
  joiningDate: Date;
  status: "ACTIVE" | "INACTIVE";
  passwordHash: string;
  mustChangePassword: boolean;
  lastLoginAt?: Date;
  failedLoginAttempts: number;
  lockUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    employeeCode: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true },
    role: {
      type: String,
      required: true,
      enum: ["FEC", "ASM", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"],
      index: true,
    },
    reportsTo: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    dealer: { type: Schema.Types.ObjectId, ref: "Dealer", default: null },
    designation: { type: String, required: true, trim: true },
    joiningDate: { type: Date, required: true, default: Date.now },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE", index: true },
    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

