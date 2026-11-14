import mongoose from "mongoose";
import { Dealer } from "@/models/Dealer";
import { Distributor } from "@/models/Distributor";
import { LedgerEntry, PartyType } from "@/models/LedgerEntry";
import { ChannelOrder } from "@/models/ChannelOrder";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { Vehicle } from "@/models/Vehicle";
import { VehicleModel } from "@/models/VehicleModel";

export type { PartyType };

/* ------------------------------------------------------------------ */
/* Pure helpers (unit-tested)                                          */
/* ------------------------------------------------------------------ */

export type ChannelTier = "SUPER_DISTRIBUTOR" | "DISTRIBUTOR" | "DEALER" | "SUB_DEALER";

/** Default margin off the ex-showroom price when a model has no explicit price for a tier. */
export const TIER_FALLBACK: Record<ChannelTier, number> = {
  SUPER_DISTRIBUTOR: 0.85,
  DISTRIBUTOR: 0.88,
  DEALER: 0.92,
  SUB_DEALER: 0.95,
};

type PricedModel = {
  sellingPrice: number;
  superDistributorPrice?: number | null;
  distributorPrice?: number | null;
  dealerPrice?: number | null;
  subDealerPrice?: number | null;
};

/** Ex-GST buying price (paise) for a channel tier. */
export function tierPrice(model: PricedModel, tier: ChannelTier): number {
  const explicit =
    tier === "SUPER_DISTRIBUTOR"
      ? model.superDistributorPrice
      : tier === "DISTRIBUTOR"
        ? model.distributorPrice
        : tier === "DEALER"
          ? model.dealerPrice
          : model.subDealerPrice;
  return explicit || Math.round(model.sellingPrice * TIER_FALLBACK[tier]);
}

/** The tier of a party document (old records without a tier are plain distributors / dealers). */
export function tierOf(partyType: PartyType, doc: { tier?: string | null } | null | undefined): ChannelTier {
  if (partyType === "DISTRIBUTOR") return doc?.tier === "SUPER_DISTRIBUTOR" ? "SUPER_DISTRIBUTOR" : "DISTRIBUTOR";
  return doc?.tier === "SUB_DEALER" ? "SUB_DEALER" : "DEALER";
}

/** Ex-GST channel price in paise; falls back to a margin off the ex-showroom price. */
export function channelPrice(model: PricedModel, partyType: PartyType, tier?: ChannelTier): number {
  return tierPrice(model, tier || (partyType === "DISTRIBUTOR" ? "DISTRIBUTOR" : "DEALER"));
}

/**
 * Who supplies a party: the company (null) or another partner.
 *  - super distributor → company
 *  - distributor → its super distributor, else company
 *  - dealer → its distributor, else company (consignment)
 *  - sub dealer → its parent dealer, else its distributor
 */
export function supplierRef(
  partyType: PartyType,
  doc: { tier?: string | null; parent?: any; parentDistributor?: any; parentDealer?: any }
): { type: PartyType; id: mongoose.Types.ObjectId } | null {
  if (partyType === "DISTRIBUTOR") {
    if (doc.tier === "SUPER_DISTRIBUTOR" || !doc.parent) return null;
    return { type: "DISTRIBUTOR", id: doc.parent };
  }
  if (doc.tier === "SUB_DEALER" && doc.parentDealer) return { type: "DEALER", id: doc.parentDealer };
  if (doc.parentDistributor) return { type: "DISTRIBUTOR", id: doc.parentDistributor };
  return null;
}

/** Line value including GST, in paise. GST is rounded per line, as on the invoice. */
export function lineValue(qty: number, unitPrice: number, gstRate: number) {
  const taxable = qty * unitPrice;
  const gst = Math.round((taxable * gstRate) / 100);
  return { taxable, gst, total: taxable + gst };
}

/**
 * Overdue amount with payments applied first-in-first-out to the oldest debits.
 * A debit is overdue once it is older than `creditDays`.
 */
export function overdueAmount(
  entries: Array<{ date: Date; debit: number; credit: number }>,
  creditDays: number,
  asOf: Date = new Date()
): number {
  const sorted = [...entries].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  let credits = sorted.reduce((s, e) => s + (e.credit || 0), 0);
  const cutoff = asOf.getTime() - creditDays * 86400000;
  let overdue = 0;
  for (const e of sorted) {
    if (!e.debit) continue;
    const settled = Math.min(credits, e.debit);
    credits -= settled;
    const open = e.debit - settled;
    if (open > 0 && new Date(e.date).getTime() < cutoff) overdue += open;
  }
  return overdue;
}

