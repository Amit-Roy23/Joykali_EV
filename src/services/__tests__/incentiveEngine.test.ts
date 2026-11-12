import { describe, it, expect } from "vitest";
import {
  computeIncentives,
  calculateSlabIncentive,
  SaleItemForIncentive,
  EmployeeInfoForIncentive,
} from "../incentiveEngine";
import { ISlabTier } from "@/models/IncentiveScheme";

describe("Incentive Engine", () => {
  const periodStart = new Date("2026-11-01T00:00:00Z");
  const periodEnd = new Date("2026-11-30T23:59:59Z");

  const fecUser: EmployeeInfoForIncentive = {
    _id: "emp-fec-1",
    employeeCode: "JKE-FEC-0001",
    name: "Ramesh Kumar",
    role: "FEC",
    reportsTo: "emp-asm-1",
  };

  const asmUser: EmployeeInfoForIncentive = {
    _id: "emp-asm-1",
    employeeCode: "JKE-ASM-0001",
    name: "Subhash Bose",
    role: "ASM",
    reportsTo: "emp-bh-1",
  };

  describe("Slab calculation (Pure)", () => {
    const slabs: ISlabTier[] = [
      { minUnits: 1, maxUnits: 5, amountPerUnit: 50000 }, // ₹500
      { minUnits: 6, maxUnits: 10, amountPerUnit: 80000 }, // ₹800
      { minUnits: 11, maxUnits: null, amountPerUnit: 120000 }, // ₹1200
    ];

    it("calculates ALL_UNITS correctly for 5 units (edge of slab 1)", () => {
      const res = calculateSlabIncentive(slabs, 5, "ALL_UNITS");
      // 5 * 500 = ₹2,500 = 250000 paise
      expect(res.earned).toBe(250000);
    });

    it("calculates ALL_UNITS correctly for 6 units (edge of slab 2)", () => {
      const res = calculateSlabIncentive(slabs, 6, "ALL_UNITS");
      // 6 * 800 = ₹4,800 = 480000 paise
      expect(res.earned).toBe(480000);
    });

    it("calculates ALL_UNITS correctly for 12 units (slab 3)", () => {
      const res = calculateSlabIncentive(slabs, 12, "ALL_UNITS");
      // 12 * 1200 = ₹14,400 = 1440000 paise
      expect(res.earned).toBe(1440000);
    });

    it("calculates INCREMENTAL correctly for 8 units", () => {
      const res = calculateSlabIncentive(slabs, 8, "INCREMENTAL");
      // Units 1-5 (5 units) * 500 = 2500
      // Units 6-8 (3 units) * 800 = 2400
      // Total: 4900 = 490000 paise
      expect(res.earned).toBe(490000);
    });
  });

  describe("PER_UNIT Scheme", () => {
    it("computes per-unit incentive including model-specific overrides", () => {
      const scheme = {
        _id: "scheme-1",
        name: "Standard Per Unit",
        status: "ACTIVE",
        validFrom: periodStart,
        validTo: periodEnd,
        applicableRoles: ["FEC"],
        rules: [
          {
            ruleType: "PER_UNIT",
            perUnitAmount: 100000, // ₹1,000
            modelSpecificAmounts: [
              { model: "model-premium", amount: 150000 }, // ₹1,500
            ],
          },
        ],
      };

      const sales: SaleItemForIncentive[] = [
        {
          _id: "s1",
          saleCode: "JKS/2026-27/0001",
          saleDate: new Date("2026-11-05"),
          soldBy: "emp-fec-1",
          modelId: "model-basic",
          exShowroom: 7500000,
          totalAmount: 8500000,
          status: "DELIVERED",
        },
        {
          _id: "s2",
          saleCode: "JKS/2026-27/0002",
          saleDate: new Date("2026-11-10"),
          soldBy: "emp-fec-1",
          modelId: "model-premium",
          exShowroom: 12000000,
          totalAmount: 13500000,
          status: "DELIVERED",
        },
      ];

      const res = computeIncentives(fecUser, sales, [scheme], periodStart, periodEnd);
      // ₹1,000 + ₹1,500 = ₹2,500 = 250000 paise
      expect(res.totalIncentiveEarned).toBe(250000);
    });
  });

  describe("TARGET_BONUS & PERCENTAGE Schemes", () => {
    it("awards target bonus only when target units threshold is reached", () => {
      const scheme = {
        _id: "scheme-target",
        name: "Monthly Sprint Bonus",
        status: "ACTIVE",
        validFrom: periodStart,
        validTo: periodEnd,
        applicableRoles: ["FEC"],
        rules: [
          {
            ruleType: "TARGET_BONUS",
            targetUnits: 3,
            targetBonusAmount: 500000, // ₹5,000
          },
        ],
      };

      const twoSales: SaleItemForIncentive[] = [
        {
          _id: "s1",
          saleCode: "JKS/2026-27/0001",
          saleDate: new Date("2026-11-05"),
          soldBy: "emp-fec-1",
          modelId: "m1",
          exShowroom: 8000000,
          totalAmount: 8000000,
          status: "DELIVERED",
        },
        {
          _id: "s2",
          saleCode: "JKS/2026-27/0002",
          saleDate: new Date("2026-11-08"),
          soldBy: "emp-fec-1",
          modelId: "m1",
          exShowroom: 8000000,
          totalAmount: 8000000,
          status: "DELIVERED",
        },
      ];

      // 2 units: should not get bonus
      const resUnmet = computeIncentives(fecUser, twoSales, [scheme], periodStart, periodEnd);
      expect(resUnmet.totalIncentiveEarned).toBe(0);

      // Add 3rd sale: should trigger ₹5,000 bonus
      const threeSales = [
        ...twoSales,
        {
          _id: "s3",
          saleCode: "JKS/2026-27/0003",
          saleDate: new Date("2026-11-12"),
          soldBy: "emp-fec-1",
          modelId: "m1",
          exShowroom: 8000000,
          totalAmount: 8000000,
          status: "DELIVERED",
        } as SaleItemForIncentive,
      ];
      const resMet = computeIncentives(fecUser, threeSales, [scheme], periodStart, periodEnd);
      expect(resMet.totalIncentiveEarned).toBe(500000);
    });

    it("calculates percentage rate on ex-showroom amount", () => {
      const scheme = {
        _id: "scheme-pct",
        name: "Commission Rate",
        status: "ACTIVE",
        validFrom: periodStart,
        validTo: periodEnd,
        applicableRoles: ["FEC"],
        rules: [
          {
            ruleType: "PERCENTAGE",
            percentageRate: 2, // 2%
          },
        ],
      };

      const sales: SaleItemForIncentive[] = [
        {
          _id: "s1",
          saleCode: "JKS/2026-27/0001",
          saleDate: new Date("2026-11-05"),
          soldBy: "emp-fec-1",
          modelId: "m1",
          exShowroom: 10000000, // ₹1,00,000 = 10000000 paise
          totalAmount: 11000000,
          status: "DELIVERED",
        },
      ];

      const res = computeIncentives(fecUser, sales, [scheme], periodStart, periodEnd);
      // 2% of 10000000 = 200000 paise (₹2,000)
      expect(res.totalIncentiveEarned).toBe(200000);
    });
  });

  describe("Cancellations handling", () => {
    it("excludes CANCELLED sales from incentive counts", () => {
      const scheme = {
        _id: "scheme-slab",
        name: "FEC Slab",
        status: "ACTIVE",
        validFrom: periodStart,
        validTo: periodEnd,
        applicableRoles: ["FEC"],
        rules: [
          {
            ruleType: "SLAB",
            slabApplication: "ALL_UNITS",
            slabs: [
              { minUnits: 1, maxUnits: 1, amountPerUnit: 50000 },
              { minUnits: 2, maxUnits: null, amountPerUnit: 100000 },
            ],
          },
        ],
      };

      const sales: SaleItemForIncentive[] = [
        {
          _id: "s1",
          saleCode: "JKS/2026-27/0001",
          saleDate: new Date("2026-11-05"),
          soldBy: "emp-fec-1",
          modelId: "m1",
          exShowroom: 5000000,
          totalAmount: 5500000,
          status: "DELIVERED",
        },
        {
          _id: "s2",
          saleCode: "JKS/2026-27/0002",
          saleDate: new Date("2026-11-10"),
          soldBy: "emp-fec-1",
          modelId: "m1",
          exShowroom: 5000000,
          totalAmount: 5500000,
          status: "CANCELLED", // Was cancelled!
        },
      ];

      const res = computeIncentives(fecUser, sales, [scheme], periodStart, periodEnd);
      // Only 1 delivered unit qualifies, tier 1 = ₹500 (50000 paise)
      expect(res.totalIncentiveEarned).toBe(50000);
    });
  });

  describe("FEC Mid-Month Reassignment and ASM Team Override", () => {
    it("correctly attributes team override based on asmAtSale for reassigned FEC", () => {
      const asmScheme = {
        _id: "asm-override",
        name: "ASM Team Override",
        status: "ACTIVE",
        validFrom: periodStart,
        validTo: periodEnd,
        applicableRoles: ["ASM"],
        rules: [
          {
            ruleType: "TEAM_OVERRIDE",
            teamOverridePerUnit: 30000, // ₹300 per team unit
          },
        ],
      };

      // FEC worked under asm-1 from Nov 1-15, then reassigned to asm-2 on Nov 16
      const sales: SaleItemForIncentive[] = [
        {
          _id: "s1",
          saleCode: "JKS/2026-27/0001",
          saleDate: new Date("2026-11-04"),
          soldBy: "emp-fec-1",
          asmAtSale: "emp-asm-1", // managed by asm-1 at this date
          modelId: "m1",
          exShowroom: 8000000,
          totalAmount: 8500000,
          status: "DELIVERED",
        },
        {
          _id: "s2",
          saleCode: "JKS/2026-27/0002",
          saleDate: new Date("2026-11-10"),
          soldBy: "emp-fec-1",
          asmAtSale: "emp-asm-1", // managed by asm-1 at this date
          modelId: "m1",
          exShowroom: 8000000,
          totalAmount: 8500000,
          status: "DELIVERED",
        },
        {
          _id: "s3",
          saleCode: "JKS/2026-27/0003",
          saleDate: new Date("2026-11-20"),
          soldBy: "emp-fec-1",
          asmAtSale: "emp-asm-2", // managed by new ASM at this date
          modelId: "m1",
          exShowroom: 8000000,
          totalAmount: 8500000,
          status: "DELIVERED",
        },
      ];

      // Calculation for ASM 1: should get override for the first 2 sales only
      const resAsm1 = computeIncentives(asmUser, sales, [asmScheme], periodStart, periodEnd);
      // 2 * ₹300 = ₹600 = 60000 paise
      expect(resAsm1.totalIncentiveEarned).toBe(60000);

      // Calculation for ASM 2: should get override for the 3rd sale only
      const asm2User: EmployeeInfoForIncentive = {
        _id: "emp-asm-2",
        employeeCode: "JKE-ASM-0002",
        name: "Anil Sharma",
        role: "ASM",
      };
      const resAsm2 = computeIncentives(asm2User, sales, [asmScheme], periodStart, periodEnd);
      // 1 * ₹300 = ₹300 = 30000 paise
      expect(resAsm2.totalIncentiveEarned).toBe(30000);
    });
  });
});


