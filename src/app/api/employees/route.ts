import { NextRequest } from "next/server";
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

    const query: any = { ...scopeFilter };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { employeeCode: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }
    if (role) query.role = role;
    if (status) query.status = status;

    const total = await User.countDocuments(query);
    const employees = await User.find(query)
      .populate("reportsTo", "name employeeCode role")
      .populate("dealer", "name dealerCode")
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

    const data = parseResult.data;

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
      const employeeCode = await generateEmployeeCode(data.role, session);

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
            effectiveFrom: new Date(data.joiningDate),
            isActive: true,
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
    return errorResponse(error.message || "Failed to create employee", 500);
  }
}

