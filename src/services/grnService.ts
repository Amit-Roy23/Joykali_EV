import mongoose from "mongoose";
import { JWTPayload, isPartnerRole } from "@/types";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { PartnerSale } from "@/models/PartnerSale";
import { myParty, partyFilter, partyScope } from "@/lib/partyAccess";
import { hasPermission } from "@/lib/rbac";

export class GrnError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface GrnRow {
  kind: "DO" | "NETWORK";
  id: string;
  direction: "IN" | "OUT"; // for a partner: coming to me, or sent by me
  document: string; // invoice / challan / sale code
  from: string;
  to: string;
  units: number;
  value: number;
  dispatchedAt: string | null;
  truck?: string;
  driver?: string;
  status: "IN_TRANSIT" | "RECEIVED" | "RECEIVED_WITH_ISSUES";
  daysOnRoad: number;
  grnNo?: string;
  receivedAt?: string;
  receivedBy?: string;
  received: number;
  short: number;
  damaged: number;
  creditNote?: string;
  remarks?: string;
  href: string;
  pdf?: string;
}

const days = (from?: Date | string | null, to: Date = new Date()) => (from ? Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86400000)) : 0);

function fromDO(d: any, direction: "IN" | "OUT"): GrnRow {
  const items = d.grn?.items || [];
  const short = items.filter((i: any) => i.condition === "SHORT").length;
  const damaged = items.filter((i: any) => i.condition === "DAMAGED").length;
  const received = d.grn ? items.length - short : 0;
  return {
    kind: "DO",
    id: String(d._id),
    direction,
    document: d.document?.number || d.doCode,
    from: d.warehouseName || "Joykali EV warehouse",
    to: d.partySnapshot?.name,
    units: d.vehicles?.length || 0,
    value: d.document?.totalValue || 0,
    dispatchedAt: d.dispatch?.at || null,
    truck: d.loading?.registrationNo,
    driver: d.loading?.driverName ? `${d.loading.driverName} ${d.loading.driverPhone || ""}`.trim() : undefined,
    status: d.status === "DISPATCHED" ? "IN_TRANSIT" : short || damaged ? "RECEIVED_WITH_ISSUES" : "RECEIVED",
    daysOnRoad: days(d.dispatch?.at, d.grn?.at ? new Date(d.grn.at) : new Date()),
    grnNo: d.grn?.grnNo,
    receivedAt: d.grn?.at,
    receivedBy: d.grn?.receivedByName,
    received,
    short,
    damaged,
    creditNote: d.grn?.creditNoteNo,
    remarks: d.grn?.remarks,
    href: `/dispatch/${d._id}`,
    pdf: d.grn?.grnNo ? `/api/grn/do/${d._id}/pdf` : undefined,
  };
}

function fromSale(s: any, direction: "IN" | "OUT"): GrnRow {
  const short = s.received?.shortChassis?.length || 0;
  return {
    kind: "NETWORK",
    id: String(s._id),
    direction,
    document: s.invoiceNo || s.saleCode,
    from: s.sellerName,
    to: s.buyerName,
    units: s.lines.length,
    value: s.totalValue,
    dispatchedAt: s.saleDate,
    status: s.status === "IN_TRANSIT" ? "IN_TRANSIT" : short ? "RECEIVED_WITH_ISSUES" : "RECEIVED",
    daysOnRoad: days(s.saleDate, s.received?.at ? new Date(s.received.at) : new Date()),
    grnNo: s.received?.grnNo,
    receivedAt: s.received?.at,
    receivedBy: s.received?.byName,
    received: s.received ? s.lines.length - short : 0,
    short,
    damaged: 0,
    remarks: s.received?.remarks,
    href: `/partner/sales/${s._id}`,
    pdf: s.received ? `/api/grn/network/${s._id}/pdf` : undefined,
  };
}

const RECEIPT_STATUSES = ["DISPATCHED", "DELIVERED", "DELIVERED_WITH_ISSUES"];

/**
 * Goods receipts. Partners: shipments coming to them (to confirm) and those they sent down the chain.
 * Staff: company shipments to the parties they look after, plus network receipts in their area.
 */