export interface CreditSummary {
  partyType: PartyType;
  /** Who grants this credit: null = the company (BH + MP approval), else the supplying partner. */
  supplier: { type: PartyType; id: string; name: string; code: string } | null;
  limit: number;
  creditDays: number;
  ledgerBalance: number; // unpaid invoices (distributors) / manual entries
  openOrders: number; // approved or pending orders not yet on a DO
  pipeline: number; // on Delivery Orders not yet invoiced (distributor) / not yet received (dealer)
  consignment: number; // dealer only: stock on the dealer floor at dealer price incl. GST
  exposure: number;
  available: number;
  overdue: number;
  onHold: boolean;
  holdReason: string | null;
}

/* ------------------------------------------------------------------ */
/* Database-backed                                                     */
/* ------------------------------------------------------------------ */

export async function getParty(partyType: PartyType, id: string | mongoose.Types.ObjectId) {
  if (!mongoose.isValidObjectId(id)) return null;
  const doc: any =
    partyType === "DEALER" ? await Dealer.findById(id).lean() : await Distributor.findById(id).lean();
  if (!doc) return null;
  return {
    ...doc,
    code: partyType === "DEALER" ? doc.dealerCode : doc.distributorCode,
    creditLimit: doc.creditLimit || 0,
    creditDays: doc.creditDays ?? 30,
    stateCode: doc.stateCode || "19",
    pincode: doc.pincode || "",
  };
}

const PIPELINE_STATUSES: Record<PartyType, string[]> = {
  // invoiced at dispatch → from then on it is in the ledger
  DISTRIBUTOR: ["CREATED", "SUBMITTED", "LOADING", "LOADED"],
  // consignment: counted until the dealer has received it (then it is floor stock)
  DEALER: ["CREATED", "SUBMITTED", "LOADING", "LOADED", "DISPATCHED"],
};

export async function creditSummary(
  partyType: PartyType,
  partyId: string | mongoose.Types.ObjectId,
  opts: { excludeOrder?: string | mongoose.Types.ObjectId } = {}
): Promise<CreditSummary> {
  const party = await getParty(partyType, partyId);
  if (!party) throw new Error(`${partyType === "DEALER" ? "Dealer" : "Distributor"} not found`);
  const pid = new mongoose.Types.ObjectId(String(partyId));
  const sup = supplierRef(partyType, party);
  if (sup) return networkCreditSummary(partyType, party, pid, sup, opts);
  const entries = await LedgerEntry.find({ partyType, party: pid, book: null }).select("date debit credit").lean();
  const ledgerBalance = entries.reduce((s, e) => s + (e.debit || 0) - (e.credit || 0), 0);
  const overdue = overdueAmount(entries as any, party.creditDays);

  const orders = await ChannelOrder.find({
    partyType,
    party: pid,
    status: { $in: ["PENDING_APPROVAL", "APPROVED", "PARTIALLY_DISPATCHED"] },
    ...(opts.excludeOrder ? { _id: { $ne: new mongoose.Types.ObjectId(String(opts.excludeOrder)) } } : {}),
  }).lean();
  const openOrders = orders.reduce(
    (s, o) =>
      s +
      o.lines.reduce((t, l) => t + lineValue(Math.max(0, l.quantity - (l.dispatchedQty || 0)), l.unitPrice, l.gstRate).total, 0),
    0
  );

  const dos = await DeliveryOrder.find({ partyType, party: pid, status: { $in: PIPELINE_STATUSES[partyType] } })
    .select("lines")
    .lean();
  const pipeline = dos.reduce(
    (s, d) => s + d.lines.reduce((t, l) => t + lineValue(l.quantity, l.unitPrice, l.gstRate).total, 0),
    0
  );

  let consignment = 0;
  if (partyType === "DEALER") {
    const floor = await Vehicle.aggregate([
      { $match: { status: "ALLOCATED_TO_DEALER", currentLocationDealer: pid } },
      { $group: { _id: "$model", n: { $sum: 1 } } },
    ]);
    if (floor.length) {
      const models = await VehicleModel.find({ _id: { $in: floor.map((f: any) => f._id) } }).lean();
      for (const f of floor) {
        const m: any = models.find((x: any) => String(x._id) === String(f._id));
        if (m) consignment += lineValue(f.n, channelPrice(m, "DEALER"), m.gstRate ?? 5).total;
      }
    }
  }

  const exposure = Math.max(0, ledgerBalance) + openOrders + pipeline + consignment;
  const available = party.creditLimit - exposure;
  let holdReason: string | null = null;
  if (party.status && party.status !== "ACTIVE") holdReason = `Account is ${String(party.status).toLowerCase().replace("_", " ")}`;
  else if (overdue > 0) holdReason = "Overdue invoices — clear dues to release new orders";
  return {
    partyType,
    supplier: null,
    limit: party.creditLimit,
    creditDays: party.creditDays,
    ledgerBalance,
    openOrders,
    pipeline,
    consignment,
    exposure,
    available,
    overdue,
    onHold: !!holdReason,
    holdReason,
  };
}

