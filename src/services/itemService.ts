import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import {
  Item,
  IItem,
  ItemStock,
  ItemSerial,
  ItemMovement,
  ItemMoveType,
  StockCondition,
  SerialStatus,
  IItemLine,
  PartsSale,
  BatteryJob,
  ITEM_CATEGORIES,
  ITEM_UNITS,
  ItemCategory,
} from "@/models/Item";
import { Warehouse } from "@/models/Warehouse";
import { Vehicle } from "@/models/Vehicle";
import { VehicleModel } from "@/models/VehicleModel";
import { Setting } from "@/models/Setting";
import { PayrollRun } from "@/models/PayrollRun";
import { withTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { rupeesToPaise } from "@/lib/money";
import { periodOf } from "@/lib/period";
import { generateFyCode, generateItemCode } from "@/lib/codeGenerator";
import { canOperate, mainWarehouse } from "./warehouseService";

export class ItemError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Session = mongoose.ClientSession | undefined;
const oid = (v: any) => new mongoose.Types.ObjectId(String(v));
const same = (a: any, b: any) => !!a && !!b && String(a) === String(b);
const S = (s: Session) => s ?? null;
const istDay = (d: Date) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  BATTERY: "Battery",
  CHARGER: "Charger",
  SPARE_PART: "Spare part",
  ACCESSORY: "Accessory",
};

/* ------------------------------------------------------------------ */
/* Core: one stock movement                                            */
/* ------------------------------------------------------------------ */

export interface MoveInput {
  item: IItem | any;
  warehouse: any;
  condition?: StockCondition;
  qty: number; // + in, − out
  serials?: string[];
  type: ItemMoveType;
  reason?: string;
  reference?: string;
  party?: string;
  unitCost?: number;
  notes?: string;
  at?: Date;
  /** Status a serial gets when it goes out (default SOLD). */
  outStatus?: SerialStatus;
  /** Where an incoming serial came from (PURCHASE, VEHICLE, CUSTOMER …). */
  source?: string;
  vehicle?: any;
  /** Incoming serial that may already exist as sold / returned (customer battery). */
  allowReturning?: boolean;
}

