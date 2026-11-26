import { periodOf } from "@/lib/period";
import { PayrollRun } from "@/models/PayrollRun";
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
import { Setting } from "@/models/Setting";
import { LineInput, moveLines, priceLines, refitBattery, removeBattery } from "./itemService";
import { mainWarehouse } from "./warehouseService";

export interface CreateSaleInput {
  saleDate: Date | string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    idProofType?: string;
    idProofNumber?: string;
    gstin?: string;
  };
  vehicleId: string;
  /** Accessories / parts on the same invoice, taken from `itemsWarehouseId` (default: the vehicle's warehouse). */
  items?: LineInput[];
  itemsWarehouseId?: string;
  /** Sell the vehicle without its battery: the battery goes into stock at `batteryWarehouseId`. */
  withoutBattery?: boolean;
  batteryItemId?: string;
  batteryWarehouseId?: string;
  /** Extra explanation for selling without the battery. */
  batteryNote?: string;
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
        throw new Error("You can only bill under your own name or an FSE posted at this showroom");
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
    if (Number.isNaN(+saleDateObj)) throw new Error("Choose the sale date");
    // Sale date rules: not in the future, not in a month whose payroll is locked (incentives are final),
    // and not before the vehicle came into stock.
    const istDay = (d: Date) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
    if (istDay(saleDateObj) > istDay(new Date())) throw new Error("Sale date cannot be in the future");
    const sp = periodOf(saleDateObj);
    if (await PayrollRun.exists({ year: sp.year, month: sp.month, status: "LOCKED" }).session(session ?? null)) {
      throw new Error(`Payroll for ${sp.period} is locked — a sale cannot be dated in that month`);
    }
    const inward: any = await StockMovement.findOne({ vehicle: vehicle._id, movementType: "INWARD" }).session(session ?? null).lean();
    if (inward && istDay(saleDateObj) < istDay(new Date(inward.timestamp))) {
      throw new Error(`Sale date is before this vehicle came into stock (${istDay(new Date(inward.timestamp))})`);
    }
    const saleCode = await generateSaleCode(saleDateObj, session);

    if (salesperson.status !== "ACTIVE" || !["FEC", "ASM", "OUTLET"].includes(salesperson.role)) {
      throw new Error("Sales can only be attributed to an active FSE, ASM or showroom login");
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

    // Accessories / parts billed on the same invoice.
    const defaultWh = vehicle.warehouse || (await mainWarehouse(session))._id;
    const itemLines = input.items?.length ? await priceLines(session, input.items, input.itemsWarehouseId || defaultWh) : [];
    const itemsTotal = itemLines.reduce((t, l) => t + l.amount, 0);

    const totalAmount = exShowroom - discount + gst + registration + insurance + accessories + itemsTotal;

    // Customer GST details (business buyers): state code from the GSTIN, else the company's state.
    const gstin = String(input.customer.gstin || "").trim().toUpperCase();
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) throw new Error("Customer GSTIN is not valid");
    const companyState = ((await Setting.findOne().select("stateCode").lean()) as any)?.stateCode || "19";

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
          customer: { ...input.customer, gstin: gstin || undefined, stateCode: gstin ? gstin.slice(0, 2) : companyState },
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
          items: itemLines.length ? itemLines : undefined,
          withoutBattery: !!input.withoutBattery,
        },
      ],
      { session }
    );
    const sale = saleDocs[0];

    // Accessories / parts leave warehouse stock with this invoice.
    if (itemLines.length) await moveLines(session, user, itemLines, "OUT", saleCode, input.customer.name, saleDateObj);

    // Sold without battery: the vehicle's battery goes back into stock as a sellable battery (18% GST
    // when billed on its own). A battery taken out earlier (recorded with its reason) is simply linked.
    if (input.withoutBattery) {
      const { BatteryRemoval } = await import("@/models/Item");
      let rec: any = vehicle.batteryRemoved ? await BatteryRemoval.findOne({ vehicle: vehicle._id, status: "REMOVED" }).sort({ removedAt: -1 }).session(session ?? null) : null;
      if (!rec) {
        const out = await removeBattery(
          user,
          {
            vehicleId: String(vehicle._id),
            reason: "CUSTOMER_NO_BATTERY",
            notes: `Sold without battery on invoice ${saleCode}${input.batteryNote?.trim() ? ` — ${input.batteryNote.trim()}` : ""}`,
            batteryItemId: input.batteryItemId,
            warehouseId: input.batteryWarehouseId || String(defaultWh),
          },
          { session, sale: { _id: sale._id, saleCode }, at: saleDateObj, skipGuard: true }
        );
        rec = out.record;
      } else {
        rec.sale = sale._id;
        rec.saleCode = saleCode;
        await rec.save({ session });
      }
      const { Item } = await import("@/models/Item");
      const bi: any = await Item.findById(rec.item).select("purchasePrice").session(session ?? null).lean();
      sale.batteryReturn = { item: rec.item, serialNo: rec.serialNo || undefined, warehouse: rec.warehouse, unitCost: bi?.purchasePrice || 0 };
      await sale.save({ session });
      vehicle.batteryRemoved = true;
    } else if (vehicle.batteryRemoved) {
      throw new Error("This vehicle's battery has been taken out — refit a battery first, or tick “Sold without battery”");
    }

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

    // Accessories / parts on the invoice go back into stock.
    if (sale.items?.length) await moveLines(session, user, sale.items, "IN", sale.saleCode, sale.customer.name);

    // Revert Vehicle status
    const vehicle = await Vehicle.findById(sale.vehicle).session(session ?? null);
    if (vehicle && sale.withoutBattery) {
      // Battery taken out by this sale → fitted back (it must still be in stock).
      // Battery taken out earlier for another reason → stays out; the vehicle returns to stock without it.
      const { BatteryRemoval } = await import("@/models/Item");
      const rec: any = await BatteryRemoval.findOne({ vehicle: vehicle._id, status: "REMOVED" }).sort({ removedAt: -1 }).session(session ?? null);
      if (rec && rec.reason === "CUSTOMER_NO_BATTERY" && String(rec.sale) === String(sale._id)) {
        try {
          await refitBattery(user, { vehicleId: String(vehicle._id), notes: `Sale ${sale.saleCode} cancelled` }, { session, skipGuard: true, allowSold: true });
        } catch (e: any) {
          throw new Error(`The battery taken off this vehicle is no longer in stock (${e.message}). Put a battery back on the vehicle before cancelling.`);
        }
        vehicle.batteryRemoved = false;
        if (rec.serialNo) vehicle.batteryNumber = rec.serialNo;
      } else if (rec) {
        rec.sale = null;
        rec.saleCode = undefined;
        await rec.save({ session });
      }
    }
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

