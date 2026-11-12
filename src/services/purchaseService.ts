import { Purchase, IPurchase } from "@/models/Purchase";
import { Vehicle } from "@/models/Vehicle";
import { Supplier } from "@/models/Supplier";
import { StockMovement } from "@/models/StockMovement";
import { generatePurchaseCode } from "@/lib/codeGenerator";
import { rupeesToPaise } from "@/lib/money";
import { withTransaction } from "@/lib/db";
import { JWTPayload } from "@/types";
import mongoose from "mongoose";

export interface VehicleInwardItem {
  chassisNumber: string;
  motorNumber: string;
  batteryNumber: string;
  chargerNumber?: string;
  color: string;
}

export interface PurchaseLineItemInput {
  model: string; // model id
  quantity: number;
  unitCost: number; // in rupees
  gstRate: number; // e.g. 5
  vehicles?: VehicleInwardItem[];
}

export interface CreatePurchaseInput {
  supplier: string; // supplier id
  invoiceNumber: string;
  invoiceDate: Date | string;
  lineItems: PurchaseLineItemInput[];
  notes?: string;
}

export async function createPurchase(
  input: CreatePurchaseInput,
  user: JWTPayload
): Promise<IPurchase> {
  return await withTransaction(async (session) => {
    const supplier = await Supplier.findById(input.supplier).session(session ?? null);
    if (!supplier) {
      throw new Error("Supplier not found");
    }

    const invoiceDate = new Date(input.invoiceDate);
    const purchaseCode = await generatePurchaseCode(invoiceDate, session);

    let subTotalPaise = 0;
    let gstAmountPaise = 0;
    const formattedLineItems = [];

    // Verify all chassis numbers across all items are globally unique
    const allChassis: string[] = [];
    for (const item of input.lineItems) {
      if (item.vehicles) {
        for (const v of item.vehicles) {
          const upper = v.chassisNumber.trim().toUpperCase();
          if (allChassis.includes(upper)) {
            throw new Error(`Duplicate chassis number in input: ${upper}`);
          }
          allChassis.push(upper);
        }
      }
    }

    if (allChassis.length > 0) {
      const existing = await Vehicle.find({ chassisNumber: { $in: allChassis } })
        .session(session ?? null)
        .lean();
      if (existing.length > 0) {
        throw new Error(
          `Chassis number already exists in inventory: ${existing.map((e: any) => e.chassisNumber).join(", ")}`
        );
      }
    }

    for (const item of input.lineItems) {
      const unitCostPaise = rupeesToPaise(item.unitCost);
      const lineCost = unitCostPaise * item.quantity;
      const itemGst = Math.round(lineCost * ((item.gstRate || 5) / 100));

      subTotalPaise += lineCost;
      gstAmountPaise += itemGst;

      formattedLineItems.push({
        model: new mongoose.Types.ObjectId(item.model),
        quantity: item.quantity,
        unitCost: unitCostPaise,
        gstRate: item.gstRate || 5,
        totalCost: lineCost + itemGst,
      });
    }

    const totalAmountPaise = subTotalPaise + gstAmountPaise;

    // Create Purchase document
    const purchaseDocs = await Purchase.create(
      [
        {
          purchaseCode,
          supplier: supplier._id,
          invoiceNumber: input.invoiceNumber,
          invoiceDate,
          lineItems: formattedLineItems,
          subTotal: subTotalPaise,
          gstAmount: gstAmountPaise,
          totalAmount: totalAmountPaise,
          paymentStatus: "UNPAID",
          payments: [],
          notes: input.notes,
          createdBy: new mongoose.Types.ObjectId(user.userId),
        },
      ],
      { session }
    );
    const purchase = purchaseDocs[0];

    // Inward individual vehicles if supplied
    for (const item of input.lineItems) {
      if (item.vehicles && item.vehicles.length > 0) {
        for (const v of item.vehicles) {
          const createdVehicleDocs = await Vehicle.create(
            [
              {
                chassisNumber: v.chassisNumber.trim().toUpperCase(),
                motorNumber: v.motorNumber.trim().toUpperCase(),
                batteryNumber: v.batteryNumber.trim().toUpperCase(),
                chargerNumber: v.chargerNumber?.trim().toUpperCase(),
                color: v.color.trim(),
                model: new mongoose.Types.ObjectId(item.model),
                status: "IN_STOCK",
                currentLocationType: "WAREHOUSE",
                purchase: purchase._id,
              },
            ],
            { session }
          );
          const vehicle = createdVehicleDocs[0];

          await StockMovement.create(
            [
              {
                vehicle: vehicle._id,
                movementType: "INWARD",
                fromLocation: `Supplier: ${supplier.name}`,
                toLocation: "Main Warehouse",
                performedBy: new mongoose.Types.ObjectId(user.userId),
                reference: purchase.purchaseCode,
                notes: `Purchase Inward invoice #${input.invoiceNumber}`,
                timestamp: invoiceDate,
              },
            ],
            { session }
          );
        }
      }
    }

    return purchase;
  });
}