function cleanSerials(list: string[] | undefined) {
  const out = (list || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  const dup = out.find((s, i) => out.indexOf(s) !== i);
  if (dup) throw new ItemError(`Serial ${dup} is entered twice`);
  return out;
}

/** Apply one signed stock change to an item in a warehouse, keeping serials and the ledger in step. */
export async function moveStock(session: Session, user: JWTPayload | null, m: MoveInput) {
  const qty = Math.trunc(m.qty);
  if (!qty) throw new ItemError("Quantity must be at least 1");
  const condition: StockCondition = m.condition || "GOOD";
  const item = m.item;
  const serials = item.serialTracked ? cleanSerials(m.serials) : [];
  if (item.serialTracked && serials.length !== Math.abs(qty)) {
    throw new ItemError(`${item.name}: enter ${Math.abs(qty)} serial number(s) — one for each unit (${serials.length} given)`);
  }
  const wh = oid(m.warehouse);

  if (qty < 0) {
    const r = await ItemStock.findOneAndUpdate(
      { item: item._id, warehouse: wh, condition, qty: { $gte: -qty } },
      { $inc: { qty } },
      { new: true, session: S(session) }
    );
    if (!r) {
      const have: any = await ItemStock.findOne({ item: item._id, warehouse: wh, condition }).session(S(session)).lean();
      const w: any = await Warehouse.findById(wh).select("name").session(S(session)).lean();
      throw new ItemError(
        `${item.name}: only ${have?.qty || 0} ${condition === "GOOD" ? "" : `${condition.toLowerCase()} `}in stock at ${w?.name || "the warehouse"}, ${-qty} needed`,
        409
      );
    }
    for (const sn of serials) {
      const u = await ItemSerial.findOneAndUpdate(
        { item: item._id, serialNo: sn, status: "IN_STOCK", warehouse: wh, condition },
        { $set: { status: m.outStatus || "SOLD", warehouse: null, lastReference: m.reference || "" } },
        { new: true, session: S(session) }
      );
      if (!u) throw new ItemError(`${item.name}: serial ${sn} is not in ${condition === "GOOD" ? "good " : `${condition.toLowerCase()} `}stock at this warehouse`, 409);
    }
  } else {
    await ItemStock.updateOne(
      { item: item._id, warehouse: wh, condition },
      { $inc: { qty } },
      { upsert: true, session }
    );
    for (const sn of serials) {
      const existing: any = await ItemSerial.findOne({ item: item._id, serialNo: sn }).session(S(session));
      if (existing) {
        if (existing.status === "IN_STOCK") throw new ItemError(`${item.name}: serial ${sn} is already in stock`, 409);
        if (!m.allowReturning && !["SOLD", "ISSUED", "FITTED", "RETURNED_TO_CUSTOMER", "SENT_TO_SUPPLIER"].includes(existing.status)) {
          throw new ItemError(`${item.name}: serial ${sn} was ${existing.status.toLowerCase().replace(/_/g, " ")} and cannot come back in`, 409);
        }
        existing.status = "IN_STOCK";
        existing.condition = condition;
        existing.warehouse = wh;
        existing.source = m.source || existing.source;
        existing.lastReference = m.reference || "";
        if (m.vehicle) existing.vehicle = oid(m.vehicle);
        await existing.save({ session });
      } else {
        await ItemSerial.create(
          [{ item: item._id, serialNo: sn, status: "IN_STOCK", condition, warehouse: wh, source: m.source || "PURCHASE", vehicle: m.vehicle ? oid(m.vehicle) : null, lastReference: m.reference || "" }],
          { session: S(session) }
        );
      }
    }
  }

  await ItemMovement.create(
    [
      {
        item: item._id,
        warehouse: wh,
        condition,
        qty,
        serials,
        type: m.type,
        reason: m.reason,
        reference: m.reference,
        party: m.party,
        unitCost: m.unitCost ?? item.purchasePrice ?? 0,
        notes: m.notes,
        by: user ? oid(user.userId) : undefined,
        byName: user?.name,
        at: m.at || new Date(),
      },
    ],
    { session: S(session) }
  );
}

/* ------------------------------------------------------------------ */
/* Item master                                                         */
/* ------------------------------------------------------------------ */

const RATE_FIELDS = ["purchasePrice", "sellingPrice", "dealerPrice", "gstRate", "hsnCode"] as const;
const RATE_LABEL: Record<string, string> = {
  purchasePrice: "Purchase rate",
  sellingPrice: "Selling rate",
  dealerPrice: "Dealer rate",
  distributorPrice: "Distributor rate",
  superDistributorPrice: "Super distributor rate",
  subDealerPrice: "Sub-dealer rate",
  gstRate: "GST %",
  hsnCode: "HSN",
};
export { RATE_LABEL };

export interface ItemInput {
  name: string;
  category: ItemCategory;
  brand?: string;
  partNo?: string;
  unit?: string;
  hsnCode: string;
  gstRate: number;
  purchaseRupees: number;
  sellingRupees: number;
  dealerRupees?: number | null;
  serialTracked?: boolean;
  compatibleModels?: string[];
  minStock?: number;
  description?: string;
  isActive?: boolean;
  rateNote?: string;
}

function validItem(input: ItemInput) {
  if (!input.name?.trim()) throw new ItemError("Enter the item name");
  if (!ITEM_CATEGORIES.includes(input.category)) throw new ItemError("Choose the item type");
  if (!/^\d{4,8}$/.test(String(input.hsnCode || "").trim())) throw new ItemError("HSN code must be 4 to 8 digits");
  if (![0, 5, 12, 18, 28].includes(Number(input.gstRate))) throw new ItemError("GST rate must be 0, 5, 12, 18 or 28%");
  for (const [k, v] of [["purchase rate", input.purchaseRupees], ["selling rate", input.sellingRupees]] as const) {
    if (!Number.isFinite(Number(v)) || Number(v) < 0) throw new ItemError(`Enter a valid ${k}`);
  }
  if (input.unit && !(ITEM_UNITS as readonly string[]).includes(input.unit)) throw new ItemError("Choose a valid unit");
}

export async function listItems(q: { category?: string; q?: string; active?: string; warehouse?: string }) {
  const filter: any = {};
  if (q.category && ITEM_CATEGORIES.includes(q.category as ItemCategory)) filter.category = q.category;
  if (q.active === "1") filter.isActive = true;
  if (q.q?.trim()) {
    const rx = new RegExp(q.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: rx }, { code: rx }, { partNo: rx }, { brand: rx }];
  }
  const items = await Item.find(filter).select("-rateHistory").populate("compatibleModels", "name variant").sort({ category: 1, name: 1 }).lean();
  const stockFilter: any = { item: { $in: items.map((i: any) => i._id) } };
  if (q.warehouse && mongoose.isValidObjectId(q.warehouse)) stockFilter.warehouse = oid(q.warehouse);
  const stock = await ItemStock.find(stockFilter).lean();
  return items.map((i: any) => {
    const mine = stock.filter((s: any) => same(s.item, i._id));
    const sum = (c: string) => mine.filter((s: any) => s.condition === c).reduce((t: number, s: any) => t + s.qty, 0);
    const good = sum("GOOD");
    return { ...i, stock: { good, defective: sum("DEFECTIVE"), repair: sum("REPAIR"), value: good * (i.purchasePrice || 0) }, low: i.isActive && i.minStock > 0 && good < i.minStock };
  });
}

export async function createItem(user: JWTPayload, input: ItemInput) {
  validItem(input);
  const name = input.name.trim();
  if (await Item.findOne({ name, category: input.category })) throw new ItemError(`${name} already exists in ${CATEGORY_LABEL[input.category]}`, 409);
  const item = await Item.create({
    code: await generateItemCode(),
    name,
    category: input.category,
    brand: input.brand?.trim(),
    partNo: input.partNo?.trim(),
    unit: input.unit || "PCS",
    hsnCode: String(input.hsnCode).trim(),
    gstRate: Number(input.gstRate),
    purchasePrice: rupeesToPaise(Number(input.purchaseRupees)),
    sellingPrice: rupeesToPaise(Number(input.sellingRupees)),
    dealerPrice: input.dealerRupees ? rupeesToPaise(Number(input.dealerRupees)) : null,
    // batteries and chargers are tracked by serial number unless told otherwise
    serialTracked: input.serialTracked ?? (input.category === "BATTERY" || input.category === "CHARGER"),
    compatibleModels: (input.compatibleModels || []).filter((m) => mongoose.isValidObjectId(m)).map(oid),
    minStock: Math.max(0, Math.floor(Number(input.minStock || 0))),
    description: input.description?.trim(),
    isActive: input.isActive ?? true,
    createdBy: oid(user.userId),
  });
  await logAudit({ user, action: "CREATE", resource: "ITEM", resourceId: String(item._id), after: { code: item.code, name: item.name, category: item.category } });
  return item;
}

