import mongoose from "mongoose";
import { JWTPayload, isPartnerRole } from "@/types";
import { ChannelOrder, IChannelOrder } from "@/models/ChannelOrder";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { VehicleModel } from "@/models/VehicleModel";
import { CreditLimitChange } from "@/models/CreditLimitChange";
import { LedgerEntry } from "@/models/LedgerEntry";
import { generateFyCode } from "@/lib/codeGenerator";
import { canAccessParty, myParty, PartyType } from "@/lib/partyAccess";
import { logAudit } from "@/lib/audit";
import { assertCredit, channelPrice, creditSummary, getParty, lineValue, supplierRef, tierOf } from "./creditService";
import { rupeesToPaise } from "@/lib/money";

export class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Place a vehicle order. Distributors order for themselves; ASM for their own dealers; BH+ for anyone. */
export async function placeOrder(
  input: { partyType: PartyType; partyId: string; lines: Array<{ modelId: string; quantity: number }>; notes?: string },
  user: JWTPayload
): Promise<IChannelOrder> {
  let { partyType, partyId } = input;
  if (isPartnerRole(user.role)) {
    const own = await myParty(user);
    if (!own) throw new OrderError("Your login is not linked to an active partner account", 403);
    partyType = own.type;
    partyId = String(own.id);
  }
  if (partyType !== "DEALER" && partyType !== "DISTRIBUTOR") throw new OrderError("Choose a dealer or distributor");
  if (!(await canAccessParty(user, partyType, partyId))) {
    throw new OrderError("You can only place orders for dealers/distributors assigned to you", 403);
  }
  const party = await getParty(partyType, partyId);
  if (!party) throw new OrderError(`${partyType === "DEALER" ? "Dealer" : "Distributor"} not found`, 404);
  if (party.status !== "ACTIVE") throw new OrderError(`${party.name} is not active`);
  const sup = supplierRef(partyType, party);
  if (sup) {
    const s = await getParty(sup.type, sup.id);
    throw new OrderError(`${party.name} buys from ${s?.name || "its distributor"}. Place the order with them under My network → Buy stock.`);
  }

  // Merge duplicate lines, validate quantities.
  const qtyByModel = new Map<string, number>();
  for (const l of input.lines || []) {
    const q = Math.floor(Number(l.quantity));
    if (!mongoose.isValidObjectId(l.modelId) || !Number.isFinite(q) || q < 1) continue;
    qtyByModel.set(l.modelId, (qtyByModel.get(l.modelId) || 0) + q);
  }
  if (qtyByModel.size === 0) throw new OrderError("Add at least one vehicle model with a quantity");
  if ([...qtyByModel.values()].some((q) => q > 500)) throw new OrderError("Maximum 500 units per model per order");

  const models = await VehicleModel.find({ _id: { $in: [...qtyByModel.keys()] }, isActive: true }).lean();
  if (models.length !== qtyByModel.size) throw new OrderError("One or more models are not available for ordering");

  const lines = models.map((m: any) => ({
    model: m._id,
    modelName: `${m.name} ${m.variant ? `(${m.variant})` : ""}`.trim(),
    quantity: qtyByModel.get(String(m._id))!,
    unitPrice: channelPrice(m, partyType, tierOf(partyType, party)),
    gstRate: m.gstRate ?? 5,
    hsnCode: m.hsnCode || "870380",
    dispatchedQty: 0,
  }));
  const totals = lines.reduce(
    (t, l) => {
      const v = lineValue(l.quantity, l.unitPrice, l.gstRate);
      return { taxable: t.taxable + v.taxable, gst: t.gst + v.gst, total: t.total + v.total };
    },
    { taxable: 0, gst: 0, total: 0 }
  );

  // Hard credit control at the moment of ordering.
  const credit = await assertCredit(partyType, partyId, totals.total, { context: "new order" }).catch((e) => {
    throw new OrderError(e.message, 409);
  });

  const order = await ChannelOrder.create({
    orderCode: await generateFyCode("ORDER"),
    partyType,
    party: new mongoose.Types.ObjectId(partyId),
    partyName: party.name,
    partyCode: party.code,
    lines,
    taxableValue: totals.taxable,
    gstValue: totals.gst,
    totalValue: totals.total,
    status: "PENDING_APPROVAL",
    approvals: [],
    creditCheck: { limit: credit.limit, exposureBefore: credit.exposure, availableBefore: credit.available },
    notes: input.notes?.trim(),
    placedBy: new mongoose.Types.ObjectId(user.userId),
    placedByName: user.name,
  });

  await logAudit({
    user,
    action: "CREATE",
    resource: "ORDER",
    resourceId: String(order._id),
    after: { orderCode: order.orderCode, party: party.name, total: totals.total },
  });
  return order;
}

