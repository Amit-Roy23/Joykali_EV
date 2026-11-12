import { Sale, ISale } from "@/models/Sale";
import { Vehicle } from "@/models/Vehicle";
import { StockMovement } from "@/models/StockMovement";
import { User } from "@/models/User";
import { IncentiveScheme } from "@/models/IncentiveScheme";
import { IncentiveLedger } from "@/models/IncentiveLedger";
import { generateSaleCode } from "@/lib/codeGenerator";
import { rupeesToPaise } from "@/lib/money";
import { computeIncentives } from "./incentiveEngine";
import { withTransaction } from "@/lib/db";
import { JWTPayload, UserRole } from "@/types";
import mongoose from "mongoose";

export interface CreateSaleInput {
  saleDate: Date | string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    idProofType?: string;
    idProofNumber?: string;
  };
  vehicleId: string;
  dealerId?: string | null;
  soldBy: string; // FEC id
  priceBreakdown: {
    exShowroom: number; // in rupees
    discount?: number;
    gst: number;
    registration?: number;
    insurance?: number;
    accessories?: number;
  };
  paymentMode: "CASH" | "UPI" | "BANK" | "FINANCE";
  financierDetails?: {
    financierName: string;
    loanAmount: number;
    downPayment: number;
    loanAccountNo?: string;
  };
  initialPayment?: {
    amount: number;
    reference?: string;
  };
}

/**
 * Recalculate and update the IncentiveLedger for affected employees in the month of the sale
 */
export async function recalculateIncentivesForPeriod(
  employeeIds: Array<string | mongoose.Types.ObjectId>,
  date: Date
): Promise<void> {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const period = `${year}-${String(month).padStart(2, "0")}`;

  const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  // Fetch active schemes covering this period
  const activeSchemes = await IncentiveScheme.find({
    status: "ACTIVE",
    validFrom: { $lte: periodEnd },
    validTo: { $gte: periodStart },
  }).lean();

  // Fetch all sales for this month (delivered only)
  const monthSales = await Sale.find({
    saleDate: { $gte: periodStart, $lte: periodEnd },
    status: "DELIVERED",
  })
    .populate("vehicle")
    .lean();

  const formattedSales = monthSales.map((s: any) => ({
    _id: String(s._id),
    saleCode: s.saleCode,
    saleDate: s.saleDate,
    soldBy: String(s.soldBy),
    asmAtSale: s.asmAtSale ? String(s.asmAtSale) : null,
    modelId: String(s.vehicle?.model || ""),
    dealerId: s.dealer ? String(s.dealer) : null,
    exShowroom: s.priceBreakdown?.exShowroom || 0,
    totalAmount: s.totalAmount || 0,
    status: s.status,
  }));

  for (const empId of employeeIds) {
    if (!empId) continue;
    const employee = await User.findById(empId).lean();
    if (!employee) continue;

    // Check if employee's ledger is locked by a locked payroll run
    const existingLedger = await IncentiveLedger.findOne({
      employee: employee._id,
      period,
    });
    if (existingLedger?.isLocked) {
      continue;
    }

    const output = computeIncentives(
      {
        _id: String(employee._id),
        employeeCode: employee.employeeCode,
        name: employee.name,
        role: employee.role as UserRole,
        reportsTo: employee.reportsTo ? String(employee.reportsTo) : null,
      },
      formattedSales,
      activeSchemes,
      periodStart,
      periodEnd
    );

    const breakdownItems: any[] = [];
    let totalUnits = 0;

    for (const sc of output.schemes) {
      for (const r of sc.rulesBreakdown) {
        breakdownItems.push({
          schemeId: new mongoose.Types.ObjectId(sc.schemeId),
          schemeName: sc.schemeName,
          ruleType: r.ruleType,
          unitsCount: r.qualifyingUnits,
          revenueCount: r.qualifyingRevenue,
          earnedAmount: r.earnedAmount,
          description: r.description,
        });
        totalUnits += r.qualifyingUnits;
      }
    }

    await IncentiveLedger.findOneAndUpdate(
      { employee: employee._id, period },
      {
        employee: employee._id,
        period,
        totalEarned: output.totalIncentiveEarned,
        totalUnits,
        breakdown: breakdownItems,
        isLocked: false,
        calculatedAt: new Date(),
      },
      { upsert: true, new: true }
    );
  }
}

/**
 * Core business service for creating a vehicle sale
 */