/** Edit an item. Changing a rate needs `price.manage` and is written to the rate history. */
export async function updateItem(user: JWTPayload, id: string, input: ItemInput) {
  if (!mongoose.isValidObjectId(id)) throw new ItemError("Item not found", 404);
  validItem(input);
  const item = await Item.findById(id);
  if (!item) throw new ItemError("Item not found", 404);
  const next: Record<string, any> = {
    purchasePrice: rupeesToPaise(Number(input.purchaseRupees)),
    sellingPrice: rupeesToPaise(Number(input.sellingRupees)),
    dealerPrice: input.dealerRupees ? rupeesToPaise(Number(input.dealerRupees)) : null,
    gstRate: Number(input.gstRate),
    hsnCode: String(input.hsnCode).trim(),
  };
  const changes = RATE_FIELDS.filter((f) => String((item as any)[f] ?? "") !== String(next[f] ?? "")).map((f) => ({ field: f, from: (item as any)[f] ?? null, to: next[f] }));
  if (changes.length && !(await hasPermission(user.role, "price.manage"))) throw new ItemError("You can edit item details but not its rates", 403);
  if (input.serialTracked !== undefined && input.serialTracked !== item.serialTracked) {
    const held = await ItemStock.exists({ item: item._id, qty: { $gt: 0 } });
    if (held) throw new ItemError("Serial tracking can only be switched while the item has no stock");
    item.serialTracked = input.serialTracked;
  }
  const name = input.name.trim();
  if ((name !== item.name || input.category !== item.category) && (await Item.findOne({ _id: { $ne: item._id }, name, category: input.category }))) {
    throw new ItemError(`${name} already exists`, 409);
  }
  Object.assign(item, {
    name,
    category: input.category,
    brand: input.brand?.trim(),
    partNo: input.partNo?.trim(),
    unit: input.unit || item.unit,
    compatibleModels: (input.compatibleModels || []).filter((m) => mongoose.isValidObjectId(m)).map(oid),
    minStock: Math.max(0, Math.floor(Number(input.minStock || 0))),
    description: input.description?.trim(),
    isActive: input.isActive ?? item.isActive,
    ...next,
  });
  if (changes.length) item.rateHistory.push({ at: new Date(), by: oid(user.userId), byName: user.name, changes, note: input.rateNote?.trim() });
  await item.save();
  await logAudit({ user, action: "UPDATE", resource: changes.length ? "PRICE" : "ITEM", resourceId: String(item._id), after: { code: item.code, changes } });
  return item;
}

export async function itemDetail(id: string) {
  if (!mongoose.isValidObjectId(id)) throw new ItemError("Item not found", 404);
  const item: any = await Item.findById(id).populate("compatibleModels", "name variant").lean();
  if (!item) throw new ItemError("Item not found", 404);
  const [stock, serials, moves] = await Promise.all([
    ItemStock.find({ item: item._id, qty: { $gt: 0 } }).populate("warehouse", "name code").lean(),
    item.serialTracked ? ItemSerial.find({ item: item._id, status: "IN_STOCK" }).populate("warehouse", "name code").sort({ serialNo: 1 }).limit(500).lean() : Promise.resolve([]),
    ItemMovement.find({ item: item._id }).populate("warehouse", "name code").sort({ at: -1, _id: -1 }).limit(150).lean(),
  ]);
  return { item, stock, serials, movements: moves };
}

/* ------------------------------------------------------------------ */
/* Stock actions                                                       */
/* ------------------------------------------------------------------ */

async function guardWarehouse(user: JWTPayload, warehouseId: any) {
  if (!mongoose.isValidObjectId(warehouseId)) throw new ItemError("Choose the warehouse");
  const w: any = await Warehouse.findById(warehouseId).lean();
  if (!w) throw new ItemError("Warehouse not found", 404);
  if (w.status !== "ACTIVE") throw new ItemError(`${w.name} is inactive`);
  const ok = (await hasPermission(user.role, "inventory.manage")) || (await canOperate(user, w._id));
  if (!ok) throw new ItemError(`You can only handle stock at the warehouses you run`, 403);
  return w;
}

async function loadItem(id: any, session?: Session) {
  if (!mongoose.isValidObjectId(id)) throw new ItemError("Choose the item");
  const item = await Item.findById(id).session(S(session));
  if (!item) throw new ItemError("Item not found", 404);
  return item;
}

export const STOCK_IN_REASONS = {
  OPENING: "Opening stock",
  BATTERY_BACK: "Battery back in stock (vehicle sold without battery)",
  CUSTOMER_RETURN: "Customer returned goods",
  FOUND: "Found in stock count",
  OTHER: "Other",
} as const;
export const STOCK_OUT_REASONS = {
  DAMAGED: "Damaged",
  INTERNAL_USE: "Used in workshop / service",
  SENT_TO_SUPPLIER: "Sent to supplier (warranty claim)",
  SCRAP: "Scrapped",
  LOST: "Lost / shortage in stock count",
  OTHER: "Other",
} as const;

