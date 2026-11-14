import { Sale, ISale } from "@/models/Sale";
import { Vehicle } from "@/models/Vehicle";
import { VehicleModel } from "@/models/VehicleModel";
import { StockMovement } from "@/models/StockMovement";
import { User } from "@/models/User";
import { generateSaleCode } from "@/lib/codeGenerator";
import { rupeesToPaise } from "@/lib/money";
import { withTransaction } from "@/lib/db";
import { JWTPayload } from "@/types";
import mongoose from "mongoose";
import { getTeamUserIds } from "@/lib/rbac";

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

// Incentive recalculation lives in incentiveService; re-exported for existing callers.
export { recalculateIncentivesForPeriod } from "./incentiveService";
import { recalculateIncentivesForPeriod } from "./incentiveService";

/**
 * Core business service for creating a vehicle sale
 */
export async function createSale(
  input: CreateSaleInput,
  user: JWTPayload
): Promise<ISale> {
  // Attribution guard: an FEC can only book sales under their own name, an
  // ASM under themselves or their own downline. Previously any salesperson
  // could credit (or steal) incentive-bearing sales for anyone.
  let sellerOutlet: string | null = null;
  if (user.role === "FEC" || user.role === "OUTLET") {
    const me = await User.findById(user.userId).select("outlet").lean();
    sellerOutlet = (me as any)?.outlet ? String((me as any).outlet) : null;
  }
  if (user.role === "FEC") {
    input.soldBy = user.userId;
  } else if (user.role === "OUTLET") {
    // A showroom login bills under its own name or an FEC posted at the same showroom.
    if (String(input.soldBy) !== String(user.userId)) {
      const fec = await User.findById(input.soldBy).select("outlet role").lean();
      if (!fec || !sellerOutlet || String((fec as any).outlet) !== sellerOutlet) {
        throw new Error("You can only bill under your own name or an FEC posted at this showroom");
      }
    }
  } else if (user.role === "ASM" && String(input.soldBy) !== String(user.userId)) {
    const team = await getTeamUserIds(user.userId);
    if (!team.some((id) => String(id) === String(input.soldBy))) {
      throw new Error("You can only record sales for yourself or your own team");
    }
  }

  let affectedEmployees: mongoose.Types.ObjectId[] = [];
  const sale = await withTransaction(async (session) => {
    // 1. Check vehicle
    const vehicle = await Vehicle.findById(input.vehicleId).session(session ?? null);
    if (!vehicle) {
      throw new Error("Vehicle not found");
    }
    if (!["IN_STOCK", "ALLOCATED_TO_DEALER", "AT_OUTLET"].includes(vehicle.status)) {
      throw new Error(`Vehicle is not available for sale. Current status: ${vehicle.status}`);
    }
    // Showroom stock is billed only at that showroom; a showroom login bills only its own stock.
    if (vehicle.status === "AT_OUTLET") {
      if ((user.role === "OUTLET" || user.role === "FEC") && String(vehicle.currentLocationOutlet) !== sellerOutlet) {
        throw new Error("This vehicle is in another showroom's stock");
      }
    } else if (user.role === "OUTLET") {
      throw new Error("A showroom can only bill vehicles in its own stock");
    }

    // 2. Fetch salesperson and derive ASM at sale time
    const salesperson = await User.findById(input.soldBy).session(session ?? null);
    if (!salesperson) {
      throw new Error("Salesperson not found");
    }

    const saleDateObj = new Date(input.saleDate);
    const saleCode = await generateSaleCode(saleDateObj, session);

    if (salesperson.status !== "ACTIVE" || !["FEC", "ASM", "OUTLET"].includes(salesperson.role)) {
      throw new Error("Sales can only be attributed to an active FEC, ASM or showroom login");
    }

    // Convert all amounts to integer paise
    const exShowroom = rupeesToPaise(input.priceBreakdown.exShowroom);
    const discount = rupeesToPaise(input.priceBreakdown.discount || 0);
    if (exShowroom <= 0) throw new Error("Ex-showroom price must be greater than zero");
    if (discount > exShowroom) throw new Error("Discount cannot exceed the ex-showroom price");

    // GST is computed here from the model's rate — never trusted from the client.
    const model = await VehicleModel.findById(vehicle.model).session(session ?? null).lean();
    const gstRate = model?.gstRate ?? 5;
    const gst = Math.round(((exShowroom - discount) * gstRate) / 100);
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
          // A vehicle sitting at a dealer is always that dealer's sale.
          dealer:
            vehicle.currentLocationDealer ||
            (input.dealerId ? new mongoose.Types.ObjectId(input.dealerId) : null),
          outlet: vehicle.status === "AT_OUTLET" ? vehicle.currentLocationOutlet : null,
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
        : vehicle.currentLocationType === "OUTLET"
          ? `Outlet: ${vehicle.currentLocationOutlet}`
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

    affectedEmployees = [salesperson._id];
    if (salesperson.reportsTo) {
      affectedEmployees.push(salesperson.reportsTo as mongoose.Types.ObjectId);
    }

    return sale;
  });

  // 6. Recalculate incentives for the salesperson and their ASM only after the
  // sale has committed, so the ledger always reflects persisted data.
  await recalculateIncentivesForPeriod(affectedEmployees, sale.saleDate);
  return sale;
}

/**
 * Cancel a sale and reverse stock status & incentives
 */
export async function cancelSale(
  saleId: string,
  reason: string,
  user: JWTPayload
): Promise<ISale> {
  const cancelled = await withTransaction(async (session) => {
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
      vehicle.status = vehicle.currentLocationDealer
        ? "ALLOCATED_TO_DEALER"
        : vehicle.currentLocationOutlet && vehicle.currentLocationType === "OUTLET"
          ? "AT_OUTLET"
          : "IN_STOCK";
      vehicle.sale = null;
      await vehicle.save({ session });

      // Stock movement log for return
      await StockMovement.create(
        [
          {
            vehicle: vehicle._id,
            movementType: "RETURN",
            fromLocation: `Customer: ${sale.customer.name}`,
            toLocation: vehicle.currentLocationDealer
              ? `Dealer: ${vehicle.currentLocationDealer}`
              : vehicle.status === "AT_OUTLET"
                ? `Outlet: ${vehicle.currentLocationOutlet}`
                : "Main Warehouse",
            performedBy: new mongoose.Types.ObjectId(user.userId),
            reference: sale.saleCode,
            notes: `Sale cancellation: ${reason}`,
            timestamp: new Date(),
          },
        ],
        { session }
      );
    }

    return sale;
  });

  // Reverse the incentive impact once the cancellation is committed.
  const affected = [cancelled.soldBy];
  if (cancelled.asmAtSale) affected.push(cancelled.asmAtSale);
  await recalculateIncentivesForPeriod(affected, cancelled.saleDate);
  return cancelled;
}

