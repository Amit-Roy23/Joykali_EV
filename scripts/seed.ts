/**
 * Joykali EV Mobility — demo seed.
 *
 * Builds ~6 months of realistic, internally consistent history relative to
 * today's date by driving the real service layer (purchases -> dealer
 * allocation -> sales -> incentive ledgers -> payroll runs), so every number
 * on every screen is produced by the same code paths the app uses.
 *
 * Deterministic: a seeded PRNG means each reseed produces the same story.
 *
 *   pnpm seed
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { useReliableDnsForSrv } from "./dns-fix";
import { connectToDatabase } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
import { rupeesToPaise } from "../src/lib/money";
import { periodFor, periodOf } from "../src/lib/period";
import { DEFAULT_ROLE_PERMISSIONS } from "../src/lib/rbac";
import { generateDealerCode, generateEmployeeCode } from "../src/lib/codeGenerator";
import { logAudit } from "../src/lib/audit";
import {
  User,
  SalaryStructure,
  Dealer,
  Supplier,
  VehicleModel,
  Vehicle,
  StockMovement,
  IncentiveScheme,
  Setting,
  RolePermission,
  ReportingHistory,
  PayrollEntry,
  PayrollRun,
} from "../src/models";
import { createPurchase } from "../src/services/purchaseService";
import { bulkAllocateVehiclesToDealer } from "../src/services/inventoryService";
import { createSale, cancelSale } from "../src/services/salesService";
import {
  adjustPayrollEntry,
  generateDraftPayrollRun,
  lockPayrollRun,
} from "../src/services/payrollService";
import type { JWTPayload, UserRole } from "../src/types";
import { signApproval } from "../src/services/approvalService";
import { placeOrder, recordPayment, requestCreditChange } from "../src/services/orderService";
import {
  autoPick,
  completeLoading,
  createDeliveryOrder,
  dispatchDO,
  generateDocument,
  recordEwayBill,
  recordGRN,
  startLoading,
  submitDO,
} from "../src/services/dispatchService";
import { proposeRevision } from "../src/services/salaryService";
import { createPurchase as createPurchaseAgain } from "../src/services/purchaseService";
import { Distributor, FleetVehicle, CreditLimitChange, LedgerEntry as LedgerEntryModel, DeliveryOrder as DeliveryOrderModel } from "../src/models";
import { generateDistributorCode } from "../src/lib/codeGenerator";

export const DEMO_PASSWORD = "Joykali@123";

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------
let rngState = 20260412;
function rand(): number {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
function weighted<T>(items: Array<[T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

function asPayload(u: any): JWTPayload {
  return {
    userId: String(u._id),
    employeeCode: u.employeeCode,
    email: u.email,
    name: u.name,
    role: u.role,
    reportsTo: u.reportsTo ? String(u.reportsTo) : null,
    mustChangePassword: false,
  };
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
const FIRST = ["Arijit", "Sourav", "Debasish", "Partha", "Tanmoy", "Subhajit", "Rupa", "Moumita", "Ananya", "Sayantan", "Kaushik", "Abhijit", "Rakhi", "Pallabi", "Indranil", "Sudip", "Joydeep", "Priyanka", "Arnab", "Soumen", "Biswajit", "Nabanita", "Rahul", "Sk. Imran", "Md. Rafiq", "Laxmi", "Gopal", "Bapi", "Mithun", "Shyamal"];
const LAST = ["Das", "Ghosh", "Banerjee", "Mukherjee", "Chatterjee", "Sarkar", "Mondal", "Roy", "Saha", "Paul", "Biswas", "Dutta", "Halder", "Pramanik", "Sen", "Bose", "Majumder", "Kundu", "Hossain", "Mahato"];
const FINANCIERS = ["Bajaj Finance", "Shriram Finance", "IDFC First Bank", "State Bank of India", "Bandhan Bank", "Hero FinCorp"];
const COLORS = ["Pearl White", "Matte Black", "Racing Red", "Electric Blue", "Lime Green", "Graphite Grey"];

/** The seed wipes the database: never let it run against a remote DB by accident. */
function confirmTarget() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/joykali_ev";
  const isLocal = /@?(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(uri.replace(/^mongodb(\+srv)?:\/\//, "//"));
  const host = uri.replace(/^mongodb(\+srv)?:\/\/([^@]*@)?/, "").split(/[/?]/)[0];
  if (!isLocal && !process.argv.includes("--yes")) {
    console.error(
      `\n  Refusing to seed ${host}: this ERASES every collection in that database.\n` +
        `  If this is your demo database, run again with:  pnpm seed --yes\n` +
        `  For a real production database use instead:     pnpm setup:admin\n`
    );
    process.exit(1);
  }
  console.log(`Target: ${host}${isLocal ? " (local)" : " (remote — confirmed with --yes)"}`);
}

async function main() {
  confirmTarget();
  useReliableDnsForSrv(process.env.MONGODB_URI);
  await connectToDatabase();
  const db = mongoose.connection.db!;
  console.log(`Connected to ${db.databaseName}. Resetting database…`);
  await db.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

  const now = new Date();
  const current = periodOf(now);
  const todayIst = new Date(now.getTime() + 5.5 * 3600 * 1000).getUTCDate();
  const months = Array.from({ length: 6 }, (_, i) => {
    let m = current.month - (5 - i);
    let y = current.year;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    return periodFor(y, m);
  });
  const first = months[0];

  // ---------------------------------------------------------------- settings
  console.log("• Company settings & role matrix");
  for (const [role, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    await RolePermission.create({ role, permissions });
  }
  await Setting.create({
    companyName: "Joykali EV Mobility",
    brandTagline: "Electric Vehicle Dealership & Enterprise Network",
    address: "NH-34, EV Commercial Hub, Barasat",
    city: "Kolkata",
    state: "West Bengal",
    pincode: "700124",
    stateCode: "19",
    gstin: "19AAACJ1234F1Z5",
    pan: "AAACJ1234F",
    phone: "+91 98765 43210",
    email: "contact@joykaliev.in",
    website: "https://joykaliev.in",
    codePrefixes: { employee: "JKE", dealer: "JKD", sale: "JKS", purchase: "JKP", payroll: "PR", payslip: "PS" },
    statutoryDeductions: {
      pfRate: 12,
      esiRate: 0.75,
      ptMonthlyPaise: 20000,
      pfEnabled: true,
      esiEnabled: true,
      ptEnabled: true,
      ptMode: "WB_SLAB",
    },
  });

  // -------------------------------------------------------------- employees
  console.log("• Employees, hierarchy & salary structures");
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const joined = new Date(Date.UTC(first.year - 1, 3, 1));

  async function makeUser(
    role: UserRole,
    name: string,
    email: string,
    designation: string,
    reportsTo: any,
    salary: { basic: number; hra: number; conveyance: number; other: number; esi?: boolean },
    extra: Record<string, any> = {}
  ) {
    const employeeCode = await generateEmployeeCode(role);
    const user = await User.create({
      employeeCode,
      name,
      email,
      phone: `98${between(30000000, 39999999)}`,
      role,
      reportsTo: reportsTo?._id ?? null,
      designation,
      joiningDate: extra.joiningDate ?? joined,
      status: "ACTIVE",
      passwordHash,
      mustChangePassword: false,
      ...extra,
    });
    await SalaryStructure.create({
      employee: user._id,
      basic: rupeesToPaise(salary.basic),
      hra: rupeesToPaise(salary.hra),
      conveyance: rupeesToPaise(salary.conveyance),
      otherAllowances: rupeesToPaise(salary.other),
      fixedDeductions: { pf: true, esi: salary.esi ?? false, professionalTax: true },
      bankDetails: {
        accountNo: String(between(100000000, 999999999)) + String(between(100, 999)),
        ifsc: pick(["SBIN0001234", "HDFC0004567", "UTIB0000789", "BKID0005678"]),
        bankName: pick(["State Bank of India", "HDFC Bank", "Axis Bank", "Bank of India"]),
      },
      pan: `${"ABCDEFGHJK"[between(0, 9)]}${"LMNPQRSTUV"[between(0, 9)]}${"WXYZABCDEF"[between(0, 9)]}P${name[0].toUpperCase()}${between(1000, 9999)}${"ABCDEFGHJK"[between(0, 9)]}`,
      effectiveFrom: joined,
      isActive: true,
    });
    return user;
  }

  const admin = await makeUser("ADMIN", "Rajib Chakraborty", "admin@joykaliev.in", "System Administrator", null, { basic: 28000, hra: 11200, conveyance: 3200, other: 12600 });
  const mp = await makeUser("MANAGING_PARTNER", "Joydeb Kali Sarkar", "mp@joykaliev.in", "Managing Partner", null, { basic: 60000, hra: 24000, conveyance: 6000, other: 30000 });
  const bh = await makeUser("BUSINESS_HEAD", "Ananya Bhattacharya", "bh@joykaliev.in", "Business Head — West Bengal", mp, { basic: 42000, hra: 16800, conveyance: 4800, other: 21400 });

  const asmNorth = await makeUser("ASM", "Tanmoy Ghosh", "asm.north@joykaliev.in", "Area Sales Manager — North Bengal", bh, { basic: 18000, hra: 7200, conveyance: 2400, other: 4400 });
  const asmKolkata = await makeUser("ASM", "Moumita Banerjee", "asm.kolkata@joykaliev.in", "Area Sales Manager — Kolkata Metro", bh, { basic: 18000, hra: 7200, conveyance: 2400, other: 4400 });
  const asmSouth = await makeUser("ASM", "Partha Mondal", "asm.south@joykaliev.in", "Area Sales Manager — South Bengal", bh, { basic: 18000, hra: 7200, conveyance: 2400, other: 4400 });

  // ---------------------------------------------------------------- dealers
  console.log("• Dealer network");
  const dealerSpecs = [
    { name: "Siliguri EV Point", owner: "Biswajit Saha", city: "Siliguri", address: "Sevoke Road, Ward 9", asm: asmNorth, gst: "19ABCPS1234K1Z1" },
    { name: "Jalpaiguri Green Motors", owner: "Gopal Roy", city: "Jalpaiguri", address: "Club Road, Near Kadamtala", asm: asmNorth, gst: "19ADFPR5678L1Z2" },
    { name: "Howrah E-Mobility Hub", owner: "Sk. Imran Hossain", city: "Howrah", address: "G.T. Road, Shibpur", asm: asmKolkata, gst: "19AHKPH9012M1Z3" },
    { name: "Barasat Electric Wheels", owner: "Rupa Dutta", city: "Barasat", address: "Jessore Road, Champadali More", asm: asmKolkata, gst: "19AJBPD3456N1Z4" },
    { name: "Durgapur Volt Motors", owner: "Kaushik Majumder", city: "Durgapur", address: "City Centre, Bidhan Nagar", asm: asmSouth, gst: "19AKMPM7890P1Z5" },
    { name: "Kharagpur Smart EV", owner: "Laxmi Mahato", city: "Kharagpur", address: "Inda Market, NH-6", asm: asmSouth, gst: "19ALQPM2345Q1Z6" },
  ];
  const dealers: any[] = [];
  for (const [i, d] of dealerSpecs.entries()) {
    dealers.push(
      await Dealer.create({
        dealerCode: await generateDealerCode(),
        name: d.name,
        ownerName: d.owner,
        phone: `94${between(30000000, 39999999)}`,
        email: `${d.city.toLowerCase()}@dealers.joykaliev.in`,
        address: d.address,
        city: d.city,
        state: "West Bengal",
        gstin: d.gst,
        assignedASM: d.asm._id,
        stateCode: "19",
        pincode: String(700100 + i * 37),
        creditLimit: rupeesToPaise(3000000), // ₹30 L — approved below
        creditDays: 30,
        status: "ACTIVE",
        onboardingDate: new Date(Date.UTC(first.year - 1, 4 + i, 10)),
        createdBy: bh._id,
      })
    );
  }

  // --------------------------------------------------------------------- FECs
  const fecSpecs: Array<{ name: string; asm: any; dealer: number; skill: number }> = [
    { name: "Bikash Sen", asm: asmNorth, dealer: 0, skill: 1.35 },
    { name: "Sayantan Paul", asm: asmNorth, dealer: 0, skill: 0.9 },
    { name: "Rakhi Biswas", asm: asmNorth, dealer: 1, skill: 1.05 },
    { name: "Indranil Kundu", asm: asmNorth, dealer: 1, skill: 0.7 },
    { name: "Arnab Chatterjee", asm: asmKolkata, dealer: 2, skill: 1.5 },
    { name: "Priyanka Das", asm: asmKolkata, dealer: 2, skill: 1.1 },
    { name: "Md. Rafiq Hossain", asm: asmKolkata, dealer: 3, skill: 1.2 },
    { name: "Nabanita Saha", asm: asmKolkata, dealer: 3, skill: 0.85 },
    { name: "Soumen Pramanik", asm: asmSouth, dealer: 4, skill: 1.0 },
    { name: "Pallabi Kundu", asm: asmSouth, dealer: 4, skill: 0.95 },
    { name: "Mithun Halder", asm: asmSouth, dealer: 5, skill: 1.15 },
    { name: "Shyamal Bose", asm: asmSouth, dealer: 5, skill: 0.75 },
  ];
  const fecs: Array<{ user: any; skill: number; dealer: any }> = [];
  for (const [i, f] of fecSpecs.entries()) {
    const user = await makeUser(
      "FEC",
      f.name,
      `fec${i + 1}@joykaliev.in`,
      "Field Executive Consultant",
      f.asm,
      { basic: 9000 + (i % 3) * 500, hra: 3600, conveyance: 1600, other: 1800, esi: true },
      { dealer: dealers[f.dealer]._id }
    );
    fecs.push({ user, skill: f.skill, dealer: dealers[f.dealer] });
  }

  // ------------------------------------------------------- suppliers / models
  console.log("• Suppliers & vehicle catalogue");
  const supplierMain = await Supplier.create({
    name: "Volta Drive Manufacturing Pvt. Ltd.",
    gstin: "19AABCV4321R1Z9",
    contactPerson: "Sanjay Agarwal",
    phone: "9831098310",
    email: "orders@voltadrive.in",
    address: "Plot 14, Uluberia Industrial Growth Centre",
    city: "Howrah",
    state: "West Bengal",
  });
  const supplierCargo = await Supplier.create({
    name: "Eastern Cargo EV Works",
    gstin: "19AAECE8765S1Z2",
    contactPerson: "Nirmal Jha",
    phone: "9433094330",
    email: "sales@easterncargoev.in",
    address: "Kalyani Industrial Area, Block B",
    city: "Kalyani",
    state: "West Bengal",
  });

  const modelSpecs = [
    { key: "FALCON", name: "Joykali Falcon Pro", variant: "72V LFP Dual Battery", category: "2W", battery: "LFP 3.2 kWh", range: 120, cost: 74000, price: 98000, supplier: supplierMain, weight: 26 },
    { key: "STORM", name: "Joykali Storm", variant: "60V City Commuter", category: "2W", battery: "Li-ion 2.4 kWh", range: 85, cost: 57000, price: 78000, supplier: supplierMain, weight: 30 },
    { key: "ZIPPY", name: "Joykali Zippy Lite", variant: "Low-speed 48V", category: "2W", battery: "Li-ion 1.5 kWh", range: 70, cost: 41000, price: 56000, supplier: supplierMain, weight: 16 },
    { key: "CITYRIDE", name: "Joykali CityRide", variant: "E-Rickshaw Deluxe 4+1", category: "E_RICKSHAW", battery: "LFP 5.8 kWh", range: 110, cost: 108000, price: 145000, supplier: supplierCargo, weight: 17 },
    { key: "CARGO", name: "Joykali CargoLoader", variant: "500 kg Payload", category: "LOADER", battery: "LFP 7.2 kWh", range: 95, cost: 124000, price: 165000, supplier: supplierCargo, weight: 7 },
    { key: "AUTO", name: "Joykali Auto L5", variant: "Passenger 3+1", category: "3W", battery: "LFP 8.6 kWh", range: 140, cost: 228000, price: 295000, supplier: supplierCargo, weight: 4 },
  ] as const;
  const models: Record<string, any> = {};
  for (const m of modelSpecs) {
    models[m.key] = await VehicleModel.create({
      name: m.name,
      variant: m.variant,
      category: m.category,
      batteryType: m.battery,
      rangeKm: m.range,
      purchasePrice: rupeesToPaise(m.cost),
      sellingPrice: rupeesToPaise(m.price),
      dealerPrice: rupeesToPaise(Math.round(m.price * 0.91)),
      distributorPrice: rupeesToPaise(Math.round(m.price * 0.87)),
      gstRate: 5,
      hsnCode: "870380",
      isActive: true,
      createdBy: admin._id,
    });
  }

  // ----------------------------------------------------------------- schemes
  console.log("• Incentive schemes");
  const endOf = (p: (typeof months)[number]) => p.end;
  const nextMonth = periodFor(current.month === 12 ? current.year + 1 : current.year, current.month === 12 ? 1 : current.month + 1);
  await IncentiveScheme.create({
    name: "Puja Festive Slab Bonanza",
    description: "Festive-season slab payout for field executives on every delivered vehicle.",
    status: "ACTIVE",
    validFrom: months[0].start,
    validTo: endOf(months[2]),
    applicableRoles: ["FEC"],
    rules: [{ ruleType: "SLAB", slabApplication: "ALL_UNITS", slabs: [
      { minUnits: 1, maxUnits: 3, amountPerUnit: rupeesToPaise(400) },
      { minUnits: 4, maxUnits: 6, amountPerUnit: rupeesToPaise(700) },
      { minUnits: 7, maxUnits: null, amountPerUnit: rupeesToPaise(1000) },
    ] }],
    approvedBy: mp._id,
    approvedAt: months[0].start,
  });
  await IncentiveScheme.create({
    name: "Winter Drive Incremental Slab",
    description: "Incremental slab — every additional unit earns more as you climb tiers.",
    status: "ACTIVE",
    validFrom: months[3].start,
    validTo: nextMonth.end,
    applicableRoles: ["FEC"],
    rules: [{ ruleType: "SLAB", slabApplication: "INCREMENTAL", slabs: [
      { minUnits: 1, maxUnits: 3, amountPerUnit: rupeesToPaise(500) },
      { minUnits: 4, maxUnits: 6, amountPerUnit: rupeesToPaise(800) },
      { minUnits: 7, maxUnits: null, amountPerUnit: rupeesToPaise(1200) },
    ] }],
    approvedBy: mp._id,
    approvedAt: months[3].start,
  });
  await IncentiveScheme.create({
    name: "FEC Target Champion",
    description: "₹5,000 bonus for 6+ deliveries in a month.",
    status: "ACTIVE",
    validFrom: months[3].start,
    validTo: nextMonth.end,
    applicableRoles: ["FEC"],
    rules: [{ ruleType: "TARGET_BONUS", targetUnits: 6, targetBonusAmount: rupeesToPaise(5000) }],
    approvedBy: mp._id,
    approvedAt: months[3].start,
  });
  await IncentiveScheme.create({
    name: "ASM Team Override",
    description: "Area managers earn ₹300 per team unit plus 0.25% of team ex-showroom value.",
    status: "ACTIVE",
    validFrom: months[0].start,
    validTo: nextMonth.end,
    applicableRoles: ["ASM"],
    rules: [{ ruleType: "TEAM_OVERRIDE", teamOverridePerUnit: rupeesToPaise(300), teamOverridePercentage: 0.25 }],
    approvedBy: mp._id,
    approvedAt: months[0].start,
  });
  // Business Head has signed; awaiting the Managing Partner — the live-demo moment.
  const draftScheme = await IncentiveScheme.create({
    name: "Commercial EV Push — E-Rickshaw & Cargo",
    description: "Per-unit kicker on commercial vehicles. Approve it and watch this month's payouts update instantly.",
    status: "DRAFT",
    validFrom: current.start,
    validTo: current.end,
    applicableRoles: ["FEC"],
    applicableModels: [models.CITYRIDE._id, models.CARGO._id, models.AUTO._id],
    rules: [{ ruleType: "PER_UNIT", perUnitAmount: rupeesToPaise(1500), modelSpecificAmounts: [
      { model: models.AUTO._id, amount: rupeesToPaise(3000) },
    ] }],
  });

  // ------------------------------------------------- monthly business activity
  const bhPayload = asPayload(bh);
  const mpPayload = asPayload(mp);
  const monthlyTargets = [42, 49, 58, 66, 78];
  let chassisSeq = 1000;
  const saleIds: string[] = [];

  for (const [mi, p] of months.entries()) {
    const isCurrent = mi === months.length - 1;
    const lastDay = isCurrent ? Math.max(1, todayIst) : p.daysInMonth;
    const salesTarget = isCurrent
      ? Math.max(4, Math.round((86 * lastDay) / p.daysInMonth))
      : monthlyTargets[mi];
    console.log(`• ${p.period}: purchase, allocation & ${salesTarget} sales`);

    // Reporting change mid-history to demonstrate ReportingHistory.
    if (mi === 3) {
      const moved = fecs[3];
      await ReportingHistory.create({
        employee: moved.user._id,
        previousManager: asmNorth._id,
        newManager: asmKolkata._id,
        changedBy: bh._id,
        changedAt: p.start,
        reason: "Territory realignment — Kolkata expansion",
      });
      await User.updateOne({ _id: moved.user._id }, { reportsTo: asmKolkata._id, dealer: dealers[3]._id });
      moved.user.reportsTo = asmKolkata._id;
      moved.dealer = dealers[3];
    }

    // 1. Purchase enough stock for the month (+ buffer), split by supplier.
    const plan: Record<string, number> = {};
    const need = salesTarget + 8;
    for (let i = 0; i < need; i++) {
      const key = weighted(modelSpecs.map((m) => [m.key, m.weight] as [string, number]));
      plan[key] = (plan[key] || 0) + 1;
    }
    const purchaseDay = ymd(p.year, p.month, 1);
    for (const supplier of [supplierMain, supplierCargo]) {
      const lineItems = modelSpecs
        .filter((m) => m.supplier === supplier && plan[m.key])
        .map((m) => ({
          model: String(models[m.key]._id),
          quantity: plan[m.key],
          unitCost: m.cost,
          gstRate: 5,
          vehicles: Array.from({ length: plan[m.key] }, () => {
            chassisSeq += 1;
            const code = `${m.key.slice(0, 3)}${p.year % 100}${String(p.month).padStart(2, "0")}${chassisSeq}`;
            return {
              chassisNumber: `MD9JK${code}`,
              motorNumber: `MTR${code}`,
              batteryNumber: `BAT${code}`,
              chargerNumber: `CHG${code}`,
              color: pick([...COLORS]),
            };
          }),
        }));
      if (lineItems.length === 0) continue;
      await createPurchase(
        {
          supplier: String(supplier._id),
          invoiceNumber: `${supplier === supplierMain ? "VDM" : "ECW"}/${p.year}/${String(p.month).padStart(2, "0")}/${between(100, 999)}`,
          invoiceDate: purchaseDay,
          lineItems,
          notes: "Monthly stock replenishment",
        },
        bhPayload
      );
    }

    // 2. Allocate ~60% of warehouse stock to dealers, round-robin.
    const warehouse = await Vehicle.find({ status: "IN_STOCK" }).lean();
    const toAllocate = warehouse.filter(() => rand() < 0.6);
    const byDealer: Record<string, string[]> = {};
    toAllocate.forEach((v: any, i) => {
      const d = dealers[i % dealers.length];
      (byDealer[String(d._id)] ||= []).push(String(v._id));
    });
    for (const [dealerId, ids] of Object.entries(byDealer)) {
      await bulkAllocateVehiclesToDealer(ids, dealerId, bhPayload, "Monthly dealer allocation");
    }
    await StockMovement.updateMany(
      { movementType: "DEALER_ALLOCATION", timestamp: { $gt: p.end } },
      { $set: { timestamp: new Date(p.start.getTime() + 3 * 86400000) } }
    );

    // 3. Sales, weighted by FEC skill; ASMs occasionally close deals too.
    const sellers: Array<[any, number]> = [
      ...fecs.map((f) => [f, f.skill] as [any, number]),
      ...[asmNorth, asmKolkata, asmSouth].map((a) => [{ user: a, dealer: null, skill: 0.25 }, 0.25] as [any, number]),
    ];
    for (let s = 0; s < salesTarget; s++) {
      const seller = weighted(sellers);
      const day = between(1, lastDay);
      const modelKey = weighted(modelSpecs.map((m) => [m.key, m.weight] as [string, number]));
      const model = models[modelKey];
      const vehicle =
        (seller.dealer &&
          (await Vehicle.findOne({ model: model._id, status: "ALLOCATED_TO_DEALER", currentLocationDealer: seller.dealer._id }).lean())) ||
        (await Vehicle.findOne({ model: model._id, status: { $in: ["IN_STOCK", "ALLOCATED_TO_DEALER"] } }).lean());
      if (!vehicle) continue;

      const ex = model.sellingPrice / 100;
      const discount = pick([0, 0, 1000, 1500, 2000, 3000]);
      const gst = Math.round((ex - discount) * 0.05);
      const isCommercial = ["CITYRIDE", "CARGO", "AUTO"].includes(modelKey);
      const total = ex - discount + gst;
      const mode = weighted<"CASH" | "UPI" | "BANK" | "FINANCE">([["FINANCE", isCommercial ? 55 : 30], ["UPI", 30], ["BANK", 20], ["CASH", 15]]);
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const sellerPayload = asPayload(seller.user);
      const sale = await createSale(
        {
          saleDate: ymd(p.year, p.month, day),
          customer: {
            name,
            phone: `9${between(100000000, 999999999)}`,
            email: rand() < 0.5 ? `${name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "")}${between(10, 99)}@gmail.com` : undefined,
            address: `${between(1, 220)}, ${pick(["Station Road", "Bazar Para", "Netaji Pally", "College Para", "Rabindra Sarani", "Main Road"])}, ${(seller.dealer ?? pick(dealers)).city}`,
            idProofType: "Aadhaar",
            idProofNumber: `XXXX-XXXX-${between(1000, 9999)}`,
          },
          vehicleId: String(vehicle._id),
          dealerId: vehicle.currentLocationDealer ? String(vehicle.currentLocationDealer) : null,
          soldBy: String(seller.user._id),
          priceBreakdown: {
            exShowroom: ex,
            discount,
            gst,
            registration: isCommercial ? 4500 : 1200,
            insurance: isCommercial ? between(7000, 9500) : between(3200, 4800),
            accessories: pick([0, 0, 850, 1500, 2400]),
          },
          paymentMode: mode,
          financierDetails:
            mode === "FINANCE"
              ? {
                  financierName: pick(FINANCIERS),
                  loanAmount: Math.round(total * 0.75),
                  downPayment: Math.round(total * 0.25),
                  loanAccountNo: `LN${between(10000000, 99999999)}`,
                }
              : undefined,
          initialPayment: { amount: mode === "FINANCE" ? Math.round(total * 0.25) : total, reference: mode === "CASH" ? undefined : `TXN${between(100000, 999999)}` },
        },
        sellerPayload
      );
      saleIds.push(String(sale._id));
    }
  }

  // A couple of cancellations for realism (reverses stock + incentives).
  console.log("• Cancellations");
  await cancelSale(saleIds[saleIds.length - 6], "Customer withdrew — finance not approved", mpPayload);
  await cancelSale(saleIds[14], "Duplicate booking entered at dealer", mpPayload);

  // ----------------------------------------------------------------- payroll
  console.log("• Payroll runs");
  for (const [mi, p] of months.slice(0, -1).entries()) {
    const run = await generateDraftPayrollRun(p.year, p.month, bhPayload, `Monthly payroll ${p.period}`);
    // A few realistic manual inputs before approval.
    const entries = await PayrollEntry.find({ payrollRun: run._id }).populate("employee").lean();
    for (const e of entries) {
      const emp = e.employee as any;
      if (emp.role === "FEC" && rand() < 0.2) {
        await adjustPayrollEntry(String(e._id), { lopDays: between(1, 2) }, bhPayload);
      }
      if (["BUSINESS_HEAD", "MANAGING_PARTNER"].includes(emp.role)) {
        await adjustPayrollEntry(String(e._id), { tds: emp.role === "MANAGING_PARTNER" ? 9500 : 4200 }, bhPayload);
      }
    }
    if (mi === 2) {
      const star = entries.find((e: any) => (e.employee as any).email === "fec5@joykaliev.in");
      if (star) {
        await adjustPayrollEntry(String(star._id), { adjustment: { amount: 2500, reason: "Best showroom conduct award" } }, bhPayload);
      }
    }
    await signApproval("payroll", String(run._id), bhPayload, "APPROVED");
    await signApproval("payroll", String(run._id), mpPayload, "APPROVED");
    // The most recent closed month stays APPROVED so the demo can show "Lock".
    if (mi < months.length - 2) await lockPayrollRun(String(run._id), mpPayload);
  }

  // ------------------------------------------------- channel operations
  console.log("• Credit limits, distributors, fleet, orders & delivery orders");
  const asmSouthPayload = asPayload(asmSouth);
  const asmKolkataPayload = asPayload(asmKolkata);
  const sig = (u: any, at: Date) => ({ level: u.role, decision: "APPROVED", by: u._id, byName: u.name, byCode: u.employeeCode, at });

  // Dealer limits were set at onboarding; record the approvals that granted them.
  for (const d of dealers) {
    await CreditLimitChange.create({
      partyType: "DEALER", party: d._id, partyName: d.name, partyCode: d.dealerCode,
      fromLimit: 0, toLimit: d.creditLimit, creditDays: 30, reason: "Opening credit limit at onboarding",
      status: "APPROVED", approvals: [sig(bh, d.onboardingDate), sig(mp, d.onboardingDate)],
      requestedBy: bh._id, appliedAt: d.onboardingDate,
    });
  }

  // Distributors (one inter-state → IGST on its invoices).
  const distSpecs = [
    { name: "Bardhaman Auto Distributors", owner: "Sujit Kumar Ghosh", city: "Bardhaman", pincode: "713101", gstin: "19AAGFB4521M1Z8", state: "West Bengal", limit: 6000000, login: "dist1@joykaliev.in", asm: asmSouth },
    { name: "Malda EV Traders", owner: "Anowar Hossain", city: "Malda", pincode: "732101", gstin: "19ABCFM7788N1Z2", state: "West Bengal", limit: 2500000, login: null, asm: asmNorth },
    { name: "Bihar Green Wheels", owner: "Rakesh Kumar Singh", city: "Patna", pincode: "800001", gstin: "10AAJFB3344P1Z6", state: "Bihar", limit: 4000000, login: "dist3@joykaliev.in", asm: asmNorth },
  ];
  const distributors: any[] = [];
  const distUsers: Record<string, any> = {};
  for (const [i, ds] of distSpecs.entries()) {
    const onboard = new Date(first.start.getTime() + i * 9 * 86400000);
    const code = await generateDistributorCode();
    const dist = await Distributor.create({
      distributorCode: code, name: ds.name, ownerName: ds.owner, phone: `97${between(30000000, 39999999)}`,
      email: `accounts${i + 1}@${ds.city.toLowerCase()}dist.in`, address: `${between(10, 180)}, ${pick(["G.T. Road", "Station Road", "Bypass More", "Industrial Area"])}`,
      city: ds.city, state: ds.state, stateCode: ds.gstin.slice(0, 2), pincode: ds.pincode, gstin: ds.gstin,
      creditLimit: rupeesToPaise(ds.limit), creditDays: 30, assignedASM: ds.asm._id, status: "ACTIVE", onboardingDate: onboard, createdBy: bh._id,
    });
    await CreditLimitChange.create({
      partyType: "DISTRIBUTOR", party: dist._id, partyName: dist.name, partyCode: code, fromLimit: 0, toLimit: dist.creditLimit, creditDays: 30,
      reason: "Opening credit limit at onboarding", status: "APPROVED", approvals: [sig(bh, onboard), sig(mp, onboard)], requestedBy: bh._id, appliedAt: onboard,
    });
    if (ds.login) {
      distUsers[code] = await User.create({
        employeeCode: code, name: ds.owner, email: ds.login, phone: dist.phone, role: "DISTRIBUTOR", distributor: dist._id,
        designation: `Distributor — ${ds.name}`, joiningDate: onboard, status: "ACTIVE", passwordHash, mustChangePassword: false,
      });
    }
    distributors.push(dist);
  }
  const [bardhaman, malda, bihar] = distributors;
  const bardhamanUser = asPayload(distUsers[bardhaman.distributorCode]);
  const biharUser = asPayload(distUsers[bihar.distributorCode]);

  // Malda carries an older unpaid invoice (within its 30 credit days).
  await LedgerEntryModel.create({
    partyType: "DISTRIBUTOR", party: malda._id, date: new Date(Date.now() - 18 * 86400000), type: "OPENING",
    reference: "OPENING/2026-27", debit: rupeesToPaise(320000), credit: 0, narration: "Opening balance migrated from Tally", createdBy: admin._id,
  });

  // Transport fleet with documents. One truck has an expired PUC → locked.
  const day = 86400000;
  const inDays = (n: number) => new Date(Date.now() + n * day);
  const docs = (fuel: string, overrides: Record<string, Date | null> = {}) =>
    ["RC", "INSURANCE", "FITNESS", "PERMIT", "ROAD_TAX", ...(fuel === "ELECTRIC" ? [] : ["PUC"])].map((type) => ({
      type,
      number: `${type}-${between(100000, 999999)}`,
      issuedOn: inDays(-200),
      validUpto: type in overrides ? overrides[type] : type === "RC" ? inDays(3650) : inDays(between(60, 330)),
      issuer: type === "INSURANCE" ? pick(["ICICI Lombard", "Tata AIG", "New India Assurance"]) : "RTO Kolkata",
      updatedBy: bh._id,
    }));
  const fleetSpecs = [
    { reg: "WB25K4521", type: "TRUCK", mm: "Tata LPT 1109 (car carrier)", fuel: "DIESEL", cap: 10, own: "OWNED", over: {} },
    { reg: "WB19J7710", type: "MINI_TRUCK", mm: "Ashok Leyland Dost+", fuel: "DIESEL", cap: 6, own: "OWNED", over: { INSURANCE: inDays(9) } },
    { reg: "WB11C3302", type: "TRUCK", mm: "Eicher Pro 2049", fuel: "DIESEL", cap: 12, own: "HIRED", over: { PUC: inDays(-4) } },
    { reg: "WB02AB9001", type: "EV_LOADER", mm: "Joykali CargoLoader (in-house)", fuel: "ELECTRIC", cap: 3, own: "OWNED", over: {} },
  ];
  const fleet: Record<string, any> = {};
  for (const f of fleetSpecs) {
    fleet[f.reg] = await FleetVehicle.create({
      registrationNo: f.reg, vehicleType: f.type, makeModel: f.mm, fuel: f.fuel, capacityUnits: f.cap, ownership: f.own,
      transporterName: f.own === "HIRED" ? "Sealdah Roadlines" : undefined, transporterGstin: f.own === "HIRED" ? "19AAKFS1122Q1Z4" : undefined,
      documents: docs(f.fuel, f.over as any), status: "ACTIVE",
    });
  }

  // Fresh stock for channel orders.
  const bump: Array<[string, number]> = [["FALCON", 14], ["STORM", 12], ["CITYRIDE", 6], ["CARGO", 4]];
  for (const supplier of [supplierMain, supplierCargo]) {
    const lineItems = bump
      .map(([k, q]) => ({ spec: modelSpecs.find((m) => m.key === k)!, q }))
      .filter(({ spec }) => spec.supplier === supplier)
      .map(({ spec, q }) => ({
        model: String(models[spec.key]._id), quantity: q, unitCost: spec.cost, gstRate: 5,
        vehicles: Array.from({ length: q }, () => {
          chassisSeq += 1;
          const code = `${spec.key.slice(0, 3)}${current.year % 100}${String(current.month).padStart(2, "0")}${chassisSeq}`;
          return { chassisNumber: `MD9JK${code}`, motorNumber: `MTR${code}`, batteryNumber: `BAT${code}`, chargerNumber: `CHG${code}`, color: pick([...COLORS]) };
        }),
      }));
    await createPurchaseAgain(
      { supplier: String(supplier._id), invoiceNumber: `${supplier === supplierMain ? "VDM" : "ECW"}/${current.year}/CH/${between(100, 999)}`, invoiceDate: ymd(current.year, current.month, Math.max(1, todayIst - 3)), lineItems, notes: "Channel stock" },
      bhPayload
    );
  }
  const M = (k: string) => String(models[k]._id);
  const approveBoth = async (kind: "order", id: string) => {
    await signApproval(kind, id, bhPayload, "APPROVED");
    await signApproval(kind, id, mpPayload, "APPROVED");
  };

  // (a) Bardhaman: ordered on the portal → approved → shipped → received in full → part-paid.
  const oA = await placeOrder({ partyType: "DISTRIBUTOR", partyId: String(bardhaman._id), lines: [{ modelId: M("FALCON"), quantity: 6 }, { modelId: M("STORM"), quantity: 4 }], notes: "Puja season replenishment" }, bardhamanUser);
  await approveBoth("order", String(oA._id));
  const doA = await createDeliveryOrder(String(oA._id), [{ modelId: M("FALCON"), quantity: 6 }, { modelId: M("STORM"), quantity: 4 }], bhPayload);
  await submitDO(String(doA._id), bhPayload);
  await startLoading(String(doA._id), { fleetVehicleId: String(fleet.WB25K4521._id), driverName: "Ramesh Yadav", driverPhone: "9831245670", driverLicence: "WB1020190045821" }, bhPayload);
  await autoPick(String(doA._id), bhPayload);
  await completeLoading(String(doA._id), { physicalInspection: true, chassisVerified: true, batteryChargerKeys: true, securedForTransit: true }, bhPayload);
  await generateDocument(String(doA._id), bhPayload);
  await recordEwayBill(String(doA._id), { distanceKm: 110, ewbNo: `3810${between(10000000, 99999999)}` }, bhPayload);
  await dispatchDO(String(doA._id), mpPayload); // loader ≠ dispatcher
  const doAfull: any = await DeliveryOrderModel.findById(doA._id).lean();
  await recordGRN(String(doA._id), { items: doAfull.vehicles.map((v: any) => ({ vehicleId: String(v.vehicle), condition: "RECEIVED" })), remarks: "All 10 received in good condition" }, bardhamanUser);
  await recordPayment({ partyType: "DISTRIBUTOR", partyId: String(bardhaman._id), amountRupees: 500000, mode: "BANK", reference: `UTR${between(100000000, 999999999)}`, narration: "Part payment" }, bhPayload);

  // (b) Bihar (inter-state, IGST): approved → shipped → IN TRANSIT, awaiting the distributor's GRN.
  const oB = await placeOrder({ partyType: "DISTRIBUTOR", partyId: String(bihar._id), lines: [{ modelId: M("CITYRIDE"), quantity: 3 }, { modelId: M("CARGO"), quantity: 2 }] }, biharUser);
  await approveBoth("order", String(oB._id));
  const doB = await createDeliveryOrder(String(oB._id), [{ modelId: M("CITYRIDE"), quantity: 3 }, { modelId: M("CARGO"), quantity: 2 }], bhPayload);
  await submitDO(String(doB._id), bhPayload);
  await startLoading(String(doB._id), { fleetVehicleId: String(fleet.WB19J7710._id), driverName: "Manoj Paswan", driverPhone: "9123456781", driverLicence: "BR0120180067112" }, bhPayload);
  await autoPick(String(doB._id), bhPayload);
  await completeLoading(String(doB._id), { physicalInspection: true, chassisVerified: true, batteryChargerKeys: true, securedForTransit: true }, bhPayload);
  await generateDocument(String(doB._id), bhPayload);
  await recordEwayBill(String(doB._id), { distanceKm: 560, ewbNo: `3810${between(10000000, 99999999)}` }, bhPayload);
  await dispatchDO(String(doB._id), mpPayload);

  // (c) Howrah dealer stock order by the ASM → approved → DO submitted, waiting to be loaded.
  const howrah = dealers[2];
  const oC = await placeOrder({ partyType: "DEALER", partyId: String(howrah._id), lines: [{ modelId: M("STORM"), quantity: 4 }], notes: "Weekend demand" }, asmKolkataPayload);
  await approveBoth("order", String(oC._id));
  const doC = await createDeliveryOrder(String(oC._id), [{ modelId: M("STORM"), quantity: 4 }], bhPayload);
  await submitDO(String(doC._id), bhPayload);

  // (d) Malda: placed by the ASM, waiting for the Business Head.
  await placeOrder({ partyType: "DISTRIBUTOR", partyId: String(malda._id), lines: [{ modelId: M("FALCON"), quantity: 3 }, { modelId: M("ZIPPY"), quantity: 2 }] }, asPayload(asmNorth));
  // (e) Bardhaman repeat order: Business Head signed, waiting for the Managing Partner.
  const oE = await placeOrder({ partyType: "DISTRIBUTOR", partyId: String(bardhaman._id), lines: [{ modelId: M("FALCON"), quantity: 4 }] }, bardhamanUser);
  await signApproval("order", String(oE._id), bhPayload, "APPROVED");
  // (f) Durgapur dealer order by ASM South, waiting for the Business Head.
  await placeOrder({ partyType: "DEALER", partyId: String(dealers[4]._id), lines: [{ modelId: M("CITYRIDE"), quantity: 2 }] }, asmSouthPayload);

  // Credit limit increase waiting for the Business Head.
  await requestCreditChange({ partyType: "DISTRIBUTOR", partyId: String(malda._id), toLimitRupees: 3500000, creditDays: 30, reason: "Opening a second showroom in English Bazar" }, bhPayload);

  // Salary revision for the top FEC from next month: BH proposed and signed, waiting for the MP.
  const star = fecs[4].user;
  const rev = await proposeRevision(
    String(star._id),
    { mode: "GROSS", amountRupees: 21000, flags: { pf: true, esi: true, professionalTax: true }, effectiveMonth: nextMonth.period, reason: "Top performer — 6-month review" },
    asPayload(mp)
  );
  await signApproval("salary", String(rev._id), bhPayload, "APPROVED");

  // The commercial EV scheme: Business Head has signed, waiting for the Managing Partner.
  await signApproval("scheme", String(draftScheme._id), bhPayload, "APPROVED");

  // A light audit trail so the Audit screen isn't empty.
  for (const u of [admin, mp, bh, asmNorth, fecs[0].user]) {
    await logAudit({ user: asPayload(u), action: "LOGIN", resource: "AUTH", resourceId: String(u._id), ipAddress: "103.42.18.7" });
  }

  const runs = await PayrollRun.countDocuments();
  const vehicles = await Vehicle.countDocuments();
  console.log(`\nSeed complete: ${saleIds.length} sales, ${vehicles} vehicles, ${runs} payroll runs.`);
  console.log(`\nDemo accounts (password: ${DEMO_PASSWORD})`);
  for (const u of await User.find({ role: { $nin: ["FEC", "DISTRIBUTOR"] } }).sort({ role: 1 }).lean()) {
    console.log(`  ${u.role.padEnd(17)} ${u.employeeCode.padEnd(13)} ${u.email}`);
  }
  console.log(`  FEC               JKE-FEC-0001  fec1@joykaliev.in (… fec12)`);
  console.log(`  DISTRIBUTOR       JKDB-0001     dist1@joykaliev.in  (Bardhaman)`);
  console.log(`  DISTRIBUTOR       JKDB-0003     dist3@joykaliev.in  (Patna, Bihar — inter-state)`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