export async function createSale(
  input: CreateSaleInput,
  user: JWTPayload
): Promise<ISale> {
  return await withTransaction(async (session) => {
    // 1. Check vehicle
    const vehicle = await Vehicle.findById(input.vehicleId).session(session ?? null);
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }
    if (vehicle.status !== "IN_STOCK" && vehicle.status !== "ALLOCATED_TO_DEALER") {
      throw new Error(`Vehicle is not available for sale. Current status: ${vehicle.status}`);
    }

    // 2. Fetch salesperson and derive ASM at sale time
    const salesperson = await User.findById(input.soldBy).session(session ?? null);
    if (!salesperson) {
      throw new Error("Salesperson not found");
    }

    const saleDateObj = new Date(input.saleDate);
    const saleCode = await generateSaleCode(saleDateObj, session);

    // Convert all amounts to integer paise
    const exShowroom = rupeesToPaise(input.priceBreakdown.exShowroom);
    const discount = rupeesToPaise(input.priceBreakdown.discount || 0);
    const gst = rupeesToPaise(input.priceBreakdown.gst);
    const registration = rupeesToPaise(input.priceBreakdown.registration || 0);
    const insurance = rupeesToPaise(input.priceBreakdown.insurance || 0);
    const accessories = rupeesToPaise(input.priceBreakdown.accessories || 0);

    const totalAmount = exShowroom - discount + gst + registration + insurance + accessories;

    const payments = [];
    if (input.initialPayment && input.initialPayment.amount > 0) {
      payments.push({
        amount: rupeesToPaise(input.initialPayment.amount),
        date: saleDateObj,
        mode: input.paymentMode,
        reference: input.initialPayment.reference,
      });
    }

    let financierDetails = undefined;
    if (input.paymentMode === "FINANCE" && input.financierDetails) {
      financierDetails = {
        financierName: input.financierDetails.financierName,
        loanAmount: rupeesToPaise(input.financierDetails.loanAmount),
        downPayment: rupeesToPaise(input.financierDetails.downPayment),
        loanAccountNo: input.financierDetails.loanAccountNo,
      };
    }

    // 3. Create Sale record
    const saleDocs = await Sale.create(
      [
        {
          saleCode,
          saleDate: saleDateObj,
          customer: input.customer,
          vehicle: vehicle._id,
          dealer: input.dealerId ? new mongoose.Types.ObjectId(input.dealerId) : vehicle.currentLocationDealer || null,
          soldBy: salesperson._id,
          asmAtSale: salesperson.reportsTo || null,
          priceBreakdown: {
            exShowroom,
            discount,
            gst,
            registration,
            insurance,
            accessories,
          },
          totalAmount,
          paymentMode: input.paymentMode,
          financierDetails,
          payments,
          status: "DELIVERED",
        },
      ],
      { session }
    );
    const sale = saleDocs[0];

    // 4. Update Vehicle status
    const previousLocation =
      vehicle.currentLocationType === "DEALER"
        ? `Dealer: ${vehicle.currentLocationDealer}`
        : "Main Warehouse";

    vehicle.status = "SOLD";
    vehicle.sale = sale._id;
    await vehicle.save({ session });

    // 5. Create Stock Movement log
    await StockMovement.create(
      [
        {
          vehicle: vehicle._id,
          movementType: "SALE",
          fromLocation: previousLocation,
          toLocation: `Customer: ${input.customer.name} (${input.customer.phone})`,
          performedBy: new mongoose.Types.ObjectId(user.userId),
          reference: sale.saleCode,
          notes: `Sold via ${salesperson.name} (${salesperson.employeeCode})`,
          timestamp: saleDateObj,
        },
      ],
      { session }
    );

    // 6. Recalculate incentives for salesperson and their ASM
    const affectedEmployees = [salesperson._id];
    if (salesperson.reportsTo) {
      affectedEmployees.push(salesperson.reportsTo as mongoose.Types.ObjectId);
    }

    // Post-commit async or immediate update of ledger
    setTimeout(() => {
      recalculateIncentivesForPeriod(affectedEmployees, saleDateObj).catch(console.error);
    }, 50);

    return sale;
  });
}

/**
 * Cancel a sale and reverse stock status & incentives
 */
export async function cancelSale(
  saleId: string,
  reason: string,
  user: JWTPayload
): Promise<ISale> {
  return await withTransaction(async (session) => {
    const sale = await Sale.findById(saleId).session(session ?? null);
    if (!sale) {
      throw new Error("Sale not found");
    }
    if (sale.status === "CANCELLED") {
      throw new Error("Sale is already cancelled");
    }

    sale.status = "CANCELLED";
    sale.cancellationReason = reason;
    sale.cancelledBy = new mongoose.Types.ObjectId(user.userId);
    sale.cancelledAt = new Date();
    await sale.save({ session });

    // Revert Vehicle status
    const vehicle = await Vehicle.findById(sale.vehicle).session(session ?? null);
    if (vehicle) {
      vehicle.status = vehicle.currentLocationDealer ? "ALLOCATED_TO_DEALER" : "IN_STOCK";
      vehicle.sale = null;
      await vehicle.save({ session });

      // Stock movement log for return
      await StockMovement.create(
        [
          {
            vehicle: vehicle._id,
            movementType: "RETURN",
            fromLocation: `Customer: ${sale.customer.name}`,
            toLocation: vehicle.currentLocationDealer ? `Dealer: ${vehicle.currentLocationDealer}` : "Main Warehouse",
            performedBy: new mongoose.Types.ObjectId(user.userId),
            reference: sale.saleCode,
            notes: `Sale cancellation: ${reason}`,
            timestamp: new Date(),
          },
        ],
        { session }
      );
    }

    // Recalculate incentives for affected employees
    const affected = [sale.soldBy];
    if (sale.asmAtSale) {
      affected.push(sale.asmAtSale);
    }

    setTimeout(() => {
      recalculateIncentivesForPeriod(affected, sale.saleDate).catch(console.error);
    }, 50);

    return sale;
  });
}