export async function stockIn(
  user: JWTPayload,
  input: { itemId: string; warehouseId: string; qty: number; serials?: string[]; condition?: StockCondition; reason: keyof typeof STOCK_IN_REASONS; notes?: string; costRupees?: number; chassisNumber?: string }
) {
  const w = await guardWarehouse(user, input.warehouseId);
  if (!(input.reason in STOCK_IN_REASONS)) throw new ItemError("Choose why the stock is coming in");
  if (input.reason === "OTHER" && !input.notes?.trim()) throw new ItemError("Write a note for 'Other'");
  const qty = Math.floor(Number(input.qty));
  if (!(qty >= 1 && qty <= 10000)) throw new ItemError("Enter a quantity between 1 and 10,000");
  const condition = input.condition === "DEFECTIVE" ? "DEFECTIVE" : "GOOD";
  let vehicle: any = null;
  if (input.chassisNumber?.trim()) {
    vehicle = await Vehicle.findOne({ chassisNumber: input.chassisNumber.trim().toUpperCase() }).select("_id chassisNumber").lean();
    if (!vehicle) throw new ItemError("No vehicle with that chassis number");
  }
  const reference = await generateFyCode("STOCK_ADJUST");
  await withTransaction(async (session) => {
    const item = await loadItem(input.itemId, session);
    await moveStock(session, user, {
      item,
      warehouse: w._id,
      condition,
      qty,
      serials: input.serials,
      type: "STOCK_IN",
      reason: STOCK_IN_REASONS[input.reason],
      reference,
      notes: [input.notes?.trim(), vehicle ? `Vehicle ${vehicle.chassisNumber}` : ""].filter(Boolean).join(" · "),
      unitCost: input.costRupees != null && input.costRupees !== ("" as any) ? rupeesToPaise(Number(input.costRupees)) : undefined,
      source: input.reason === "BATTERY_BACK" ? "VEHICLE" : input.reason,
      vehicle: vehicle?._id,
    });
  });
  await logAudit({ user, action: "RECEIVE", resource: "STOCK", resourceId: String(input.itemId), after: { reference, qty, warehouse: w.name, reason: input.reason } });
  return { reference };
}

export async function stockOut(
  user: JWTPayload,
  input: { itemId: string; warehouseId: string; qty: number; serials?: string[]; condition?: StockCondition; reason: keyof typeof STOCK_OUT_REASONS; notes?: string }
) {
  const w = await guardWarehouse(user, input.warehouseId);
  if (!(input.reason in STOCK_OUT_REASONS)) throw new ItemError("Choose why the stock is going out");
  if (input.reason === "OTHER" && !input.notes?.trim()) throw new ItemError("Write a note for 'Other'");
  const qty = Math.floor(Number(input.qty));
  if (!(qty >= 1)) throw new ItemError("Enter a quantity");
  const condition: StockCondition = input.condition === "DEFECTIVE" ? "DEFECTIVE" : "GOOD";
  const type: ItemMoveType = input.reason === "SENT_TO_SUPPLIER" ? "RETURN_TO_SUPPLIER" : input.reason === "SCRAP" ? "SCRAP" : "STOCK_OUT";
  const reference = await generateFyCode("STOCK_ADJUST");
  await withTransaction(async (session) => {
    const item = await loadItem(input.itemId, session);
    await moveStock(session, user, {
      item,
      warehouse: w._id,
      condition,
      qty: -qty,
      serials: input.serials,
      type,
      reason: STOCK_OUT_REASONS[input.reason],
      reference,
      notes: input.notes?.trim(),
      outStatus: type === "RETURN_TO_SUPPLIER" ? "SENT_TO_SUPPLIER" : type === "SCRAP" ? "SCRAPPED" : "ISSUED",
    });
  });
  await logAudit({ user, action: "UPDATE", resource: "STOCK", resourceId: String(input.itemId), after: { reference, qty: -qty, warehouse: w.name, reason: input.reason } });
  return { reference };
}

/** Defective stock repaired in-house: moves units from DEFECTIVE to GOOD. */
export async function markRepaired(user: JWTPayload, input: { itemId: string; warehouseId: string; qty: number; serials?: string[]; notes?: string }) {
  const w = await guardWarehouse(user, input.warehouseId);
  const qty = Math.floor(Number(input.qty));
  if (!(qty >= 1)) throw new ItemError("Enter a quantity");
  const reference = await generateFyCode("STOCK_ADJUST");
  await withTransaction(async (session) => {
    const item = await loadItem(input.itemId, session);
    const base = { item, warehouse: w._id, serials: input.serials, type: "CONDITION_CHANGE" as const, reference, notes: input.notes?.trim(), reason: "Repaired — back to good stock" };
    await moveStock(session, user, { ...base, condition: "DEFECTIVE", qty: -qty, outStatus: "ISSUED" });
    await moveStock(session, user, { ...base, condition: "GOOD", qty, source: "REPAIRED", allowReturning: true });
  });
  return { reference };
}

export async function transferItems(user: JWTPayload, input: { itemId: string; fromId: string; toId: string; qty: number; serials?: string[]; notes?: string }) {
  if (same(input.fromId, input.toId)) throw new ItemError("Choose two different warehouses");
  const from = await guardWarehouse(user, input.fromId);
  const to: any = await Warehouse.findById(input.toId).lean();
  if (!to || to.status !== "ACTIVE") throw new ItemError("Choose an active destination warehouse");
  const qty = Math.floor(Number(input.qty));
  if (!(qty >= 1)) throw new ItemError("Enter a quantity");
  const reference = await generateFyCode("STOCK_ADJUST");
  await withTransaction(async (session) => {
    const item = await loadItem(input.itemId, session);
    await moveStock(session, user, { item, warehouse: from._id, qty: -qty, serials: input.serials, type: "TRANSFER_OUT", reference, party: to.name, notes: input.notes, outStatus: "ISSUED" });
    await moveStock(session, user, { item, warehouse: to._id, qty, serials: input.serials, type: "TRANSFER_IN", reference, party: from.name, notes: input.notes, source: "TRANSFER", allowReturning: true });
  });
  await logAudit({ user, action: "DISPATCH", resource: "STOCK", resourceId: String(input.itemId), after: { reference, qty, from: from.name, to: to.name } });
  return { reference };
}

