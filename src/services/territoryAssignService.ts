import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import { User } from "@/models/User";
import { Territory } from "@/models/Territory";
import { TerritoryAssignment } from "@/models/TerritoryAssignment";
import { withTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { canManageRole, hasPermission } from "@/lib/rbac";
import { notifyUsers } from "./notificationService";

/**
 * Area assignment for the field team.
 *  - An ASM covers one or more DISTRICTS (one ASM per district).
 *  - An FSE covers one or more AREAS, which must lie inside their ASM's districts.
 *  - A Business Head may be given ZONES.
 * Every change opens / closes a dated spell in TerritoryAssignment, so "who worked
 * where, when" can always be answered later.
 */

export const KIND_FOR_ROLE: Record<string, "ZONE" | "DISTRICT" | "AREA"> = {
  BUSINESS_HEAD: "ZONE",
  ASM: "DISTRICT",
  FEC: "AREA",
};
const KIND_WORD = { ZONE: "zones", DISTRICT: "districts", AREA: "areas" } as const;

const err = (message: string, status = 400) => Object.assign(new Error(message), { status });
const sid = (v: any) => String(v?._id ?? v);

/** Admin / BH / HR (employee.manage) or network.manage may assign anyone they can manage; an ASM may give areas to their own FSEs. */
async function mayAssign(user: JWTPayload, target: any) {
  if ((await hasPermission(user.role, "employee.manage")) || (await hasPermission(user.role, "network.manage"))) {
    return canManageRole(user.role, target.role);
  }
  return user.role === "ASM" && target.role === "FEC" && sid(target.reportsTo) === user.userId;
}

export async function canAssignTerritories(user: JWTPayload, employeeId: string) {
  if (!mongoose.isValidObjectId(employeeId)) return false;
  const target = await User.findById(employeeId).select("role reportsTo").lean();
  return !!target && !!KIND_FOR_ROLE[target.role] && (await mayAssign(user, target));
}

/** Districts covered by an employee's ASM (the FSE's manager), or null when the manager holds none. */
async function managerDistricts(fse: any) {
  if (!fse.reportsTo) return null;
  const mgr = await User.findById(fse.reportsTo).select("name role territories").lean();
  if (!mgr || mgr.role !== "ASM" || !(mgr.territories || []).length) return null;
  return { manager: mgr, districts: (mgr.territories || []).map(String) };
}

export async function assignTerritories(
  user: JWTPayload,
  employeeId: string,
  input: { territoryIds: string[]; note?: string; takeOver?: boolean }
) {
  if (!mongoose.isValidObjectId(employeeId)) throw err("Employee not found", 404);
  const ids = [...new Set((input.territoryIds || []).map(String))];
  if (ids.some((x) => !mongoose.isValidObjectId(x))) throw err("Unknown territory");

  const outbox: Array<[any[], any]> = [];
  const result = await withTransaction(async (s) => {
    const session = s ?? null;
    outbox.length = 0;
    const emp = await User.findById(employeeId).session(session);
    if (!emp) throw err("Employee not found", 404);
    const kind = KIND_FOR_ROLE[emp.role];
    if (!kind) throw err("Areas can be assigned to Area Sales Managers (districts), Field Sales Executives (areas) and the Business Head (zones) only");
    if (emp.status !== "ACTIVE") throw err("This employee is not active");
    if (!(await mayAssign(user, emp.toObject()))) throw err("You cannot change this person's areas", 403);

    const terrs = await Territory.find({ _id: { $in: ids }, isActive: true }).session(session).lean();
    if (terrs.length !== ids.length) throw err("One of the chosen territories does not exist or is closed");
    const wrong = terrs.filter((t) => t.kind !== kind);
    if (wrong.length) {
      throw err(`${emp.role === "FEC" ? "An FSE" : emp.role === "ASM" ? "An ASM" : "The Business Head"} is given ${KIND_WORD[kind]} — ${wrong.map((t) => t.name).join(", ")} ${wrong.length > 1 ? "are" : "is a"} ${wrong.length > 1 ? KIND_WORD[wrong[0].kind] : wrong[0].kind.toLowerCase()}`);
    }

    const warnings: string[] = [];

    // FSE: areas must be inside the ASM's districts.
    if (emp.role === "FEC") {
      const md = await managerDistricts(emp);
      if (user.role === "ASM" && !md) throw err("Assign your own districts first (ask the Business Head), then give areas to your FSEs");
      if (md) {
        const outside = terrs.filter((t) => !md.districts.includes(String(t.parent)));
        if (outside.length) {
          const names = (await Territory.find({ _id: { $in: md.districts } }).select("name").lean()).map((d) => d.name);
          throw err(`${outside.map((t) => t.name).join(", ")} ${outside.length > 1 ? "are" : "is"} outside ${md.manager.name}'s districts (${names.join(", ")}). Give the ASM that district first, or move the FSE to the right ASM.`);
        }
      } else if (terrs.length) warnings.push("This FSE's manager is not an ASM with districts, so the areas were not checked against a district.");
    }

    // District / zone: one holder at a time.
    if (kind !== "AREA" && ids.length) {
      const holders = await User.find({ _id: { $ne: emp._id }, role: emp.role, status: "ACTIVE", territories: { $in: ids } })
        .select("name territories")
        .session(session);
      if (holders.length && !input.takeOver) {
        const clash = holders.map((h) => `${terrs.filter((t) => (h.territories || []).map(String).includes(String(t._id))).map((t) => t.name).join(", ")} (with ${h.name})`);
        throw Object.assign(err(`Already covered by someone else: ${clash.join("; ")}. Choose "move it to this person" to transfer it.`, 409), { code: "TAKEN" });
      }
      for (const h of holders) {
        const moving = (h.territories || []).map(String).filter((x) => ids.includes(x));
        await closeSpells(h._id, moving, user.name, `Moved to ${emp.name}`, session);
        h.territories = (h.territories || []).filter((x) => !ids.includes(String(x)));
        await h.save({ session });
        outbox.push([[h._id], { kind: "territory", title: "Your territory changed", body: `${terrs.filter((t) => moving.includes(String(t._id))).map((t) => t.name).join(", ")} moved to ${emp.name}`, href: "/territories/team" }]);
      }
    }

    const before = (emp.territories || []).map(String);
    const added = ids.filter((x) => !before.includes(x));
    const removed = before.filter((x) => !ids.includes(x));

    // ASM giving up a district: FSEs below with areas there are now outside it.
    if (emp.role === "ASM" && removed.length) {
      const areas = await Territory.find({ parent: { $in: removed } }).select("_id").session(session).lean();
      const fses = await User.find({ reportsTo: emp._id, role: "FEC", status: "ACTIVE", territories: { $in: areas.map((a) => a._id) } }).select("name").session(session).lean();
      if (fses.length) warnings.push(`${fses.map((f) => f.name).join(", ")} still ${fses.length > 1 ? "have" : "has"} areas in the district(s) removed — reassign them.`);
    }

    await closeSpells(emp._id, removed, user.name, input.note || "", session);
    if (added.length) {
      const byId = new Map(terrs.map((t) => [String(t._id), t]));
      await TerritoryAssignment.insertMany(
        added.map((tid) => {
          const t: any = byId.get(tid);
          return {
            employee: emp._id,
            employeeName: emp.name,
            employeeCode: emp.employeeCode,
            role: emp.role,
            territory: t._id,
            territoryName: t.name,
            territoryCode: t.code,
            kind: t.kind,
            from: new Date(),
            to: null,
            assignedByName: user.name,
            note: input.note || "",
          };
        }),
        { session }
      );
    }
    emp.territories = ids.map((x) => new mongoose.Types.ObjectId(x));
    await emp.save({ session });

    if (added.length || removed.length) {
      await logAudit({ user, action: "UPDATE", resource: "EMPLOYEE", resourceId: String(emp._id), before: { territories: before }, after: { territories: ids, note: input.note } });
      if (String(emp._id) !== user.userId) {
        outbox.push([[emp._id], {
          kind: "territory",
          title: "Your working area was updated",
          body: terrs.length ? `You now cover: ${terrs.map((t) => t.name).join(", ")}` : "You have no area assigned at the moment",
          href: `/employees/${emp._id}`,
        }]);
      }
    }
    return { territories: terrs.map((t) => ({ _id: t._id, name: t.name, code: t.code, kind: t.kind })), added: added.length, removed: removed.length, warnings };
  });
  for (const [ids, n] of outbox) await notifyUsers(ids, n, user.userId);
  return result;
}

async function closeSpells(employee: any, territoryIds: string[], byName: string, note: string, session: any = null) {
  if (!territoryIds.length) return;
  await TerritoryAssignment.updateMany(
    { employee, territory: { $in: territoryIds }, to: null },
    { $set: { to: new Date(), endedByName: byName, ...(note ? { note } : {}) } },
    { session }
  );
}

/** Close every open spell (used when someone leaves or changes post). */
export async function clearTerritories(employeeId: any, byName: string, reason: string, session?: any) {
  const emp = await User.findById(employeeId).select("territories").session(session || null);
  if (!emp || !(emp.territories || []).length) return;
  await closeSpells(emp._id, emp.territories!.map(String), byName, reason, session);
  emp.territories = [];
  await emp.save({ session });
}

/** Spells for one employee or one territory (newest first). */
export async function assignmentHistory(q: { employeeId?: string; territoryId?: string; limit?: number }) {
  const f: any = {};
  if (q.employeeId && mongoose.isValidObjectId(q.employeeId)) f.employee = q.employeeId;
  if (q.territoryId && mongoose.isValidObjectId(q.territoryId)) {
    // A district's history includes its areas.
    const kids = await Territory.find({ parent: q.territoryId }).select("_id").lean();
    f.territory = { $in: [q.territoryId, ...kids.map((k) => k._id)] };
  }
  return TerritoryAssignment.find(f).sort({ from: -1, createdAt: -1 }).limit(Math.min(q.limit || 200, 500)).lean();
}

/** Who covered a territory on a date (for reports looking back). */
export async function coveredOn(territoryId: string, at: Date) {
  if (!mongoose.isValidObjectId(territoryId)) throw err("Unknown territory");
  return TerritoryAssignment.find({ territory: territoryId, from: { $lte: at }, $or: [{ to: null }, { to: { $gt: at } }] }).lean();
}

/**
 * The field-team map: each ASM with their districts and FSEs (with areas),
 * plus gaps — FSEs with no area, areas outside their ASM's districts,
 * districts with no ASM and areas with no FSE.
 */
export async function territoryTeam(user: JWTPayload) {
  const [terrs, staff] = await Promise.all([
    Territory.find({ isActive: true }).select("kind name code parent").lean(),
    User.find({ role: { $in: ["ASM", "FEC", "BUSINESS_HEAD"] }, status: "ACTIVE" })
      .select("name employeeCode role designation reportsTo territories phone")
      .sort({ name: 1 })
      .lean(),
  ]);
  const tById = new Map(terrs.map((t) => [String(t._id), t]));
  const brief = (id: any) => {
    const t: any = tById.get(String(id));
    return t ? { _id: t._id, name: t.name, code: t.code, kind: t.kind, parent: t.parent ? String(t.parent) : null } : null;
  };
  const person = (u: any) => ({
    _id: u._id,
    name: u.name,
    employeeCode: u.employeeCode,
    role: u.role,
    designation: u.designation,
    phone: u.phone,
    territories: (u.territories || []).map(brief).filter(Boolean),
  });

  const asms = staff.filter((u) => u.role === "ASM");
  const fses = staff.filter((u) => u.role === "FEC");
  let teams = asms.map((a) => {
    const p = person(a);
    const districtIds = p.territories.map((t: any) => String(t._id));
    const members = fses
      .filter((f) => sid(f.reportsTo) === String(a._id))
      .map((f) => {
        const fp: any = person(f);
        fp.outside = fp.territories.filter((t: any) => !districtIds.includes(String(t.parent))).map((t: any) => t.name);
        return fp;
      });
    return { ...p, fses: members };
  });
  // An ASM sees only their own team.
  if (user.role === "ASM") teams = teams.filter((t) => String(t._id) === user.userId);

  const asmIds = new Set(asms.map((a) => String(a._id)));
  const otherFses = user.role === "ASM" ? [] : fses.filter((f) => !asmIds.has(sid(f.reportsTo))).map((f) => ({ ...person(f), managerId: f.reportsTo ? sid(f.reportsTo) : null }));

  const coveredDistricts = new Set(asms.flatMap((a) => (a.territories || []).map(String)));
  const coveredAreas = new Set(fses.flatMap((f) => (f.territories || []).map(String)));
  const scopeDistricts = user.role === "ASM" ? new Set(teams.flatMap((t) => t.territories.map((x: any) => String(x._id)))) : null;
  const districts = terrs.filter((t) => t.kind === "DISTRICT" && (!scopeDistricts || scopeDistricts.has(String(t._id))));
  const districtName = (id: any) => (tById.get(String(id)) as any)?.name || "";

  return {
    teams,
    otherFses,
    zoneHeads: user.role === "ASM" ? [] : staff.filter((u) => u.role === "BUSINESS_HEAD").map(person),
    gaps: {
      districtsWithoutAsm: user.role === "ASM" ? [] : districts.filter((d) => !coveredDistricts.has(String(d._id))).map((d) => brief(d._id)),
      areasWithoutFse: terrs
        .filter((t) => t.kind === "AREA" && districts.some((d) => String(d._id) === String(t.parent)) && !coveredAreas.has(String(t._id)))
        .map((t) => ({ ...brief(t._id), district: districtName(t.parent) })),
      fsesWithoutArea: [...teams.flatMap((t) => t.fses), ...otherFses].filter((f: any) => !f.territories.length).map((f: any) => ({ _id: f._id, name: f.name, employeeCode: f.employeeCode })),
      areasOutsideAsm: teams.flatMap((t) => t.fses.filter((f: any) => f.outside.length).map((f: any) => ({ _id: f._id, name: f.name, asm: t.name, areas: f.outside }))),
    },
  };
}

/** Field staff per territory node, for the territory tree. */
export async function staffByTerritory() {
  const staff = await User.find({ role: { $in: ["ASM", "FEC", "BUSINESS_HEAD"] }, status: "ACTIVE", "territories.0": { $exists: true } })
    .select("name employeeCode role territories")
    .lean();
  const map = new Map<string, Array<{ _id: any; name: string; employeeCode: string; role: string }>>();
  for (const u of staff) {
    for (const t of u.territories || []) {
      const k = String(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push({ _id: u._id, name: u.name, employeeCode: u.employeeCode, role: u.role });
    }
  }
  return map;
}
