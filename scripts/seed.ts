import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../src/models/User";
import { SalaryStructure } from "../src/models/SalaryStructure";
import { Dealer } from "../src/models/Dealer";
import { Supplier } from "../src/models/Supplier";
import { VehicleModel } from "../src/models/VehicleModel";
import { Vehicle } from "../src/models/Vehicle";
import { StockMovement } from "../src/models/StockMovement";
import { Sale } from "../src/models/Sale";
import { IncentiveScheme } from "../src/models/IncentiveScheme";
import { Setting } from "../src/models/Setting";
import { RolePermission } from "../src/models/RolePermission";
import { Counter } from "../src/models/Counter";
import { DEFAULT_ROLE_PERMISSIONS } from "../src/lib/rbac";
import { rupeesToPaise } from "../src/lib/money";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/joykali_ev";

async function seed() {
  console.log("Connecting to MongoDB at:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  // Clean collections
  console.log("Cleaning existing database collections...");
  await Promise.all([
    User.deleteMany({}),
    SalaryStructure.deleteMany({}),
    Dealer.deleteMany({}),
    Supplier.deleteMany({}),
    VehicleModel.deleteMany({}),
    Vehicle.deleteMany({}),
    StockMovement.deleteMany({}),
    Sale.deleteMany({}),
    IncentiveScheme.deleteMany({}),
    Setting.deleteMany({}),
    RolePermission.deleteMany({}),
    Counter.deleteMany({}),
  ]);

  console.log("Seeding Role-Permissions Matrix...");
  for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    await RolePermission.create({
      role,
      permissions: perms,
    });
  }

  console.log("Seeding Company Settings...");
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
    codePrefixes: {
      employee: "JKE",
      dealer: "JKD",
      sale: "JKS",
      purchase: "JKP",
      payroll: "PR",
      payslip: "PS",
    },
    statutoryDeductions: {
      pfRate: 12,
      esiRate: 0.75,
      ptMonthlyPaise: 20000,
      pfEnabled: true,
      esiEnabled: true,
      ptEnabled: true,
    },
  });

  const defaultPasswordHash = await bcrypt.hash("Admin@123", 10);

  // 1. Admin
  console.log("Creating Admin User...");
  const admin = await User.create({
    employeeCode: "JKE-ADM-0001",
    name: "System Administrator",
    email: "admin@joykali.com",
    phone: "9830012345",
    role: "ADMIN",
    designation: "Principal Administrator",
    joiningDate: new Date("2025-01-01"),
    status: "ACTIVE",
    passwordHash: defaultPasswordHash,
    mustChangePassword: true,
  });

  await SalaryStructure.create({
    employee: admin._id,
    basic: rupeesToPaise(60000),
    hra: rupeesToPaise(24000),
    conveyance: rupeesToPaise(8000),
    otherAllowances: rupeesToPaise(8000),
    fixedDeductions: { pf: true, esi: false, professionalTax: true },
    bankDetails: {
      accountNo: "910010099887766",
      ifsc: "HDFC0001234",
      bankName: "HDFC Bank",
    },
    pan: "AAACJ9999A",
    isActive: true,
  });

  // 2. Managing Partner
  console.log("Creating Managing Partner...");
  const mp = await User.create({
    employeeCode: "JKE-MP-0001",
    name: "Joydeb Roy",
    email: "mp@joykali.com",
    phone: "9830023456",
    role: "MANAGING_PARTNER",
    reportsTo: admin._id,
    designation: "Managing Partner & Director",
    joiningDate: new Date("2025-01-15"),
    status: "ACTIVE",
    passwordHash: defaultPasswordHash,
    mustChangePassword: true,
  });

  await SalaryStructure.create({
    employee: mp._id,
    basic: rupeesToPaise(50000),
    hra: rupeesToPaise(20000),
    conveyance: rupeesToPaise(10000),
    otherAllowances: rupeesToPaise(10000),
    fixedDeductions: { pf: true, esi: false, professionalTax: true },
    bankDetails: {
      accountNo: "910010099887755",
      ifsc: "ICIC0001234",
      bankName: "ICICI Bank",
    },
    pan: "ABCDE2345B",
    isActive: true,
  });

  // 3. Business Head
  console.log("Creating Business Head...");
  const bh = await User.create({
    employeeCode: "JKE-BH-0001",
    name: "Subrata Banerjee",
    email: "bh@joykali.com",
    phone: "9830034567",
    role: "BUSINESS_HEAD",
    reportsTo: mp._id,
    designation: "State Business Head",
    joiningDate: new Date("2025-02-01"),
    status: "ACTIVE",
    passwordHash: defaultPasswordHash,
    mustChangePassword: true,
  });

  await SalaryStructure.create({
    employee: bh._id,
    basic: rupeesToPaise(40000),
    hra: rupeesToPaise(16000),
    conveyance: rupeesToPaise(6000),
    otherAllowances: rupeesToPaise(6000),
    fixedDeductions: { pf: true, esi: false, professionalTax: true },
    bankDetails: {
      accountNo: "910010099887744",
      ifsc: "SBIN0001234",
      bankName: "State Bank of India",
    },
    pan: "ABCDE3456C",
    isActive: true,
  });

  // 4. ASMs (2 Area Sales Managers)
  console.log("Creating 2 Area Sales Managers...");
  const asm1 = await User.create({
    employeeCode: "JKE-ASM-0001",
    name: "Pradip Mondal",
    email: "asm1@joykali.com",
    phone: "9830045678",
    role: "ASM",
    reportsTo: bh._id,
    designation: "Area Sales Manager - North 24 Parganas",
    joiningDate: new Date("2025-03-01"),
    status: "ACTIVE",
    passwordHash: defaultPasswordHash,
    mustChangePassword: true,
  });

  const asm2 = await User.create({
    employeeCode: "JKE-ASM-0002",
    name: "Dipankar Das",
    email: "asm2@joykali.com",
    phone: "9830056789",
    role: "ASM",
    reportsTo: bh._id,
    designation: "Area Sales Manager - Nadia & Hooghly",
    joiningDate: new Date("2025-03-15"),
    status: "ACTIVE",
    passwordHash: defaultPasswordHash,
    mustChangePassword: true,
  });

  for (const asm of [asm1, asm2]) {
    await SalaryStructure.create({
      employee: asm._id,
      basic: rupeesToPaise(28000),
      hra: rupeesToPaise(10000),
      conveyance: rupeesToPaise(5000),
      otherAllowances: rupeesToPaise(4000),
      fixedDeductions: { pf: true, esi: false, professionalTax: true },
      bankDetails: {
        accountNo: `300100200300${asm.employeeCode.slice(-2)}`,
        ifsc: "SBIN0004567",
        bankName: "State Bank of India",
      },
      pan: `ABCDE${asm.employeeCode.slice(-4)}D`,
      isActive: true,
    });
  }

  // 5. FECs (3 reporting to ASM1, 3 reporting to ASM2)
  console.log("Creating 6 Field Executive Consultants (FECs)...");
  const fecNamesAsm1 = ["Bikash Sen", "Rahul Sharma", "Amitabha Roy"];
  const fecNamesAsm2 = ["Sanjay Paul", "Tanmoy Dutta", "Arup Naskar"];

  const fecsAsm1 = [];
  for (let i = 0; i < fecNamesAsm1.length; i++) {
    const fec = await User.create({
      employeeCode: `JKE-FEC-000${i + 1}`,
      name: fecNamesAsm1[i],
      email: `fec${i + 1}@joykali.com`,
      phone: `983011110${i + 1}`,
      role: "FEC",
      reportsTo: asm1._id,
      designation: "Field Executive Consultant",
      joiningDate: new Date("2025-04-01"),
      status: "ACTIVE",
      passwordHash: defaultPasswordHash,
      mustChangePassword: true,
    });
    fecsAsm1.push(fec);
  }

  const fecsAsm2 = [];
  for (let i = 0; i < fecNamesAsm2.length; i++) {
    const num = i + 4;
    const fec = await User.create({
      employeeCode: `JKE-FEC-000${num}`,
      name: fecNamesAsm2[i],
      email: `fec${num}@joykali.com`,
      phone: `983011110${num}`,
      role: "FEC",
      reportsTo: asm2._id,
      designation: "Field Executive Consultant",
      joiningDate: new Date("2025-04-15"),
      status: "ACTIVE",
      passwordHash: defaultPasswordHash,
      mustChangePassword: true,
    });
    fecsAsm2.push(fec);
  }

  const allFecs = [...fecsAsm1, ...fecsAsm2];
  for (const fec of allFecs) {
    await SalaryStructure.create({
      employee: fec._id,
      basic: rupeesToPaise(16000),
      hra: rupeesToPaise(5000),
      conveyance: rupeesToPaise(3000),
      otherAllowances: rupeesToPaise(2000),
      fixedDeductions: { pf: true, esi: false, professionalTax: true },
      bankDetails: {
        accountNo: `400100200400${fec.employeeCode.slice(-2)}`,
        ifsc: "PUNB0001234",
        bankName: "Punjab National Bank",
      },
      pan: `ABCDE${fec.employeeCode.slice(-4)}F`,
      isActive: true,
    });
  }

  // 6. Dealers
  console.log("Creating 3 Dealerships...");
  const dealer1 = await Dealer.create({
    dealerCode: "JKD-0001",
    name: "Joykali EV Barasat Hub",
    ownerName: "Alok Mukherjee",
    phone: "9830555001",
    email: "barasat@joykaliev.in",
    address: "KNC Road, Champadali More",
    city: "Barasat",
    state: "West Bengal",
    gstin: "19AABCF1234E1Z1",
    assignedASM: asm1._id,
    status: "ACTIVE",
    onboardingDate: new Date("2025-03-01"),
  });

  const dealer2 = await Dealer.create({
    dealerCode: "JKD-0002",
    name: "Joykali EV Habra Express",
    ownerName: "Subhashis Saha",
    phone: "9830555002",
    email: "habra@joykaliev.in",
    address: "Jessore Road, Rail Gate",
    city: "Habra",
    state: "West Bengal",
    gstin: "19AABCF1234E1Z2",
    assignedASM: asm1._id,
    status: "ACTIVE",
    onboardingDate: new Date("2025-03-15"),
  });

  const dealer3 = await Dealer.create({
    dealerCode: "JKD-0003",
    name: "Joykali EV Basirhat Central",
    ownerName: "Debashis Biswas",
    phone: "9830555003",
    email: "basirhat@joykaliev.in",
    address: "Taki Road, College More",
    city: "Basirhat",
    state: "West Bengal",
    gstin: "19AABCF1234E1Z3",
    assignedASM: asm2._id,
    status: "ACTIVE",
    onboardingDate: new Date("2025-04-01"),
  });

  // 7. Supplier
  console.log("Creating OEM Supplier...");
  const supplier = await Supplier.create({
    name: "ElectroTech Motors India Pvt Ltd",
    gstin: "27AAACE5678H1Z4",
    contactPerson: "Vikram Malhotra",
    phone: "9820011223",
    email: "sales@electrotechindia.com",
    address: "MIDC Industrial Area, Phase II",
    city: "Pune",
    state: "Maharashtra",
    isActive: true,
  });

  // 8. Vehicle Models
  console.log("Creating 4 Vehicle Models...");
  const modelFalcon = await VehicleModel.create({
    name: "Joykali Falcon Pro",
    variant: "LFP Dual-Battery 72V",
    category: "2W",
    batteryType: "Lithium Iron Phosphate (LFP)",
    rangeKm: 120,
    purchasePrice: rupeesToPaise(75000),
    sellingPrice: rupeesToPaise(98000),
    gstRate: 5,
    hsnCode: "870380",
    isActive: true,
  });

  const modelStorm = await VehicleModel.create({
    name: "Joykali Storm",
    variant: "City Commuter 60V",
    category: "2W",
    batteryType: "Lithium-ion",
    rangeKm: 85,
    purchasePrice: rupeesToPaise(58000),
    sellingPrice: rupeesToPaise(78000),
    gstRate: 5,
    hsnCode: "870380",
    isActive: true,
  });

  const modelRickshaw = await VehicleModel.create({
    name: "Joykali CityRide E-Rickshaw",
    variant: "Passanger Deluxe 4+1",
    category: "E_RICKSHAW",
    batteryType: "Lead-Acid / LFP Hybrid",
    rangeKm: 110,
    purchasePrice: rupeesToPaise(110000),
    sellingPrice: rupeesToPaise(145000),
    gstRate: 5,
    hsnCode: "870380",
    isActive: true,
  });

  const modelLoader = await VehicleModel.create({
    name: "Joykali CargoLoader",
    variant: "Heavy Duty 500kg Payload",
    category: "LOADER",
    batteryType: "LFP High-Torque",
    rangeKm: 95,
    purchasePrice: rupeesToPaise(125000),
    sellingPrice: rupeesToPaise(165000),
    gstRate: 5,
    hsnCode: "870380",
    isActive: true,
  });

  // 9. Vehicles (30 Units)
  console.log("Creating 30 Vehicle Units...");
  const createdVehicles = [];
  const modelsPool = [modelFalcon, modelStorm, modelRickshaw, modelLoader];
  const dealersPool = [dealer1, dealer2, dealer3];

  for (let i = 1; i <= 30; i++) {
    const model = modelsPool[(i - 1) % modelsPool.length];
    const chassisNumber = `ME4EVJK26X${String(i).padStart(4, "0")}`;
    const motorNumber = `MOT-JK26-${String(i).padStart(4, "0")}`;
    const batteryNumber = `BAT-JK26-${String(i).padStart(4, "0")}`;
    const chargerNumber = `CHG-JK26-${String(i).padStart(4, "0")}`;

    let status = "IN_STOCK";
    let locType: "WAREHOUSE" | "DEALER" = "WAREHOUSE";
    let dealerRef = null;

    if (i <= 10) {
      status = "ALLOCATED_TO_DEALER";
      locType = "DEALER";
      dealerRef = dealersPool[i % dealersPool.length]._id;
    } else if (i <= 20) {
      status = "IN_STOCK";
      locType = "WAREHOUSE";
    }

    const v = await Vehicle.create({
      chassisNumber,
      motorNumber,
      batteryNumber,
      chargerNumber,
      color: i % 3 === 0 ? "Glossy Black" : i % 3 === 1 ? "Pearl White" : "Emerald Green",
      model: model._id,
      status,
      currentLocationType: locType,
      currentLocationDealer: dealerRef,
    });
    createdVehicles.push(v);

    await StockMovement.create({
      vehicle: v._id,
      movementType: locType === "DEALER" ? "DEALER_ALLOCATION" : "INWARD",
      fromLocation: locType === "DEALER" ? "Main Warehouse" : `Supplier: ${supplier.name}`,
      toLocation: locType === "DEALER" ? `Dealer Outlet` : "Main Warehouse",
      performedBy: admin._id,
      reference: "INITIAL_SEED",
      notes: "System initial stock inward",
      timestamp: new Date("2026-11-01"),
    });
  }

  // 10. Sample Sales (10 Delivered Sales)
  console.log("Creating 10 Delivered Sales across FECs...");
  const customerNames = [
    "Arunava Chakraborty",
    "Sudipto Majumder",
    "Priyanka Mukherjee",
    "Kallol Bhattacharya",
    "Soumen Chatterjee",
    "Debolina Sen",
    "Prasenjit Ghosh",
    "Swapan Halder",
    "Rituparna Das",
    "Manas Karmakar",
  ];

  for (let i = 0; i < 10; i++) {
    const vehicle = createdVehicles[i + 20]; // Take units 21 to 30
    const fec = allFecs[i % allFecs.length];
    const customerName = customerNames[i];
    const saleCode = `JKS/2026-27/00${String(i + 1).padStart(2, "0")}`;

    const exShowroom = vehicle.model.equals(modelFalcon._id)
      ? rupeesToPaise(98000)
      : vehicle.model.equals(modelStorm._id)
      ? rupeesToPaise(78000)
      : vehicle.model.equals(modelRickshaw._id)
      ? rupeesToPaise(145000)
      : rupeesToPaise(165000);

    const gst = Math.round(exShowroom * 0.05);
    const registration = rupeesToPaise(4500);
    const insurance = rupeesToPaise(3500);
    const accessories = rupeesToPaise(1500);
    const totalAmount = exShowroom + gst + registration + insurance + accessories;

    const sale = await Sale.create({
      saleCode,
      saleDate: new Date(`2026-11-0${(i % 8) + 1}`),
      customer: {
        name: customerName,
        phone: `98765432${String(i).padStart(2, "0")}`,
        email: `customer${i + 1}@gmail.com`,
        address: `${100 + i}, VIP Road, Barasat, Kolkata 700124`,
        idProofType: "Aadhaar",
        idProofNumber: `4567 8901 23${String(i).padStart(2, "0")}`,
      },
      vehicle: vehicle._id,
      dealer: i % 2 === 0 ? dealer1._id : dealer2._id,
      soldBy: fec._id,
      asmAtSale: fec.reportsTo,
      priceBreakdown: {
        exShowroom,
        discount: 0,
        gst,
        registration,
        insurance,
        accessories,
      },
      totalAmount,
      paymentMode: i % 3 === 0 ? "UPI" : i % 3 === 1 ? "BANK" : "FINANCE",
      status: "DELIVERED",
    });

    vehicle.status = "SOLD";
    vehicle.sale = sale._id;
    await vehicle.save();

    await StockMovement.create({
      vehicle: vehicle._id,
      movementType: "SALE",
      fromLocation: "Warehouse / Dealer",
      toLocation: `Customer: ${customerName}`,
      performedBy: fec._id,
      reference: saleCode,
      notes: "Customer delivery completed",
      timestamp: sale.saleDate,
    });
  }

  // 11. Active Incentive Schemes
  console.log("Creating Active Incentive Schemes (SLAB for FEC, TEAM_OVERRIDE for ASM)...");
  await IncentiveScheme.create({
    name: "FY26-27 FEC Volume Escalation Slab Scheme",
    description: "Progressive tiers based on units delivered within current calendar month",
    status: "ACTIVE",
    validFrom: new Date("2026-11-01T00:00:00Z"),
    validTo: new Date("2026-11-30T23:59:59Z"),
    applicableRoles: ["FEC"],
    rules: [
      {
        ruleType: "SLAB",
        slabApplication: "ALL_UNITS",
        slabs: [
          { minUnits: 1, maxUnits: 3, amountPerUnit: rupeesToPaise(500) },
          { minUnits: 4, maxUnits: 6, amountPerUnit: rupeesToPaise(800) },
          { minUnits: 7, maxUnits: null, amountPerUnit: rupeesToPaise(1200) },
        ],
      },
    ],
    approvedBy: mp._id,
    approvedAt: new Date("2026-11-01"),
    version: 1,
  });

  await IncentiveScheme.create({
    name: "ASM Area Leadership Override Scheme",
    description: "₹300 per unit override on all vehicles delivered by reporting FEC teams",
    status: "ACTIVE",
    validFrom: new Date("2026-11-01T00:00:00Z"),
    validTo: new Date("2026-11-30T23:59:59Z"),
    applicableRoles: ["ASM"],
    rules: [
      {
        ruleType: "TEAM_OVERRIDE",
        teamOverridePerUnit: rupeesToPaise(300),
      },
    ],
    approvedBy: mp._id,
    approvedAt: new Date("2026-11-01"),
    version: 1,
  });

  console.log("\n=======================================================");
  console.log("  JOYKALI EV MOBILITY — SEEDING COMPLETED SUCCESSFULLY! ");
  console.log("=======================================================");
  console.log("Default Login Credentials:");
  console.log("  Admin:            admin@joykali.com     / Admin@123");
  console.log("  Managing Partner: mp@joykali.com        / Admin@123");
  console.log("  Business Head:    bh@joykali.com        / Admin@123");
  console.log("  Area Manager 1:   asm1@joykali.com      / Admin@123");
  console.log("  Field Exec 1:     fec1@joykali.com      / Admin@123");
  console.log("=======================================================\n");

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});

