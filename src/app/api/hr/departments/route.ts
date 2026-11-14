import { handle } from "@/lib/route";
import { Department } from "@/models/Hr";
import { User } from "@/models/User";
import { upsertDepartment } from "@/services/hrService";

export const GET = handle(async () => {
  const deps = await Department.find().populate("head", "name employeeCode").sort({ name: 1 }).lean();
  const counts = await User.aggregate([{ $match: { status: "ACTIVE", department: { $ne: null } } }, { $group: { _id: "$department", n: { $sum: 1 } } }]);
  return deps.map((d: any) => ({ ...d, headcount: counts.find((c: any) => String(c._id) === String(d._id))?.n || 0 }));
});
export const POST = handle(async ({ req, user }) => upsertDepartment(user, await req.json()), "hr.manage");
