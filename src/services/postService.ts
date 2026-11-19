import mongoose from "mongoose";
import { JWTPayload, EMPLOYEE_ROLES, UserRole } from "@/types";
import { Post } from "@/models/Post";
import { User } from "@/models/User";
import { canManageRole } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";

export class PostError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** What each access level means, in plain words (shown when creating a post). */
export const ACCESS_LEVELS: Array<{ role: UserRole; label: string; means: string; needs?: "outlet" | "warehouse" }> = [
  { role: "STAFF", label: "General staff", means: "Own attendance, leave, advances and payslips only — for clerks, assistants, drivers, office staff." },
  { role: "FEC", label: "Field sales (FSE)", means: "Records sales, sees own sales, incentives and attendance." },
  { role: "OUTLET", label: "Showroom", means: "Bills customers from one showroom's stock, receives transfers, day closing.", needs: "outlet" },
  { role: "STORE_MANAGER", label: "Warehouse", means: "Stock, warehouse transfers and truck loading for one warehouse.", needs: "warehouse" },
  { role: "ASM", label: "Team manager", means: "Everyone reporting to them (and their teams): sales, attendance, leave and overtime approvals, dealer orders. For area / regional managers." },
  { role: "ACCOUNTANT", label: "Accounts", means: "Cash and bank books, dealer payments, expenses, P&L, payroll." },
  { role: "HR_MANAGER", label: "HR", means: "Employees, attendance, leave, documents, exits, payroll preparation." },
  { role: "BUSINESS_HEAD", label: "Senior management", means: "All business data; first signature on every approval." },
  { role: "MANAGING_PARTNER", label: "Managing partner", means: "Everything; final signature on every approval." },
];

/** Posts that exist from the start, one per access level, plus common extra designations. */
export const DEFAULT_POSTS: Array<{ name: string; code: string; accessRole: UserRole; description?: string }> = [
  { name: "Field Sales Executive", code: "FSE", accessRole: "FEC" },
  { name: "Area Sales Manager", code: "ASM", accessRole: "ASM" },
  { name: "Business Head", code: "BH", accessRole: "BUSINESS_HEAD" },
  { name: "Managing Partner", code: "MP", accessRole: "MANAGING_PARTNER" },
  { name: "System Administrator", code: "ADM", accessRole: "ADMIN" },
  { name: "HR Manager", code: "HR", accessRole: "HR_MANAGER" },
  { name: "Accounts Manager", code: "ACC", accessRole: "ACCOUNTANT" },
  { name: "Store Manager", code: "STR", accessRole: "STORE_MANAGER" },
  { name: "Showroom Executive", code: "OUT", accessRole: "OUTLET" },
  { name: "Showroom Manager", code: "SM", accessRole: "OUTLET", description: "Runs a company showroom: counter billing, stock and day closing." },
  { name: "Regional Manager", code: "RM", accessRole: "ASM", description: "Area managers report to the Regional Manager, who sees all their teams." },
  { name: "Clerk", code: "CLK", accessRole: "STAFF", description: "Office clerk." },
  { name: "Personal Assistant", code: "PA", accessRole: "STAFF", description: "Assistant to a senior manager." },
];

/** Creates the default posts once and links existing employees to the post of their role. */
export async function ensurePosts() {
  if (!(await Post.exists({}))) {
    try {
      await Post.insertMany(DEFAULT_POSTS.map((p) => ({ ...p, active: true, createdByName: "System" })), { ordered: false });
    } catch {
      // created concurrently
    }
  }
  const unlinked = await User.countDocuments({ post: null, role: { $in: [...EMPLOYEE_ROLES] } });
  if (unlinked) {
    const first = new Map<string, any>();
    for (const p of await Post.find().sort({ createdAt: 1 }).lean()) if (!first.has(p.accessRole)) first.set(p.accessRole, p._id);
    for (const [role, id] of first) await User.updateMany({ post: null, role }, { $set: { post: id } });
  }
}

export async function listPosts() {
  await ensurePosts();
  const [posts, counts] = await Promise.all([
    Post.find().populate("department", "name").sort({ active: -1, name: 1 }).lean(),
    User.aggregate([{ $match: { post: { $ne: null }, status: "ACTIVE" } }, { $group: { _id: "$post", n: { $sum: 1 } } }]),
  ]);
  const n = new Map(counts.map((c: any) => [String(c._id), c.n]));
  return posts.map((p: any) => ({ ...p, holders: n.get(String(p._id)) || 0 }));
}

