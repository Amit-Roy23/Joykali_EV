import { NextRequest } from "next/server";
import { connectToDatabase, withTransaction } from "@/lib/db";
import { User } from "@/models/User";
import { SalaryStructure } from "@/models/SalaryStructure";
import { ReportingHistory } from "@/models/ReportingHistory";
import { Sale } from "@/models/Sale";
import { IncentiveLedger } from "@/models/IncentiveLedger";
import { PayrollEntry } from "@/models/PayrollEntry";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { canManageRole } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "employee.view");
    if (auth.error) return auth.error;

    const { id } = await params;
    const user = await User.findById(id)
      .populate("reportsTo", "name employeeCode role")
      .populate("dealer", "name dealerCode")
      .select("-passwordHash")
      .lean();

    if (!user) return errorResponse("Employee not found", 404);

    const salary = await SalaryStructure.findOne({
      employee: user._id,
      isActive: true,
    })
      .sort({ effectiveFrom: -1 })
      .lean();

    const reportingHistory = await ReportingHistory.find({ employee: user._id })
      .populate("previousManager", "name employeeCode role")
      .populate("newManager", "name employeeCode role")
      .populate("changedBy", "name employeeCode")
      .sort({ changedAt: -1 })
      .lean();

    // Sales Performance summary
    const totalSalesCount = await Sale.countDocuments({
      soldBy: user._id,
      status: "DELIVERED",
    });

    const recentSales = await Sale.find({ soldBy: user._id })
      .populate("vehicle")
      .sort({ saleDate: -1 })
      .limit(5)
      .lean();

    // Incentive History
    const incentiveHistory = await IncentiveLedger.find({ employee: user._id })
      .sort({ period: -1 })
      .limit(6)
      .lean();

    // Recent Payslips
    const recentPayslips = await PayrollEntry.find({ employee: user._id })
      .populate("payrollRun", "runCode month year status")
      .sort({ createdAt: -1 })
      .limit(6)
      .lean();

    return jsonResponse({
      user,
      salary,
      reportingHistory,
      performance: {
        totalSalesCount,
        recentSales,
      },
      incentiveHistory,
      recentPayslips,
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch employee", 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "employee.manage");
    if (auth.error) return auth.error;

    const { id } = await params;
    const body = await req.json();

    const existingUser = await User.findById(id);
    if (!existingUser) return errorResponse("Employee not found", 404);

    // Hierarchy rule check
    if (!canManageRole(auth.user.role, existingUser.role)) {
      return errorResponse(
        `Hierarchy restriction: You cannot modify a user with role ${existingUser.role}`,
        403
      );
    }

    const beforeState = existingUser.toObject();

    await withTransaction(async (session) => {
      // 1. Check reporting manager change
      if (
        body.reportsTo !== undefined &&
        String(body.reportsTo || "") !== String(existingUser.reportsTo || "")
      ) {
        await ReportingHistory.create(
          [
            {
              employee: existingUser._id,
              previousManager: existingUser.reportsTo || null,
              newManager: new mongoose.Types.ObjectId(body.reportsTo),
              changedBy: new mongoose.Types.ObjectId(auth.user.userId),
              changedAt: new Date(),
              reason: body.reassignmentReason || "Manager reassignment",
            },
          ],
          { session }
        );
        existingUser.reportsTo = body.reportsTo ? new mongoose.Types.ObjectId(body.reportsTo) : null;
      }

      // 2. Update basic fields
      if (body.name) existingUser.name = body.name.trim();
      if (body.phone) existingUser.phone = body.phone.trim();
      if (body.designation) existingUser.designation = body.designation.trim();
      if (body.status) existingUser.status = body.status;
      if (body.dealer !== undefined) {
        existingUser.dealer = body.dealer ? new mongoose.Types.ObjectId(body.dealer) : null;
      }

      // Password reset by admin
      if (body.resetPassword) {
        existingUser.passwordHash = await hashPassword(body.resetPassword);
        existingUser.mustChangePassword = true;
      }

      await existingUser.save({ session });

      // 3. Update or version salary structure if provided
      if (body.salary) {
        await SalaryStructure.updateMany(
          { employee: existingUser._id },
          { $set: { isActive: false } },
          { session }
        );

        await SalaryStructure.create(
          [
            {
              employee: existingUser._id,
              basic: rupeesToPaise(body.salary.basic),
              hra: rupeesToPaise(body.salary.hra || 0),
              conveyance: rupeesToPaise(body.salary.conveyance || 0),
              otherAllowances: rupeesToPaise(body.salary.otherAllowances || 0),
              fixedDeductions: body.salary.fixedDeductions,
              bankDetails: body.salary.bankDetails,
              pan: body.salary.pan?.toUpperCase().trim(),
              effectiveFrom: new Date(),
              isActive: true,
            },
          ],
          { session }
        );
      }
    });

    await logAudit({
      user: auth.user,
      action: "UPDATE",
      resource: "EMPLOYEE",
      resourceId: String(existingUser._id),
      before: beforeState,
      after: existingUser.toObject(),
    });

    return jsonResponse(existingUser);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to update employee", 500);
  }
}