/** Credit a supplying partner gives its own buyer (secondary trade, in the partner's books). */
async function networkCreditSummary(
  partyType: PartyType,
  party: any,
  pid: mongoose.Types.ObjectId,
  sup: { type: PartyType; id: mongoose.Types.ObjectId },
  opts: { excludeOrder?: string | mongoose.Types.ObjectId }
): Promise<CreditSummary> {
  const { NetworkOrder } = await import("@/models/NetworkOrder");
  const { PartnerSale } = await import("@/models/PartnerSale");
  const supplier = await getParty(sup.type, sup.id);
  const entries = await LedgerEntry.find({ partyType, party: pid, bookType: sup.type, book: sup.id })
    .select("date debit credit")
    .lean();
  const ledgerBalance = entries.reduce((s, e) => s + (e.debit || 0) - (e.credit || 0), 0);
  const overdue = overdueAmount(entries as any, party.creditDays);
  const orders = await NetworkOrder.find({
    buyerType: partyType,
    buyer: pid,
    status: { $in: ["PLACED", "ACCEPTED", "PARTIALLY_FULFILLED"] },
    ...(opts.excludeOrder ? { _id: { $ne: new mongoose.Types.ObjectId(String(opts.excludeOrder)) } } : {}),
  }).lean();
  const openOrders = orders.reduce(
    (s: number, o: any) =>
      s +
      o.lines.reduce(
        (t: number, l: any) => t + lineValue(Math.max(0, l.quantity - (l.fulfilledQty || 0)), l.unitPrice, l.gstRate).total,
        0
      ),
    0
  );
  const exposure = Math.max(0, ledgerBalance) + openOrders;
  let holdReason: string | null = null;
  if (party.status && party.status !== "ACTIVE") holdReason = `Account is ${String(party.status).toLowerCase().replace("_", " ")}`;
  else if (overdue > 0) holdReason = "Overdue invoices — clear dues to release new orders";
  return {
    partyType,
    supplier: supplier ? { type: sup.type, id: String(sup.id), name: supplier.name, code: supplier.code } : null,
    limit: party.creditLimit,
    creditDays: party.creditDays,
    ledgerBalance,
    openOrders,
    pipeline: 0,
    consignment: 0,
    exposure,
    available: party.creditLimit - exposure,
    overdue,
    onHold: !!holdReason,
    holdReason,
  };
}

const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;

/**
 * Throw if adding `additional` (paise, incl. GST) would breach the party's
 * credit limit, or the account is on hold / overdue.
 */
export async function assertCredit(
  partyType: PartyType,
  partyId: string | mongoose.Types.ObjectId,
  additional: number,
  opts: { excludeOrder?: string | mongoose.Types.ObjectId; context?: string } = {}
): Promise<CreditSummary> {
  const c = await creditSummary(partyType, partyId, opts);
  if (c.onHold) throw new Error(`Credit hold: ${c.holdReason}.`);
  if (additional > c.available) {
    throw new Error(
      `Credit limit exceeded${opts.context ? ` (${opts.context})` : ""}: needs ${rupees(additional)}, available ${rupees(
        Math.max(0, c.available)
      )} of ${rupees(c.limit)} limit.`
    );
  }
  return c;
}