export interface PostInput {
  name: string;
  code: string;
  accessRole: string;
  departmentId?: string | null;
  description?: string;
  active?: boolean;
}

/** Create or edit a post. Nobody can create a post above their own level. */
export async function savePost(user: JWTPayload, input: PostInput, id?: string) {
  await ensurePosts();
  const name = String(input.name || "").trim().replace(/\s+/g, " ");
  const code = String(input.code || "").trim().toUpperCase();
  if (name.length < 2) throw new PostError("Give the post a name");
  if (!/^[A-Z]{2,4}$/.test(code)) throw new PostError("ID prefix must be 2–4 capital letters, e.g. RM");
  const level = ACCESS_LEVELS.find((a) => a.role === input.accessRole) || (input.accessRole === "ADMIN" ? { role: "ADMIN" as UserRole } : null);
  if (!level) throw new PostError("Choose what this post can access");
  if (!canManageRole(user.role, level.role)) throw new PostError("You cannot create a post at or above your own level", 403);
  const dup = await Post.findOne({ ...(id && mongoose.isValidObjectId(id) ? { _id: { $ne: new mongoose.Types.ObjectId(id) } } : {}), $or: [{ code }, { name }] })
    .collation({ locale: "en", strength: 2 })
    .lean();
  if (dup) throw new PostError(dup.code === code ? `ID prefix ${code} is already used by "${dup.name}"` : `A post called "${dup.name}" already exists`, 409);
  const data: any = {
    name,
    code,
    accessRole: level.role,
    department: input.departmentId && mongoose.isValidObjectId(input.departmentId) ? new mongoose.Types.ObjectId(input.departmentId) : null,
    description: input.description?.trim(),
  };
  if (id) {
    if (!mongoose.isValidObjectId(id)) throw new PostError("Post not found", 404);
    const p = await Post.findById(id);
    if (!p) throw new PostError("Post not found", 404);
    if (!canManageRole(user.role, p.accessRole as UserRole)) throw new PostError("You cannot change a post at or above your own level", 403);
    const holders = await User.countDocuments({ post: p._id, status: "ACTIVE" });
    if (holders && p.accessRole !== level.role) {
      throw new PostError(`${holders} employee(s) hold this post. Create a new post with the other access and move them, so nobody's access changes by surprise.`);
    }
    const renamed = p.name !== name;
    Object.assign(p, data);
    if (input.active !== undefined) p.active = !!input.active;
    await p.save();
    // Holders carry the post name as their designation.
    if (renamed) await User.updateMany({ post: p._id }, { $set: { designation: name } });
    await logAudit({ user, action: "UPDATE", resource: "EMPLOYEE", resourceId: String(p._id), after: { post: name, code, access: level.role, active: p.active } });
    return p;
  }
  const p = await Post.create({ ...data, active: true, createdByName: user.name });
  await logAudit({ user, action: "CREATE", resource: "EMPLOYEE", resourceId: String(p._id), after: { post: name, code, access: level.role } });
  return p;
}

export async function deletePost(user: JWTPayload, id: string) {
  if (!mongoose.isValidObjectId(id)) throw new PostError("Post not found", 404);
  const p = await Post.findById(id);
  if (!p) throw new PostError("Post not found", 404);
  if (!canManageRole(user.role, p.accessRole as UserRole)) throw new PostError("Not allowed", 403);
  const ever = await User.countDocuments({ post: p._id });
  if (ever) throw new PostError(`${ever} employee(s) have held this post — switch it off instead of deleting, so their history stays.`);
  await p.deleteOne();
  await logAudit({ user, action: "DELETE", resource: "EMPLOYEE", resourceId: id, after: { post: p.name } });
  return { deleted: true };
}

/** The post to use for a new hire or a post change; must be active. */
export async function resolvePost(id: string) {
  if (!mongoose.isValidObjectId(id)) throw new PostError("Choose a post", 400);
  const p = await Post.findById(id).lean();
  if (!p) throw new PostError("Post not found", 404);
  if (!p.active) throw new PostError(`"${p.name}" is switched off`);
  return p;
}
