import { handle } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { ACCESS_LEVELS, listPosts, savePost } from "@/services/postService";
import { canManageRole } from "@/lib/rbac";
import { Outlet } from "@/models/Outlet";
import { Warehouse } from "@/models/Warehouse";
import { Department } from "@/models/Hr";

export const GET = handle(async ({ user }) => ({
  posts: await listPosts(),
  outlets: await Outlet.find({ status: "ACTIVE" }).select("name city").sort({ name: 1 }).lean(),
  warehouses: await Warehouse.find({ status: "ACTIVE" }).select("name city").sort({ name: 1 }).lean(),
  departments: await Department.find().select("name").sort({ name: 1 }).lean(),
  levels: ACCESS_LEVELS.map((l) => ({ ...l, allowed: canManageRole(user.role, l.role) })),
  canManage: await hasPermission(user.role, "employee.manage"),
}), "employee.view");

/** { name, code, accessRole, departmentId?, description? } */
export const POST = handle(async ({ req, user }) => savePost(user, await req.json()), "employee.manage");
