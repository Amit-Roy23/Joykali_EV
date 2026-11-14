import mongoose from "mongoose";
import { JWTPayload, isPartnerRole } from "@/types";
import { Dealer } from "@/models/Dealer";
import { Distributor } from "@/models/Distributor";
import { User } from "@/models/User";
import { Vehicle } from "@/models/Vehicle";
import { VehicleModel } from "@/models/VehicleModel";
import { LedgerEntry } from "@/models/LedgerEntry";
import { StockMovement } from "@/models/StockMovement";
import { NetworkOrder, INetworkOrder } from "@/models/NetworkOrder";
import { PartnerSale } from "@/models/PartnerSale";
import { Territory } from "@/models/Territory";
import { CreditLimitChange } from "@/models/CreditLimitChange";
import { withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { myParty, PartyType } from "@/lib/partyAccess";
import { documentTotals } from "@/lib/gstDocs";
import { rupeesToPaise } from "@/lib/money";
import {
  generateDealerCode,
  generateDistributorCode,
  generateFyCode,
  generateSubDealerCode,
  generateSuperDistributorCode,
} from "@/lib/codeGenerator";
import { ChannelTier, creditSummary, getParty, lineValue, supplierRef, tierOf, tierPrice } from "./creditService";

export class NetworkError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const oid = (v: any) => new mongoose.Types.ObjectId(String(v));
const same = (a: any, b: any) => !!a && !!b && String(a) === String(b);
const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const TIER_LABEL: Record<ChannelTier, string> = {
  SUPER_DISTRIBUTOR: "Super distributor",
  DISTRIBUTOR: "Distributor",
  DEALER: "Dealer",
  SUB_DEALER: "Sub dealer",
};

/** The stock status / location a partner of this type owns vehicles in. */
export function ownedStockFilter(type: PartyType, id: any) {
  return type === "DISTRIBUTOR"
    ? { status: "WITH_DISTRIBUTOR", currentLocationDistributor: oid(id) }
    : { status: "WITH_DEALER", currentLocationDealer: oid(id) };
}

/* ------------------------------------------------------------------ */
/* Pure rules (unit-tested)                                            */
/* ------------------------------------------------------------------ */

/**
 * Which tiers a partner may appoint directly below itself.
 *  - super distributor → distributors
 *  - distributor → dealers and sub dealers
 *  - dealer that buys from a distributor → sub dealers
 *    (a company dealer holds consignment stock it does not own, so it cannot supply anyone)
 */
export function appointableTiers(
  parentTier: ChannelTier,
  parent: { parentDistributor?: any } = {}
): ChannelTier[] {
  if (parentTier === "SUPER_DISTRIBUTOR") return ["DISTRIBUTOR"];
  if (parentTier === "DISTRIBUTOR") return ["DEALER", "SUB_DEALER"];
  if (parentTier === "DEALER" && parent.parentDistributor) return ["SUB_DEALER"];
  return [];
}

/** Commission earned on a monthly target: paid on every unit, but only once the unit target is met. */
export function commissionEarned(target: { targetUnits: number; commissionPerUnit: number }, achievedUnits: number) {
  if (!target.targetUnits || achievedUnits < target.targetUnits) return 0;
  return achievedUnits * (target.commissionPerUnit || 0);
}

/** Security deposit held = received − refunded − adjusted. */
export function depositHeld(entries: Array<{ type: string; amount: number }>) {
  return entries.reduce((s, e) => s + (e.type === "RECEIVED" ? e.amount : -e.amount), 0);
}

/* ------------------------------------------------------------------ */
/* Actor helpers                                                       */
/* ------------------------------------------------------------------ */

export async function requirePartner(user: JWTPayload) {
  if (!isPartnerRole(user.role)) throw new NetworkError("Only channel partner logins can do this", 403);
  const me = await myParty(user);
  if (!me) throw new NetworkError("Your login is not linked to an active partner account", 403);
  const doc = await getParty(me.type, me.id);
  if (!doc) throw new NetworkError("Partner account not found", 404);
  return { type: me.type, id: me.id, doc, tier: tierOf(me.type, doc) };
}

/** Is `child` supplied directly by `parent`? */
export function isDirectChild(parentType: PartyType, parentId: any, childType: PartyType, childDoc: any) {
  const sup = supplierRef(childType, childDoc);
  return !!sup && sup.type === parentType && same(sup.id, parentId);
}

/** Direct buyers of a partner. */
export async function directChildren(type: PartyType, id: any) {
  const pid = oid(id);
  if (type === "DISTRIBUTOR") {
    const [distributors, dealers] = await Promise.all([
      Distributor.find({ parent: pid }).sort({ name: 1 }).lean(),
      Dealer.find({ parentDistributor: pid, parentDealer: null }).sort({ name: 1 }).lean(),
    ]);
    return [
      ...distributors.map((d: any) => ({ type: "DISTRIBUTOR" as PartyType, doc: d })),
      ...dealers.map((d: any) => ({ type: "DEALER" as PartyType, doc: d })),
    ];
  }
  const subs = await Dealer.find({ parentDealer: pid }).sort({ name: 1 }).lean();
  return subs.map((d: any) => ({ type: "DEALER" as PartyType, doc: d }));
}

/** Staff may manage a party if they hold the relevant manage permission (ASMs only for their own). */
async function staffCanManage(user: JWTPayload, type: PartyType, doc: any) {
  if (isPartnerRole(user.role)) return false;
  const perm = type === "DEALER" ? "dealer.manage" : "distributor.manage";
  if (await hasPermission(user.role, perm)) return true;
  return false;
}

/** May this user act on a party's network account? The party itself, its direct supplier, or staff. */
export async function canActOnParty(user: JWTPayload, type: PartyType, id: any) {
  const doc = await getParty(type, id);
  if (!doc) return { ok: false as const, doc: null, as: null };
  if (isPartnerRole(user.role)) {
    const me = await myParty(user);
    if (!me) return { ok: false as const, doc, as: null };
    if (me.type === type && same(me.id, id)) return { ok: true as const, doc, as: "SELF" as const };
    if (isDirectChild(me.type, me.id, type, doc)) return { ok: true as const, doc, as: "SUPPLIER" as const };
    return { ok: false as const, doc, as: null };
  }
  if (await hasPermission(user.role, "network.view")) {
    if (user.role === "ASM") {
      // ASMs reach the parties assigned to them and everything below those.
      const top = await topAncestor(type, doc);
      if (!same(top.doc.assignedASM, user.userId)) return { ok: false as const, doc, as: null };
    }
    return { ok: true as const, doc, as: "STAFF" as const };
  }
  return { ok: false as const, doc, as: null };
}

async function topAncestor(type: PartyType, doc: any): Promise<{ type: PartyType; doc: any }> {
  let cur = { type, doc };
  for (let i = 0; i < 4; i++) {
    const sup = supplierRef(cur.type, cur.doc);
    if (!sup) return cur;
    const next = await getParty(sup.type, sup.id);
    if (!next) return cur;
    cur = { type: sup.type, doc: next };
  }
  return cur;
}

/* ------------------------------------------------------------------ */
/* Appointments & partner records                                      */
/* ------------------------------------------------------------------ */

export interface PartnerInput {
  tier: ChannelTier;
  /** For staff: the supplying parent (omit for company-supplied partners). */
  parentType?: PartyType | null;
  parentId?: string | null;
  name: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state?: string;
  pincode: string;
  gstin: string;
  territories?: string[];
  creditDays?: number;
  /** Opening credit: for company-supplied partners a request for BH + MP; for network partners set by the supplier. */
  creditLimitRupees?: number;
  assignedASM?: string | null;
  login?: { email?: string; password: string } | null;
}

/**
 * Create a partner. Partners appoint their own downline (starts PENDING until the company has
 * verified KYC); staff with dealer/distributor manage rights can create any tier (ACTIVE).
 */
export async function createPartner(input: PartnerInput, user: JWTPayload) {
  const tier = input.tier;
  if (!["SUPER_DISTRIBUTOR", "DISTRIBUTOR", "DEALER", "SUB_DEALER"].includes(tier)) throw new NetworkError("Choose a partner type");
  const type: PartyType = tier === "SUPER_DISTRIBUTOR" || tier === "DISTRIBUTOR" ? "DISTRIBUTOR" : "DEALER";

  // Who is the parent?
  let parent: { type: PartyType; id: mongoose.Types.ObjectId; doc: any; tier: ChannelTier } | null = null;
  let byPartner = false;
  if (isPartnerRole(user.role)) {
    if (!(await hasPermission(user.role, "partner.appoint"))) throw new NetworkError("Your login cannot appoint partners", 403);
    const me = await requirePartner(user);
    if (me.doc.status !== "ACTIVE") throw new NetworkError("Your account must be active to appoint partners", 403);
    parent = { type: me.type, id: me.id, doc: me.doc, tier: me.tier };
    byPartner = true;
  } else {
    if (!(await hasPermission(user.role, type === "DEALER" ? "dealer.manage" : "distributor.manage"))) {
      throw new NetworkError("You do not have permission to create this partner", 403);
    }
    if (input.parentType && input.parentId) {
      const pdoc = await getParty(input.parentType, input.parentId);
      if (!pdoc) throw new NetworkError("Parent partner not found", 404);
      parent = { type: input.parentType, id: oid(input.parentId), doc: pdoc, tier: tierOf(input.parentType, pdoc) };
    }
  }

  if (parent) {
    const allowed = appointableTiers(parent.tier, parent.doc);
    if (!allowed.includes(tier)) {
      throw new NetworkError(
        allowed.length
          ? `A ${TIER_LABEL[parent.tier].toLowerCase()} can appoint: ${allowed.map((t) => TIER_LABEL[t].toLowerCase()).join(", ")}`
          : `A ${TIER_LABEL[parent.tier].toLowerCase()} supplied by the company on consignment cannot appoint partners`
      );
    }
  } else if (tier === "SUB_DEALER") {
    throw new NetworkError("A sub dealer must sit under a distributor or a dealer");
  }

  // Validation
  for (const f of ["name", "ownerName", "phone", "email", "address", "city", "pincode", "gstin"] as const) {
    if (!String((input as any)[f] || "").trim()) throw new NetworkError(`${f} is required`);
  }
  const gstin = String(input.gstin).toUpperCase().trim();
  if (!GSTIN.test(gstin)) throw new NetworkError("Invalid GSTIN");
  if (!/^\d{6}$/.test(String(input.pincode))) throw new NetworkError("Pincode must be 6 digits");
  if (!/^[6-9]\d{9}$/.test(String(input.phone))) throw new NetworkError("Phone must be a 10-digit mobile number");
  const Coll: any = type === "DEALER" ? Dealer : Distributor;
  if (await Coll.findOne({ gstin })) throw new NetworkError("A partner with this GSTIN already exists", 409);
  const loginEmail = String(input.login?.email || input.email).toLowerCase().trim();
  if (input.login?.password) {
    if (String(input.login.password).length < 8) throw new NetworkError("Login password must be at least 8 characters");
    if (await User.findOne({ email: loginEmail })) throw new NetworkError("That login email is already in use", 409);
  }

  // Territory: super distributors get districts; distributors get areas inside the super distributor's districts.
  const territories = (input.territories || []).filter((t) => mongoose.isValidObjectId(t)).map(oid);
  if (territories.length) {
    const terr = await Territory.find({ _id: { $in: territories } }).lean();
    if (terr.length !== territories.length) throw new NetworkError("Unknown territory");
    const wantKind = tier === "SUPER_DISTRIBUTOR" ? "DISTRICT" : "AREA";
    if (terr.some((t: any) => t.kind !== wantKind)) {
      throw new NetworkError(tier === "SUPER_DISTRIBUTOR" ? "Allocate districts to a super distributor" : "Allocate areas (not districts or zones)");
    }
    if (tier === "DISTRIBUTOR" && parent?.tier === "SUPER_DISTRIBUTOR") {
      const districts = (parent.doc.territories || []).map(String);
      const outside = terr.filter((t: any) => !districts.includes(String(t.parent)));
      if (outside.length) throw new NetworkError(`${outside.map((t: any) => t.name).join(", ")} is outside ${parent.doc.name}'s districts`);
    }
    if (tier === "DISTRIBUTOR") {
      // One active distributor per area.
      const clash: any = await Distributor.findOne({ tier: "DISTRIBUTOR", status: { $ne: "INACTIVE" }, territories: { $in: territories } }).lean();
      if (clash) throw new NetworkError(`That area is already allocated to ${clash.name}`, 409);
    }
    if (tier === "SUPER_DISTRIBUTOR") {
      const clash: any = await Distributor.findOne({ tier: "SUPER_DISTRIBUTOR", status: { $ne: "INACTIVE" }, territories: { $in: territories } }).lean();
      if (clash) throw new NetworkError(`That district is already allocated to ${clash.name}`, 409);
    }
  }

  const creditDays = Math.min(180, Math.max(0, Math.floor(Number(input.creditDays ?? 30))));
  const openingLimit = Math.max(0, rupeesToPaise(Number(input.creditLimitRupees || 0)));

  const result = await withTransaction(async (session) => {
    const code =
      tier === "SUPER_DISTRIBUTOR"
        ? await generateSuperDistributorCode(session)
        : tier === "DISTRIBUTOR"
          ? await generateDistributorCode(session)
          : tier === "SUB_DEALER"
            ? await generateSubDealerCode(session)
            : await generateDealerCode(session);
    const common = {
      tier,
      name: input.name.trim(),
      ownerName: input.ownerName.trim(),
      phone: String(input.phone).trim(),
      email: String(input.email).toLowerCase().trim(),
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state?.trim() || "West Bengal",
      stateCode: gstin.slice(0, 2),
      pincode: String(input.pincode),
      gstin,
      // network partners get their limit from the supplier straight away; company credit needs BH + MP
      creditLimit: parent ? openingLimit : 0,
      creditDays,
      assignedASM: !byPartner && input.assignedASM && mongoose.isValidObjectId(input.assignedASM) ? input.assignedASM : (parent?.doc.assignedASM ?? null),
      status: byPartner ? "PENDING" : "ACTIVE",
      onboardingDate: new Date(),
      createdBy: oid(user.userId),
    };
    let doc: any;
    if (type === "DISTRIBUTOR") {
      [doc] = await Distributor.create(
        [{ ...common, distributorCode: code, parent: parent?.type === "DISTRIBUTOR" ? parent.id : null, territories }],
        { session }
      );
    } else {
      const parentDistributor =
        parent?.type === "DISTRIBUTOR" ? parent.id : parent?.type === "DEALER" ? parent.doc.parentDistributor || null : null;
      [doc] = await Dealer.create(
        [
          {
            ...common,
            dealerCode: code,
            parentDistributor,
            parentDealer: parent?.type === "DEALER" ? parent.id : null,
            territory: territories[0] || null,
          },
        ],
        { session }
      );
    }
    let login = null;
    if (input.login?.password) {
      const [u] = await User.create(
        [
          {
            employeeCode: code,
            name: input.ownerName.trim(),
            email: loginEmail,
            phone: String(input.phone).trim(),
            role: tier,
            ...(type === "DISTRIBUTOR" ? { distributor: doc._id } : { dealer: doc._id }),
            designation: `${TIER_LABEL[tier]} — ${input.name.trim()}`,
            joiningDate: new Date(),
            status: "ACTIVE",
            passwordHash: await hashPassword(String(input.login.password)),
            mustChangePassword: true,
          },
        ],
        { session }
      );
      login = { employeeCode: u.employeeCode, email: u.email };
    }
    if (!parent && openingLimit > 0) {
      await CreditLimitChange.create(
        [
          {
            partyType: type,
            party: doc._id,
            partyName: doc.name,
            partyCode: code,
            fromLimit: 0,
            toLimit: openingLimit,
            creditDays,
            reason: "Opening credit limit at onboarding",
            status: "PENDING",
            approvals: [],
            requestedBy: oid(user.userId),
          },
        ],
        { session }
      );
    }
    return { partyType: type, partner: doc, code, login };
  });

  await logAudit({
    user,
    action: "CREATE",
    resource: "NETWORK",
    resourceId: String(result.partner._id),
    after: { code: result.code, tier, name: result.partner.name, parent: parent?.doc.name || "Company", status: result.partner.status },
  });
  return result;
}

/** Supplier partner sets the credit limit of its own direct buyer (secondary credit; no company approval). */
export async function setChildCredit(
  user: JWTPayload,
  childType: PartyType,
  childId: string,
  input: { limitRupees: number; creditDays?: number; reason?: string }
) {
  const me = await requirePartner(user);
  const child = await getParty(childType, childId);
  if (!child || !isDirectChild(me.type, me.id, childType, child)) throw new NetworkError("Partner not found in your network", 404);
  const limit = rupeesToPaise(Number(input.limitRupees));
  if (!Number.isFinite(limit) || limit < 0) throw new NetworkError("Enter a valid credit limit");
  const days = input.creditDays != null ? Math.floor(Number(input.creditDays)) : child.creditDays;
  if (!Number.isFinite(days) || days < 0 || days > 180) throw new NetworkError("Credit days must be 0–180");
  const Coll: any = childType === "DEALER" ? Dealer : Distributor;
  await Coll.updateOne({ _id: child._id }, { $set: { creditLimit: limit, creditDays: days } });
  await logAudit({
    user,
    action: "UPDATE",
    resource: "CREDIT",
    resourceId: String(child._id),
    before: { creditLimit: child.creditLimit, creditDays: child.creditDays },
    after: { creditLimit: limit, creditDays: days, setBy: me.doc.name, reason: input.reason },
  });
  return creditSummary(childType, childId);
}

/* ------------------------------------------------------------------ */
/* Network orders                                                      */
/* ------------------------------------------------------------------ */

function sumLines(lines: Array<{ quantity: number; unitPrice: number; gstRate: number }>) {
  return lines.reduce(
    (t, l) => {
      const v = lineValue(l.quantity, l.unitPrice, l.gstRate);
      return { taxable: t.taxable + v.taxable, gst: t.gst + v.gst, total: t.total + v.total };
    },
    { taxable: 0, gst: 0, total: 0 }
  );
}

/** What the buyer's supplier has in stock, by model (for the catalogue). */
export async function supplierStock(sup: { type: PartyType; id: any } | null) {
  const match = sup ? ownedStockFilter(sup.type, sup.id) : { status: "IN_STOCK", currentLocationType: "WAREHOUSE" };
  const rows = await Vehicle.aggregate([{ $match: match }, { $group: { _id: "$model", n: { $sum: 1 } } }]);
  return new Map(rows.map((r: any) => [String(r._id), r.n as number]));
}

/** Catalogue for a partner: every active model at its buying price and the supplier's live stock. */
export async function catalogueFor(user: JWTPayload) {
  const me = await requirePartner(user);
  const sup = supplierRef(me.type, me.doc);
  const supplier = sup ? await getParty(sup.type, sup.id) : null;
  const [models, stock, credit] = await Promise.all([
    VehicleModel.find({ isActive: true }).sort({ category: 1, name: 1 }).lean(),
    supplierStock(sup),
    creditSummary(me.type, me.id).catch(() => null),
  ]);
  return {
    me: { type: me.type, id: me.id, name: me.doc.name, code: me.doc.code, tier: me.tier, status: me.doc.status },
    supplier: supplier ? { type: sup!.type, id: String(sup!.id), name: supplier.name, code: supplier.code } : null,
    credit,
    models: models.map((m: any) => ({
      _id: m._id,
      name: m.name,
      variant: m.variant,
      category: m.category,
      batteryType: m.batteryType,
      rangeKm: m.rangeKm,
      mrp: m.sellingPrice,
      unitPrice: tierPrice(m, me.tier),
      gstRate: m.gstRate ?? 5,
      available: stock.get(String(m._id)) || 0,
    })),
  };
}

export async function placeNetworkOrder(
  user: JWTPayload,
  input: { lines: Array<{ modelId: string; quantity: number }>; notes?: string }
): Promise<INetworkOrder> {
  const me = await requirePartner(user);
  if (me.doc.status !== "ACTIVE") throw new NetworkError(`Your account is ${String(me.doc.status).toLowerCase()} — orders open once it is active`);
  const sup = supplierRef(me.type, me.doc);
  if (!sup) throw new NetworkError("You buy from the company. Use Place an order.", 400);
  const seller = await getParty(sup.type, sup.id);
  if (!seller) throw new NetworkError("Your supplier was not found", 404);

  const qty = new Map<string, number>();
  for (const l of input.lines || []) {
    const q = Math.floor(Number(l.quantity));
    if (!mongoose.isValidObjectId(l.modelId) || !Number.isFinite(q) || q < 1) continue;
    qty.set(l.modelId, (qty.get(l.modelId) || 0) + q);
  }
  if (!qty.size) throw new NetworkError("Add at least one model with a quantity");
  if ([...qty.values()].some((q) => q > 200)) throw new NetworkError("Maximum 200 units per model per order");
  const models = await VehicleModel.find({ _id: { $in: [...qty.keys()] }, isActive: true }).lean();
  if (models.length !== qty.size) throw new NetworkError("One or more models are not available");
  const lines = models.map((m: any) => ({
    model: m._id,
    modelName: `${m.name}${m.variant ? ` (${m.variant})` : ""}`,
    quantity: qty.get(String(m._id))!,
    unitPrice: tierPrice(m, me.tier),
    gstRate: m.gstRate ?? 5,
    hsnCode: m.hsnCode || "870380",
    fulfilledQty: 0,
  }));
  const totals = sumLines(lines);
  const credit = await creditSummary(me.type, me.id);
  if (credit.onHold) throw new NetworkError(`Credit hold: ${credit.holdReason}.`, 409);
  if (totals.total > credit.available) {
    throw new NetworkError(
      `Credit limit exceeded: this order needs ${rupees(totals.total)}, available ${rupees(Math.max(0, credit.available))} of the ${rupees(credit.limit)} limit ${seller.name} gave you.`,
      409
    );
  }
  const order = await NetworkOrder.create({
    orderCode: await generateFyCode("NETWORK_ORDER"),
    buyerType: me.type,
    buyer: me.id,
    buyerName: me.doc.name,
    buyerCode: me.doc.code,
    sellerType: sup.type,
    seller: sup.id,
    sellerName: seller.name,
    sellerCode: seller.code,
    lines,
    taxableValue: totals.taxable,
    gstValue: totals.gst,
    totalValue: totals.total,
    status: "PLACED",
    creditCheck: { limit: credit.limit, exposureBefore: credit.exposure, availableBefore: credit.available },
    notes: input.notes?.trim(),
    placedBy: oid(user.userId),
    placedByName: user.name,
  });
  await logAudit({ user, action: "CREATE", resource: "ORDER", resourceId: String(order._id), after: { orderCode: order.orderCode, to: seller.name, total: totals.total } });
  return order;
}

async function loadOrderFor(user: JWTPayload, id: string) {
  if (!mongoose.isValidObjectId(id)) throw new NetworkError("Order not found", 404);
  const order = await NetworkOrder.findById(id);
  if (!order) throw new NetworkError("Order not found", 404);
  return order;
}

/** Visible to the buyer, the seller, and staff who can see either side. */
export async function canSeeNetworkOrder(user: JWTPayload, o: any) {
  const a = await canActOnParty(user, o.buyerType, o.buyer);
  if (a.ok) return true;
  const b = await canActOnParty(user, o.sellerType, o.seller);
  return b.ok && b.as !== "SUPPLIER";
}

export async function decideNetworkOrder(user: JWTPayload, id: string, decision: "ACCEPT" | "REJECT", note?: string) {
  const me = await requirePartner(user);
  const order = await loadOrderFor(user, id);
  if (order.sellerType !== me.type || !same(order.seller, me.id)) throw new NetworkError("Only the supplying partner can accept or reject this order", 403);
  if (order.status !== "PLACED") throw new NetworkError(`Order is already ${order.status.toLowerCase().replace("_", " ")}`);
  if (decision === "REJECT") {
    if (!note?.trim()) throw new NetworkError("Give a reason for rejecting");
    order.status = "REJECTED";
  } else {
    const c = await creditSummary(order.buyerType, order.buyer, { excludeOrder: order._id as any });
    if (c.onHold) throw new NetworkError(`Cannot accept: buyer is on credit hold (${c.holdReason})`, 409);
    if (order.totalValue > c.available) {
      throw new NetworkError(`Cannot accept: needs ${rupees(order.totalValue)}, buyer has ${rupees(Math.max(0, c.available))} available`, 409);
    }
    order.status = "ACCEPTED";
  }
  order.decidedByName = user.name;
  order.decidedAt = new Date();
  order.decisionNote = note?.trim();
  await order.save();
  await logAudit({ user, action: decision === "ACCEPT" ? "APPROVE" : "REJECT", resource: "ORDER", resourceId: id, after: { status: order.status, note } });
  return order;
}

export async function cancelNetworkOrder(user: JWTPayload, id: string, reason: string) {
  if (!reason?.trim()) throw new NetworkError("A reason is required");
  const me = await requirePartner(user);
  const order = await loadOrderFor(user, id);
  const isBuyer = order.buyerType === me.type && same(order.buyer, me.id);
  const isSeller = order.sellerType === me.type && same(order.seller, me.id);
  if (!isBuyer && !isSeller) throw new NetworkError("Order not found", 404);
  if (["CANCELLED", "REJECTED", "COMPLETED"].includes(order.status)) throw new NetworkError(`Order is already ${order.status.toLowerCase()}`);
  if (isBuyer && order.status !== "PLACED") throw new NetworkError("Your supplier has accepted this order; ask them to close it");
  const anyFulfilled = order.lines.some((l) => l.fulfilledQty > 0);
  order.status = anyFulfilled ? "COMPLETED" : "CANCELLED";
  order.decisionNote = `${anyFulfilled ? "Balance closed" : "Cancelled"}: ${reason.trim()}`;
  order.decidedByName = user.name;
  order.decidedAt = new Date();
  await order.save();
  await logAudit({ user, action: "CANCEL", resource: "ORDER", resourceId: id, after: { status: order.status, reason } });
  return order;
}

/* ------------------------------------------------------------------ */
/* Partner sales: to a downline partner, or to a retail customer       */
/* ------------------------------------------------------------------ */

export interface PartnerSaleInput {
  buyerKind: "DEALER" | "DISTRIBUTOR" | "CUSTOMER";
  buyerId?: string;
  orderId?: string;
  customer?: { name: string; phone: string; address: string; email?: string };
  vehicles: Array<{ vehicleId: string; unitPriceRupees?: number }>;
  invoiceNo?: string;
  paymentMode?: "CASH" | "UPI" | "BANK" | "FINANCE" | "CREDIT";
  amountReceivedRupees?: number;
  saleDate?: string;
}

export async function createPartnerSale(user: JWTPayload, input: PartnerSaleInput) {
  const me = await requirePartner(user);
  if (!(await hasPermission(user.role, "partner.sell"))) throw new NetworkError("Your login cannot record sales", 403);
  if (me.doc.status !== "ACTIVE") throw new NetworkError("Your account must be active to sell");
  const items = (input.vehicles || []).filter((v) => mongoose.isValidObjectId(v.vehicleId));
  if (!items.length) throw new NetworkError("Scan or pick at least one vehicle");
  if (new Set(items.map((v) => v.vehicleId)).size !== items.length) throw new NetworkError("The same vehicle is listed twice");
  if (items.length > 100) throw new NetworkError("Maximum 100 vehicles per sale");
  const saleDate = input.saleDate ? new Date(input.saleDate) : new Date();
  if (Number.isNaN(+saleDate) || saleDate > new Date(Date.now() + 86400000)) throw new NetworkError("Sale date cannot be in the future");

  // Buyer
  let buyer: any = null;
  let buyerTier: ChannelTier | null = null;
  if (input.buyerKind === "CUSTOMER") {
    const c = input.customer;
    if (!c?.name?.trim() || !c?.address?.trim()) throw new NetworkError("Enter the customer's name and address");
    if (!/^[6-9]\d{9}$/.test(String(c.phone || ""))) throw new NetworkError("Customer phone must be a 10-digit mobile number");
  } else {
    if (!["DEALER", "DISTRIBUTOR"].includes(input.buyerKind) || !mongoose.isValidObjectId(input.buyerId)) throw new NetworkError("Choose who you are selling to");
    buyer = await getParty(input.buyerKind, input.buyerId!);
    if (!buyer || !isDirectChild(me.type, me.id, input.buyerKind, buyer)) throw new NetworkError("You can only sell stock to partners you supply", 403);
    if (buyer.status !== "ACTIVE") throw new NetworkError(`${buyer.name} is ${String(buyer.status).toLowerCase()} — complete their KYC first`);
    buyerTier = tierOf(input.buyerKind, buyer);
  }

  // Order (optional, partner buyers only)
  let order: any = null;
  if (input.orderId) {
    if (input.buyerKind === "CUSTOMER") throw new NetworkError("Orders apply to partner sales only");
    order = await NetworkOrder.findById(input.orderId);
    if (!order || !same(order.seller, me.id) || !same(order.buyer, buyer._id)) throw new NetworkError("Order not found for this buyer", 404);
    if (!["ACCEPTED", "PARTIALLY_FULFILLED"].includes(order.status)) throw new NetworkError("Accept the order before fulfilling it");
  }

  // Vehicles must be owned by me right now.
  const vehicles = await Vehicle.find({ _id: { $in: items.map((i) => oid(i.vehicleId)) }, ...ownedStockFilter(me.type, me.id) })
    .populate("model")
    .lean();
  if (vehicles.length !== items.length) throw new NetworkError("Some vehicles are not in your stock (already sold, in transit or not yours)", 409);

  const lines = items.map((i) => {
    const v: any = vehicles.find((x: any) => same(x._id, i.vehicleId));
    const m: any = v.model;
    const defaultPrice = buyerTier ? tierPrice(m, buyerTier) : m.sellingPrice;
    const price = i.unitPriceRupees != null && Number(i.unitPriceRupees) > 0 ? rupeesToPaise(Number(i.unitPriceRupees)) : defaultPrice;
    return {
      vehicle: v._id,
      chassisNumber: v.chassisNumber,
      batteryNumber: v.batteryNumber,
      model: m._id,
      modelName: `${m.name}${m.variant ? ` (${m.variant})` : ""}`,
      unitPrice: price,
      gstRate: m.gstRate ?? 5,
      hsnCode: m.hsnCode || "870380",
    };
  });

  // Order lines must cover these models.
  if (order) {
    const need = new Map<string, number>();
    for (const l of lines) need.set(String(l.model), (need.get(String(l.model)) || 0) + 1);
    for (const [model, n] of need) {
      const ol = order.lines.find((x: any) => same(x.model, model));
      if (!ol) throw new NetworkError(`${lines.find((l) => same(l.model, model))!.modelName} is not on order ${order.orderCode}`);
      if (ol.fulfilledQty + n > ol.quantity) throw new NetworkError(`Order ${order.orderCode} has only ${ol.quantity - ol.fulfilledQty} × ${ol.modelName} left to supply`);
    }
  }

  const totals = documentTotals(
    lines.map((l) => ({ modelName: l.modelName, hsnCode: l.hsnCode, quantity: 1, unitPrice: l.unitPrice, gstRate: l.gstRate })),
    me.doc.stateCode || "19",
    buyer ? buyer.stateCode || "19" : me.doc.stateCode || "19"
  );

  // Credit check for partner buyers (an accepted order already reserved its credit).
  if (buyer) {
    const c = await creditSummary(input.buyerKind as PartyType, buyer._id, order ? { excludeOrder: order._id } : {});
    if (c.onHold) throw new NetworkError(`${buyer.name} is on credit hold: ${c.holdReason}`, 409);
    if (totals.totalValue > c.available) {
      throw new NetworkError(`Credit limit exceeded: ${rupees(totals.totalValue)} needed, ${buyer.name} has ${rupees(Math.max(0, c.available))} available`, 409);
    }
  }

  const amountReceived = input.buyerKind === "CUSTOMER" ? Math.max(0, rupeesToPaise(Number(input.amountReceivedRupees || 0))) : 0;
  if (amountReceived > totals.totalValue) throw new NetworkError("Amount received is more than the bill");

  const sale = await withTransaction(async (session) => {
    const saleCode = await generateFyCode("PARTNER_SALE", saleDate, session);
    const [doc] = await PartnerSale.create(
      [
        {
          saleCode,
          invoiceNo: input.invoiceNo?.trim() || saleCode,
          sellerType: me.type,
          seller: me.id,
          sellerName: me.doc.name,
          sellerCode: me.doc.code,
          sellerGstin: me.doc.gstin || "",
          sellerStateCode: me.doc.stateCode || "19",
          buyerKind: input.buyerKind,
          buyer: buyer?._id || null,
          buyerName: buyer ? buyer.name : input.customer!.name.trim(),
          buyerCode: buyer?.code,
          buyerGstin: buyer?.gstin,
          buyerStateCode: buyer ? buyer.stateCode || "19" : me.doc.stateCode || "19",
          customer: buyer ? null : { ...input.customer, name: input.customer!.name.trim() },
          order: order?._id || null,
          lines,
          taxableValue: totals.taxableValue,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          totalValue: totals.totalValue,
          amountReceived,
          paymentMode: input.buyerKind === "CUSTOMER" ? input.paymentMode || "CASH" : "CREDIT",
          status: buyer ? "IN_TRANSIT" : "COMPLETED",
          saleDate,
          createdBy: oid(user.userId),
          createdByName: user.name,
        },
      ],
      { session }
    );

    // Claim the vehicles atomically: still in my stock at this instant.
    const res = await Vehicle.updateMany(
      { _id: { $in: lines.map((l) => l.vehicle) }, ...ownedStockFilter(me.type, me.id) },
      buyer
        ? { $set: { status: "IN_TRANSIT", currentLocationType: "IN_TRANSIT", transfer: doc._id } }
        : { $set: { status: "SOLD", transfer: doc._id } },
      { session }
    );
    if (res.modifiedCount !== lines.length) throw new NetworkError("Stock changed while saving — please try again", 409);

    await StockMovement.create(
      lines.map((l) => ({
        vehicle: l.vehicle,
        movementType: buyer ? "NETWORK_SALE" : "PARTNER_RETAIL",
        fromLocation: `${TIER_LABEL[me.tier]}: ${me.doc.name}`,
        toLocation: buyer ? `In transit to ${buyer.name}` : `Customer: ${input.customer!.name} (${input.customer!.phone})`,
        performedBy: oid(user.userId),
        reference: saleCode,
        timestamp: saleDate,
      })),
      { session, ordered: true }
    );

    if (buyer) {
      await LedgerEntry.create(
        [
          {
            bookType: me.type,
            book: me.id,
            partyType: input.buyerKind,
            party: buyer._id,
            date: saleDate,
            type: "INVOICE",
            reference: doc.invoiceNo,
            debit: totals.totalValue,
            credit: 0,
            narration: `${lines.length} vehicle(s) — ${saleCode}`,
            partnerSale: doc._id,
            createdBy: oid(user.userId),
          },
        ],
        { session }
      );
    }

    if (order) {
      for (const l of lines) {
        const ol = order.lines.find((x: any) => same(x.model, l.model));
        ol.fulfilledQty += 1;
      }
      const done = order.lines.every((l: any) => l.fulfilledQty >= l.quantity);
      order.status = done ? "COMPLETED" : "PARTIALLY_FULFILLED";
      await order.save({ session });
    }
    return doc;
  });

  await logAudit({
    user,
    action: "CREATE",
    resource: "PARTNER_SALE",
    resourceId: String(sale._id),
    after: { saleCode: sale.saleCode, to: sale.buyerName, units: lines.length, total: sale.totalValue },
  });
  return sale;
}

/** Seller, buyer, the seller's own staff view — but not the seller's supplier peeking at retail detail. */
export async function canSeePartnerSale(user: JWTPayload, s: any) {
  const a = await canActOnParty(user, s.sellerType, s.seller);
  if (a.ok && a.as !== "SUPPLIER") return true;
  if (s.buyer) {
    const b = await canActOnParty(user, s.buyerKind, s.buyer);
    if (b.ok) return true;
  }
  return false;
}

/** Buyer confirms the vehicles arrived (or reports some short). */
export async function receivePartnerSale(
  user: JWTPayload,
  id: string,
  input: { remarks?: string; shortVehicleIds?: string[] } = {}
) {
  if (!mongoose.isValidObjectId(id)) throw new NetworkError("Sale not found", 404);
  const sale = await PartnerSale.findById(id);
  if (!sale) throw new NetworkError("Sale not found", 404);
  if (sale.buyerKind === "CUSTOMER") throw new NetworkError("Retail sales need no receipt");
  let allowed = false;
  if (isPartnerRole(user.role)) {
    const me = await myParty(user);
    allowed = !!me && me.type === sale.buyerKind && same(me.id, sale.buyer);
  } else {
    allowed = await hasPermission(user.role, "network.manage");
  }
  if (!allowed) throw new NetworkError("Only the receiving partner can confirm this delivery", 403);
  if (sale.status !== "IN_TRANSIT") throw new NetworkError(`Already ${sale.status.toLowerCase().replace("_", " ")}`);

  const short = new Set((input.shortVehicleIds || []).map(String));
  if (short.size && !input.remarks?.trim()) throw new NetworkError("Explain the shortage in the remarks");
  const ownerSet =
    sale.buyerKind === "DISTRIBUTOR"
      ? { status: "WITH_DISTRIBUTOR", currentLocationType: "DISTRIBUTOR", currentLocationDistributor: sale.buyer, currentLocationDealer: null, transfer: null }
      : { status: "WITH_DEALER", currentLocationType: "DEALER", currentLocationDealer: sale.buyer, currentLocationDistributor: null, transfer: null };

  await withTransaction(async (session) => {
    const okIds = sale.lines.filter((l) => !short.has(String(l.vehicle))).map((l) => l.vehicle);
    const shortLines = sale.lines.filter((l) => short.has(String(l.vehicle)));
    if (okIds.length) {
      await Vehicle.updateMany({ _id: { $in: okIds }, transfer: sale._id }, { $set: ownerSet }, { session });
    }
    if (shortLines.length) {
      await Vehicle.updateMany({ _id: { $in: shortLines.map((l) => l.vehicle) }, transfer: sale._id }, { $set: { status: "MISSING" } }, { session });
      // Credit the buyer for what never arrived, in the seller's books.
      const t = documentTotals(
        shortLines.map((l) => ({ modelName: l.modelName, hsnCode: l.hsnCode, quantity: 1, unitPrice: l.unitPrice, gstRate: l.gstRate })),
        sale.sellerStateCode,
        sale.buyerStateCode
      );
      await LedgerEntry.create(
        [
          {
            bookType: sale.sellerType,
            book: sale.seller,
            partyType: sale.buyerKind,
            party: sale.buyer,
            type: "CREDIT_NOTE",
            reference: `${sale.saleCode}/SHORT`,
            debit: 0,
            credit: t.totalValue,
            narration: `Short on receipt: ${shortLines.map((l) => l.chassisNumber).join(", ")}`,
            partnerSale: sale._id,
            createdBy: oid(user.userId),
          },
        ],
        { session }
      );
    }
    await StockMovement.create(
      sale.lines.map((l) => ({
        vehicle: l.vehicle,
        movementType: short.has(String(l.vehicle)) ? "SHORTAGE" : "NETWORK_RECEIPT",
        fromLocation: `In transit from ${sale.sellerName}`,
        toLocation: short.has(String(l.vehicle)) ? "Not received" : sale.buyerName,
        performedBy: oid(user.userId),
        reference: sale.saleCode,
        timestamp: new Date(),
      })),
      { session, ordered: true }
    );
    sale.status = "RECEIVED";
    sale.received = { at: new Date(), byName: user.name, remarks: input.remarks?.trim() };
    await sale.save({ session });
  });
  await logAudit({ user, action: "RECEIVE", resource: "PARTNER_SALE", resourceId: id, after: { short: [...short] } });
  return sale;
}

/** Seller cancels a partner sale that has not been received yet. Stock returns, invoice is reversed. */
export async function cancelPartnerSale(user: JWTPayload, id: string, reason: string) {
  if (!reason?.trim()) throw new NetworkError("A reason is required");
  const me = await requirePartner(user);
  if (!mongoose.isValidObjectId(id)) throw new NetworkError("Sale not found", 404);
  const sale = await PartnerSale.findById(id);
  if (!sale || sale.sellerType !== me.type || !same(sale.seller, me.id)) throw new NetworkError("Sale not found", 404);
  if (sale.status !== "IN_TRANSIT") throw new NetworkError("Only sales still in transit can be cancelled; received stock is returned with a sales return");
  await withTransaction(async (session) => {
    const back =
      me.type === "DISTRIBUTOR"
        ? { status: "WITH_DISTRIBUTOR", currentLocationType: "DISTRIBUTOR", currentLocationDistributor: me.id, transfer: null }
        : { status: "WITH_DEALER", currentLocationType: "DEALER", currentLocationDealer: me.id, transfer: null };
    await Vehicle.updateMany({ _id: { $in: sale.lines.map((l) => l.vehicle) }, transfer: sale._id }, { $set: back }, { session });
    await LedgerEntry.create(
      [
        {
          bookType: sale.sellerType,
          book: sale.seller,
          partyType: sale.buyerKind,
          party: sale.buyer,
          type: "CREDIT_NOTE",
          reference: `${sale.saleCode}/CANCEL`,
          debit: 0,
          credit: sale.totalValue,
          narration: `Sale cancelled: ${reason.trim()}`,
          partnerSale: sale._id,
          createdBy: oid(user.userId),
        },
      ],
      { session }
    );
    if (sale.order) {
      const order = await NetworkOrder.findById(sale.order).session(session ?? null);
      if (order) {
        for (const l of sale.lines) {
          const ol = order.lines.find((x) => same(x.model, l.model));
          if (ol) ol.fulfilledQty = Math.max(0, ol.fulfilledQty - 1);
        }
        if (["COMPLETED", "PARTIALLY_FULFILLED"].includes(order.status) && !String(order.decisionNote || "").startsWith("Balance closed")) {
          order.status = order.lines.some((l) => l.fulfilledQty > 0) ? "PARTIALLY_FULFILLED" : "ACCEPTED";
        }
        await order.save({ session });
      }
    }
    sale.status = "CANCELLED";
    sale.cancelledReason = reason.trim();
    await sale.save({ session });
  });
  await logAudit({ user, action: "CANCEL", resource: "PARTNER_SALE", resourceId: id, after: { reason } });
  return sale;
}

/** Supplier records money received from its own buyer (credit in the supplier's books). */
export async function recordNetworkPayment(
  user: JWTPayload,
  input: { buyerType: PartyType; buyerId: string; amountRupees: number; mode: "CASH" | "UPI" | "BANK" | "CHEQUE"; reference?: string; date?: string }
) {
  const me = await requirePartner(user);
  const buyer = await getParty(input.buyerType, input.buyerId);
  if (!buyer || !isDirectChild(me.type, me.id, input.buyerType, buyer)) throw new NetworkError("Partner not found in your network", 404);
  const amount = rupeesToPaise(Number(input.amountRupees));
  if (!Number.isFinite(amount) || amount <= 0) throw new NetworkError("Enter a valid amount");
  if (!["CASH", "UPI", "BANK", "CHEQUE"].includes(input.mode)) throw new NetworkError("Choose a payment mode");
  if (input.mode !== "CASH" && !input.reference?.trim()) throw new NetworkError("Enter the UTR / cheque / transaction reference");
  const date = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(+date) || date > new Date(Date.now() + 86400000)) throw new NetworkError("Payment date cannot be in the future");
  const receiptNo = await generateFyCode("PARTNER_RECEIPT", date);
  const entry = await LedgerEntry.create({
    bookType: me.type,
    book: me.id,
    partyType: input.buyerType,
    party: buyer._id,
    date,
    type: "PAYMENT",
    reference: receiptNo,
    debit: 0,
    credit: amount,
    paymentMode: input.mode,
    narration: input.reference?.trim() ? `Ref ${input.reference.trim()}` : "Cash",
    createdBy: oid(user.userId),
  });
  await logAudit({ user, action: "PAYMENT", resource: "LEDGER", resourceId: String(entry._id), after: { receiptNo, from: buyer.name, amount } });
  return entry;
}

/** Ledger of a party in a given book (null = company). Running balance oldest first. */
export async function bookLedger(partyType: PartyType, partyId: any, book: { type: PartyType; id: any } | null) {
  const entries = await LedgerEntry.find({
    partyType,
    party: oid(partyId),
    ...(book ? { bookType: book.type, book: oid(book.id) } : { book: null }),
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();
  let bal = 0;
  return entries.map((e: any) => {
    bal += (e.debit || 0) - (e.credit || 0);
    return { ...e, balance: bal };
  });
}
