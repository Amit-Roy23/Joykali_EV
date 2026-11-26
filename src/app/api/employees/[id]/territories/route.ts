import { User } from "@/models/User";
import { handle } from "@/lib/route";
import { getScopeFilter } from "@/lib/rbac";
import { assignTerritories, assignmentHistory, canAssignTerritories, KIND_FOR_ROLE } from "@/services/territoryAssignService";

/** Current areas, the dated history, and whether the viewer may change them. */
export const GET = handle(async ({ user, params }) => {
  const scope = await getScopeFilter(user, "employees");
  const emp = await User.findOne({ $and: [{ _id: params.id }, scope] })
    .select("name role territories reportsTo")
    .populate("territories", "name code kind parent")
    .lean();
  if (!emp) throw Object.assign(new Error("Employee not found"), { status: 404 });
  const mgr: any = emp.role === "FEC" && emp.reportsTo ? await User.findById(emp.reportsTo).select("name role territories").lean() : null;
  return {
    manager: mgr && mgr.role === "ASM" ? { _id: mgr._id, name: mgr.name, districts: (mgr.territories || []).map(String) } : null,
    kind: KIND_FOR_ROLE[emp.role] || null,
    territories: emp.territories || [],
    history: await assignmentHistory({ employeeId: params.id }),
    canAssign: await canAssignTerritories(user, params.id),
  };
}, "employee.view");

/** Replace the person's areas: { territoryIds, note?, takeOver? }. */
export const PUT = handle(async ({ req, user, params }) => assignTerritories(user, params.id, await req.json()), undefined, "Failed to assign areas");
