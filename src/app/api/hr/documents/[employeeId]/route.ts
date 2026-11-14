import { handle, fileFrom } from "@/lib/route";
import { hasPermission } from "@/lib/rbac";
import { EmployeeDocument } from "@/models/Hr";
import { HrError } from "@/services/hrService";
import { uploadEmployeeDoc } from "@/services/hrMoneyService";

export const GET = handle(async ({ user, params }) => {
  if (params.employeeId !== user.userId && !(await hasPermission(user.role, "hr.manage"))) throw new HrError("Not allowed", 403);
  return EmployeeDocument.find({ employee: params.employeeId }).sort({ createdAt: -1 }).lean();
}, "hr.self");

export const POST = handle(async ({ req, user, params }) => {
  const f = await req.formData();
  return uploadEmployeeDoc(user, params.employeeId, { docType: String(f.get("docType") || ""), number: String(f.get("number") || ""), file: await fileFrom(f, "file") });
}, "hr.self");
