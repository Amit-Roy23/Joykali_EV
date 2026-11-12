import ExcelJS from "exceljs";
import { Sale } from "@/models/Sale";
import { Purchase } from "@/models/Purchase";
import { Vehicle } from "@/models/Vehicle";
import { Dealer } from "@/models/Dealer";
import { PayrollEntry } from "@/models/PayrollEntry";
import { PayrollRun } from "@/models/PayrollRun";
import { IncentiveLedger } from "@/models/IncentiveLedger";
import { User } from "@/models/User";
import { formatINR, paiseToRupees } from "@/lib/money";
import { JWTPayload } from "@/types";
import { getScopeFilter, getTeamUserIds } from "@/lib/rbac";
import mongoose from "mongoose";

/**
 * Generate Sales Register Excel
 */
export async function generateSalesRegisterExcel(filter: any = {}): Promise<Buffer> {
  const sales = await Sale.find(filter)
    .populate("vehicle")
    .populate("soldBy", "name employeeCode")
    .populate("dealer", "name dealerCode")
    .sort({ saleDate: -1 })
    .lean();

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sales Register");

  worksheet.columns = [
    { header: "Invoice Code", key: "saleCode", width: 22 },
    { header: "Date", key: "date", width: 14 },
    { header: "Customer Name", key: "customerName", width: 22 },
    { header: "Customer Phone", key: "customerPhone", width: 15 },
    { header: "Salesperson", key: "salesperson", width: 20 },
    { header: "Dealer", key: "dealer", width: 20 },
    { header: "Chassis No", key: "chassis", width: 22 },
    { header: "Ex-Showroom (₹)", key: "exShowroom", width: 16 },
    { header: "Discount (₹)", key: "discount", width: 14 },
    { header: "GST (₹)", key: "gst", width: 14 },
    { header: "Insurance (₹)", key: "insurance", width: 14 },
    { header: "Registration (₹)", key: "registration", width: 14 },
    { header: "Total Amount (₹)", key: "total", width: 16 },
    { header: "Payment Mode", key: "paymentMode", width: 14 },
    { header: "Status", key: "status", width: 14 },
  ];

  sales.forEach((s: any) => {
    worksheet.addRow({
      saleCode: s.saleCode,
      date: new Date(s.saleDate).toLocaleDateString("en-IN"),
      customerName: s.customer?.name || "",
      customerPhone: s.customer?.phone || "",
      salesperson: s.soldBy ? `${s.soldBy.name} (${s.soldBy.employeeCode})` : "",
      dealer: s.dealer ? `${s.dealer.name}` : "Direct / Warehouse",
      chassis: s.vehicle?.chassisNumber || "",
      exShowroom: paiseToRupees(s.priceBreakdown?.exShowroom || 0),
      discount: paiseToRupees(s.priceBreakdown?.discount || 0),
      gst: paiseToRupees(s.priceBreakdown?.gst || 0),
      insurance: paiseToRupees(s.priceBreakdown?.insurance || 0),
      registration: paiseToRupees(s.priceBreakdown?.registration || 0),
      total: paiseToRupees(s.totalAmount || 0),
      paymentMode: s.paymentMode,
      status: s.status,
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Generate Purchase Register Excel
 */
export async function generatePurchaseRegisterExcel(): Promise<Buffer> {
  const purchases = await Purchase.find()
    .populate("supplier", "name gstin")
    .sort({ invoiceDate: -1 })
    .lean();

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Purchase Register");

  worksheet.columns = [
    { header: "Purchase Code", key: "purchaseCode", width: 20 },
    { header: "Invoice Number", key: "invoiceNumber", width: 18 },
    { header: "Invoice Date", key: "date", width: 14 },
    { header: "Supplier", key: "supplier", width: 24 },
    { header: "Supplier GSTIN", key: "gstin", width: 18 },
    { header: "Subtotal (₹)", key: "subTotal", width: 16 },
    { header: "GST Amount (₹)", key: "gst", width: 16 },
    { header: "Total Amount (₹)", key: "total", width: 16 },
    { header: "Payment Status", key: "status", width: 14 },
  ];

  purchases.forEach((p: any) => {
    worksheet.addRow({
      purchaseCode: p.purchaseCode,
      invoiceNumber: p.invoiceNumber,
      date: new Date(p.invoiceDate).toLocaleDateString("en-IN"),
      supplier: p.supplier?.name || "",
      gstin: p.supplier?.gstin || "",
      subTotal: paiseToRupees(p.subTotal),
      gst: paiseToRupees(p.gstAmount),
      total: paiseToRupees(p.totalAmount),
      status: p.paymentStatus,
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Generate Stock Report Excel
 */
export async function generateStockReportExcel(): Promise<Buffer> {
  const vehicles = await Vehicle.find()
    .populate("model", "name variant category")
    .populate("currentLocationDealer", "name dealerCode")
    .sort({ status: 1, createdAt: -1 })
    .lean();

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Stock Report");

  worksheet.columns = [
    { header: "Chassis Number", key: "chassis", width: 22 },
    { header: "Model", key: "model", width: 20 },
    { header: "Variant", key: "variant", width: 16 },
    { header: "Category", key: "category", width: 14 },
    { header: "Color", key: "color", width: 14 },
    { header: "Status", key: "status", width: 22 },
    { header: "Location Type", key: "locationType", width: 16 },
    { header: "Location / Dealer", key: "location", width: 24 },
    { header: "Motor Number", key: "motor", width: 18 },
    { header: "Battery Number", key: "battery", width: 18 },
  ];

  vehicles.forEach((v: any) => {
    worksheet.addRow({
      chassis: v.chassisNumber,
      model: v.model?.name || "",
      variant: v.model?.variant || "",
      category: v.model?.category || "",
      color: v.color,
      status: v.status,
      locationType: v.currentLocationType,
      location: v.currentLocationDealer ? `${v.currentLocationDealer.name}` : "Main Warehouse",
      motor: v.motorNumber,
      battery: v.batteryNumber,
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Generate Payroll Register Excel
 */
export async function generatePayrollRegisterExcel(payrollRunId: string): Promise<Buffer> {
  const run = await PayrollRun.findById(payrollRunId).lean();
  if (!run) throw new Error("Payroll run not found");

  const entries = await PayrollEntry.find({ payrollRun: run._id })
    .populate("employee", "name employeeCode role designation pan")
    .lean();

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Payroll ${run.runCode}`);

  worksheet.columns = [
    { header: "Payslip Code", key: "payslipCode", width: 24 },
    { header: "Emp Code", key: "empCode", width: 16 },
    { header: "Name", key: "name", width: 22 },
    { header: "Designation", key: "designation", width: 18 },
    { header: "Paid Days", key: "paidDays", width: 12 },
    { header: "Basic (₹)", key: "basic", width: 14 },
    { header: "HRA (₹)", key: "hra", width: 14 },
    { header: "Conveyance (₹)", key: "conveyance", width: 14 },
    { header: "Allowances (₹)", key: "other", width: 14 },
    { header: "Incentives (₹)", key: "incentives", width: 16 },
    { header: "Gross Pay (₹)", key: "gross", width: 16 },
    { header: "PF (₹)", key: "pf", width: 14 },
    { header: "ESI (₹)", key: "esi", width: 14 },
    { header: "PT (₹)", key: "pt", width: 12 },
    { header: "TDS (₹)", key: "tds", width: 12 },
    { header: "Total Deductions (₹)", key: "deductions", width: 18 },
    { header: "Net Pay (₹)", key: "net", width: 16 },
  ];

  entries.forEach((e: any) => {
    worksheet.addRow({
      payslipCode: e.payslipCode,
      empCode: e.employee?.employeeCode || "",
      name: e.employee?.name || "",
      designation: e.employee?.designation || "",
      paidDays: e.paidDays,
      basic: paiseToRupees(e.earnings.basic),
      hra: paiseToRupees(e.earnings.hra),
      conveyance: paiseToRupees(e.earnings.conveyance),
      other: paiseToRupees(e.earnings.otherAllowances),
      incentives: paiseToRupees(e.earnings.incentives),
      gross: paiseToRupees(e.grossPay),
      pf: paiseToRupees(e.deductions.pf),
      esi: paiseToRupees(e.deductions.esi),
      pt: paiseToRupees(e.deductions.professionalTax),
      tds: paiseToRupees(e.deductions.tds),
      deductions: paiseToRupees(e.totalDeductions),
      net: paiseToRupees(e.netPay),
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Get Dashboard Data Scoped to the Authenticated User
 */
export async function getDashboardData(user: JWTPayload) {
  const now = new Date();
  const currentMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const currentMonthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const userObjectId = new mongoose.Types.ObjectId(user.userId);

  if (user.role === "FEC") {
    // FEC Dashboard
    const monthSales = await Sale.find({
      soldBy: userObjectId,
      saleDate: { $gte: currentMonthStart, $lte: currentMonthEnd },
      status: "DELIVERED",
    })
      .populate("vehicle")
      .lean();

    const unitsCount = monthSales.length;
    const revenue = monthSales.reduce((acc, s) => acc + s.totalAmount, 0);

    const ledger = await IncentiveLedger.findOne({
      employee: userObjectId,
      period: currentPeriod,
    }).lean();

    const recentPayslips = await PayrollEntry.find({ employee: userObjectId })
      .populate("payrollRun")
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    return {
      role: "FEC",
      metrics: {
        unitsSoldThisMonth: unitsCount,
        revenueThisMonth: revenue,
        incentiveEarnedSoFar: ledger ? ledger.totalEarned : 0,
        incentiveBreakdown: ledger?.breakdown || [],
      },
      recentSales: monthSales.slice(0, 5),
      recentPayslips,
    };
  }

  if (user.role === "ASM") {
    // ASM Dashboard
    const teamUserIds = await getTeamUserIds(userObjectId);
    const allAttributedIds = [userObjectId, ...teamUserIds];

    const teamSales = await Sale.find({
      soldBy: { $in: allAttributedIds },
      saleDate: { $gte: currentMonthStart, $lte: currentMonthEnd },
      status: "DELIVERED",
    })
      .populate("soldBy", "name employeeCode")
      .populate("vehicle")
      .lean();

    const totalTeamUnits = teamSales.length;
    const totalTeamRevenue = teamSales.reduce((sum, s) => sum + s.totalAmount, 0);

    // Leaderboard by FEC
    const fecMap: Record<string, { name: string; code: string; units: number; revenue: number }> = {};
    for (const s of teamSales) {
      const fec = s.soldBy as any;
      if (!fec) continue;
      const key = String(fec._id);
      if (!fecMap[key]) {
        fecMap[key] = { name: fec.name, code: fec.employeeCode, units: 0, revenue: 0 };
      }
      fecMap[key].units += 1;
      fecMap[key].revenue += s.totalAmount;
    }
    const leaderboard = Object.values(fecMap).sort((a, b) => b.units - a.units);

    const asmIncentiveLedger = await IncentiveLedger.findOne({
      employee: userObjectId,
      period: currentPeriod,
    }).lean();

    return {
      role: "ASM",
      metrics: {
        totalTeamUnits,
        totalTeamRevenue,
        asmIncentiveEarned: asmIncentiveLedger ? asmIncentiveLedger.totalEarned : 0,
        fecCount: teamUserIds.length,
      },
      leaderboard,
      recentTeamSales: teamSales.slice(0, 5),
    };
  }

  // BH / MP / Admin: Business-wide metrics
  const totalSalesDelivered = await Sale.find({
    status: "DELIVERED",
  }).lean();

  const currentMonthSales = totalSalesDelivered.filter(
    (s) => new Date(s.saleDate) >= currentMonthStart && new Date(s.saleDate) <= currentMonthEnd
  );

  const unitsThisMonth = currentMonthSales.length;
  const revenueThisMonth = currentMonthSales.reduce((acc, s) => acc + s.totalAmount, 0);

  const totalInStock = await Vehicle.countDocuments({ status: "IN_STOCK" });
  const totalAllocated = await Vehicle.countDocuments({ status: "ALLOCATED_TO_DEALER" });
  const totalSold = await Vehicle.countDocuments({ status: "SOLD" });
  const totalDealers = await Dealer.countDocuments({ status: "ACTIVE" });
  const totalEmployees = await User.countDocuments({ status: "ACTIVE" });

  // Monthly sales trend for the last 6 months
  const monthlyTrends: Array<{ month: string; units: number; revenue: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mStart = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
    const mEnd = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59));
    const mName = d.toLocaleString("en-US", { month: "short", year: "2-digit" });

    const mSales = totalSalesDelivered.filter(
      (s) => new Date(s.saleDate) >= mStart && new Date(s.saleDate) <= mEnd
    );
    monthlyTrends.push({
      month: mName,
      units: mSales.length,
      revenue: paiseToRupees(mSales.reduce((a, s) => a + s.totalAmount, 0)),
    });
  }

  return {
    role: user.role,
    metrics: {
      unitsThisMonth,
      revenueThisMonth,
      totalInStock,
      totalAllocated,
      totalSold,
      totalDealers,
      totalEmployees,
    },
    monthlyTrends,
  };
}

