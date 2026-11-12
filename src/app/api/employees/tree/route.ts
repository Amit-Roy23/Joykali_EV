import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models/User";
import { authenticateAndAuthorize, jsonResponse, errorResponse } from "@/lib/apiHelper";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "employee.view");
    if (auth.error) return auth.error;

    // Fetch all active employees
    const employees = await User.find({ status: "ACTIVE" })
      .select("name employeeCode role designation reportsTo email phone")
      .lean();

    // Build hierarchy tree starting from Top (ADMIN / MANAGING_PARTNER / BUSINESS_HEAD)
    const empMap = new Map<string, any>();
    employees.forEach((emp: any) => {
      empMap.set(String(emp._id), { ...emp, subordinates: [] });
    });

    const roots: any[] = [];

    employees.forEach((emp: any) => {
      const current = empMap.get(String(emp._id));
      if (emp.reportsTo && empMap.has(String(emp.reportsTo))) {
        empMap.get(String(emp.reportsTo)).subordinates.push(current);
      } else {
        roots.push(current);
      }
    });

    // ASMs and FECs only see their own branch of the organisation.
    if (auth.user.role === "FEC" || auth.user.role === "ASM") {
      const own = empMap.get(String(auth.user.userId));
      return jsonResponse(own ? [own] : []);
    }

    return jsonResponse(roots);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch org tree", 500);
  }
}

