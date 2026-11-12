import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { RolePermission } from "@/models/RolePermission";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { UserRole, Permission } from "@/types";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "settings.manage");
    if (auth.error) return auth.error;

    const dbRoles = await RolePermission.find().lean();
    const roleMap: Record<string, Permission[]> = { ...DEFAULT_ROLE_PERMISSIONS };

    dbRoles.forEach((r: any) => {
      roleMap[r.role] = r.permissions;
    });

    return jsonResponse(roleMap);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch role permissions", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "settings.manage");
    if (auth.error) return auth.error;

    const body = await req.json(); // { role: "ASM", permissions: [...] }
    const { role, permissions } = body;

    if (!role || !Array.isArray(permissions)) {
      return errorResponse("Invalid role or permissions payload", 400);
    }

    const updated = await RolePermission.findOneAndUpdate(
      { role },
      {
        role: role as UserRole,
        permissions: permissions as Permission[],
        updatedBy: new mongoose.Types.ObjectId(auth.user.userId),
      },
      { upsert: true, new: true }
    );

    await logAudit({
      user: auth.user,
      action: "UPDATE",
      resource: "SETTINGS",
      resourceId: role,
      after: { role, permissionsCount: permissions.length },
    });

    return jsonResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to update role permissions", 500);
  }
}

