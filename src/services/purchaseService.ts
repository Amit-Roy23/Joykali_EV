import { Purchase, IPurchase } from "@/models/Purchase";
import { Vehicle } from "@/models/Vehicle";
import { VehicleModel } from "@/models/VehicleModel";
import { Supplier } from "@/models/Supplier";
import { StockMovement } from "@/models/StockMovement";
import { Item } from "@/models/Item";
import { Warehouse } from "@/models/Warehouse";
import { generatePurchaseCode } from "@/lib/codeGenerator";
import { rupeesToPaise } from "@/lib/money";
import { withTransaction } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";
import { JWTPayload } from "@/types";
import mongoose from "mongoose";
import { myWarehouseIds, resolveWarehouse } from "./warehouseService";
import { moveStock } from "./itemService";

export interface VehicleInwardItem {
  chassisNumber: string;
  motorNumber: string;
  batteryNumber: string;
  chargerNumber?: string;
  color: string;
}

export interface PurchaseLineItemInput {
  /** VEHICLE (default) = a vehicle model with chassis-wise inward; ITEM = parts / accessories / batteries / chargers. */
  kind?: "VEHICLE" | "ITEM";
  model?: string; // vehicle model id
  itemId?: string; // item id
  quantity: number;
  unitCost: number; // in rupees, before GST
  gstRate: number; // e.g. 5
  vehicles?: VehicleInwardItem[];
  /** Serial numbers for serial-tracked items (one per unit). */
  serials?: string[];
  /** Warehouse this line goes into; default = the purchase's warehouse. */
  warehouseId?: string;
}

export interface CreatePurchaseInput {
  supplier: string; // supplier id
  invoiceNumber: string;
  invoiceDate: Date | string;
  lineItems: PurchaseLineItemInput[];
  notes?: string;
  /** Warehouse receiving the goods (default: main). Lines may override it. */
  warehouseId?: string | null;
}

export class PurchaseError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Who may enter a purchase into which warehouse:
 *  - purchase.manage (Managing Partner, Admin) or warehouse.manage (Business Head) → any warehouse;
 *  - store managers (purchase.create + warehouse.transfer) → only the warehouses they run;
 *  - other purchase.create holders (Accountant) → any warehouse.
 */
export async function purchaseWarehouseScope(user: JWTPayload): Promise<string[] | null> {
  if ((await hasPermission(user.role, "purchase.manage")) || (await hasPermission(user.role, "warehouse.manage"))) return null;
  if (!(await hasPermission(user.role, "purchase.create"))) throw new PurchaseError("You cannot enter purchases", 403);
  if (await hasPermission(user.role, "warehouse.transfer")) return myWarehouseIds(user);
  return null;
}