/**
 * Cancel an order. Nothing on a Delivery Order yet → CANCELLED. Partly on DOs →
 * the undelivered balance is cancelled and the order is closed (COMPLETED).
 */
export async function cancelOrder(orderId: string, reason: string, user: JWTPayload) {
  if (!reason?.trim()) throw new OrderError("A reason is required");
  const order = await ChannelOrder.findById(orderId);
  if (!order) throw new OrderError("Order not found", 404);
  if (!(await canAccessParty(user, order.partyType, order.party))) throw new OrderError("Order not found", 404);
  if (["CANCELLED", "REJECTED", "COMPLETED"].includes(order.status)) {
    throw new OrderError(`Order is already ${order.status.toLowerCase()}`);
  }
  // Distributors may withdraw their own order only before it is approved.
  if (isPartnerRole(user.role) && order.status !== "PENDING_APPROVAL") {
    throw new OrderError("This order is already approved — contact Joykali to change it", 403);
  }
  const onDOs = order.lines.reduce((s, l) => s + (l.dispatchedQty || 0), 0);
  if (onDOs === 0) {
    order.status = "CANCELLED";
  } else {
    order.lines.forEach((l) => (l.quantity = l.dispatchedQty));
    const totals = order.lines.reduce(
      (t, l) => {
        const v = lineValue(l.quantity, l.unitPrice, l.gstRate);
        return { taxable: t.taxable + v.taxable, gst: t.gst + v.gst, total: t.total + v.total };
      },
      { taxable: 0, gst: 0, total: 0 }
    );
    order.taxableValue = totals.taxable;
    order.gstValue = totals.gst;
    order.totalValue = totals.total;
    order.status = "COMPLETED";
  }
  order.cancelledReason = `${reason.trim()} — ${user.name}`;
  await order.save();
  await logAudit({ user, action: "CANCEL", resource: "ORDER", resourceId: orderId, after: { status: order.status, reason } });
  return order;
}

/** Recompute an order's status from how much of it sits on Delivery Orders. */
export async function refreshOrderStatus(orderId: mongoose.Types.ObjectId | string) {
  const order = await ChannelOrder.findById(orderId);
  if (!order || !["APPROVED", "PARTIALLY_DISPATCHED", "COMPLETED"].includes(order.status)) return;
  const remaining = order.lines.reduce((s, l) => s + (l.quantity - (l.dispatchedQty || 0)), 0);
  const scheduled = order.lines.reduce((s, l) => s + (l.dispatchedQty || 0), 0);
  order.status = remaining <= 0 ? "COMPLETED" : scheduled > 0 ? "PARTIALLY_DISPATCHED" : "APPROVED";
  await order.save();
}

