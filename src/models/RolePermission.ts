import mongoose, { Schema, Document, Model } from "mongoose";
import { Permission, UserRole } from "@/types";

export interface IRolePermission extends Document {
  role: UserRole;
  permissions: Permission[];
  /** Every permission that existed when this matrix was saved — newer ones get their default. */
  knownPermissions?: string[];
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RolePermissionSchema = new Schema<IRolePermission>(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      enum: ["FEC", "OUTLET", "ASM", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN", "SUPER_DISTRIBUTOR", "DISTRIBUTOR", "DEALER", "SUB_DEALER"],
      index: true,
    },
    permissions: [{ type: String, required: true }],
    knownPermissions: [{ type: String }],
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const RolePermission: Model<IRolePermission> =
  mongoose.models.RolePermission ||
  mongoose.model<IRolePermission>("RolePermission", RolePermissionSchema);

