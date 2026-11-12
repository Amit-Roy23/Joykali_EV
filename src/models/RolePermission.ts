import mongoose, { Schema, Document, Model } from "mongoose";
import { Permission, UserRole } from "@/types";

export interface IRolePermission extends Document {
  role: UserRole;
  permissions: Permission[];
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
      enum: ["FEC", "ASM", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"],
      index: true,
    },
    permissions: [{ type: String, required: true }],
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const RolePermission: Model<IRolePermission> =
  mongoose.models.RolePermission ||
  mongoose.model<IRolePermission>("RolePermission", RolePermissionSchema);