/** Ask for a new credit limit. Applied only after the Business Head and Managing Partner approve. */
export async function requestCreditChange(
  input: { partyType: PartyType; partyId: string; toLimitRupees: number; creditDays?: number; reason: string },
  user: JWTPayload
) {
  const party = await getParty(input.partyType, input.partyId);
  if (!party) throw new OrderError("Party not found", 404);
  if (supplierRef(input.partyType, party)) {
    throw new OrderError(`${party.name} buys from a distributor/dealer, who sets its credit limit in their network.`);
  }
  const toLimit = rupeesToPaise(Number(input.toLimitRupees));
  if (!Number.isFinite(toLimit) || toLimit < 0) throw new OrderError("Enter a valid credit limit");
  if (!input.reason?.trim()) throw new OrderError("A reason is required");
  const days = input.creditDays != null ? Math.floor(Number(input.creditDays)) : undefined;
  if (days != null && (!Number.isFinite(days) || days < 0 || days > 180)) throw new OrderError("Credit days must be 0–180");
  const pending = await CreditLimitChange.findOne({ partyType: input.partyType, party: input.partyId, status: "PENDING" });
  if (pending) throw new OrderError("A credit change for this party is already awaiting approval", 409);
  if (toLimit === party.creditLimit && (days == null || days === party.creditDays)) {
    throw new OrderError("That is already the current credit limit");
  }
  const change = await CreditLimitChange.create({
    partyType: input.partyType,
    party: new mongoose.Types.ObjectId(input.partyId),
    partyName: party.name,
    partyCode: party.code,
    fromLimit: party.creditLimit,
    toLimit,
    creditDays: days,
    reason: input.reason.trim(),
    status: "PENDING",
    approvals: [],
    requestedBy: new mongoose.Types.ObjectId(user.userId),
  });
  await logAudit({
    user,
    action: "CREATE",
    resource: "CREDIT",
    resourceId: String(change._id),
    after: { party: party.name, from: party.creditLimit, to: toLimit, reason: input.reason },
  });
  return change;
}

/** Record money received from a dealer/distributor (credit entry on their ledger). */
export async function recordPayment(
  input: { partyType: PartyType; partyId: string; amountRupees: number; mode: "CASH" | "UPI" | "BANK" | "CHEQUE"; reference: string; date?: string; narration?: string },
  user: JWTPayload
) {
  const party = await getParty(input.partyType, input.partyId);
  if (!party) throw new OrderError("Party not found", 404);
  if (supplierRef(input.partyType, party)) {
    throw new OrderError(`${party.name} pays its own supplier, not the company. Their supplier records the payment.`);
  }
  const amount = rupeesToPaise(Number(input.amountRupees));
  if (!Number.isFinite(amount) || amount <= 0) throw new OrderError("Enter a valid amount");
  if (!["CASH", "UPI", "BANK", "CHEQUE"].includes(input.mode)) throw new OrderError("Choose a payment mode");
  if (!input.reference?.trim() && input.mode !== "CASH") throw new OrderError("Enter the UTR / cheque / transaction reference");
  const date = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(+date) || date > new Date(Date.now() + 86400000)) throw new OrderError("Payment date cannot be in the future");
  const receiptNo = await generateFyCode("RECEIPT", date);
  const entry = await LedgerEntry.create({
    partyType: input.partyType,
    party: new mongoose.Types.ObjectId(input.partyId),
    date,
    type: "PAYMENT",
    reference: receiptNo,
    debit: 0,
    credit: amount,
    paymentMode: input.mode,
    narration: [input.mode, input.reference?.trim(), input.narration?.trim()].filter(Boolean).join(" · "),
    createdBy: new mongoose.Types.ObjectId(user.userId),
  });
  await logAudit({ user, action: "PAYMENT", resource: "LEDGER", resourceId: String(entry._id), after: { party: party.name, amount, receiptNo } });
  return entry;
}

/** Ledger with running balance (oldest first). */
export async function partyLedger(partyType: PartyType, partyId: string) {
  const entries = await LedgerEntry.find({ partyType, party: partyId, book: null }).sort({ date: 1, createdAt: 1 }).lean();
  let balance = 0;
  return entries.map((e) => {
    balance += (e.debit || 0) - (e.credit || 0);
    return { ...e, balance };
  });
}

export async function orderDetail(orderId: string) {
  const order = await ChannelOrder.findById(orderId).lean();
  if (!order) return null;
  const [dos, credit] = await Promise.all([
    DeliveryOrder.find({ order: order._id }).select("doCode status lines vehicles.chassisNumber document.number createdAt").sort({ createdAt: 1 }).lean(),
    creditSummary(order.partyType, order.party).catch(() => null),
  ]);
  return { order, deliveryOrders: dos, credit };
}
