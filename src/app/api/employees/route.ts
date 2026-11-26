import { isValidObjectId } from "mongoose";
import { Outlet } from "@/models/Outlet";
import { Warehouse } from "@/models/Warehouse";
import { resolvePost } from "@/services/postService";
import { EMPLOYEE_ROLES } from "@/types";
import { NextRequest } from "next/server";
import { periodOf } from "@/lib/period";
import { connectToDatabase, withTransaction } from "@/lib/db";
import { User } from "@/models/User";
import { SalaryStructure } from "@/models/SalaryStructure";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { EmployeeCreateSchema } from "@/validators";
import { generateEmployeeCode } from "@/lib/codeGenerator";
import { hashPassword } from "@/lib/auth";
import { canManageRole, getScopeFilter } from "@/lib/rbac";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "employee.view");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10")));
    const search = searchParams.get("search")?.trim() || "";
    const role = searchParams.get("role");
    const status = searchParams.get("status");

    // Scoping filter
    const scopeFilter = await getScopeFilter(auth.user, "employees");

    // Distributor logins are managed under Distributors, not in the employee list.
    const query: any = { $and: [scopeFilter, { role: { $in: [...EMPLOYEE_ROLES] } }] };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { employeeCode: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    if (role && role !== "DISTRIBUTOR") query.$and.push({ role });
    const post = searchParams.get("post");
    if (post && /^[a-f0-9]{24}$/i.test(post)) query.$and.push({ post: new (await import("mongoose")).Types.ObjectId(post) });
    if (status) query.status = status;
    const territory = searchParams.get("territory");
    if (territory && /^[a-f0-9]{24}$/i.test(territory)) {
      const { Territory } = await import("@/models/Territory");
      const mg = await import("mongoose");
      const kids = await Territory.find({ parent: territory }).select("_id").lean();
      query.$and.push({ territories: { $in: [new mg.Types.ObjectId(territory), ...kids.map((k: any) => k._id)] } });
    }

    const total = await User.countDocuments(query);
    const employees = await User.find(query)
      .populate("reportsTo", "name employeeCode role")
      .populate("dealer", "name dealerCode")
      .populate("post", "name code accessRole")
      .populate("territories", "name code kind")
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return jsonResponse(employees, {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch employees", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "employee.manage");
    if (auth.error) return auth.error;

    const body = await req.json();
    const parseResult = EmployeeCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const data: any = parseResult.data;
    // The post decides the access level, the designation and the employee-ID prefix.
    let post: any = null;
    if (data.postId) {
      post = await resolvePost(data.postId).catch((e: any) => {
        throw Object.assign(new Error(e.message), { status: e.status || 400 });
      });
      data.role = post.accessRole;
      data.designation = data.designation?.trim() || post.name;
    }
    if (!data.role) return errorResponse("Choose the post", 400);
    if (!data.designation?.trim() || data.designation.trim().length < 2) return errorResponse("Designation is required", 400);
    let outlet: any = null;
    let warehouse: any = null;
    if (data.role === "OUTLET") {
      if (!data.outletId || !isValidObjectId(data.outletId)) return errorResponse("Choose the showroom this person works at", 400);
      outlet = await Outlet.findById(data.outletId).select("_id status").lean();
      if (!outlet || outlet.status !== "ACTIVE") return errorResponse("Showroom not found or closed", 400);
    }
    if (data.role === "STORE_MANAGER") {
      if (!data.warehouseId || !isValidObjectId(data.warehouseId)) return errorResponse("Choose the warehouse this person runs", 400);
      warehouse = await Warehouse.findById(data.warehouseId).select("_id status").lean();
      if (!warehouse || warehouse.status !== "ACTIVE") return errorResponse("Warehouse not found or closed", 400);
    }

    // Hierarchy rule check
    if (!canManageRole(auth.user.role, data.role)) {
      return errorResponse(
        `Hierarchy restriction: A ${auth.user.role} cannot create a user with role ${data.role}`,
        403
      );
    }

    // Check duplicate email
    const existing = await User.findOne({ email: data.email.toLowerCase() });
    if (existing) {
      return errorResponse("An employee with this email already exists", 400);
    }

    const defaultPassword = data.password || "Joykali@123";
    const passwordHash = await hashPassword(defaultPassword);

    const result = await withTransaction(async (session) => {
      const employeeCode = await generateEmployeeCode(data.role, session, post?.code);

      const userDocs = await User.create(
        [
          {
            employeeCode,
            name: data.name.trim(),
            email: data.email.toLowerCase().trim(),
            phone: data.phone.trim(),
            role: data.role,
            reportsTo: data.reportsTo ? new mongoose.Types.ObjectId(data.reportsTo) : null,
            dealer: data.dealer ? new mongoose.Types.ObjectId(data.dealer) : null,
            designation: data.designation.trim(),
            post: post?._id || null,
            outlet: outlet?._id || null,
            warehouse: warehouse?._id || null,
            department: post?.department || null,
            joiningDate: new Date(data.joiningDate),
            status: "ACTIVE",
            passwordHash,
            mustChangePassword: true, // Force password change on first login
          },
        ],
        { session }
      );
      const newUser = userDocs[0];

      // Create initial salary structure
      await SalaryStructure.create(
        [
          {
            employee: newUser._id,
            basic: rupeesToPaise(data.salary.basic),
            hra: rupeesToPaise(data.salary.hra),
            conveyance: rupeesToPaise(data.salary.conveyance),
            otherAllowances: rupeesToPaise(data.salary.otherAllowances),
            fixedDeductions: data.salary.fixedDeductions,
            bankDetails: data.salary.bankDetails,
            pan: data.salary.pan.toUpperCase().trim(),
            // Effective from the 1st of the joining month; not paid until BH + MP approve it.
            effectiveFrom: periodOf(new Date(data.joiningDate)).start,
            isActive: false,
            status: "PENDING_APPROVAL",
            approvals: [],
            grossMonthly:
              rupeesToPaise(data.salary.basic) +
              rupeesToPaise(data.salary.hra) +
              rupeesToPaise(data.salary.conveyance) +
              rupeesToPaise(data.salary.otherAllowances),
            reason: "Joining salary",
            proposedBy: new mongoose.Types.ObjectId(auth.user.userId),
          },
        ],
        { session }
      );

      return newUser;
    });

    await logAudit({
      user: auth.user,
      action: "CREATE",
      resource: "EMPLOYEE",
      resourceId: String(result._id),
      after: { employeeCode: result.employeeCode, role: result.role, name: result.name },
    });

    return jsonResponse(result, undefined, 201);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to create employee", typeof error?.status === "number" ? error.status : 500);
  }
}