describe("Scheme lifecycle in the engine", () => {
  const fec = { _id: "f1", employeeCode: "JKE-FEC-0001", name: "F", role: "FEC" as const, reportsTo: "a1" };
  const sale = (n: number) => ({
    _id: `s${n}`,
    saleCode: `JKS/${n}`,
    saleDate: new Date("2026-10-10T00:00:00Z"),
    soldBy: "f1",
    asmAtSale: "a1",
    modelId: "m1",
    exShowroom: 10000000,
    totalAmount: 10500000,
    status: "DELIVERED" as const,
  });
  const scheme = (status: string) => ({
    _id: "507f1f77bcf86cd799439011",
    name: "Oct per-unit",
    status,
    validFrom: new Date("2026-10-01T00:00:00Z"),
    validTo: new Date("2026-10-31T23:59:59Z"),
    applicableRoles: ["FEC"],
    rules: [{ ruleType: "PER_UNIT", perUnitAmount: 50000 }],
  });
  const start = new Date("2026-10-01T00:00:00Z");
  const end = new Date("2026-10-31T23:59:59Z");

  it("still pays an EXPIRED scheme for sales inside its validity window", () => {
    const r = computeIncentives(fec, [sale(1), sale(2)], [scheme("EXPIRED")], start, end);
    expect(r.totalIncentiveEarned).toBe(100000);
  });

  it("ignores DRAFT and ARCHIVED schemes", () => {
    expect(computeIncentives(fec, [sale(1)], [scheme("DRAFT")], start, end).totalIncentiveEarned).toBe(0);
    expect(computeIncentives(fec, [sale(1)], [scheme("ARCHIVED")], start, end).totalIncentiveEarned).toBe(0);
  });
});
