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

/** Ex-GST channel price in paise; falls back to a margin off the ex-showroom price. */
export function channelPrice(
  model: { sellingPrice: number; dealerPrice?: number | null; distributorPrice?: number | null },
  partyType: PartyType
): number {
  if (partyType === "DISTRIBUTOR") return model.distributorPrice || Math.round(model.sellingPrice * 0.88);
  return model.dealerPrice || Math.round(model.sellingPrice * 0.92);
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

  const entries = await LedgerEntry.find({ partyType, party: pid }).select("date debit credit").lean();
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
