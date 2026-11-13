import { NextRequest } from "next/server";
import { ALL_PERMISSIONS, getPermissionsForRole } from "@/lib/rbac";
import { connectToDatabase } from "@/lib/db";
import { RolePermission } from "@/models/RolePermission";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { UserRole, Permission, ALL_ROLES } from "@/types";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "settings.manage");
    if (auth.error) return auth.error;

    // Effective permissions: stored matrix + any newer default permission.
    const roleMap: Record<string, Permission[]> = {};
    for (const role of ALL_ROLES) roleMap[role] = await getPermissionsForRole(role as UserRole);

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

    if (!role || !Array.isArray(permissions) || !(ALL_ROLES as readonly string[]).includes(role)) {
      return errorResponse("Invalid role or permissions payload", 400);
    }
    const valid = new Set<string>(ALL_PERMISSIONS);
    let cleaned = [...new Set(permissions.filter((p: string) => valid.has(p)))] as Permission[];
    // Approvals always need the Business Head and the Managing Partner, never Admin.
    if (role === "ADMIN") cleaned = cleaned.filter((p) => p !== "approvals.sign");

    const updated = await RolePermission.findOneAndUpdate(
      { role },
      {
        role: role as UserRole,
        permissions: cleaned,
        knownPermissions: ALL_PERMISSIONS,
        updatedBy: new mongoose.Types.ObjectId(auth.user.userId),
      },
      { upsert: true, new: true }
    );

    await logAudit({
      user: auth.user,
      action: "UPDATE",
      resource: "SETTINGS",
      resourceId: role,
      after: { role, permissionsCount: cleaned.length },
    });

    return jsonResponse(updated);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to update role permissions", 500);
  }
}

