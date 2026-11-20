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
  Sale,
  IncentiveScheme,
  Setting,
  RolePermission,
  ReportingHistory,
  PayrollEntry,
  PayrollRun,
  Outlet,
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
import {
  createPartner,
  createPartnerSale,
  receivePartnerSale,
  placeNetworkOrder,
  recordNetworkPayment,
} from "../src/services/networkService";
import {
  createTerritory,
  createOutlet,
  createStockTransfer,
  receiveStockTransfer,
  setTarget,
  recordDeposit,
  uploadPartyDocument,
  verifyPartyDocument,
} from "../src/services/partnerAdminService";
import { Department, Shift, Holiday, LeaveType, LeaveRequest, AttendancePunch, AttendanceDay, Regularization, EmployeeTarget, EmployeeDocument } from "../src/models/Hr";
import { requestAdvance, submitClaim, verifyClaim, submitResignation } from "../src/services/hrMoneyService";
import { applyLeave, approveOvertime } from "../src/services/hrService";
import { createWarehouseTransfer, mainWarehouse, receiveWarehouseTransfer, saveWarehouse, setMinStock } from "../src/services/warehouseService";
import { accountBalances, createExpense, createVoucher, ensureAccounts, recordPayout, saveMoneyAccount, setBudget, SALARY_HEAD } from "../src/services/accountsService";
import { proposeTemplate } from "../src/services/salaryTemplateService";
import { DEFAULT_STATUTORY } from "../src/services/salaryTemplateEngine";
import { MoneyAccount } from "../src/models/Accounts";
import { Post } from "../src/models/Post";
import { ensurePosts } from "../src/services/postService";
import { recordReceipt, rejectAdvice, setCleared, submitAdvice, verifyAdvice } from "../src/services/paymentService";
import { createItem, createPartsSale, receiveBattery, returnBattery, stockIn, stockOut, transferItems } from "../src/services/itemService";
import { Item } from "../src/models/Item";

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
    const { codePrefix, ...rest } = extra;
    extra = rest;
    const employeeCode = await generateEmployeeCode(role, undefined, codePrefix);
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
      `fse${i + 1}@joykaliev.in`,
      "Field Sales Executive",
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
    name: "FSE Target Champion",
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
      const star = entries.find((e: any) => (e.employee as any).email === "fse5@joykaliev.in");
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
    { reg: "WB04G2210", type: "MINI_TRUCK", mm: "Tata Ace Gold (local deliveries)", fuel: "DIESEL", cap: 3, own: "OWNED", over: {} },
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
  const bump: Array<[string, number]> = [["FALCON", 14], ["STORM", 12], ["ZIPPY", 8], ["CITYRIDE", 6], ["CARGO", 4]];
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
  const approveBoth = async (kind: "order" | "credit", id: string) => {
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
  // The Howrah dealer gets its own login: it follows its orders, invoices and trucks, records the GRN and reports payments.
  const howrahUserDoc = await User.create({
    employeeCode: "JKDL-HWH", name: "Sk. Imran Hossain", email: "dealer.howrah@joykaliev.in", phone: "9830011223", role: "DEALER", dealer: howrah._id,
    designation: "Dealer — Howrah E-Mobility Hub", joiningDate: joined, status: "ACTIVE", passwordHash, mustChangePassword: false,
  });
  const howrahUser = asPayload(howrahUserDoc);
  const oC = await placeOrder({ partyType: "DEALER", partyId: String(howrah._id), lines: [{ modelId: M("STORM"), quantity: 4 }], notes: "Weekend demand" }, asmKolkataPayload);
  await approveBoth("order", String(oC._id));
  const doC = await createDeliveryOrder(String(oC._id), [{ modelId: M("STORM"), quantity: 4 }], bhPayload);
  await submitDO(String(doC._id), bhPayload);
  // (g) Howrah dealer orders on its portal → approved → challan made → dispatched on the EV loader, waiting for the dealer's GRN.
  const oG = await placeOrder({ partyType: "DEALER", partyId: String(howrah._id), lines: [{ modelId: M("ZIPPY"), quantity: 2 }], notes: "Ordered from the dealer portal" }, howrahUser);
  await approveBoth("order", String(oG._id));
  const doG = await createDeliveryOrder(String(oG._id), [{ modelId: M("ZIPPY"), quantity: 2 }], bhPayload);
  await submitDO(String(doG._id), bhPayload);
  await startLoading(String(doG._id), { fleetVehicleId: String(fleet.WB04G2210._id), driverName: "Sanjib Mondal", driverPhone: "9874512360", driverLicence: "WB0220200011223" }, bhPayload);
  await autoPick(String(doG._id), bhPayload);
  await completeLoading(String(doG._id), { physicalInspection: true, chassisVerified: true, batteryChargerKeys: true, securedForTransit: true }, bhPayload);
  await generateDocument(String(doG._id), bhPayload);
  await recordEwayBill(String(doG._id), { distanceKm: 30, ewbNo: `3810${between(10000000, 99999999)}` }, bhPayload);
  await dispatchDO(String(doG._id), mpPayload);

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


  // ---------------------------------------------------------------------------
  // Phase 4: territories, the full channel network, partner portals, a showroom.
  // Built through the real services so every business rule runs during seeding.
  // ---------------------------------------------------------------------------
  const terr = async (kind: "ZONE" | "DISTRICT" | "AREA", name: string, code: string, parent?: any, state?: string) =>
    createTerritory(bhPayload, { kind, name, code, parentId: parent ? String(parent._id) : undefined, state });
  const zSB = await terr("ZONE", "South Bengal", "ZN-SB");
  const zNB = await terr("ZONE", "North Bengal", "ZN-NB");
  const zBR = await terr("ZONE", "Bihar", "ZN-BR", undefined, "Bihar");
  const dKOL = await terr("DISTRICT", "Kolkata", "DT-KOL", zSB);
  const dBDN = await terr("DISTRICT", "Purba Bardhaman", "DT-BDN", zSB);
  const dBIR = await terr("DISTRICT", "Birbhum", "DT-BIR", zSB);
  const dMLD = await terr("DISTRICT", "Malda", "DT-MLD", zNB);
  const dPAT = await terr("DISTRICT", "Patna", "DT-PAT", zBR);
  const aBDN = await terr("AREA", "Bardhaman Sadar", "AR-BDN", dBDN);
  const aMEM = await terr("AREA", "Memari", "AR-MEM", dBDN);
  const aKLN = await terr("AREA", "Kalna", "AR-KLN", dBDN);
  const aGUS = await terr("AREA", "Guskara", "AR-GUS", dBDN);
  const aBOL = await terr("AREA", "Bolpur", "AR-BOL", dBIR);
  await terr("AREA", "Suri", "AR-SURI", dBIR);
  const aSLK = await terr("AREA", "Salt Lake", "AR-SLK", dKOL);
  const aEBZ = await terr("AREA", "English Bazar", "AR-EBZ", dMLD);
  const aPAT = await terr("AREA", "Patna Sadar", "AR-PAT", dPAT);
  await Distributor.updateOne({ _id: bardhaman._id }, { $set: { territories: [aBDN._id] } });
  await Distributor.updateOne({ _id: malda._id }, { $set: { territories: [aEBZ._id] } });
  await Distributor.updateOne({ _id: bihar._id }, { $set: { territories: [aPAT._id] } });

  // KYC for the company-supplied distributors: uploaded by the MP, verified by the BH.
  const kyc = async (by: JWTPayload, type: "DEALER" | "DISTRIBUTOR", party: any, items: Array<[string, string]>, verifier: JWTPayload | null) => {
    for (const [docType, number] of items) {
      const doc = await uploadPartyDocument(by, type, String(party._id), { docType, number });
      if (verifier) await verifyPartyDocument(verifier, String(doc._id), "VERIFIED");
    }
  };
  for (const d of [bardhaman, malda, bihar]) {
    await kyc(mpPayload, "DISTRIBUTOR", d, [["GST", d.gstin], ["PAN", d.gstin.slice(2, 12)], ["AGREEMENT", `AGR/${d.distributorCode}`]], bhPayload);
  }
  const demoLogin = async (email: string) => {
    const u = await User.findOneAndUpdate({ email }, { $set: { mustChangePassword: false } }, { new: true });
    return asPayload(u);
  };

  // (1) Super distributor for Birbhum, supplied by the company.
  const sdRes = await createPartner(
    {
      tier: "SUPER_DISTRIBUTOR", name: "Rarh Bengal EV Super Distributors", ownerName: "Debashis Mondal", phone: "9734512890",
      email: "sd1@joykaliev.in", address: "12, Lalbandh Road", city: "Suri", pincode: "731101", gstin: "19AAKFR6612L1Z3",
      territories: [String(dBIR._id)], creditDays: 45, creditLimitRupees: 4000000, assignedASM: String(asmSouth._id),
      login: { password: DEMO_PASSWORD },
    },
    bhPayload
  );
  const sd = sdRes.partner;
  const sdUser = await demoLogin("sd1@joykaliev.in");
  const sdCredit = await CreditLimitChange.findOne({ party: sd._id, status: "PENDING" });
  await approveBoth("credit", String(sdCredit!._id));
  await kyc(mpPayload, "DISTRIBUTOR", sd, [["GST", sd.gstin], ["PAN", sd.gstin.slice(2, 12)], ["AGREEMENT", `AGR/${sd.distributorCode}`]], bhPayload);
  // The super distributor appoints a distributor for Bolpur; it activates once the company verifies its KYC.
  const bolRes = await createPartner(
    {
      tier: "DISTRIBUTOR", name: "Bolpur EV Hub", ownerName: "Suman Ghosh", phone: "9732201456", email: "bolpur.evhub@gmail.com",
      address: "Station Road", city: "Bolpur", pincode: "731204", gstin: "19ABJFB2201K1Z9", territories: [String(aBOL._id)], creditDays: 30, creditLimitRupees: 1500000,
    },
    sdUser
  );
  const bolpur = bolRes.partner;
  await kyc(sdUser, "DISTRIBUTOR", bolpur, [["GST", bolpur.gstin], ["PAN", bolpur.gstin.slice(2, 12)], ["AGREEMENT", "AGR/RARH/BOL-01"]], bhPayload);
  // Company → super distributor: order, both approvals, warehouse dispatch, receipt.
  const oSD = await placeOrder({ partyType: "DISTRIBUTOR", partyId: String(sd._id), lines: [{ modelId: M("FALCON"), quantity: 3 }, { modelId: M("ZIPPY"), quantity: 3 }], notes: "Opening stock for Birbhum" }, sdUser);
  await approveBoth("order", String(oSD._id));
  const doSD = await createDeliveryOrder(String(oSD._id), [{ modelId: M("FALCON"), quantity: 3 }, { modelId: M("ZIPPY"), quantity: 3 }], bhPayload);
  await submitDO(String(doSD._id), bhPayload);
  await startLoading(String(doSD._id), { fleetVehicleId: String(fleet.WB25K4521._id), driverName: "Ramesh Yadav", driverPhone: "9831245670", driverLicence: "WB1020190045821" }, bhPayload);
  await autoPick(String(doSD._id), bhPayload);
  await completeLoading(String(doSD._id), { physicalInspection: true, chassisVerified: true, batteryChargerKeys: true, securedForTransit: true }, bhPayload);
  await generateDocument(String(doSD._id), bhPayload);
  await recordEwayBill(String(doSD._id), { distanceKm: 210, ewbNo: `3810${between(10000000, 99999999)}` }, bhPayload);
  await dispatchDO(String(doSD._id), mpPayload);
  const doSDfull: any = await DeliveryOrderModel.findById(doSD._id).lean();
  await recordGRN(String(doSD._id), { items: doSDfull.vehicles.map((v: any) => ({ vehicleId: String(v.vehicle), condition: "RECEIVED" })), remarks: "Received at Suri godown" }, sdUser);
  // Super distributor → Bolpur distributor (secondary sale), received by the Business Head on Bolpur's behalf (Bolpur has no login).
  const sdStock = await Vehicle.find({ status: "WITH_DISTRIBUTOR", currentLocationDistributor: sd._id }).populate("model").lean();
  const toBol = sdStock.filter((v: any) => v.model.name.includes("Falcon")).slice(0, 2);
  const sBol = await createPartnerSale(sdUser, { buyerKind: "DISTRIBUTOR", buyerId: String(bolpur._id), vehicles: toBol.map((v: any) => ({ vehicleId: String(v._id) })) });
  await receivePartnerSale(bhPayload, String(sBol._id), { remarks: "Confirmed by phone with Bolpur EV Hub" });

  // (2) Bardhaman distributor's own network: a dealer, a sub dealer, and one still waiting for KYC.
  const memRes = await createPartner(
    {
      tier: "DEALER", name: "Memari Motors", ownerName: "Prosenjit Saha", phone: "9800456123", email: "dealer1@joykaliev.in",
      address: "G.T. Road, near Memari Station", city: "Memari", pincode: "713146", gstin: "19ABMFM4410C1Z5",
      territories: [String(aMEM._id)], creditDays: 21, creditLimitRupees: 1500000, login: { password: DEMO_PASSWORD },
    },
    bardhamanUser
  );
  const memari = memRes.partner;
  const memariUser = await demoLogin("dealer1@joykaliev.in");
  await kyc(bardhamanUser, "DEALER", memari, [["GST", memari.gstin], ["PAN", memari.gstin.slice(2, 12)], ["AGREEMENT", "AGR/BDN/MEM-01"], ["CANCELLED_CHEQUE", "SBIN0007788"]], bhPayload);
  const kalRes = await createPartner(
    {
      tier: "SUB_DEALER", name: "Kalna E-Ride Point", ownerName: "Rina Pal", phone: "9851230987", email: "subdealer1@joykaliev.in",
      address: "Kalna Gate", city: "Kalna", pincode: "713409", gstin: "19ACKPP9087D1Z1", territories: [String(aKLN._id)],
      creditDays: 15, creditLimitRupees: 300000, login: { password: DEMO_PASSWORD },
    },
    memariUser
  );
  const kalna = kalRes.partner;
  const kalnaUser = await demoLogin("subdealer1@joykaliev.in");
  await kyc(memariUser, "DEALER", kalna, [["GST", kalna.gstin], ["PAN", kalna.gstin.slice(2, 12)], ["AGREEMENT", "AGR/MEM/KLN-01"]], bhPayload);
  const gusRes = await createPartner(
    {
      tier: "DEALER", name: "Guskara Auto Point", ownerName: "Sk. Rafiqul Islam", phone: "9775312045", email: "guskara.autopoint@gmail.com",
      address: "Guskara Bazar", city: "Guskara", pincode: "713128", gstin: "19ADGPI5521E1Z7", territories: [String(aGUS._id)], creditDays: 21, creditLimitRupees: 600000,
    },
    bardhamanUser
  );
  // Guskara's papers are uploaded but not yet checked by the company → stays "KYC pending".
  await kyc(bardhamanUser, "DEALER", gusRes.partner, [["GST", gusRes.partner.gstin], ["PAN", gusRes.partner.gstin.slice(2, 12)], ["AGREEMENT", "AGR/BDN/GUS-01"]], null);

  // Security deposits: Bardhaman with the company, Memari with Bardhaman.
  await recordDeposit(bhPayload, "DISTRIBUTOR", String(bardhaman._id), { type: "RECEIVED", amountRupees: 200000, mode: "BANK", reference: `UTR${between(100000000, 999999999)}`, narration: "Security deposit as per agreement" });
  await recordDeposit(bardhamanUser, "DEALER", String(memari._id), { type: "RECEIVED", amountRupees: 50000, mode: "CHEQUE", reference: `CHQ ${between(100000, 999999)}` });

  // Bardhaman → Memari: 3 received, 2 still on the road; Memari → Kalna 1; retail bills at each level.
  const bdnStock = await Vehicle.find({ status: "WITH_DISTRIBUTOR", currentLocationDistributor: bardhaman._id }).sort({ chassisNumber: 1 }).lean();
  const s1 = await createPartnerSale(bardhamanUser, { buyerKind: "DEALER", buyerId: String(memari._id), vehicles: bdnStock.slice(0, 3).map((v: any) => ({ vehicleId: String(v._id) })) });
  await receivePartnerSale(memariUser, String(s1._id), { remarks: "All three received" });
  await createPartnerSale(bardhamanUser, { buyerKind: "DEALER", buyerId: String(memari._id), vehicles: bdnStock.slice(3, 5).map((v: any) => ({ vehicleId: String(v._id) })) });
  await createPartnerSale(bardhamanUser, {
    buyerKind: "CUSTOMER", vehicles: [{ vehicleId: String(bdnStock[5]._id) }],
    customer: { name: "Tapas Kumar Roy", phone: "9732145678", address: "Kalitala, Bardhaman" }, paymentMode: "UPI", amountReceivedRupees: 60000,
  });
  await recordNetworkPayment(bardhamanUser, { buyerType: "DEALER", buyerId: String(memari._id), amountRupees: 150000, mode: "BANK", reference: `UTR${between(100000000, 999999999)}` });
  const memStock = await Vehicle.find({ status: "WITH_DEALER", currentLocationDealer: memari._id }).lean();
  const s2 = await createPartnerSale(memariUser, { buyerKind: "DEALER", buyerId: String(kalna._id), vehicles: [{ vehicleId: String(memStock[0]._id) }] });
  await receivePartnerSale(kalnaUser, String(s2._id), { remarks: "Received" });
  await createPartnerSale(memariUser, {
    buyerKind: "CUSTOMER", vehicles: [{ vehicleId: String(memStock[1]._id) }],
    customer: { name: "Mitali Ghosh", phone: "9933012456", address: "Memari Bazar, Purba Bardhaman" }, paymentMode: "FINANCE", amountReceivedRupees: 25000,
  });
  // Memari orders more from Bardhaman → waiting for Bardhaman to accept (demo).
  await placeNetworkOrder(memariUser, { lines: [{ modelId: M("STORM"), quantity: 2 }], notes: "Two Storms for a fleet customer" });

  // Targets for this month: company-set for its partners, Bardhaman-set for Memari.
  await setTarget(bhPayload, { partyType: "DISTRIBUTOR", partyId: String(bardhaman._id), period: current.period, targetUnits: 12, commissionPerUnitRupees: 1500 });
  await setTarget(bhPayload, { partyType: "DISTRIBUTOR", partyId: String(sd._id), period: current.period, targetUnits: 6, commissionPerUnitRupees: 2000 });
  await setTarget(bhPayload, { partyType: "DISTRIBUTOR", partyId: String(malda._id), period: current.period, targetUnits: 8, commissionPerUnitRupees: 1200 });
  await setTarget(bhPayload, { partyType: "DISTRIBUTOR", partyId: String(bihar._id), period: current.period, targetUnits: 10, commissionPerUnitRupees: 1200 });
  await setTarget(bardhamanUser, { partyType: "DEALER", partyId: String(memari._id), period: current.period, targetUnits: 6, commissionPerUnitRupees: 500 });

  // (3) Company showroom in Salt Lake with its own login, stock transfers and counter bills.
  const outlet = await createOutlet(bhPayload, { name: "Joykali Showroom — Salt Lake", address: "DD-14, Sector 1, Salt Lake", city: "Kolkata", pincode: "700064", phone: "03340012345", territoryId: String(aSLK._id) });
  const outletUser = await makeUser("OUTLET", "Sayantani Dutta", "showroom@joykaliev.in", "Showroom Manager — Salt Lake", asmKolkata, { basic: 14000, hra: 5600, conveyance: 1600, other: 2800, esi: false }, { outlet: outlet._id });
  await Outlet.updateOne({ _id: outlet._id }, { $set: { manager: outletUser._id } });
  const outletPayload = asPayload(outletUser);
  const free = await Vehicle.find({ status: "IN_STOCK", currentLocationType: "WAREHOUSE" }).populate("model").sort({ createdAt: -1 }).lean();
  const pickModels = (names: string[], n: number) => {
    const out: any[] = [];
    for (const nm of names) out.push(...free.filter((v: any) => v.model.name.includes(nm) && !out.includes(v)).slice(0, n));
    return out;
  };
  const showroomLot = pickModels(["Falcon", "Storm", "Zippy"], 2);
  const t1 = await createStockTransfer(bhPayload, { outletId: String(outlet._id), direction: "TO_OUTLET", vehicleIds: showroomLot.map((v) => String(v._id)), remarks: "Showroom opening stock" });
  await receiveStockTransfer(outletPayload, String(t1._id));
  const secondLot = pickModels(["CityRide"], 1).filter((v) => !showroomLot.includes(v));
  if (secondLot.length) await createStockTransfer(bhPayload, { outletId: String(outlet._id), direction: "TO_OUTLET", vehicleIds: secondLot.map((v) => String(v._id)), remarks: "E-rickshaw display unit" });
  for (const [i, v] of showroomLot.slice(0, 2).entries()) {
    const m: any = v.model;
    await createSale(
      {
        saleDate: new Date(),
        customer: { name: i ? "Arijit Sen" : "Payel Majumdar", phone: i ? "9830098765" : "9903312478", address: i ? "BF-112, Salt Lake" : "Lake Town, Kolkata" },
        vehicleId: String(v._id),
        soldBy: String(outletUser._id),
        priceBreakdown: { exShowroom: m.sellingPrice / 100, discount: i ? 2000 : 0, gst: 0, registration: 1500, insurance: 4200 },
        paymentMode: i ? "UPI" : "CASH",
        initialPayment: { amount: i ? 40000 : 102000 },
      } as any,
      outletPayload
    );
  }

  // ---------------------------------------------------------------------------
  // Phase 5: HR — departments, shifts, holidays, leave, this month's attendance,
  // advances, loans, claims, a resignation and staff targets.
  // ---------------------------------------------------------------------------
  const todayStr = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  await Setting.updateOne({}, { $set: { hr: { trackingFrom: `${current.period}-01`, latesPerHalfDay: 3, otMultiplier: 2, otEligibleRoles: ["FEC", "OUTLET"], office: { lat: 22.7225, lng: 88.481, radiusM: 300 }, maxAdvancePctOfGross: 50, maxLoanMultipleOfGross: 3, idleLogoutMinutes: 30 } } });
  const [depSales, depChannel, depAdmin, depHr, depShowroom] = await Department.create([
    { name: "Sales", code: "SAL", head: bh._id },
    { name: "Channel & Logistics", code: "CHL", head: bh._id },
    { name: "Accounts & Admin", code: "ADM", head: admin._id },
    { name: "Human Resources", code: "HR" },
    { name: "Showrooms", code: "SHR" },
  ]);
  const general = await Shift.create({ name: "General", code: "GEN", start: "09:30", end: "18:30", graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 480, weeklyOffs: [0], isDefault: true });
  const showroomShift = await Shift.create({ name: "Showroom", code: "SHW", start: "10:30", end: "20:00", graceMinutes: 10, halfDayMinutes: 270, fullDayMinutes: 510, weeklyOffs: [2] });
  const hy = current.year;
  await Holiday.create([
    { date: `${hy}-01-26`, name: "Republic Day", kind: "NATIONAL" },
    { date: `${hy}-05-01`, name: "May Day", kind: "NATIONAL" },
    { date: `${hy}-08-15`, name: "Independence Day", kind: "NATIONAL" },
    { date: `${hy}-10-02`, name: "Gandhi Jayanti", kind: "NATIONAL" },
    { date: `${hy}-10-19`, name: "Durga Puja (Ashtami)", kind: "FESTIVAL" },
    { date: `${hy}-10-20`, name: "Durga Puja (Navami)", kind: "FESTIVAL" },
    { date: `${hy}-10-21`, name: "Bijoya Dashami", kind: "FESTIVAL" },
    { date: `${hy}-11-11`, name: "Bhai Phonta", kind: "FESTIVAL" },
    { date: `${hy}-12-25`, name: "Christmas", kind: "FESTIVAL" },
  ]);
  await LeaveType.create([
    { code: "CL", name: "Casual leave", annualQuota: 12, paid: true, halfDayAllowed: true },
    { code: "SL", name: "Sick leave", annualQuota: 7, paid: true, halfDayAllowed: true },
    { code: "EL", name: "Earned leave", annualQuota: 15, carryForwardMax: 30, paid: true, encashable: true, halfDayAllowed: false },
    { code: "LOP", name: "Unpaid leave", annualQuota: 0, paid: false, halfDayAllowed: true },
  ]);
  const hrUser = await makeUser("HR_MANAGER", "Rupa Sen", "hr@joykaliev.in", "HR Manager", bh, { basic: 22000, hra: 8800, conveyance: 1600, other: 5600 }, { department: depHr._id, attendanceMode: "OFFICE" });
  // Posts: the defaults (one per access level, plus Showroom Manager, Regional Manager, Clerk, Personal Assistant).
  await ensurePosts();
  const postOf = async (name: string) => (await Post.findOne({ name }).lean())!._id;
  await makeUser("STAFF", "Laxmi Mahato", "clerk@joykaliev.in", "Clerk", hrUser, { basic: 7000, hra: 2800, conveyance: 1600, other: 600, esi: true }, { department: depHr._id, attendanceMode: "OFFICE", post: await postOf("Clerk"), codePrefix: "CLK" });
  await makeUser("STAFF", "Priyanka Dutta", "pa@joykaliev.in", "Personal Assistant", mp, { basic: 11000, hra: 4400, conveyance: 1600, other: 3000, esi: true }, { attendanceMode: "OFFICE", post: await postOf("Personal Assistant"), codePrefix: "PA" });
  const hrPayload = asPayload(hrUser);
  await User.updateMany({ role: { $in: ["FEC", "ASM"] } }, { $set: { department: depSales._id, attendanceMode: "FIELD" } });
  await User.updateMany({ role: "MANAGING_PARTNER" }, { $set: { department: depSales._id, attendanceMode: "OFFICE" } });
  // The Business Head works from the office some days and visits the field on others.
  await User.updateMany({ role: "BUSINESS_HEAD" }, { $set: { department: depSales._id, attendanceMode: "HYBRID" } });
  await User.updateMany({ role: "ADMIN" }, { $set: { department: depAdmin._id, attendanceMode: "OFFICE" } });
  await User.updateOne({ _id: outletUser._id }, { $set: { department: depShowroom._id, shift: showroomShift._id, attendanceMode: "OFFICE" } });
  void depChannel;

  // This month's punches: mostly on time, some late, a few absences, overtime on busy days.
  const staff = await User.find({ status: "ACTIVE", role: { $in: ["FEC", "ASM", "OUTLET", "HR_MANAGER", "BUSINESS_HEAD"] } }).lean();
  const at = (date: string, mins: number) => new Date(Date.parse(`${date}T00:00:00+05:30`) + mins * 60000);
  const holidaySet = new Set((await Holiday.find().lean()).map((h: any) => h.date));
  const punchDocs: any[] = [];
  for (const u of staff as any[]) {
    const sh = String(u.shift || "") === String(showroomShift._id) ? showroomShift : general;
    const start = Number(sh.start.slice(0, 2)) * 60 + Number(sh.start.slice(3));
    const end = Number(sh.end.slice(0, 2)) * 60 + Number(sh.end.slice(3));
    const reliability = u.role === "FEC" ? 0.85 + rand() * 0.12 : 0.97;
    for (let d = 1; d <= 31; d++) {
      const date = `${current.period}-${String(d).padStart(2, "0")}`;
      if (date > todayStr || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).getUTCDate() !== d) break;
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (sh.weeklyOffs.includes(dow) || holidaySet.has(date)) continue;
      if (rand() > reliability) continue; // absent
      const late = rand() < 0.18 ? between(12, 45) : between(-20, 8);
      const inMin = start + late;
      const isToday = date === todayStr;
      if (isToday && at(date, inMin).getTime() > Date.now()) continue; // shift not started yet
      // Hybrid staff (Business Head): every third working day is a field visit.
      const place = u.attendanceMode === "OFFICE" ? "OFFICE" : u.attendanceMode === "HYBRID" ? (d % 3 === 0 ? "FIELD" : "OFFICE") : "FIELD";
      punchDocs.push({ employee: u._id, at: at(date, inMin), date, type: "IN", place, source: u.attendanceMode === "OFFICE" ? "WEB" : "MOBILE", location: { lat: 22.57 + rand() * 0.2, lng: 88.36 + rand() * 0.15, accuracy: between(8, 40) } });
      if (isToday) continue; // still at work
      const stay = rand() < 0.15 ? between(60, 150) : between(-25, 25);
      punchDocs.push({ employee: u._id, at: at(date, end + stay), date, type: "OUT", place, source: u.attendanceMode === "OFFICE" ? "WEB" : "MOBILE", location: { lat: 22.57 + rand() * 0.2, lng: 88.36 + rand() * 0.15, accuracy: between(8, 40) } });
    }
  }
  await AttendancePunch.insertMany(punchDocs);

  // Leave: an approved casual leave in the past, a pending sick leave ahead, an unpaid half day.
  const f1 = fecs[0].user, f2 = fecs[1].user, f3 = fecs[2].user, f4 = fecs[3].user, f5 = fecs[4].user, f6 = fecs[5].user, f12 = fecs[11].user;
  const firstWorkday = (() => {
    for (let d = 2; d <= 9; d++) {
      const ds = `${current.period}-${String(d).padStart(2, "0")}`;
      if (ds < todayStr && new Date(`${ds}T00:00:00Z`).getUTCDay() !== 0 && !holidaySet.has(ds)) return ds;
    }
    return `${current.period}-03`;
  })();
  await AttendancePunch.deleteMany({ employee: f2._id, date: firstWorkday });
  await LeaveRequest.create({ employee: f2._id, employeeName: f2.name, leaveType: (await LeaveType.findOne({ code: "CL" }))!._id, leaveCode: "CL", paid: true, from: firstWorkday, to: firstWorkday, days: 1, reason: "Family function", status: "APPROVED", decidedBy: asmNorth._id, decidedByName: asmNorth.name, decidedAt: new Date() });
  const nextWeek = new Date(Date.now() + 330 * 60000 + 6 * 86400000).toISOString().slice(0, 10);
  await applyLeave(asPayload(f6), { leaveCode: "EL", from: nextWeek, to: new Date(Date.parse(`${nextWeek}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10), reason: "Sister's wedding in Siliguri" });
  await applyLeave(asPayload(f3), { leaveCode: "SL", from: todayStr, to: todayStr, half: true, reason: "Doctor's appointment in the afternoon" });
  // A missed out-punch the FEC asks to correct.
  const missedDay = (punchDocs.find((p) => String(p.employee) === String(f5._id) && p.type === "OUT" && p.date < todayStr) || {}).date;
  if (missedDay) {
    await AttendancePunch.deleteMany({ employee: f5._id, date: missedDay, type: "OUT" });
    await Regularization.create({ employee: f5._id, employeeName: f5.name, date: missedDay, outTime: "19:05", reason: "Phone battery died at the Barasat test-ride camp" });
  }
  // Overtime for the showroom manager approved by the Kolkata ASM.
  const otDays = punchDocs.filter((p) => String(p.employee) === String(outletUser._id) && p.type === "OUT").map((p) => p.date);
  if (otDays.length) await approveOvertime(asmKolkataPayload, String(outletUser._id), otDays);

  // Money: an active loan, a pending advance, claims at every stage, one resignation.
  const loan = await requestAdvance(asPayload(f2), { kind: "LOAN", amountRupees: 30000, tenureMonths: 6, reason: "Two-wheeler repair after accident" });
  await signApproval("advance" as any, String(loan._id), bhPayload, "APPROVED");
  await signApproval("advance" as any, String(loan._id), mpPayload, "APPROVED");
  await requestAdvance(asPayload(f5), { kind: "ADVANCE", amountRupees: 8000, reason: "Child's school admission fee" });
  const d3 = new Date(Date.now() + 330 * 60000 - 3 * 86400000).toISOString().slice(0, 10);
  await submitClaim(asPayload(f1), { date: d3, category: "FUEL", amountRupees: 420, description: "Petrol for dealer visits, Siliguri–Jalpaiguri", kmTravelled: 96 });
  const c2 = await submitClaim(asPayload(f3), { date: d3, category: "TRAVEL", amountRupees: 1850, description: "Bus + auto to Malda distributor meeting", bill: { name: "ticket.png", type: "image/png", data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") } });
  await verifyClaim(hrPayload, String(c2._id), "VERIFIED");
  const c3 = await submitClaim(asPayload(f4), { date: d3, category: "CUSTOMER_DEMO", amountRupees: 350, description: "Tea and snacks for a fleet-buyer demo" });
  await verifyClaim(hrPayload, String(c3._id), "VERIFIED");
  await signApproval("claim" as any, String(c3._id), bhPayload, "APPROVED");
  await signApproval("claim" as any, String(c3._id), mpPayload, "APPROVED");
  await submitResignation(asPayload(f12), { reason: "Moving to Bangalore with family", requestedLwd: new Date(Date.now() + 330 * 60000 + 20 * 86400000).toISOString().slice(0, 10) });
  // Monthly unit targets for every FEC, set by their ASM.
  for (const f of fecs) await EmployeeTarget.create({ employee: f.user._id, period: current.period, targetUnits: Math.max(3, Math.round(6 * f.skill)), setByName: "Area Sales Manager" });
  await EmployeeDocument.create([
    { employee: f1._id, docType: "AADHAAR", number: "XXXX-XXXX-4521", uploadedBy: f1._id },
    { employee: f1._id, docType: "PAN", number: "BQKPS4521M", uploadedBy: f1._id, verified: true, verifiedByName: hrUser.name },
  ]);
  void hrPayload;
  void AttendanceDay;

  // ---------------------------------------------------------------------------
  // Phase 6: several warehouses with transfers, accounts (cash/bank books,
  // expenses, vouchers, payouts, budgets) and the editable salary structure.
  // ---------------------------------------------------------------------------
  console.log("• Warehouses, store & accounts logins, transfers");
  const PNG = { name: "bill.png", type: "image/png", data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") };
  const storeUser = await makeUser("STORE_MANAGER", "Bapi Mahato", "store@joykaliev.in", "Store Manager — Siliguri Warehouse", asmNorth, { basic: 11000, hra: 4400, conveyance: 1600, other: 2000, esi: true }, { attendanceMode: "OFFICE" });
  const accountsUser = await makeUser("ACCOUNTANT", "Nabanita Dutta", "accounts@joykaliev.in", "Accounts Manager", mp, { basic: 20000, hra: 8000, conveyance: 1600, other: 4400 }, { attendanceMode: "OFFICE" });
  const storePayload = asPayload(storeUser);
  const accountsPayload = asPayload(accountsUser);
  const mainWh = await mainWarehouse();
  mainWh.name = "Main Warehouse — Barasat";
  await mainWh.save();
  const siliguri = await saveWarehouse(asPayload(admin), { name: "Siliguri Warehouse", address: "Plot 7, Sevoke Road Industrial Estate", city: "Siliguri", state: "West Bengal", stateCode: "19", pincode: "734001", phone: "9800012345", managerId: String(storeUser._id) });
  const dhanbad = await saveWarehouse(asPayload(admin), { name: "Dhanbad Depot", address: "Govindpur Road, Near Bus Stand", city: "Dhanbad", state: "Jharkhand", stateCode: "20", pincode: "828109", phone: "9800054321" });

  // Stock bought straight into Siliguri.
  const sgLines = [["STORM", 4], ["ZIPPY", 3]].map(([k, q]: any) => {
    const spec = modelSpecs.find((m) => m.key === k)!;
    return {
      model: String(models[k]._id), quantity: q, unitCost: spec.cost, gstRate: 5,
      vehicles: Array.from({ length: q }, () => {
        chassisSeq += 1;
        const code = `${k.slice(0, 3)}${current.year % 100}${String(current.month).padStart(2, "0")}${chassisSeq}`;
        return { chassisNumber: `MD9JK${code}`, motorNumber: `MTR${code}`, batteryNumber: `BAT${code}`, chargerNumber: `CHG${code}`, color: pick([...COLORS]) };
      }),
    };
  });
  await createPurchaseAgain({ supplier: String(supplierMain._id), invoiceNumber: `VDM/${current.year}/SG/${between(100, 999)}`, invoiceDate: ymd(current.year, current.month, Math.max(1, todayIst - 6)), lineItems: sgLines, notes: "Direct to Siliguri", warehouseId: String(siliguri._id) }, bhPayload);

  // Main → Siliguri: sent by the Business Head, checked in by the Siliguri store manager.
  const wt1 = await createWarehouseTransfer(bhPayload, {
    fromId: String(mainWh._id), toId: String(siliguri._id),
    lines: [{ modelId: M("FALCON"), quantity: 2 }, { modelId: M("CITYRIDE"), quantity: 1 }],
    transport: { vehicleNo: "WB 23 C 4410", driverName: "Gopal Roy", driverPhone: "9832011223", ewayBillNo: "331009876512" },
    remarks: "Stock for North Bengal dealers",
  });
  await receiveWarehouseTransfer(storePayload, String(wt1._id));
  // Main → Dhanbad (another state): taxable branch transfer, still on the road.
  await createWarehouseTransfer(bhPayload, {
    fromId: String(mainWh._id), toId: String(dhanbad._id),
    lines: [{ modelId: M("STORM"), quantity: 2 }],
    transport: { vehicleNo: "WB 25 F 9021", driverName: "Shyamal Saha", driverPhone: "9830099887", ewayBillNo: "331009876598", invoiceNo: "JKBT/2026-27/0003" },
    remarks: "Opening stock for the Jharkhand depot",
  });
  // Siliguri → Main: sent by the store manager, waiting for Barasat to check it in.
  await createWarehouseTransfer(storePayload, {
    fromId: String(siliguri._id), toId: String(mainWh._id),
    lines: [{ modelId: M("ZIPPY"), quantity: 1 }],
    transport: { vehicleNo: "WB 73 B 1180", driverName: "Mithun Paul", driverPhone: "9775501234" },
    remarks: "Slow mover back to Barasat",
  });
  await setMinStock(asPayload(admin), String(siliguri._id), [{ modelId: M("FALCON"), qty: 4 }, { modelId: M("STORM"), qty: 3 }, { modelId: M("CITYRIDE"), qty: 2 }]);
  await setMinStock(asPayload(admin), String(mainWh._id), [{ modelId: M("AUTO"), qty: 2 }, { modelId: M("CARGO"), qty: 3 }]);

  // PF / ESI numbers for everyone on payroll.
  for (const u of await User.find({ role: { $in: ["FEC", "OUTLET", "ASM", "HR_MANAGER", "ACCOUNTANT", "STORE_MANAGER", "STAFF", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"] } }).select("_id").lean()) {
    const ss: any = await SalaryStructure.findOne({ employee: u._id }).lean();
    await User.updateOne({ _id: u._id }, { $set: { uan: `1009${between(10000000, 99999999)}`, esiNumber: ss?.fixedDeductions?.esi ? `31${between(10000000, 99999999)}` : "" } });
  }

  console.log("• Salary structure with editable columns (approved) + current month payroll");
  const tpl = await proposeTemplate(hrPayload, {
    effectiveFrom: current.period,
    reason: "Add a medical allowance and a staff welfare fund as agreed with the staff committee",
    components: [
      { key: "basic", name: "Basic", kind: "EARNING", calc: "PCT_GROSS", value: 50, pfWage: true, prorate: true, active: true },
      { key: "hra", name: "HRA", kind: "EARNING", calc: "PCT_BASIC", value: 40, pfWage: false, prorate: true, active: true },
      { key: "conveyance", name: "Conveyance", kind: "EARNING", calc: "FIXED", value: 160000, pfWage: false, prorate: true, active: true },
      { key: "medical", name: "Medical allowance", kind: "EARNING", calc: "PCT_BASIC", value: 5, pfWage: false, prorate: true, active: true },
      { key: "special", name: "Special allowance", kind: "EARNING", calc: "BALANCE", value: 0, pfWage: false, prorate: true, active: true },
      { key: "welfare", name: "Staff welfare fund", kind: "DEDUCTION", calc: "FIXED", value: 5000, pfWage: false, prorate: false, active: true },
    ],
    statutory: { ...DEFAULT_STATUTORY },
  });
  await signApproval("salaryTemplate" as any, String(tpl._id), bhPayload, "APPROVED");
  await signApproval("salaryTemplate" as any, String(tpl._id), mpPayload, "APPROVED");
  await generateDraftPayrollRun(current.year, current.month, bhPayload, `Monthly payroll ${current.period}`);

  console.log("• Accounts: cash & bank, supplier payments, salaries paid, expenses, vouchers, budgets");
  await ensureAccounts();
  const fyFrom = `${current.month < 4 ? current.year - 1 : current.year}-04-01`;
  const cashAcc = await MoneyAccount.findOne({ kind: "CASH" });
  const bankAcc = await MoneyAccount.findOne({ kind: "BANK" });
  cashAcc!.openingBalance = rupeesToPaise(150000);
  cashAcc!.openingDate = fyFrom;
  await cashAcc!.save();
  bankAcc!.name = "SBI Current A/c — Barasat";
  bankAcc!.bankName = "State Bank of India";
  bankAcc!.accountNo = "38291045562";
  bankAcc!.ifsc = "SBIN0001234";
  bankAcc!.openingBalance = rupeesToPaise(5000000);
  bankAcc!.openingDate = fyFrom;
  await bankAcc!.save();
  const hdfc = await saveMoneyAccount(accountsPayload, { name: "HDFC Current A/c — Salaries", kind: "BANK", bankName: "HDFC Bank", accountNo: "50200061234567", ifsc: "HDFC0004567", openingRupees: 1200000, openingDate: fyFrom });
  const dayOf = (p: { year: number; month: number }, d: number) => `${p.year}-${String(p.month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayYmd = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const clampDay = (s: string) => (s > todayYmd ? todayYmd : s);

  // Supplier invoices: older ones paid in full from SBI, the latest left part-paid / unpaid.
  const purchasesAll = await (await import("../src/models/Purchase")).Purchase.find().sort({ invoiceDate: 1 }).lean();
  for (const [i, pch] of purchasesAll.entries()) {
    const inv = new Date(new Date(pch.invoiceDate).getTime() + 330 * 60000);
    const age = (Date.now() - inv.getTime()) / 86400000;
    if (age < 10) continue;
    const payOn = clampDay(new Date(inv.getTime() + 20 * 86400000).toISOString().slice(0, 10));
    const part = i === purchasesAll.length - 4;
    await recordPayout(accountsPayload, "purchase", String(pch._id), { accountId: String(bankAcc!._id), date: payOn, reference: `NEFT/${between(100000, 999999)}`, ...(part ? { amountRupees: Math.round(pch.totalAmount / 200) } : {}) });
  }
  // Salaries of locked months paid from HDFC on the 1st of the next month; the loan paid out in cash… by bank.
  for (const r of await PayrollRun.find({ status: "LOCKED" }).sort({ year: 1, month: 1 }).lean()) {
    const nm = r.month === 12 ? { year: r.year + 1, month: 1 } : { year: r.year, month: r.month + 1 };
    await recordPayout(accountsPayload, "payroll", String(r._id), { accountId: String(hdfc._id), date: clampDay(dayOf(nm, 1)), reference: `Salary ${r.runCode}` });
  }
  await recordPayout(accountsPayload, "advance", String(loan._id), { accountId: String(bankAcc!._id), date: todayYmd, reference: "IMPS to employee" });

  // Working-capital loan from the bank in the first month (a receipt that is not income).
  await createVoucher(accountsPayload, { type: "RECEIPT", date: clampDay(dayOf(first, 2)), accountId: String(bankAcc!._id), amountRupees: 5000000, head: "Loan received", narration: "SBI working-capital term loan disbursed", reference: "SBI/WCTL/2026/118" });
  // Contra: fund the salary account from SBI each month, deposit surplus cash.
  for (const p of months.slice(0, -1)) {
    await createVoucher(accountsPayload, { type: "CONTRA", date: clampDay(dayOf(p, 28)), accountId: String(bankAcc!._id), toAccountId: String(hdfc._id), amountRupees: 600000, head: "Transfer between banks", narration: `Fund salary account for ${p.period}` });
  }
  // Showroom cash banked at every month end, keeping a ₹50,000 float.
  for (const p of months.slice(0, -1)) {
    const eom = clampDay(dayOf(p, new Date(Date.UTC(p.year, p.month, 0)).getUTCDate()));
    const bal = (await accountBalances(eom)).find((a: any) => a.kind === "CASH")!.balance;
    if (bal > rupeesToPaise(60000)) await createVoucher(accountsPayload, { type: "CONTRA", date: eom, accountId: String(cashAcc!._id), toAccountId: String(bankAcc!._id), amountRupees: Math.floor((bal - rupeesToPaise(50000)) / 100), head: "Cash deposited in bank", narration: `Month-end cash deposit ${p.period}` });
  }
  // Monthly running costs.
  for (const [mi, p] of months.entries()) {
    const last = mi === months.length - 1;
    const d = (n: number) => clampDay(dayOf(p, n));
    const mk = async (x: any, approve: boolean, pay: { acc: any; on: string } | null) => {
      const e = await createExpense(accountsPayload, { ...x, bill: PNG, payNow: !approve && pay ? { accountId: String(pay.acc._id), date: pay.on, reference: x.ref } : null });
      if (approve) {
        await signApproval("expense" as any, String(e._id), bhPayload, "APPROVED");
        await signApproval("expense" as any, String(e._id), mpPayload, "APPROVED");
        if (pay) await recordPayout(accountsPayload, "expense", String(e._id), { accountId: String(pay.acc._id), date: pay.on, reference: x.ref });
      }
      return e;
    };
    await mk({ date: d(1), category: "Rent", description: `Barasat warehouse & office rent ${p.period}`, vendor: "Sri Durga Properties", billNo: `R/${p.period}`, amountRupees: 45000, gstRupees: 8100, gstInput: true, costCentre: "Main Warehouse — Barasat", ref: `CHQ ${between(100000, 999999)}` }, true, last && todayIst < 6 ? null : { acc: bankAcc, on: d(5) });
    await mk({ date: d(8), category: "Electricity & water", description: `WBSEDCL bill ${p.period} — warehouse & charging bay`, vendor: "WBSEDCL", billNo: `E${between(10000, 99999)}`, amountRupees: 6600 + between(0, 2400), costCentre: "Main Warehouse — Barasat", ref: "UPI" }, false, { acc: bankAcc, on: d(9) });
    await mk({ date: d(12), category: "Fuel & conveyance", description: "Diesel for the delivery truck and pilot runs", vendor: "IOCL Barasat", amountRupees: 3200 + between(0, 1800), costCentre: "Head office", ref: "cash" }, false, { acc: cashAcc, on: d(12) });
    if (mi % 2 === 0) await mk({ date: d(15), category: "Repairs & maintenance", description: "Charger and lift servicing", vendor: "PowerTech Services", amountRupees: 4600, gstRupees: 828, gstInput: true, costCentre: "Main Warehouse — Barasat", ref: "cash" }, false, { acc: cashAcc, on: d(16) });
    if (mi % 3 === 1) await mk({ date: d(18), category: "Marketing & advertising", description: "Local newspaper ads and hoardings", vendor: "Bartaman Ads", amountRupees: 22000, gstRupees: 3960, gstInput: true, costCentre: "Head office", ref: `NEFT ${between(10000, 99999)}` }, true, { acc: bankAcc, on: d(22) });
    await mk({ date: d(20), category: "Telephone & internet", description: "Jio fibre + staff SIMs", vendor: "Reliance Jio", amountRupees: 2950, gstRupees: 531, gstInput: true, costCentre: "Head office", ref: "auto-debit" }, false, { acc: bankAcc, on: d(20) });
    await createVoucher(accountsPayload, { type: "PAYMENT", date: d(Math.min(25, 28)), accountId: String(bankAcc!._id), amountRupees: 350 + between(0, 300), head: "Bank charges", narration: "NEFT / RTGS charges for the month" });
    if (!last) await createVoucher(accountsPayload, { type: "RECEIPT", date: d(28), accountId: String(bankAcc!._id), amountRupees: 4200 + between(0, 800), head: "Interest income", narration: "Sweep FD interest" });
  }
  // This month: marketing bill with the Business Head's signature, waiting for the MP; an approved bill to pay; a store petty-cash bill.
  const mkt = await createExpense(accountsPayload, { date: todayYmd, category: "Marketing & advertising", description: "Puja pandal branding — Siliguri", vendor: "North Star Events", billNo: "NSE/118", amountRupees: 35000, gstRupees: 6300, gstInput: true, costCentre: "Siliguri Warehouse", bill: PNG });
  await signApproval("expense" as any, String(mkt._id), bhPayload, "APPROVED");
  const ins = await createExpense(accountsPayload, { date: todayYmd, category: "Insurance", description: "Stock-in-warehouse insurance renewal", vendor: "New India Assurance", billNo: "NIA/77821", amountRupees: 18500, gstRupees: 3330, costCentre: "Main Warehouse — Barasat", bill: PNG });
  await signApproval("expense" as any, String(ins._id), bhPayload, "APPROVED");
  await signApproval("expense" as any, String(ins._id), mpPayload, "APPROVED");
  await createExpense(storePayload, { date: todayYmd, category: "Office supplies & printing", description: "Stock register and labels", vendor: "Sevoke Stationers", amountRupees: 640, costCentre: "Siliguri Warehouse" });
  // Surplus showroom cash deposited in the bank.
  const cashNow = (await accountBalances(todayYmd)).find((a: any) => a.kind === "CASH")!.balance;
  if (cashNow > rupeesToPaise(60000)) await createVoucher(accountsPayload, { type: "CONTRA", date: todayYmd, accountId: String(cashAcc!._id), toAccountId: String(bankAcc!._id), amountRupees: Math.floor((cashNow - rupeesToPaise(50000)) / 100), head: "Cash deposited in bank", narration: "Cash deposited at SBI Barasat" });
  // Dealer payments: receipts with UTR into the right bank account, partner payment advices at every stage, bank matching.
  console.log("• Dealer payments, advices, bank matching");
  const bankId = String(bankAcc!._id);
  await recordReceipt(accountsPayload, { partyType: "DISTRIBUTOR", partyId: String(bihar._id), amountRupees: 300000, mode: "RTGS", utr: `SBINR5202611${between(1000000, 9999999)}`, payerBank: "SBI Patna Main", accountId: bankId, narration: "Advance against JKI shipment" });
  await recordReceipt(accountsPayload, { partyType: "DEALER", partyId: String(howrah._id), amountRupees: 45000, mode: "CASH", narration: "Cash at Barasat counter" });
  await recordReceipt(accountsPayload, { partyType: "DEALER", partyId: String(howrah._id), amountRupees: 60000, mode: "CHEQUE", utr: String(between(100000, 999999)), payerBank: "Bank of India, Shibpur", accountId: bankId });
  const adv1 = await submitAdvice(bardhamanUser, { amountRupees: 250000, date: todayYmd, mode: "NEFT", utr: `HDFCN5202611${between(1000000, 9999999)}`, payerBank: "HDFC Bank Bardhaman", note: "Against JKI/2026-27/0001", proof: PNG });
  void adv1;
  const adv2 = await submitAdvice(howrahUser, { amountRupees: 40000, date: todayYmd, mode: "UPI", utr: `UPI${between(100000000, 999999999)}`, payerBank: "PhonePe", proof: PNG });
  await verifyAdvice(accountsPayload, String(adv2._id), { accountId: bankId });
  const adv3 = await submitAdvice(biharUser, { amountRupees: 150000, date: todayYmd, mode: "IMPS", utr: `IMPS${between(10000000, 99999999)}`, payerBank: "Axis Bank Patna", proof: PNG });
  await rejectAdvice(accountsPayload, String(adv3._id), "Not seen in our SBI account yet — please check the UTR");
  // Older receipts already matched with the bank statement.
  const older = await LedgerEntryModel.find({ type: "PAYMENT", book: null, paymentMode: { $ne: "CASH" } }).sort({ date: 1 }).lean();
  if (older.length > 1) await setCleared(accountsPayload, older.slice(0, older.length - 2).map((e: any) => String(e._id)), todayYmd);

  // Budgets for this month and last month.
  for (const p of months.slice(-2)) {
    await setBudget(accountsPayload, p.period, [
      { head: SALARY_HEAD, amountRupees: 620000 },
      { head: "Rent", amountRupees: 45000 },
      { head: "Electricity & water", amountRupees: 9000 },
      { head: "Fuel & conveyance", amountRupees: 4000 },
      { head: "Marketing & advertising", amountRupees: 30000 },
      { head: "Repairs & maintenance", amountRupees: 5000 },
      { head: "Telephone & internet", amountRupees: 3000 },
      { head: "Insurance", amountRupees: 10000 },
    ]);
  }


  // ---------------------------------------------------------------- Phase 7
  console.log("• Parts, accessories, batteries & chargers: item master, purchase, stock, counter sales, battery service");
  const it = async (x: any) => createItem(asPayload(admin), x);
  const bat60 = await it({ name: "Li-ion battery 60V 30Ah", category: "BATTERY", brand: "Exide Neo", partNo: "EXN-6030", unit: "PCS", hsnCode: "850760", gstRate: 18, purchaseRupees: 16500, sellingRupees: 21500, dealerRupees: 19800, serialTracked: true, minStock: 4, compatibleModels: [String(models.STORM._id), String(models.FALCON._id)] });
  const bat48 = await it({ name: "Li-ion battery 48V 24Ah", category: "BATTERY", brand: "Exide Neo", partNo: "EXN-4824", unit: "PCS", hsnCode: "850760", gstRate: 18, purchaseRupees: 11200, sellingRupees: 14900, serialTracked: true, minStock: 3, compatibleModels: [String(models.ZIPPY._id)] });
  const batLfp = await it({ name: "LFP battery pack 51V 105Ah", category: "BATTERY", brand: "Trontek", partNo: "TRN-51105", unit: "PCS", hsnCode: "850760", gstRate: 18, purchaseRupees: 52000, sellingRupees: 64000, serialTracked: true, minStock: 2, compatibleModels: [String(models.CITYRIDE._id), String(models.CARGO._id), String(models.AUTO._id)] });
  const chg60 = await it({ name: "Smart charger 60V 5A", category: "CHARGER", brand: "Joykali", partNo: "JK-CH605", unit: "PCS", hsnCode: "850440", gstRate: 18, purchaseRupees: 2100, sellingRupees: 3200, serialTracked: true, minStock: 5 });
  const brake = await it({ name: "Brake shoe set (front)", category: "SPARE_PART", partNo: "BS-F110", unit: "SET", hsnCode: "871410", gstRate: 28, purchaseRupees: 180, sellingRupees: 320, minStock: 20 });
  const tyre = await it({ name: "Tubeless tyre 90/90-12", category: "SPARE_PART", brand: "TVS Eurogrip", unit: "PCS", hsnCode: "401140", gstRate: 28, purchaseRupees: 1150, sellingRupees: 1550, minStock: 10 });
  const mirror = await it({ name: "Rear-view mirror (pair)", category: "SPARE_PART", unit: "PAIR", hsnCode: "871410", gstRate: 28, purchaseRupees: 140, sellingRupees: 260, minStock: 15 });
  const throttle = await it({ name: "Throttle assembly 60V", category: "SPARE_PART", partNo: "TH-60", unit: "PCS", hsnCode: "871410", gstRate: 28, purchaseRupees: 420, sellingRupees: 690, minStock: 6 });
  const helmet = await it({ name: "ISI helmet (half face)", category: "ACCESSORY", brand: "Steelbird", unit: "PCS", hsnCode: "650610", gstRate: 18, purchaseRupees: 620, sellingRupees: 990, minStock: 24 });
  const holder = await it({ name: "Mobile holder with USB charger", category: "ACCESSORY", unit: "PCS", hsnCode: "851762", gstRate: 18, purchaseRupees: 210, sellingRupees: 449, minStock: 10 });
  const cover = await it({ name: "Body cover (waterproof)", category: "ACCESSORY", unit: "PCS", hsnCode: "630790", gstRate: 12, purchaseRupees: 260, sellingRupees: 499, minStock: 10 });
  // Default battery of each model (taken into stock when a vehicle is sold without its battery).
  await VehicleModel.updateMany({ _id: { $in: [models.STORM._id, models.FALCON._id] } }, { $set: { batteryItem: bat60._id } });
  await VehicleModel.updateOne({ _id: models.ZIPPY._id }, { $set: { batteryItem: bat48._id } });
  await VehicleModel.updateMany({ _id: { $in: [models.CITYRIDE._id, models.CARGO._id, models.AUTO._id] } }, { $set: { batteryItem: batLfp._id } });

  // One supplier invoice with parts for two warehouses (Barasat + Siliguri), entered by the accountant.
  const serials = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${current.year % 100}${String(current.month).padStart(2, "0")}${String(i + 1).padStart(3, "0")}`);
  const partsDate = ymd(current.year, current.month, Math.max(1, todayIst - 8));
  await createPurchaseAgain(
    {
      supplier: String(supplierMain._id),
      invoiceNumber: `VDM/${current.year}/SP/${between(100, 999)}`,
      invoiceDate: partsDate,
      notes: "Spares, accessories and batteries — 2 cases",
      warehouseId: String(mainWh._id),
      lineItems: [
        { kind: "ITEM", itemId: String(bat60._id), quantity: 8, unitCost: 16500, gstRate: 18, serials: serials("EXN60A", 8) },
        { kind: "ITEM", itemId: String(bat48._id), quantity: 4, unitCost: 11200, gstRate: 18, serials: serials("EXN48A", 4) },
        { kind: "ITEM", itemId: String(chg60._id), quantity: 6, unitCost: 2100, gstRate: 18, serials: serials("CH60A", 6) },
        { kind: "ITEM", itemId: String(helmet._id), quantity: 24, unitCost: 620, gstRate: 18 },
        { kind: "ITEM", itemId: String(holder._id), quantity: 12, unitCost: 210, gstRate: 18 },
        { kind: "ITEM", itemId: String(cover._id), quantity: 15, unitCost: 260, gstRate: 12 },
        { kind: "ITEM", itemId: String(brake._id), quantity: 30, unitCost: 180, gstRate: 28 },
        { kind: "ITEM", itemId: String(tyre._id), quantity: 12, unitCost: 1150, gstRate: 28 },
        { kind: "ITEM", itemId: String(mirror._id), quantity: 20, unitCost: 140, gstRate: 28 },
        { kind: "ITEM", itemId: String(throttle._id), quantity: 5, unitCost: 420, gstRate: 28 },
        // Siliguri's share of the same invoice
        { kind: "ITEM", itemId: String(helmet._id), quantity: 10, unitCost: 620, gstRate: 18, warehouseId: String(siliguri._id) },
        { kind: "ITEM", itemId: String(brake._id), quantity: 10, unitCost: 180, gstRate: 28, warehouseId: String(siliguri._id) },
        { kind: "ITEM", itemId: String(bat60._id), quantity: 2, unitCost: 16500, gstRate: 18, serials: serials("EXN60S", 2), warehouseId: String(siliguri._id) },
      ],
    },
    accountsPayload
  );
  await createPurchaseAgain(
    {
      supplier: String(supplierCargo._id),
      invoiceNumber: `ECW/${current.year}/SP/${between(100, 999)}`,
      invoiceDate: partsDate,
      notes: "LFP packs for the commercial range",
      warehouseId: String(mainWh._id),
      lineItems: [{ kind: "ITEM", itemId: String(batLfp._id), quantity: 3, unitCost: 52000, gstRate: 18, serials: serials("TRN51A", 3) }],
    },
    accountsPayload
  );
  // Opening stock counted at Siliguri, entered by the store manager; a damaged mirror written off.
  await stockIn(storePayload, { itemId: String(mirror._id), warehouseId: String(siliguri._id), qty: 6, reason: "OPENING", notes: "Physical count" } as any);
  await stockIn(storePayload, { itemId: String(holder._id), warehouseId: String(siliguri._id), qty: 4, reason: "OPENING", notes: "Physical count" } as any);
  await stockOut(storePayload, { itemId: String(mirror._id), warehouseId: String(siliguri._id), qty: 1, reason: "DAMAGED", notes: "Glass cracked in transit" } as any);
  await transferItems(bhPayload, { itemId: String(tyre._id), fromId: String(mainWh._id), toId: String(siliguri._id), qty: 4, notes: "North Bengal service stock" });

  // Counter bills.
  await createPartsSale(bhPayload, { saleDate: ymd(current.year, current.month, Math.max(1, todayIst - 5)), customer: { name: "Rakesh Mondal", phone: "9831200456", address: "Madhyamgram" }, warehouseId: String(mainWh._id), lines: [{ itemId: String(brake._id), qty: 2 }, { itemId: String(mirror._id), qty: 1 }], paymentMode: "CASH" });
  await createPartsSale(bhPayload, { saleDate: ymd(current.year, current.month, Math.max(1, todayIst - 3)), customer: { name: "Sarkar Motors", phone: "9830077120", address: "Barasat, North 24 Pgs", gstin: "19ABCPS1234K1Z9" }, warehouseId: String(mainWh._id), lines: [{ itemId: String(tyre._id), qty: 4, rateRupees: 1500 }, { itemId: String(helmet._id), qty: 6, discountRupees: 300 }], paymentMode: "CREDIT", notes: "Monthly credit customer" });
  await createPartsSale(storePayload, { saleDate: todayYmd, customer: { name: "Pinki Barman", phone: "9734011220", address: "Siliguri" }, warehouseId: String(siliguri._id), lines: [{ itemId: String(bat60._id), qty: 1, serials: [serials("EXN60S", 2)[0]] }], paymentMode: "UPI", reference: `UPI${between(100000000, 999999999)}`, notes: "Spare battery" });

  // Vehicle sales: one with accessories on the same invoice, one sold without its battery.
  const seller = fecs[0];
  const sellerPayload = asPayload(seller.user);
  const freshVehicles = await Vehicle.find({ status: "IN_STOCK", currentLocationType: "WAREHOUSE", warehouse: mainWh._id, model: { $in: [models.STORM._id, models.FALCON._id] } }).populate("model").limit(2).lean();
  if (freshVehicles.length === 2) {
    const [va, vb] = freshVehicles as any[];
    const accLines = [{ itemId: String(helmet._id), qty: 2 }, { itemId: String(holder._id), qty: 1 }];
    const accTotal = [{ r: 990, q: 2, g: 18 }, { r: 449, q: 1, g: 18 }].reduce((t, l) => t + Math.round(l.r * l.q * 100 * (1 + l.g / 100)) / 100, 0);
    const exA = va.model.sellingPrice / 100;
    const withAcc = await createSale(
      { saleDate: todayYmd, customer: { name: "Debjani Pal", phone: "9748800123", address: "Dum Dum Park, Kolkata 700055", idProofType: "Aadhaar", idProofNumber: "XXXX-XXXX-4412" }, vehicleId: String(va._id), soldBy: String(seller.user._id), priceBreakdown: { exShowroom: exA, discount: 1000, gst: 0, registration: 1200, insurance: 3500 }, paymentMode: "UPI", initialPayment: { amount: Math.round((exA - 1000) * 1.05 + 1200 + 3500 + accTotal), reference: `UPI${between(100000000, 999999999)}` }, items: accLines, itemsWarehouseId: String(mainWh._id) } as any,
      sellerPayload
    );
    // the customer paid the invoice to the paisa
    await Sale.updateOne({ _id: withAcc._id }, { $set: { "payments.0.amount": withAcc.totalAmount } });
    const exB = va.model._id.equals(vb.model._id) ? exA : vb.model.sellingPrice / 100;
    const noBatPrice = exB - 21500;
    await createSale(
      { saleDate: todayYmd, customer: { name: "Arif Hossain", phone: "9903312345", address: "Rajarhat, New Town 700135" }, vehicleId: String(vb._id), soldBy: String(seller.user._id), priceBreakdown: { exShowroom: noBatPrice, discount: 0, gst: 0, registration: 1200, insurance: 3500 }, paymentMode: "CASH", initialPayment: { amount: Math.round(noBatPrice * 1.05 + 4700) }, withoutBattery: true, batteryWarehouseId: String(mainWh._id) } as any,
      sellerPayload
    );
  }

  // Battery service: one in for repair, one replaced under warranty, one repaired and returned.
  await receiveBattery(bhPayload, { customer: { name: "Sujit Ghosh", phone: "9836022331" }, chassisNumber: "", itemId: String(bat60._id), serialNo: "EXN60OLD1187", warehouseId: String(mainWh._id), complaint: "Backup dropped to 35 km" });
  await receiveBattery(bhPayload, {
    customer: { name: "Mitali Das", phone: "9830455612" },
    itemId: String(bat48._id),
    serialNo: "EXN48OLD0921",
    warehouseId: String(mainWh._id),
    complaint: "Cell failure — not charging",
    replaceNow: { itemId: String(bat48._id), serialNo: serials("EXN48A", 4)[0], warranty: true, resolution: "Replaced under 3-year warranty" },
  });
  const jobR: any = await receiveBattery(bhPayload, { customer: { name: "Tapas Kundu", phone: "9875012340" }, itemId: String(bat60._id), serialNo: "EXN60OLD0450", warehouseId: String(mainWh._id), complaint: "BMS error E04" });
  await returnBattery(bhPayload, String(jobR._id), "BMS reset and cells balanced");
  void Item;

  // FSE recruitment: the top FSE appointed five dealers this month, another FSE two.
  console.log("• FSE dealer recruitment + target commission scheme");
  const newDealer = async (name: string, city: string, fse: any, day: number) => {
    const code = await generateDealerCode();
    return Dealer.create({
      dealerCode: code, tier: "DEALER", name, ownerName: `${name.split(" ")[0]} Owner`, phone: `98${between(10000000, 99999999)}`, email: `${code.toLowerCase()}@dealers.joykaliev.in`,
      address: `Main Road, ${city}`, city, state: "West Bengal", gstin: `19AAB${String.fromCharCode(65 + (day % 26))}D${between(1000, 9999)}K1Z${day % 10}`, stateCode: "19", pincode: "7000" + String(between(10, 99)),
      creditLimit: 0, creditDays: 30, assignedASM: fse.user.reportsTo || null, recruitedBy: fse.user._id, status: "ACTIVE",
      onboardingDate: new Date(`${ymd(current.year, current.month, Math.max(1, Math.min(todayIst, day)))}T11:00:00+05:30`), createdBy: bh._id,
    });
  };
  for (const [i, [n, c]] of [["Maa Tara EV Point", "Habra"], ["Green Wheels", "Bongaon"], ["Joy Motors", "Basirhat"], ["E-Ride Hub", "Barrackpore"], ["Shakti Auto", "Naihati"]].entries()) await newDealer(n, c, fecs[0], 2 + i * 2);
  for (const [i, [n, c]] of [["Sundarban EV", "Canning"], ["Riya Electric", "Diamond Harbour"]].entries()) await newDealer(n, c, fecs[1], 3 + i * 3);
  const fseScheme = await IncentiveScheme.create({
    name: "FSE dealer recruitment + target commission",
    description: "₹1,000 per dealer appointed once 5 are appointed in the month; ₹500 per vehicle once the monthly target is met.",
    status: "DRAFT",
    validFrom: current.start,
    validTo: current.end,
    applicableRoles: ["FEC"],
    rules: [
      { ruleType: "DEALER_RECRUITMENT", minRecruits: 5, perRecruitAmount: rupeesToPaise(1000), perDistributorAmount: 0, countSubDealers: true },
      { ruleType: "TARGET_COMMISSION", perUnitAmount: rupeesToPaise(500), targetUnits: 6, targetPayout: "ALL_WHEN_MET" },
    ],
  });
  await signApproval("scheme", String(fseScheme._id), bhPayload, "APPROVED");
  await signApproval("scheme", String(fseScheme._id), mpPayload, "APPROVED");

  await ensurePosts(); // links staff created after the posts to the post of their role
  // A light audit trail so the Audit screen isn't empty.
  for (const u of [admin, mp, bh, asmNorth, fecs[0].user]) {
    await logAudit({ user: asPayload(u), action: "LOGIN", resource: "AUTH", resourceId: String(u._id), ipAddress: "103.42.18.7" });
  }

  const runs = await PayrollRun.countDocuments();
  const vehicles = await Vehicle.countDocuments();
  console.log(`\nSeed complete: ${saleIds.length} sales, ${vehicles} vehicles, ${runs} payroll runs.`);
  console.log(`\nDemo accounts (password: ${DEMO_PASSWORD})`);
  for (const u of await User.find({ role: { $nin: ["FEC", "DISTRIBUTOR", "SUPER_DISTRIBUTOR", "DEALER", "SUB_DEALER", "OUTLET", "HR_MANAGER", "ACCOUNTANT", "STORE_MANAGER", "STAFF"] } }).sort({ role: 1 }).lean()) {
    console.log(`  ${u.role.padEnd(17)} ${u.employeeCode.padEnd(13)} ${u.email}`);
  }
  console.log(`  FSE               JKE-FSE-0001  fse1@joykaliev.in (… fse12)`);
  console.log(`  DISTRIBUTOR       JKDB-0001     dist1@joykaliev.in  (Bardhaman)`);
  console.log(`  DISTRIBUTOR       JKDB-0003     dist3@joykaliev.in  (Patna, Bihar — inter-state)`);
  console.log(`  SUPER_DISTRIBUTOR JKSD-0001     sd1@joykaliev.in    (Rarh Bengal, Birbhum)`);
  console.log(`  DEALER            (Memari)      dealer1@joykaliev.in  (buys from Bardhaman)`);
  console.log(`  SUB_DEALER        JKSB-0001     subdealer1@joykaliev.in (buys from Memari)`);
  console.log(`  OUTLET            showroom@joykaliev.in (Salt Lake showroom counter)`);
  console.log(`  HR_MANAGER        hr@joykaliev.in      (attendance, leave, exits)`);
  console.log(`  ACCOUNTANT        accounts@joykaliev.in (cash & bank books, expenses, P&L)`);
  console.log(`  DEALER (company)  dealer.howrah@joykaliev.in (orders, truck tracking, GRN, payments)`);
  console.log(`  STORE_MANAGER     store@joykaliev.in    (Siliguri warehouse)`);
  console.log(`  STAFF             clerk@joykaliev.in    (Clerk, JKE-CLK-0001) · pa@joykaliev.in (Personal Assistant, JKE-PA-0001)`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