export async function stockBoard(q: { warehouse?: string; category?: string; q?: string }) {
  const [items, warehouses] = await Promise.all([
    listItems({ category: q.category, q: q.q, warehouse: q.warehouse }),
    Warehouse.find({ status: "ACTIVE" }).select("name code isMain").sort({ isMain: -1, name: 1 }).lean(),
  ]);
  const ids = items.map((i: any) => i._id);
  const byWh = await ItemStock.find({ item: { $in: ids }, condition: "GOOD", qty: { $gt: 0 } }).lean();
  const rows = items.map((i: any) => ({
    ...i,
    byWarehouse: Object.fromEntries(byWh.filter((s: any) => same(s.item, i._id)).map((s: any) => [String(s.warehouse), s.qty])),
  }));
  return {
    warehouses,
    items: rows,
    totals: {
      items: rows.length,
      value: rows.reduce((t: number, r: any) => t + r.stock.value, 0),
      low: rows.filter((r: any) => r.low).length,
      defective: rows.reduce((t: number, r: any) => t + r.stock.defective, 0),
      repair: rows.reduce((t: number, r: any) => t + r.stock.repair, 0),
    },
  };
}

export async function movementRegister(q: { itemId?: string; warehouseId?: string; type?: string; from?: string; to?: string }) {
  const f: any = {};
  if (q.itemId && mongoose.isValidObjectId(q.itemId)) f.item = oid(q.itemId);
  if (q.warehouseId && mongoose.isValidObjectId(q.warehouseId)) f.warehouse = oid(q.warehouseId);
  if (q.type) f.type = q.type;
  if (q.from || q.to) {
    f.at = {};
    if (q.from) f.at.$gte = new Date(`${q.from}T00:00:00+05:30`);
    if (q.to) f.at.$lte = new Date(`${q.to}T23:59:59.999+05:30`);
  }
  return ItemMovement.find(f).populate("item", "name code category unit").populate("warehouse", "name code").sort({ at: -1, _id: -1 }).limit(500).lean();
}

/* ------------------------------------------------------------------ */
/* Invoice lines (vehicle sales + parts sales)                         */
/* ------------------------------------------------------------------ */

export interface LineInput {
  itemId: string;
  qty: number;
  rateRupees?: number; // ex-GST; default = item selling rate
  discountRupees?: number;
  serials?: string[];
  warehouseId?: string;
}

/** Price and validate invoice lines (no stock change yet). */
export async function priceLines(session: Session, lines: LineInput[], defaultWarehouse: any): Promise<IItemLine[]> {
  const out: IItemLine[] = [];
  for (const l of lines || []) {
    const item = await loadItem(l.itemId, session);
    if (!item.isActive) throw new ItemError(`${item.name} is inactive`);
    const qty = Math.floor(Number(l.qty));
    if (!(qty >= 1 && qty <= 1000)) throw new ItemError(`${item.name}: enter a quantity`);
    const rate = l.rateRupees === undefined || l.rateRupees === null || (l.rateRupees as any) === "" ? item.sellingPrice : rupeesToPaise(Number(l.rateRupees));
    if (!(rate >= 0)) throw new ItemError(`${item.name}: enter a valid rate`);
    const discount = rupeesToPaise(Number(l.discountRupees || 0));
    if (discount < 0 || discount > rate * qty) throw new ItemError(`${item.name}: discount cannot be more than the line value`);
    const taxable = rate * qty - discount;
    const gst = Math.round((taxable * item.gstRate) / 100);
    out.push({
      item: item._id as any,
      name: item.name,
      category: item.category,
      hsnCode: item.hsnCode,
      unit: item.unit,
      qty,
      rate,
      discount,
      gstRate: item.gstRate,
      taxable,
      gst,
      amount: taxable + gst,
      unitCost: item.purchasePrice || 0,
      serials: item.serialTracked ? cleanSerials(l.serials) : [],
      warehouse: oid(l.warehouseId && mongoose.isValidObjectId(l.warehouseId) ? l.warehouseId : defaultWarehouse) as any,
    });
  }
  return out;
}

/** Take invoice lines out of stock (sale) or back in (cancellation). */
export async function moveLines(session: Session, user: JWTPayload, lines: IItemLine[], dir: "OUT" | "IN", reference: string, party: string, at?: Date) {
  for (const l of lines) {
    const item = await loadItem(l.item, session);
    await moveStock(session, user, {
      item,
      warehouse: l.warehouse,
      qty: dir === "OUT" ? -l.qty : l.qty,
      serials: l.serials,
      type: dir === "OUT" ? "SALE" : "SALE_CANCEL",
      reference,
      party,
      unitCost: l.unitCost,
      at,
      outStatus: "SOLD",
      source: "SALE_CANCEL",
    });
  }
}

/* ------------------------------------------------------------------ */
/* Parts counter sale                                                  */
/* ------------------------------------------------------------------ */

export interface PartsSaleInput {
  saleDate?: string;
  customer: { name: string; phone: string; address?: string; gstin?: string };
  warehouseId: string;
  lines: LineInput[];
  paymentMode: "CASH" | "UPI" | "BANK" | "CREDIT";
  amountReceivedRupees?: number;
  reference?: string;
  chassisNumber?: string;
  notes?: string;
}

