import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import { Warehouse, IWarehouse } from "@/models/Warehouse";
import { WarehouseTransfer } from "@/models/WarehouseTransfer";
import { Vehicle } from "@/models/Vehicle";
import { VehicleModel } from "@/models/VehicleModel";
import { StockMovement } from "@/models/StockMovement";
import { Setting } from "@/models/Setting";
import { User } from "@/models/User";
import { withTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { generateFyCode } from "@/lib/codeGenerator";
import { isEwbNumber } from "@/lib/gstDocs";
import { ageBucket, vehicleCosts } from "./stockValue";

export class WarehouseError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const oid = (v: any) => new mongoose.Types.ObjectId(String(v));
const same = (a: any, b: any) => !!a && !!b && String(a) === String(b);

/* ------------------------------------------------------------------ */
/* Lookup helpers                                                      */
/* ------------------------------------------------------------------ */

/** The main warehouse; created from the company address the first time it is needed. */
export async function mainWarehouse(session?: mongoose.ClientSession | null): Promise<IWarehouse> {
  const found = await Warehouse.findOne({ isMain: true }).session(session ?? null);
  if (found) return found;
  const s: any = await Setting.findOne().lean();
  try {
    const [w] = await Warehouse.create(
      [
        {
          code: "JKWH-01",
          name: "Main Warehouse",
          address: s?.address || "Main warehouse",
          city: s?.city || "Kolkata",
          state: s?.state || "West Bengal",
          stateCode: s?.stateCode || "19",
          pincode: s?.pincode || "",
          phone: s?.phone || "",
          isMain: true,
        },
      ],
      { session: session ?? undefined }
    );
    return w;
  } catch {
    // created concurrently
    return (await Warehouse.findOne({ isMain: true }).session(session ?? null))!;
  }
}

/** Mongo filter for vehicles held in a warehouse (older vehicles with no warehouse belong to the main one). */
export async function inWarehouse(warehouseId: any): Promise<Record<string, any>> {
  const main = await mainWarehouse();
  return same(main._id, warehouseId) ? { warehouse: { $in: [main._id, null] } } : { warehouse: oid(warehouseId) };
}

/** Free (sellable) stock in one warehouse. */
export async function freeStockFilter(warehouseId: any) {
  return { status: "IN_STOCK", currentLocationType: "WAREHOUSE", ...(await inWarehouse(warehouseId)) };
}

/** Resolve a warehouse id (default: main). Must be active. */
export async function resolveWarehouse(id?: string | null): Promise<IWarehouse> {
  if (!id) return mainWarehouse();
  if (!mongoose.isValidObjectId(id)) throw new WarehouseError("Warehouse not found", 404);
  const w = await Warehouse.findById(id);
  if (!w) throw new WarehouseError("Warehouse not found", 404);
  if (w.status !== "ACTIVE") throw new WarehouseError(`${w.name} is inactive`);
  return w;
}

/** Warehouses a store manager runs (their own record, or where they are named manager). */
export async function myWarehouseIds(user: JWTPayload): Promise<string[]> {
  const [u, managed] = await Promise.all([
    User.findById(user.userId).select("warehouse").lean(),
    Warehouse.find({ manager: oid(user.userId) }).select("_id").lean(),
  ]);
  return [...new Set([...(u?.warehouse ? [String(u.warehouse)] : []), ...managed.map((w: any) => String(w._id))])];
}

/** May this user send stock out of / receive stock into this warehouse? */
export async function canOperate(user: JWTPayload, warehouseId: any) {
  if (await hasPermission(user.role, "warehouse.manage")) return true;
  if (!(await hasPermission(user.role, "warehouse.transfer"))) return false;
  return (await myWarehouseIds(user)).includes(String(warehouseId));
}

/* ------------------------------------------------------------------ */
/* Masters                                                             */
/* ------------------------------------------------------------------ */

export interface WarehouseInput {
  id?: string;
  name: string;
  address: string;
  city: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  phone?: string;
  managerId?: string | null;
  isMain?: boolean;
  status?: "ACTIVE" | "INACTIVE";
}

export async function saveWarehouse(user: JWTPayload, input: WarehouseInput) {
  if (!input.name?.trim() || !input.address?.trim() || !input.city?.trim()) throw new WarehouseError("Name, address and city are required");
  const stateCode = String(input.stateCode || "19").trim();
  if (!/^\d{2}$/.test(stateCode)) throw new WarehouseError("State code must be two digits (e.g. 19 for West Bengal)");
  let manager: any = null;
  if (input.managerId) {
    const m = await User.findById(input.managerId).select("role status").lean();
    if (!m || m.status !== "ACTIVE") throw new WarehouseError("Manager not found");
    manager = m._id;
  }
  await mainWarehouse();
  const data: any = {
    name: input.name.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    state: (input.state || "West Bengal").trim(),
    stateCode,
    pincode: (input.pincode || "").trim(),
    phone: (input.phone || "").trim(),
    manager,
  };
  let w: IWarehouse;
  if (input.id) {
    if (!mongoose.isValidObjectId(input.id)) throw new WarehouseError("Warehouse not found", 404);
    const found = await Warehouse.findById(input.id);
    if (!found) throw new WarehouseError("Warehouse not found", 404);
    w = found;
    if (input.status === "INACTIVE" && w.status === "ACTIVE") {
      if (w.isMain) throw new WarehouseError("The main warehouse cannot be closed — make another warehouse main first");
      const held = await Vehicle.countDocuments({ currentLocationType: "WAREHOUSE", warehouse: w._id });
      const moving = await WarehouseTransfer.countDocuments({ status: "IN_TRANSIT", $or: [{ from: w._id }, { to: w._id }] });
      if (held || moving) throw new WarehouseError(`Move the ${held} unit(s) out and finish ${moving} open transfer(s) before closing ${w.name}`);
    }
    Object.assign(w, data, input.status ? { status: input.status } : {});
  } else {
    const n = (await Warehouse.countDocuments()) + 1;
    let code = `JKWH-${String(n).padStart(2, "0")}`;
    while (await Warehouse.exists({ code })) code = `JKWH-${String(Number(code.slice(5)) + 1).padStart(2, "0")}`;
    w = new Warehouse({ ...data, code, createdBy: oid(user.userId) });
  }
  if (input.isMain && !w.isMain) {
    if (w.status !== "ACTIVE") throw new WarehouseError("Only an active warehouse can be the main one");
    // Older vehicles without a warehouse belonged to the previous main warehouse: pin them there first.
    const prev = await mainWarehouse();
    await Vehicle.updateMany({ currentLocationType: "WAREHOUSE", warehouse: null }, { $set: { warehouse: prev._id } });
    await Warehouse.updateMany({ isMain: true }, { $set: { isMain: false } });
    w.isMain = true;
  }
  await w.save();
  if (manager) await User.updateOne({ _id: manager, role: "STORE_MANAGER" }, { $set: { warehouse: w._id } });
  await logAudit({ user, action: input.id ? "UPDATE" : "CREATE", resource: "WAREHOUSE", resourceId: String(w._id), after: data });
  return w;
}

/** Minimum free stock per model for one warehouse (drives the low-stock alert). */
export async function setMinStock(user: JWTPayload, id: string, rows: Array<{ modelId: string; qty: number }>) {
  const w = await resolveWarehouse(id);
  if (!(await canOperate(user, w._id))) throw new WarehouseError("Not allowed", 403);
  w.minStock = (rows || [])
    .filter((r) => mongoose.isValidObjectId(r.modelId) && Number(r.qty) > 0)
    .map((r) => ({ model: oid(r.modelId), qty: Math.floor(Number(r.qty)) })) as any;
  await w.save();
  await logAudit({ user, action: "UPDATE", resource: "WAREHOUSE", resourceId: id, after: { minStock: w.minStock.length } });
  return w;
}

/* ------------------------------------------------------------------ */
/* Stock position                                                      */
/* ------------------------------------------------------------------ */

/**
 * Every warehouse with stock by model (free / reserved on a DO), value at cost,
 * ageing, transfers on the road, and low-stock alerts against the minimum levels.
 */
export async function warehouseBoard() {
  const main = await mainWarehouse();
  const [warehouses, models, vehicles, transfers] = await Promise.all([
    Warehouse.find().populate("manager", "name employeeCode").sort({ isMain: -1, name: 1 }).lean(),
    VehicleModel.find({ isActive: true }).select("name variant").sort({ name: 1 }).lean(),
    Vehicle.find({ currentLocationType: "WAREHOUSE", status: { $in: ["IN_STOCK", "RESERVED"] } })
      .select("model status warehouse purchase createdAt")
      .lean(),
    WarehouseTransfer.find({ status: "IN_TRANSIT" }).select("from to vehicles totalValue").lean(),
  ]);
  const costs = await vehicleCosts(vehicles as any);
  // Age in stock counts from the supplier invoice date (inward), not when the record was keyed in.
  const { Purchase } = await import("@/models/Purchase");
  const pIds = [...new Set(vehicles.map((v: any) => String(v.purchase || "")).filter(Boolean))];
  const inward = new Map(
    (pIds.length ? await Purchase.find({ _id: { $in: pIds.map(oid) } }).select("invoiceDate").lean() : []).map((p: any) => [String(p._id), new Date(p.invoiceDate).getTime()])
  );
  const now = Date.now();
  const modelName = new Map(models.map((m: any) => [String(m._id), `${m.name} ${m.variant}`.trim()]));
  return warehouses.map((w: any) => {
    const mine = vehicles.filter((v: any) => String(v.warehouse || main._id) === String(w._id));
    const byModel = new Map<string, { modelId: string; model: string; free: number; reserved: number; value: number; oldestDays: number }>();
    const ageing: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    let value = 0;
    for (const v of mine as any[]) {
      const k = String(v.model);
      const row = byModel.get(k) || { modelId: k, model: modelName.get(k) || "Model", free: 0, reserved: 0, value: 0, oldestDays: 0 };
      if (v.status === "IN_STOCK") row.free++;
      else row.reserved++;
      const c = costs.get(String(v._id)) || 0;
      row.value += c;
      value += c;
      const since = (v.purchase && inward.get(String(v.purchase))) || new Date(v.createdAt).getTime();
      const days = Math.max(0, Math.floor((now - since) / 86400000));
      row.oldestDays = Math.max(row.oldestDays, days);
      ageing[ageBucket(days)]++;
      byModel.set(k, row);
    }
    const lowStock = (w.minStock || [])
      .map((m: any) => ({ modelId: String(m.model), model: modelName.get(String(m.model)) || "Model", min: m.qty, free: byModel.get(String(m.model))?.free || 0 }))
      .filter((m: any) => m.free < m.min);
    const outbound = transfers.filter((t: any) => same(t.from, w._id));
    const inbound = transfers.filter((t: any) => same(t.to, w._id));
    return {
      ...w,
      stock: [...byModel.values()].sort((a, b) => a.model.localeCompare(b.model)),
      units: mine.length,
      free: mine.filter((v: any) => v.status === "IN_STOCK").length,
      value,
      ageing,
      lowStock,
      inbound: { transfers: inbound.length, units: inbound.reduce((s: number, t: any) => s + t.vehicles.length, 0) },
      outbound: { transfers: outbound.length, units: outbound.reduce((s: number, t: any) => s + t.vehicles.length, 0) },
    };
  });
}

/** Free units in a warehouse, oldest first (for picking a transfer). */
export async function freeUnits(warehouseId: string) {
  const w = await resolveWarehouse(warehouseId);
  return Vehicle.find(await freeStockFilter(w._id))
    .populate("model", "name variant")
    .select("chassisNumber color model createdAt")
    .sort({ createdAt: 1 })
    .lean();
}

/* ------------------------------------------------------------------ */
/* Warehouse → warehouse transfer                                      */
/* ------------------------------------------------------------------ */

export interface TransferInput {
  fromId: string;
  toId: string;
  /** Either explicit vehicles … */
  vehicleIds?: string[];
  /** … or a quantity per model, picked oldest-first (FIFO). */
  lines?: Array<{ modelId: string; quantity: number }>;
  transport?: { vehicleNo?: string; driverName?: string; driverPhone?: string; ewayBillNo?: string; invoiceNo?: string };
  remarks?: string;
}

export async function createWarehouseTransfer(user: JWTPayload, input: TransferInput) {
  const from = await resolveWarehouse(input.fromId);
  const to = await resolveWarehouse(input.toId);
  if (same(from._id, to._id)) throw new WarehouseError("Choose two different warehouses");
  if (!(await canOperate(user, from._id))) throw new WarehouseError(`You can only send stock out of your own warehouse`, 403);

  const free = await freeStockFilter(from._id);
  let ids: string[] = [];
  if (input.vehicleIds?.length) {
    ids = [...new Set(input.vehicleIds.filter((v) => mongoose.isValidObjectId(v)))];
  } else {
    for (const l of input.lines || []) {
      const q = Math.floor(Number(l.quantity));
      if (!q || q < 1 || !mongoose.isValidObjectId(l.modelId)) continue;
      const pick = await Vehicle.find({ ...free, model: oid(l.modelId) }).sort({ createdAt: 1 }).limit(q).select("_id").lean();
      if (pick.length < q) {
        const m = await VehicleModel.findById(l.modelId).select("name variant").lean();
        throw new WarehouseError(`${m ? `${m.name} ${m.variant}` : "Model"}: only ${pick.length} free unit(s) in ${from.name}`, 409);
      }
      ids.push(...pick.map((p: any) => String(p._id)));
    }
  }
  if (!ids.length) throw new WarehouseError("Pick at least one vehicle to transfer");

  const vehicles = await Vehicle.find({ _id: { $in: ids.map(oid) }, ...free }).populate("model", "name variant").lean();
  if (vehicles.length !== ids.length) throw new WarehouseError(`Some vehicles are not free stock in ${from.name}`, 409);
  const costs = await vehicleCosts(vehicles as any);
  const totalValue = vehicles.reduce((s, v: any) => s + (costs.get(String(v._id)) || 0), 0);

  const s: any = await Setting.findOne().lean();
  const threshold = s?.logistics?.ewayBillThresholdPaise ?? 5000000;
  const interState = from.stateCode !== to.stateCode;
  const tp = {
    vehicleNo: (input.transport?.vehicleNo || "").trim().toUpperCase(),
    driverName: (input.transport?.driverName || "").trim(),
    driverPhone: (input.transport?.driverPhone || "").trim(),
    ewayBillNo: (input.transport?.ewayBillNo || "").replace(/\s/g, ""),
    invoiceNo: (input.transport?.invoiceNo || "").trim(),
  };
  if (!tp.vehicleNo || !tp.driverName) throw new WarehouseError("Enter the carrying vehicle number and driver name");
  if (totalValue >= threshold) {
    if (!tp.ewayBillNo) throw new WarehouseError(`Consignment value is ₹${(totalValue / 100).toLocaleString("en-IN")} — an e-way bill is required`);
    if (!isEwbNumber(tp.ewayBillNo)) throw new WarehouseError("E-way bill number must be 12 digits");
  } else if (tp.ewayBillNo && !isEwbNumber(tp.ewayBillNo)) throw new WarehouseError("E-way bill number must be 12 digits");
  // Between GST registrations in different states a branch transfer is a taxable supply.
  if (interState && !tp.invoiceNo) throw new WarehouseError(`${from.name} and ${to.name} are in different states — enter the tax invoice number for this branch transfer`);

  const transfer = await withTransaction(async (session) => {
    const code = await generateFyCode("WAREHOUSE_TRANSFER", new Date(), session);
    const [t] = await WarehouseTransfer.create(
      [
        {
          transferCode: code,
          from: from._id,
          fromName: from.name,
          fromStateCode: from.stateCode,
          to: to._id,
          toName: to.name,
          toStateCode: to.stateCode,
          interState,
          vehicles: vehicles.map((v: any) => ({
            vehicle: v._id,
            chassisNumber: v.chassisNumber,
            modelName: `${v.model?.name || ""} ${v.model?.variant || ""}`.trim(),
            value: costs.get(String(v._id)) || 0,
          })),
          totalValue,
          transport: tp,
          createdBy: oid(user.userId),
          createdByName: user.name,
          remarks: input.remarks?.trim(),
        },
      ],
      { session }
    );
    const r = await Vehicle.updateMany(
      { _id: { $in: ids.map(oid) }, ...free },
      { $set: { status: "IN_TRANSIT", currentLocationType: "IN_TRANSIT", transfer: t._id, warehouse: from._id } },
      { session }
    );
    if (r.modifiedCount !== ids.length) throw new WarehouseError("Stock changed while saving — try again", 409);
    await StockMovement.create(
      vehicles.map((v: any) => ({
        vehicle: v._id,
        movementType: "WAREHOUSE_TRANSFER",
        fromLocation: `Warehouse: ${from.name}`,
        toLocation: `In transit to ${to.name}`,
        performedBy: oid(user.userId),
        reference: code,
        timestamp: new Date(),
      })),
      { session, ordered: true }
    );
    return t;
  });
  await logAudit({ user, action: "DISPATCH", resource: "WAREHOUSE", resourceId: String(transfer._id), after: { code: transfer.transferCode, from: from.name, to: to.name, units: ids.length } });
  return transfer;
}

/**
 * Receiving warehouse checks every chassis. RECEIVED units become free stock there;
 * SHORT units are marked MISSING for investigation. The sender cannot confirm receipt.
 */
export async function receiveWarehouseTransfer(
  user: JWTPayload,
  id: string,
  items?: Array<{ vehicleId: string; condition: "RECEIVED" | "SHORT"; remarks?: string }>
) {
  if (!mongoose.isValidObjectId(id)) throw new WarehouseError("Transfer not found", 404);
  const t = await WarehouseTransfer.findById(id);
  if (!t) throw new WarehouseError("Transfer not found", 404);
  if (t.status !== "IN_TRANSIT") throw new WarehouseError(`Already ${t.status.toLowerCase().replace(/_/g, " ")}`);
  if (!(await canOperate(user, t.to))) throw new WarehouseError(`Only ${t.toName} can confirm receipt`, 403);
  if (same(t.createdBy, user.userId)) throw new WarehouseError("The person who sent the stock cannot also confirm receipt", 403);

  const marks = new Map((items || []).map((i) => [String(i.vehicleId), i]));
  for (const v of t.vehicles) {
    const m = marks.get(String(v.vehicle));
    v.condition = m?.condition === "SHORT" ? "SHORT" : "RECEIVED";
    v.remarks = m?.remarks?.trim() || undefined;
  }
  const short = t.vehicles.filter((v) => v.condition === "SHORT");
  if (short.some((v) => !v.remarks)) throw new WarehouseError("Give a remark for every unit marked short");
  const got = t.vehicles.filter((v) => v.condition === "RECEIVED");

  await withTransaction(async (session) => {
    if (got.length) {
      await Vehicle.updateMany(
        { _id: { $in: got.map((v) => v.vehicle) }, transfer: t._id },
        { $set: { status: "IN_STOCK", currentLocationType: "WAREHOUSE", warehouse: t.to, transfer: null } },
        { session }
      );
    }
    if (short.length) {
      await Vehicle.updateMany({ _id: { $in: short.map((v) => v.vehicle) }, transfer: t._id }, { $set: { status: "MISSING", transfer: null } }, { session });
    }
    await StockMovement.create(
      t.vehicles.map((v) => ({
        vehicle: v.vehicle,
        movementType: v.condition === "SHORT" ? "SHORTAGE" : "WAREHOUSE_TRANSFER",
        fromLocation: `In transit from ${t.fromName}`,
        toLocation: v.condition === "SHORT" ? "Missing — reported short" : `Warehouse: ${t.toName}`,
        performedBy: oid(user.userId),
        reference: t.transferCode,
        notes: v.remarks,
        timestamp: new Date(),
      })),
      { session, ordered: true }
    );
    t.status = short.length ? "RECEIVED_SHORT" : "RECEIVED";
    t.receivedBy = oid(user.userId);
    t.receivedByName = user.name;
    t.receivedAt = new Date();
    await t.save({ session });
  });
  await logAudit({ user, action: "RECEIVE", resource: "WAREHOUSE", resourceId: id, after: { code: t.transferCode, received: got.length, short: short.length } });
  return t;
}

/** Sender calls a transfer back before it is received; units return to the source warehouse. */
export async function cancelWarehouseTransfer(user: JWTPayload, id: string, reason: string) {
  if (!mongoose.isValidObjectId(id)) throw new WarehouseError("Transfer not found", 404);
  const t = await WarehouseTransfer.findById(id);
  if (!t) throw new WarehouseError("Transfer not found", 404);
  if (t.status !== "IN_TRANSIT") throw new WarehouseError("Only a transfer still on the road can be cancelled");
  if (!(await canOperate(user, t.from))) throw new WarehouseError("Only the sending warehouse can cancel", 403);
  if (!reason?.trim()) throw new WarehouseError("Give a reason");
  await withTransaction(async (session) => {
    await Vehicle.updateMany(
      { transfer: t._id },
      { $set: { status: "IN_STOCK", currentLocationType: "WAREHOUSE", warehouse: t.from, transfer: null } },
      { session }
    );
    await StockMovement.create(
      t.vehicles.map((v) => ({
        vehicle: v.vehicle,
        movementType: "WAREHOUSE_TRANSFER",
        fromLocation: `In transit to ${t.toName}`,
        toLocation: `Warehouse: ${t.fromName} (transfer cancelled)`,
        performedBy: oid(user.userId),
        reference: t.transferCode,
        notes: reason.trim(),
        timestamp: new Date(),
      })),
      { session, ordered: true }
    );
    t.status = "CANCELLED";
    t.cancelledByName = user.name;
    t.remarks = [t.remarks, `Cancelled: ${reason.trim()}`].filter(Boolean).join(" · ");
    await t.save({ session });
  });
  await logAudit({ user, action: "CANCEL", resource: "WAREHOUSE", resourceId: id, after: { code: t.transferCode, reason } });
  return t;
}

/** Transfers this user may see: all for stock controllers, own warehouses for a store manager. */
export async function listWarehouseTransfers(user: JWTPayload, q: { status?: string; warehouseId?: string }) {
  const filter: any = {};
  if (q.status) filter.status = q.status;
  if (q.warehouseId && mongoose.isValidObjectId(q.warehouseId)) filter.$or = [{ from: oid(q.warehouseId) }, { to: oid(q.warehouseId) }];
  if (!(await hasPermission(user.role, "warehouse.manage")) && user.role === "STORE_MANAGER") {
    const mine = (await myWarehouseIds(user)).map(oid);
    filter.$and = [{ $or: [{ from: { $in: mine } }, { to: { $in: mine } }] }];
  }
  return WarehouseTransfer.find(filter).sort({ createdAt: -1 }).limit(200).lean();
}

export async function getWarehouseTransfer(user: JWTPayload, id: string) {
  if (!mongoose.isValidObjectId(id)) throw new WarehouseError("Transfer not found", 404);
  const t = await WarehouseTransfer.findById(id).lean();
  if (!t) throw new WarehouseError("Transfer not found", 404);
  if (user.role === "STORE_MANAGER" && !(await hasPermission(user.role, "warehouse.manage"))) {
    const mine = await myWarehouseIds(user);
    if (!mine.includes(String(t.from)) && !mine.includes(String(t.to))) throw new WarehouseError("Transfer not found", 404);
  }
  const [from, to] = await Promise.all([Warehouse.findById(t.from).lean(), Warehouse.findById(t.to).lean()]);
  return {
    ...t,
    fromWarehouse: from,
    toWarehouse: to,
    canReceive: t.status === "IN_TRANSIT" && !same(t.createdBy, user.userId) && (await canOperate(user, t.to)),
    canCancel: t.status === "IN_TRANSIT" && (await canOperate(user, t.from)),
  };
}
