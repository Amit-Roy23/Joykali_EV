import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { IncentiveLedger } from "@/models/IncentiveLedger";
import { IncentiveScheme } from "@/models/IncentiveScheme";
import { Sale } from "@/models/Sale";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";
import mongoose from "mongoose";

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const userObjectId = new mongoose.Types.ObjectId(auth.user.userId);

    const ledger = await IncentiveLedger.findOne({
      employee: userObjectId,
      period: currentPeriod,
    }).lean();

    // Fetch active schemes applicable to this user's role
    const activeSchemes = await IncentiveScheme.find({
      status: "ACTIVE",
      applicableRoles: auth.user.role,
      validFrom: { $lte: now },
      validTo: { $gte: now },
    }).lean();

    // Personal sales count this month
    const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const endOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));

    const salesThisMonth = await Sale.find({
      soldBy: userObjectId,
      saleDate: { $gte: startOfMonth, $lte: endOfMonth },
      status: "DELIVERED",
    })
      .populate("vehicle")
      .lean();

    const unitsSold = salesThisMonth.length;

    // Calculate progress toward next slab for each active SLAB scheme
    const slabProgress: any[] = [];
    for (const scheme of activeSchemes) {
      for (const rule of scheme.rules) {
        if (rule.ruleType === "SLAB" && rule.slabs && rule.slabs.length > 0) {
          const sorted = [...rule.slabs].sort((a, b) => a.minUnits - b.minUnits);
          let currentTier = null;
          let nextTier = null;

          for (let i = 0; i < sorted.length; i++) {
            const tier = sorted[i];
            if (unitsSold >= tier.minUnits) {
              currentTier = tier;
              nextTier = sorted[i + 1] || null;
            } else if (!nextTier) {
              nextTier = tier;
              break;
            }
          }

          slabProgress.push({
            schemeName: scheme.name,
            currentUnits: unitsSold,
            currentTier,
            nextTier,
            unitsNeededForNextTier: nextTier ? Math.max(0, nextTier.minUnits - unitsSold) : 0,
            percentToNextTier: nextTier ? Math.min(100, Math.round((unitsSold / nextTier.minUnits) * 100)) : 100,
          });
        }
      }
    }

    return jsonResponse({
      period: currentPeriod,
      totalEarned: ledger ? ledger.totalEarned : 0,
      totalUnits: unitsSold,
      breakdown: ledger?.breakdown || [],
      slabProgress,
      activeSchemes,
      salesThisMonth,
    });
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch incentive data", 500);
  }
}