export async function createPurchase(input: CreatePurchaseInput, user: JWTPayload): Promise<IPurchase> {
  const headerWarehouse = await resolveWarehouse(input.warehouseId);
  const scope = await purchaseWarehouseScope(user);

  // Resolve each line's warehouse up front and check the user may receive into it.
  const lineWarehouses = new Map<string, any>([[String(headerWarehouse._id), headerWarehouse]]);
  for (const l of input.lineItems) {
    if (l.warehouseId && !lineWarehouses.has(String(l.warehouseId))) lineWarehouses.set(String(l.warehouseId), await resolveWarehouse(l.warehouseId));
  }
  if (scope) {
    const outside = [...lineWarehouses.values()].filter((w) => !scope.includes(String(w._id)));
    if (outside.length) throw new PurchaseError(`You can enter purchases only for your own warehouse — not ${outside.map((w) => w.name).join(", ")}`, 403);
  }
  const whOf = (l: PurchaseLineItemInput) => lineWarehouses.get(String(l.warehouseId || headerWarehouse._id));

  return await withTransaction(async (session) => {
    const supplier = await Supplier.findById(input.supplier).session(session ?? null);
    if (!supplier) {
      throw new PurchaseError("Supplier not found");
    }
    if (!input.invoiceNumber?.trim()) throw new PurchaseError("Enter the supplier's invoice number");
    if (await Purchase.exists({ supplier: supplier._id, invoiceNumber: input.invoiceNumber.trim() }).session(session ?? null)) {
      throw new PurchaseError(`Invoice ${input.invoiceNumber.trim()} from ${supplier.name} is already entered`, 409);
    }

    const invoiceDate = new Date(input.invoiceDate);
    if (Number.isNaN(+invoiceDate)) throw new PurchaseError("Choose the invoice date");
    const purchaseCode = await generatePurchaseCode(invoiceDate, session);

    let subTotalPaise = 0;
    let gstAmountPaise = 0;
    const formattedLineItems = [];

    // Verify all chassis numbers across all items are globally unique
    const allChassis: string[] = [];
    for (const item of input.lineItems) {
      if ((item.kind || "VEHICLE") === "VEHICLE" && item.vehicles) {
        for (const v of item.vehicles) {
          const upper = v.chassisNumber.trim().toUpperCase();
          if (allChassis.includes(upper)) {
            throw new PurchaseError(`Duplicate chassis number in input: ${upper}`);
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
        throw new PurchaseError(`Chassis number already exists in inventory: ${existing.map((e: any) => e.chassisNumber).join(", ")}`, 409);
      }
    }

    const items = new Map<string, any>();
    for (const line of input.lineItems) {
      const kind = line.kind || "VEHICLE";
      const qty = Math.floor(Number(line.quantity));
      if (!(qty >= 1)) throw new PurchaseError("Every line needs a quantity of at least 1");
      let description = "";
      if (kind === "VEHICLE") {
        if (!line.model || !mongoose.isValidObjectId(line.model)) throw new PurchaseError("Choose the vehicle model on every vehicle line");
        const m: any = await VehicleModel.findById(line.model).select("name variant").session(session ?? null).lean();
        if (!m) throw new PurchaseError("Vehicle model not found");
        description = `${m.name} ${m.variant}`;
        if ((line.vehicles?.length || 0) > qty) throw new PurchaseError(`${description}: more chassis entered than the quantity`);
      } else {
        if (!line.itemId || !mongoose.isValidObjectId(line.itemId)) throw new PurchaseError("Choose the item on every parts line");
        const it = await Item.findById(line.itemId).session(session ?? null);
        if (!it) throw new PurchaseError("Item not found");
        items.set(String(it._id), it);
        description = it.name;
      }
      const unitCostPaise = rupeesToPaise(line.unitCost);
      const lineCost = unitCostPaise * qty;
      const itemGst = Math.round(lineCost * ((line.gstRate ?? 5) / 100));

      subTotalPaise += lineCost;
      gstAmountPaise += itemGst;

      formattedLineItems.push({
        kind,
        model: kind === "VEHICLE" ? new mongoose.Types.ObjectId(line.model) : null,
        item: kind === "ITEM" ? new mongoose.Types.ObjectId(line.itemId) : null,
        description,
        warehouse: whOf(line)._id,
        serials: kind === "ITEM" && line.serials?.length ? line.serials.map((s) => s.trim().toUpperCase()).filter(Boolean) : undefined,
        quantity: qty,
        unitCost: unitCostPaise,
        gstRate: line.gstRate ?? 5,
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
          invoiceNumber: input.invoiceNumber.trim(),
          invoiceDate,
          lineItems: formattedLineItems,
          subTotal: subTotalPaise,
          gstAmount: gstAmountPaise,
          totalAmount: totalAmountPaise,
          paymentStatus: "UNPAID",
          payments: [],
          notes: input.notes,
          warehouse: headerWarehouse._id,
          createdBy: new mongoose.Types.ObjectId(user.userId),
        },
      ],
      { session }
    );
    const purchase = purchaseDocs[0];

    for (const line of input.lineItems) {
      const warehouse = whOf(line);
      if ((line.kind || "VEHICLE") === "ITEM") {
        // Parts / accessories / batteries / chargers: quantity (and serials) into the line's warehouse.
        const it = items.get(String(line.itemId));
        await moveStock(session, user, {
          item: it,
          warehouse: warehouse._id,
          qty: Math.floor(Number(line.quantity)),
          serials: line.serials,
          type: "PURCHASE",
          reference: purchase.purchaseCode,
          party: supplier.name,
          unitCost: rupeesToPaise(line.unitCost),
          notes: `Supplier invoice ${input.invoiceNumber.trim()}`,
          at: invoiceDate,
          source: "PURCHASE",
        });
        continue;
      }
      // Inward individual vehicles if supplied
      if (line.vehicles && line.vehicles.length > 0) {
        for (const v of line.vehicles) {
          const createdVehicleDocs = await Vehicle.create(
            [
              {
                chassisNumber: v.chassisNumber.trim().toUpperCase(),
                motorNumber: v.motorNumber.trim().toUpperCase(),
                batteryNumber: v.batteryNumber.trim().toUpperCase(),
                chargerNumber: v.chargerNumber?.trim().toUpperCase(),
                color: v.color.trim(),
                model: new mongoose.Types.ObjectId(line.model),
                status: "IN_STOCK",
                currentLocationType: "WAREHOUSE",
                warehouse: warehouse._id,
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
                toLocation: `Warehouse: ${warehouse.name}`,
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

/** Warehouses the user may pick on a purchase entry (null = all). */
export async function purchaseWarehouses(user: JWTPayload) {
  const scope = await purchaseWarehouseScope(user);
  const all = await Warehouse.find({ status: "ACTIVE" }).select("name code city isMain").sort({ isMain: -1, name: 1 }).lean();
  return scope ? all.filter((w: any) => scope.includes(String(w._id))) : all;
}
