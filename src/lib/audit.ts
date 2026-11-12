import { AuditLog } from "@/models/AuditLog";
import { JWTPayload } from "@/types";
import mongoose from "mongoose";

export interface LogAuditParams {
  user?: JWTPayload | null;
  action: "CREATE" | "UPDATE" | "DELETE" | "APPROVE" | "LOCK" | "CANCEL" | "LOGIN" | "PASSWORD_RESET";
  resource: "SALE" | "PURCHASE" | "EMPLOYEE" | "DEALER" | "VEHICLE" | "SCHEME" | "PAYROLL" | "SETTINGS" | "AUTH";
  resourceId?: string;
  before?: any;
  after?: any;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await AuditLog.create({
      user: params.user?.userId ? new mongoose.Types.ObjectId(params.user.userId) : null,
      userEmail: params.user?.email,
      userName: params.user?.name,
      action: params.action,
      resource: params.resource,
      resourceId: params.resourceId,
      before: params.before,
      after: params.after,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