export async function grnRegister(user: JWTPayload, q: { from?: string; to?: string } = {}) {
  const range: any = {};
  if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) range.$gte = new Date(`${q.from}T00:00:00+05:30`);
  if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) range.$lte = new Date(`${q.to}T23:59:59.999+05:30`);
  const dated = (field: string) => (Object.keys(range).length ? { [field]: range } : {});
  const rows: GrnRow[] = [];

  if (isPartnerRole(user.role)) {
    const me = await myParty(user);
    if (!me) throw new GrnError("Your login is not linked to a partner account", 403);
    const [dos, inbound, outbound] = await Promise.all([
      DeliveryOrder.find({ partyType: me.type, party: me.id, status: { $in: RECEIPT_STATUSES }, ...dated("dispatch.at") }).sort({ "dispatch.at": -1 }).limit(300).lean(),
      PartnerSale.find({ buyerKind: me.type, buyer: me.id, status: { $in: ["IN_TRANSIT", "RECEIVED"] }, ...dated("saleDate") }).sort({ saleDate: -1 }).limit(300).lean(),
      PartnerSale.find({ sellerType: me.type, seller: me.id, buyerKind: { $ne: "CUSTOMER" }, status: { $in: ["IN_TRANSIT", "RECEIVED"] }, ...dated("saleDate") }).sort({ saleDate: -1 }).limit(300).lean(),
    ]);
    rows.push(...dos.map((d) => fromDO(d, "IN")), ...inbound.map((s) => fromSale(s, "IN")), ...outbound.map((s) => fromSale(s, "OUT")));
  } else {
    if (!(await hasPermission(user.role, "dispatch.view")) && !(await hasPermission(user.role, "grn.record"))) throw new GrnError("Not allowed", 403);
    const dos = await DeliveryOrder.find({ ...(await partyFilter(user)), status: { $in: RECEIPT_STATUSES }, ...dated("dispatch.at") }).sort({ "dispatch.at": -1 }).limit(500).lean();
    rows.push(...dos.map((d) => fromDO(d, "OUT")));
    if (await hasPermission(user.role, "network.view")) {
      const scope = await partyScope(user);
      const inScope: any = scope
        ? {
            $or: [
              { sellerType: "DEALER", seller: { $in: scope.DEALER } },
              { sellerType: "DISTRIBUTOR", seller: { $in: scope.DISTRIBUTOR } },
              { buyerKind: "DEALER", buyer: { $in: scope.DEALER } },
              { buyerKind: "DISTRIBUTOR", buyer: { $in: scope.DISTRIBUTOR } },
            ],
          }
        : {};
      const sales = await PartnerSale.find({ buyerKind: { $ne: "CUSTOMER" }, status: { $in: ["IN_TRANSIT", "RECEIVED"] }, ...inScope, ...dated("saleDate") }).sort({ saleDate: -1 }).limit(500).lean();
      rows.push(...sales.map((s) => fromSale(s, "OUT")));
    }
  }
  rows.sort((a, b) => +new Date(b.receivedAt || b.dispatchedAt || 0) - +new Date(a.receivedAt || a.dispatchedAt || 0));
  const pending = rows.filter((r) => r.status === "IN_TRANSIT");
  const done = rows.filter((r) => r.status !== "IN_TRANSIT");
  const monthStart = new Date(`${new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7)}-01T00:00:00+05:30`);
  return {
    pending,
    received: done,
    summary: {
      pending: pending.length,
      pendingUnits: pending.reduce((s, r) => s + r.units, 0),
      overdue: pending.filter((r) => r.daysOnRoad > 3).length,
      receivedThisMonth: done.filter((r) => r.receivedAt && new Date(r.receivedAt) >= monthStart).length,
      withIssues: done.filter((r) => r.status === "RECEIVED_WITH_ISSUES").length,
    },
  };
}

/** One GRN, checked against who may see it (for the PDF). */
export async function grnDocument(user: JWTPayload, kind: string, id: string) {
  if (!mongoose.isValidObjectId(id)) throw new GrnError("GRN not found", 404);
  const reg = await grnRegister(user);
  const row = [...reg.received].find((r) => r.id === id && (kind === "do" ? r.kind === "DO" : r.kind === "NETWORK"));
  if (!row) throw new GrnError("GRN not found", 404);
  let lines: Array<{ chassis: string; model: string; condition: string; remarks: string }>;
  if (kind === "do") {
    const d: any = await DeliveryOrder.findById(id).lean();
    lines = d.vehicles.map((v: any) => {
      const it = (d.grn?.items || []).find((i: any) => i.chassisNumber === v.chassisNumber);
      return { chassis: v.chassisNumber, model: v.modelName, condition: it?.condition || "RECEIVED", remarks: it?.remarks || "" };
    });
  } else {
    const sale: any = await PartnerSale.findById(id).lean();
    lines = sale.lines.map((l: any) => ({ chassis: l.chassisNumber, model: l.modelName, condition: (sale.received?.shortChassis || []).includes(l.chassisNumber) ? "SHORT" : "RECEIVED", remarks: "" }));
  }
  return { row, lines };
}