async function companyStateCode() {
  const s: any = await Setting.findOne().select("stateCode").lean();
  return s?.stateCode || "19";
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;

async function checkSaleDate(dateStr: string | undefined) {
  const d = dateStr ? new Date(`${dateStr}T12:00:00+05:30`) : new Date();
  if (Number.isNaN(+d)) throw new ItemError("Choose the sale date");
  if (istDay(d) > istDay(new Date())) throw new ItemError("Sale date cannot be in the future");
  const p = periodOf(d);
  if (await PayrollRun.exists({ year: p.year, month: p.month, status: "LOCKED" })) throw new ItemError(`${p.period} is closed (payroll locked) — use a later date`);
  return dateStr ? d : new Date();
}

export async function createPartsSale(user: JWTPayload, input: PartsSaleInput, opts: { source?: "COUNTER" | "BATTERY_JOB"; batteryJob?: any; session?: Session } = {}) {
  const w = await guardWarehouse(user, input.warehouseId);
  if (!input.customer?.name?.trim()) throw new ItemError("Enter the customer name");
  if (!/^[6-9]\d{9}$/.test(String(input.customer?.phone || ""))) throw new ItemError("Enter the customer's 10-digit mobile number");
  const gstin = String(input.customer.gstin || "").trim().toUpperCase();
  if (gstin && !GSTIN.test(gstin)) throw new ItemError("Customer GSTIN is not valid");
  if (!input.lines?.length) throw new ItemError("Add at least one item");
  if (!["CASH", "UPI", "BANK", "CREDIT"].includes(input.paymentMode)) throw new ItemError("Choose the payment mode");
  const saleDate = await checkSaleDate(input.saleDate);
  const companyState = await companyStateCode();
  const stateCode = gstin ? gstin.slice(0, 2) : companyState;

  const run = async (session: Session) => {
    const lines = await priceLines(session, input.lines, w._id);
    const subTotal = lines.reduce((t, l) => t + l.taxable, 0);
    const gstAmount = lines.reduce((t, l) => t + l.gst, 0);
    const totalAmount = subTotal + gstAmount;
    const received =
      input.paymentMode === "CREDIT"
        ? 0
        : input.amountReceivedRupees === undefined || (input.amountReceivedRupees as any) === ""
          ? totalAmount
          : rupeesToPaise(Number(input.amountReceivedRupees));
    if (received < 0 || received > totalAmount) throw new ItemError("Amount received cannot be more than the invoice total");
    const saleCode = await generateFyCode("PARTS_SALE", saleDate, session);
    const [sale] = await PartsSale.create(
      [
        {
          saleCode,
          saleDate,
          customer: { name: input.customer.name.trim(), phone: String(input.customer.phone), address: input.customer.address?.trim(), gstin: gstin || undefined, stateCode },
          lines,
          subTotal,
          gstAmount,
          totalAmount,
          interState: stateCode !== companyState,
          paymentMode: input.paymentMode,
          payments: received > 0 ? [{ amount: received, date: saleDate, mode: input.paymentMode, reference: input.reference?.trim() }] : [],
          status: "DELIVERED",
          source: opts.source || "COUNTER",
          batteryJob: opts.batteryJob || null,
          chassisNumber: input.chassisNumber?.trim().toUpperCase() || undefined,
          notes: input.notes?.trim(),
          soldBy: oid(user.userId),
          soldByName: user.name,
        },
      ],
      { session: S(session) }
    );
    await moveLines(session, user, lines, "OUT", saleCode, input.customer.name.trim(), saleDate);
    return sale;
  };
  const sale = opts.session !== undefined ? await run(opts.session) : await withTransaction(run);
  await logAudit({ user, action: "CREATE", resource: "PARTS_SALE", resourceId: String(sale._id), after: { saleCode: sale.saleCode, total: sale.totalAmount } });
  return sale;
}

export async function cancelPartsSale(user: JWTPayload, id: string, reason: string) {
  if (!reason?.trim()) throw new ItemError("Give a reason for cancelling");
  if (!mongoose.isValidObjectId(id)) throw new ItemError("Sale not found", 404);
  const sale = await withTransaction(async (session) => {
    const s = await PartsSale.findById(id).session(S(session));
    if (!s) throw new ItemError("Sale not found", 404);
    if (s.status === "CANCELLED") throw new ItemError("Already cancelled");
    if (s.source === "BATTERY_JOB") throw new ItemError("This bill belongs to a battery replacement job and cannot be cancelled on its own");
    const p = periodOf(s.saleDate);
    if (await PayrollRun.exists({ year: p.year, month: p.month, status: "LOCKED" }).session(S(session))) throw new ItemError(`${p.period} is closed — this bill can no longer be cancelled`);
    await moveLines(session, user, s.lines, "IN", s.saleCode, s.customer.name);
    s.status = "CANCELLED";
    s.cancellationReason = reason.trim();
    s.cancelledAt = new Date();
    s.cancelledByName = user.name;
    await s.save({ session });
    return s;
  });
  await logAudit({ user, action: "CANCEL", resource: "PARTS_SALE", resourceId: id, after: { saleCode: sale.saleCode, reason } });
  return sale;
}

export async function recordPartsPayment(user: JWTPayload, id: string, input: { amountRupees: number; mode: string; reference?: string; date?: string }) {
  const s = await PartsSale.findById(id);
  if (!s || s.status === "CANCELLED") throw new ItemError("Sale not found", 404);
  if (!["CASH", "UPI", "BANK"].includes(input.mode)) throw new ItemError("Choose the payment mode");
  const amount = rupeesToPaise(Number(input.amountRupees));
  const paid = s.payments.reduce((t, p) => t + p.amount, 0);
  if (!(amount > 0) || amount > s.totalAmount - paid) throw new ItemError(`Enter an amount up to ${((s.totalAmount - paid) / 100).toFixed(2)}`);
  const date = input.date ? new Date(`${input.date}T12:00:00+05:30`) : new Date();
  if (istDay(date) > istDay(new Date())) throw new ItemError("Payment date cannot be in the future");
  s.payments.push({ amount, date, mode: input.mode, reference: input.reference?.trim() });
  await s.save();
  await logAudit({ user, action: "PAYMENT", resource: "PARTS_SALE", resourceId: id, after: { amount } });
  return s;
}

export async function listPartsSales(q: { from?: string; to?: string; q?: string; status?: string }) {
  const f: any = {};
  if (q.status) f.status = q.status;
  if (q.from || q.to) {
    f.saleDate = {};
    if (q.from) f.saleDate.$gte = new Date(`${q.from}T00:00:00+05:30`);
    if (q.to) f.saleDate.$lte = new Date(`${q.to}T23:59:59.999+05:30`);
  }
  if (q.q?.trim()) {
    const rx = new RegExp(q.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    f.$or = [{ saleCode: rx }, { "customer.name": rx }, { "customer.phone": rx }, { chassisNumber: rx }];
  }
  return PartsSale.find(f).sort({ saleDate: -1, _id: -1 }).limit(300).lean();
}

/* ------------------------------------------------------------------ */
/* Battery service jobs                                                */
/* ------------------------------------------------------------------ */

export interface ReplaceInput {
  itemId: string; // new battery item
  serialNo?: string;
  warranty: boolean;
  chargeRupees?: number; // ex-GST, when not under warranty
  paymentMode?: "CASH" | "UPI" | "BANK" | "CREDIT";
  resolution?: string;
}

/** Receive a customer's battery for repair; optionally replace it straight away. */
export async function receiveBattery(
  user: JWTPayload,
  input: { customer: { name: string; phone: string }; chassisNumber?: string; itemId: string; serialNo?: string; warehouseId: string; complaint: string; replaceNow?: ReplaceInput | null }
) {
  if (!(await hasPermission(user.role, "parts.sell"))) throw new ItemError("You cannot take in batteries for service", 403);
  const w = await guardWarehouse(user, input.warehouseId);
  if (!input.customer?.name?.trim()) throw new ItemError("Enter the customer name");
  if (!/^[6-9]\d{9}$/.test(String(input.customer?.phone || ""))) throw new ItemError("Enter the customer's 10-digit mobile number");
  if (!input.complaint?.trim()) throw new ItemError("Describe the problem");
  const item = await loadItem(input.itemId);
  if (item.category !== "BATTERY") throw new ItemError("Choose a battery item");
  const serialNo = String(input.serialNo || "").trim().toUpperCase();
  if (item.serialTracked && !serialNo) throw new ItemError("Enter the battery serial number");
  let vehicle: any = null;
  if (input.chassisNumber?.trim()) vehicle = await Vehicle.findOne({ chassisNumber: input.chassisNumber.trim().toUpperCase() }).select("_id").lean();
  const code = await generateFyCode("BATTERY_JOB");
  const job = await withTransaction(async (session) => {
    const [j] = await BatteryJob.create(
      [
        {
          code,
          customer: { name: input.customer.name.trim(), phone: String(input.customer.phone) },
          chassisNumber: input.chassisNumber?.trim().toUpperCase() || undefined,
          vehicle: vehicle?._id || null,
          item: item._id,
          serialNo,
          warehouse: w._id,
          complaint: input.complaint.trim(),
          status: "IN_REPAIR",
          receivedAt: new Date(),
          createdBy: oid(user.userId),
          createdByName: user.name,
        },
      ],
      { session: S(session) }
    );
    // The customer's battery is held as REPAIR stock (not the company's, not sellable).
    await moveStock(session, user, {
      item,
      warehouse: w._id,
      condition: "REPAIR",
      qty: 1,
      serials: serialNo ? [serialNo] : [],
      type: "REPAIR_IN",
      reference: code,
      party: input.customer.name.trim(),
      notes: input.complaint.trim(),
      source: "CUSTOMER",
      vehicle: vehicle?._id,
      allowReturning: true,
    });
    if (input.replaceNow) await doReplace(session, user, j, input.replaceNow);
    return j;
  });
  await logAudit({ user, action: "RECEIVE", resource: "BATTERY_JOB", resourceId: String(job._id), after: { code, replaced: !!input.replaceNow } });
  return BatteryJob.findById(job._id).lean();
}

async function doReplace(session: Session, user: JWTPayload, job: any, r: ReplaceInput) {
  const oldItem = await loadItem(job.item, session);
  const newItem = await loadItem(r.itemId, session);
  if (newItem.category !== "BATTERY") throw new ItemError("The replacement must be a battery");
  const newSerial = String(r.serialNo || "").trim().toUpperCase();
  if (newItem.serialTracked && !newSerial) throw new ItemError("Choose the serial number of the new battery");
  const charge = r.warranty ? 0 : rupeesToPaise(Number(r.chargeRupees || 0));
  if (!r.warranty && !(charge > 0)) throw new ItemError("Enter the charge, or tick 'under warranty'");
  // Old battery: customer's REPAIR stock → company's DEFECTIVE stock (for warranty claim / scrap / repair).
  const base = { item: oldItem, warehouse: job.warehouse, serials: job.serialNo ? [job.serialNo] : [], reference: job.code, party: job.customer.name, type: "CONDITION_CHANGE" as const };
  await moveStock(session, user, { ...base, condition: "REPAIR", qty: -1, outStatus: "ISSUED", reason: "Replaced — old battery kept" });
  await moveStock(session, user, { ...base, condition: "DEFECTIVE", qty: 1, source: "REPLACED", allowReturning: true, reason: "Old battery taken back on replacement" });
  let partsSale: any = null;
  if (charge > 0) {
    // Chargeable: bill the new battery (the bill takes it out of stock).
    partsSale = await createPartsSale(
      user,
      {
        customer: { name: job.customer.name, phone: job.customer.phone },
        warehouseId: String(job.warehouse),
        lines: [{ itemId: String(newItem._id), qty: 1, rateRupees: charge / 100, serials: newSerial ? [newSerial] : [] }],
        paymentMode: r.paymentMode || "CASH",
        chassisNumber: job.chassisNumber,
        notes: `Battery replacement ${job.code}`,
      },
      { source: "BATTERY_JOB", batteryJob: job._id, session }
    );
  } else {
    await moveStock(session, user, {
      item: newItem,
      warehouse: job.warehouse,
      qty: -1,
      serials: newSerial ? [newSerial] : [],
      type: "REPLACEMENT_OUT",
      reference: job.code,
      party: job.customer.name,
      reason: "Warranty replacement",
      outStatus: "ISSUED",
    });
  }
  job.status = "REPLACED";
  job.replacement = { item: newItem._id, serialNo: newSerial || undefined, warranty: !!r.warranty, charge, partsSale: partsSale?._id || null };
  job.resolution = r.resolution?.trim() || (r.warranty ? "Replaced under warranty" : "Replaced (chargeable)");
  job.closedAt = new Date();
  job.closedByName = user.name;
  await job.save({ session });
}

export async function replaceBattery(user: JWTPayload, jobId: string, r: ReplaceInput) {
  if (!(await hasPermission(user.role, "parts.sell"))) throw new ItemError("You cannot handle battery service", 403);
  const out = await withTransaction(async (session) => {
    const job = await BatteryJob.findById(jobId).session(S(session));
    if (!job) throw new ItemError("Job not found", 404);
    if (job.status !== "IN_REPAIR") throw new ItemError("This job is already closed");
    await guardWarehouse(user, job.warehouse);
    await doReplace(session, user, job, r);
    return job;
  });
  await logAudit({ user, action: "UPDATE", resource: "BATTERY_JOB", resourceId: jobId, after: { status: "REPLACED", warranty: r.warranty } });
  return out;
}

/** Battery repaired and handed back to the customer. */
export async function returnBattery(user: JWTPayload, jobId: string, resolution: string) {
  if (!(await hasPermission(user.role, "parts.sell"))) throw new ItemError("You cannot handle battery service", 403);
  const out = await withTransaction(async (session) => {
    const job = await BatteryJob.findById(jobId).session(S(session));
    if (!job) throw new ItemError("Job not found", 404);
    if (job.status !== "IN_REPAIR") throw new ItemError("This job is already closed");
    await guardWarehouse(user, job.warehouse);
    const item = await loadItem(job.item, session);
    await moveStock(session, user, {
      item,
      warehouse: job.warehouse,
      condition: "REPAIR",
      qty: -1,
      serials: job.serialNo ? [job.serialNo] : [],
      type: "REPAIR_RETURN",
      reference: job.code,
      party: job.customer.name,
      outStatus: "RETURNED_TO_CUSTOMER",
      reason: "Repaired and returned",
    });
    job.status = "RETURNED";
    job.resolution = resolution?.trim() || "Repaired and returned";
    job.closedAt = new Date();
    job.closedByName = user.name;
    await job.save({ session });
    return job;
  });
  await logAudit({ user, action: "UPDATE", resource: "BATTERY_JOB", resourceId: jobId, after: { status: "RETURNED" } });
  return out;
}

export async function listBatteryJobs(q: { status?: string; q?: string }) {
  const f: any = {};
  if (q.status) f.status = q.status;
  if (q.q?.trim()) {
    const rx = new RegExp(q.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    f.$or = [{ code: rx }, { "customer.name": rx }, { "customer.phone": rx }, { serialNo: rx }, { chassisNumber: rx }];
  }
  return BatteryJob.find(f)
    .populate("item", "name code")
    .populate("warehouse", "name code")
    .populate("replacement.item", "name code")
    .populate("replacement.partsSale", "saleCode totalAmount")
    .sort({ receivedAt: -1 })
    .limit(300)
    .lean();
}

/* ------------------------------------------------------------------ */
/* Vehicle sold without its battery                                    */
/* ------------------------------------------------------------------ */

/** Battery item to use for a vehicle sold without battery: the one set on its model, else the given one. */
export async function batteryItemFor(modelId: any, chosen?: string | null, session?: Session) {
  if (chosen && mongoose.isValidObjectId(chosen)) {
    const it = await loadItem(chosen, session);
    if (it.category !== "BATTERY") throw new ItemError("Choose a battery item");
    return it;
  }
  const m: any = await VehicleModel.findById(modelId).select("batteryItem name").session(S(session)).lean();
  if (m?.batteryItem) return loadItem(m.batteryItem, session);
  throw new ItemError(`Choose which battery item goes back into stock (set a default battery on ${m?.name || "the model"} to skip this)`);
}

export { mainWarehouse };
