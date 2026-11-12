import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { IncentiveScheme } from "@/models/IncentiveScheme";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import { IncentiveSchemeCreateSchema } from "@/validators";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/lib/audit";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "scheme.view");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const query: any = {};
    if (status) query.status = status;

    const schemes = await IncentiveScheme.find(query)
      .populate("applicableModels", "name variant")
      .populate("applicableDealers", "name dealerCode")
      .populate("approvedBy", "name employeeCode")
      .sort({ createdAt: -1 })
      .lean();

    return jsonResponse(schemes);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch schemes", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "scheme.create");
    if (auth.error) return auth.error;

    const body = await req.json();
    const parseResult = IncentiveSchemeCreateSchema.safeParse(body);
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0].message, 400);
    }

    const data = parseResult.data;

    // Convert money amounts in rules to paise
    const formattedRules = data.rules.map((rule) => {
      const r: any = { ...rule };
      if (r.perUnitAmount !== undefined) {
        r.perUnitAmount = rupeesToPaise(r.perUnitAmount);
      }
      if (r.modelSpecificAmounts) {
        r.modelSpecificAmounts = r.modelSpecificAmounts.map((m: any) => ({
          model: new mongoose.Types.ObjectId(m.model),
          amount: rupeesToPaise(m.amount),
        }));
      }
      if (r.slabs) {
        r.slabs = r.slabs.map((s: any) => ({
          minUnits: s.minUnits,
          maxUnits: s.maxUnits,
          amountPerUnit: rupeesToPaise(s.amountPerUnit),
        }));
      }
      if (r.targetBonusAmount !== undefined) {
        r.targetBonusAmount = rupeesToPaise(r.targetBonusAmount);
      }
      if (r.targetRevenue !== undefined) {
        r.targetRevenue = rupeesToPaise(r.targetRevenue);
      }
      if (r.teamOverridePerUnit !== undefined) {
        r.teamOverridePerUnit = rupeesToPaise(r.teamOverridePerUnit);
      }
      return r;
    });

    const scheme = await IncentiveScheme.create({
      name: data.name.trim(),
      description: data.description?.trim(),
      status: "DRAFT", // New schemes start as DRAFT
      validFrom: new Date(data.validFrom),
      validTo: new Date(data.validTo),
      applicableRoles: data.applicableRoles,
      applicableEmployees: data.applicableEmployees?.map((id) => new mongoose.Types.ObjectId(id)),
      applicableModels: data.applicableModels?.map((id) => new mongoose.Types.ObjectId(id)),
      applicableDealers: data.applicableDealers?.map((id) => new mongoose.Types.ObjectId(id)),
      rules: formattedRules,
      version: 1,
    });

    await logAudit({
      user: auth.user,
      action: "CREATE",
      resource: "SCHEME",
      resourceId: String(scheme._id),
      after: { name: scheme.name, status: scheme.status },
    });

    return jsonResponse(scheme, undefined, 201);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to create scheme", 500);
  }
}

