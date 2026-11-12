import {
  IIncentiveRule,
  IIncentiveScheme,
  ISlabTier,
} from "@/models/IncentiveScheme";
import { UserRole } from "@/types";

export interface SaleItemForIncentive {
  _id: string;
  saleCode: string;
  saleDate: Date;
  soldBy: string; // FEC id
  asmAtSale?: string | null; // ASM id
  modelId: string;
  dealerId?: string | null;
  exShowroom: number; // in paise (ex-GST / base value)
  totalAmount: number; // in paise
  status: "BOOKED" | "DELIVERED" | "CANCELLED";
}

export interface EmployeeInfoForIncentive {
  _id: string;
  employeeCode: string;
  name: string;
  role: UserRole;
  reportsTo?: string | null;
}

export interface RuleCalculationResult {
  ruleType: string;
  qualifyingUnits: number;
  qualifyingRevenue: number; // in paise
  earnedAmount: number; // in paise
  description: string;
  qualifyingSaleCodes: string[];
}

export interface SchemeCalculationResult {
  schemeId: string;
  schemeName: string;
  totalEarned: number; // in paise
  rulesBreakdown: RuleCalculationResult[];
}

export interface IncentiveCalculationOutput {
  employeeId: string;
  employeeCode: string;
  totalIncentiveEarned: number; // in paise
  schemes: SchemeCalculationResult[];
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Check if a sale matches scheme criteria (validity, models, dealers, delivered status)
 */
export function isSaleQualifyingForScheme(
  sale: SaleItemForIncentive,
  scheme: {
    validFrom: Date;
    validTo: Date;
    applicableModels?: string[];
    applicableDealers?: string[];
  }
): boolean {
  if (sale.status !== "DELIVERED") {
    return false;
  }

  const sDate = new Date(sale.saleDate).getTime();
  const vStart = new Date(scheme.validFrom).getTime();
  const vEnd = new Date(scheme.validTo).getTime();

  if (sDate < vStart || sDate > vEnd) {
    return false;
  }

  if (
    scheme.applicableModels &&
    scheme.applicableModels.length > 0 &&
    !scheme.applicableModels.map(String).includes(String(sale.modelId))
  ) {
    return false;
  }

  if (
    scheme.applicableDealers &&
    scheme.applicableDealers.length > 0 &&
    (!sale.dealerId ||
      !scheme.applicableDealers.map(String).includes(String(sale.dealerId)))
  ) {
    return false;
  }

  return true;
}

/**
 * Calculate Slab Tier incentive
 */
export function calculateSlabIncentive(
  slabs: ISlabTier[],
  totalUnits: number,
  applicationType: "ALL_UNITS" | "INCREMENTAL" = "ALL_UNITS"
): { earned: number; matchingTier?: ISlabTier } {
  if (!slabs || slabs.length === 0 || totalUnits <= 0) {
    return { earned: 0 };
  }

  // Sort slabs ascending by minUnits
  const sorted = [...slabs].sort((a, b) => a.minUnits - b.minUnits);

  if (applicationType === "ALL_UNITS") {
    // Find the highest slab where totalUnits >= minUnits
    let matchedTier: ISlabTier | undefined;
    for (const slab of sorted) {
      if (totalUnits >= slab.minUnits) {
        if (slab.maxUnits == null || totalUnits <= slab.maxUnits) {
          matchedTier = slab;
          break;
        } else if (totalUnits > slab.maxUnits) {
          // If total units exceed this slab, keep as current match until higher matches
          matchedTier = slab;
        }
      }
    }

    if (!matchedTier) {
      return { earned: 0 };
    }

    return {
      earned: totalUnits * matchedTier.amountPerUnit,
      matchingTier: matchedTier,
    };
  } else {
    // INCREMENTAL: calculate piece-wise for each slab tier
    let earned = 0;
    for (const slab of sorted) {
      if (totalUnits < slab.minUnits) continue;

      const upperLimit = slab.maxUnits != null ? slab.maxUnits : totalUnits;
      const lowerLimit = slab.minUnits;

      if (totalUnits >= lowerLimit) {
        const unitsInThisSlab = Math.min(totalUnits, upperLimit) - lowerLimit + 1;
        if (unitsInThisSlab > 0) {
          earned += unitsInThisSlab * slab.amountPerUnit;
        }
      }
    }
    return { earned };
  }
}

/**
 * Pure, unit-testable incentive engine function
 */
export function computeIncentives(
  employee: EmployeeInfoForIncentive,
  sales: SaleItemForIncentive[],
  schemes: Array<IIncentiveScheme | any>,
  periodStart: Date,
  periodEnd: Date
): IncentiveCalculationOutput {
  const pStartTime = new Date(periodStart).getTime();
  const pEndTime = new Date(periodEnd).getTime();

  // Filter sales within the accounting period
  const periodSales = sales.filter((s) => {
    const time = new Date(s.saleDate).getTime();
    return time >= pStartTime && time <= pEndTime;
  });

  const schemeResults: SchemeCalculationResult[] = [];
  let totalIncentiveEarned = 0;

  for (const scheme of schemes) {
    // EXPIRED schemes still pay out for sales inside their validity window.
    if (scheme.status !== "ACTIVE" && scheme.status !== "EXPIRED") continue;

    // Check if role is applicable
    if (
      scheme.applicableRoles &&
      scheme.applicableRoles.length > 0 &&
      !scheme.applicableRoles.includes(employee.role)
    ) {
      continue;
    }

    // Check if specific employee filter is set
    if (
      scheme.applicableEmployees &&
      scheme.applicableEmployees.length > 0 &&
      !scheme.applicableEmployees.map(String).includes(String(employee._id))
    ) {
      continue;
    }

    // Determine relevant sales for this employee and scheme
    let relevantSales: SaleItemForIncentive[] = [];

    if (employee.role === "FEC") {
      // Direct personal sales by this FEC
      relevantSales = periodSales.filter(
        (s) => String(s.soldBy) === String(employee._id)
      );
    } else if (employee.role === "ASM") {
      // Direct sales by ASM or team sales attributed to this ASM at sale time
      relevantSales = periodSales.filter(
        (s) =>
          String(s.soldBy) === String(employee._id) ||
          String(s.asmAtSale) === String(employee._id)
      );
    } else {
      // Business Head / MP
      relevantSales = periodSales;
    }

    // Filter by scheme criteria
    const qualifyingSales = relevantSales.filter((s) =>
      isSaleQualifyingForScheme(s, {
        validFrom: scheme.validFrom,
        validTo: scheme.validTo,
        applicableModels: scheme.applicableModels,
        applicableDealers: scheme.applicableDealers,
      })
    );

    const rulesBreakdown: RuleCalculationResult[] = [];
    let schemeTotal = 0;

    for (const rule of scheme.rules as IIncentiveRule[]) {
      if (rule.ruleType === "PER_UNIT") {
        // Only count personal sales for FEC / direct sales
        const personalQualifying = qualifyingSales.filter(
          (s) => String(s.soldBy) === String(employee._id)
        );

        let earned = 0;
        const qualifyingCodes: string[] = [];

        for (const sale of personalQualifying) {
          qualifyingCodes.push(sale.saleCode);
          let unitAmount = rule.perUnitAmount || 0;

          // Check model-specific override if any
          if (rule.modelSpecificAmounts && rule.modelSpecificAmounts.length > 0) {
            const specific = rule.modelSpecificAmounts.find(
              (m: any) => String(m.model) === String(sale.modelId)
            );
            if (specific) {
              unitAmount = specific.amount;
            }
          }
          earned += unitAmount;
        }

        schemeTotal += earned;
        rulesBreakdown.push({
          ruleType: "PER_UNIT",
          qualifyingUnits: personalQualifying.length,
          qualifyingRevenue: personalQualifying.reduce(
            (sum, s) => sum + s.exShowroom,
            0
          ),
          earnedAmount: earned,
          description: `Per-unit incentive: ${personalQualifying.length} vehicles`,
          qualifyingSaleCodes: qualifyingCodes,
        });
      } else if (rule.ruleType === "SLAB") {
        const personalQualifying = qualifyingSales.filter(
          (s) => String(s.soldBy) === String(employee._id)
        );
        const units = personalQualifying.length;

        const { earned, matchingTier } = calculateSlabIncentive(
          rule.slabs || [],
          units,
          rule.slabApplication
        );

        schemeTotal += earned;
        const tierDesc = matchingTier
          ? `(Tier: ${matchingTier.minUnits}${matchingTier.maxUnits ? "-" + matchingTier.maxUnits : "+"} @ ₹${matchingTier.amountPerUnit / 100}/unit)`
          : "";

        rulesBreakdown.push({
          ruleType: "SLAB",
          qualifyingUnits: units,
          qualifyingRevenue: personalQualifying.reduce(
            (sum, s) => sum + s.exShowroom,
            0
          ),
          earnedAmount: earned,
          description: `Slab incentive (${rule.slabApplication}): ${units} vehicles ${tierDesc}`.trim(),
          qualifyingSaleCodes: personalQualifying.map((s) => s.saleCode),
        });
      } else if (rule.ruleType === "TARGET_BONUS") {
        const personalQualifying = qualifyingSales.filter(
          (s) => String(s.soldBy) === String(employee._id)
        );
        const units = personalQualifying.length;
        const revenue = personalQualifying.reduce(
          (sum, s) => sum + s.exShowroom,
          0
        );

        let targetHit = true;
        if (rule.targetUnits && units < rule.targetUnits) {
          targetHit = false;
        }
        if (rule.targetRevenue && revenue < rule.targetRevenue) {
          targetHit = false;
        }

        const earned = targetHit ? rule.targetBonusAmount || 0 : 0;
        schemeTotal += earned;

        rulesBreakdown.push({
          ruleType: "TARGET_BONUS",
          qualifyingUnits: units,
          qualifyingRevenue: revenue,
          earnedAmount: earned,
          description: targetHit
            ? `Target achieved! Bonus granted.`
            : `Target not met (${units}/${rule.targetUnits || "-"} units).`,
          qualifyingSaleCodes: personalQualifying.map((s) => s.saleCode),
        });
      } else if (rule.ruleType === "PERCENTAGE") {
        const personalQualifying = qualifyingSales.filter(
          (s) => String(s.soldBy) === String(employee._id)
        );
        const totalBaseRevenue = personalQualifying.reduce(
          (sum, s) => sum + s.exShowroom,
          0
        );
        const rate = (rule.percentageRate || 0) / 100;
        const earned = Math.round(totalBaseRevenue * rate);

        schemeTotal += earned;
        rulesBreakdown.push({
          ruleType: "PERCENTAGE",
          qualifyingUnits: personalQualifying.length,
          qualifyingRevenue: totalBaseRevenue,
          earnedAmount: earned,
          description: `${rule.percentageRate}% on ex-showroom revenue`,
          qualifyingSaleCodes: personalQualifying.map((s) => s.saleCode),
        });
      } else if (rule.ruleType === "TEAM_OVERRIDE") {
        // Relevant only if ASM has team sales
        const teamSales = qualifyingSales.filter(
          (s) =>
            String(s.asmAtSale) === String(employee._id) &&
            String(s.soldBy) !== String(employee._id)
        );

        let earned = 0;
        const teamUnits = teamSales.length;
        const teamRevenue = teamSales.reduce((sum, s) => sum + s.exShowroom, 0);

        if (rule.teamOverridePerUnit) {
          earned += teamUnits * rule.teamOverridePerUnit;
        }
        if (rule.teamOverridePercentage) {
          earned += Math.round(
            teamRevenue * ((rule.teamOverridePercentage || 0) / 100)
          );
        }

        schemeTotal += earned;
        rulesBreakdown.push({
          ruleType: "TEAM_OVERRIDE",
          qualifyingUnits: teamUnits,
          qualifyingRevenue: teamRevenue,
          earnedAmount: earned,
          description: `Team override on ${teamUnits} FEC team sales`,
          qualifyingSaleCodes: teamSales.map((s) => s.saleCode),
        });
      }
    }

    totalIncentiveEarned += schemeTotal;
    schemeResults.push({
      schemeId: String(scheme._id || scheme.name),
      schemeName: scheme.name,
      totalEarned: schemeTotal,
      rulesBreakdown,
    });
  }

  return {
    employeeId: String(employee._id),
    employeeCode: employee.employeeCode,
    totalIncentiveEarned,
    schemes: schemeResults,
    periodStart,
    periodEnd,
  };
}

