import mongoose from "mongoose";
import { JWTPayload, isPartnerRole } from "@/types";
import { Dealer } from "@/models/Dealer";
import { Distributor } from "@/models/Distributor";
import { User } from "@/models/User";
import { Vehicle } from "@/models/Vehicle";
import { LedgerEntry } from "@/models/LedgerEntry";
import { StockMovement } from "@/models/StockMovement";
import { PartnerSale } from "@/models/PartnerSale";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { PartyDocument, REQUIRED_KYC, KYC_DOC_TYPES, KycDocType } from "@/models/PartyDocument";
import { SecurityDeposit } from "@/models/SecurityDeposit";
import { PartnerTarget } from "@/models/PartnerTarget";
import { Territory, TerritoryKind } from "@/models/Territory";
import { Outlet } from "@/models/Outlet";
import { StockTransfer } from "@/models/StockTransfer";
import { StoredFile } from "@/models/StoredFile";
import { Sale } from "@/models/Sale";
import { withTransaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { myParty, PartyType } from "@/lib/partyAccess";
import { rupeesToPaise } from "@/lib/money";
import { generateFyCode, generateOutletCode } from "@/lib/codeGenerator";
import { getCurrentPeriod, getPeriodBounds } from "@/lib/period";
import { getParty, supplierRef, tierOf } from "./creditService";
import { canActOnParty, commissionEarned, depositHeld, isDirectChild, NetworkError, ownedStockFilter, TIER_LABEL } from "./networkService";

const oid = (v: any) => new mongoose.Types.ObjectId(String(v));
const same = (a: any, b: any) => !!a && !!b && String(a) === String(b);

/* ------------------------------------------------------------------ */
/* KYC & agreement documents                                           */
/* ------------------------------------------------------------------ */

export function kycStatus(docs: Array<{ docType: string; status: string; validTill?: Date | null }>, asOf = new Date()) {
  const valid = (d: any) => d.status === "VERIFIED" && (!d.validTill || new Date(d.validTill) >= asOf);
  const missing = REQUIRED_KYC.filter((t) => !docs.some((d) => d.docType === t && valid(d)));
  const pending = docs.filter((d) => d.status === "PENDING").length;
  return { complete: missing.length === 0, missing, pending };
}

export async function listPartyDocuments(user: JWTPayload, partyType: PartyType, partyId: string) {
  const access = await canActOnParty(user, partyType, partyId);
  if (!access.ok) throw new NetworkError("Partner not found", 404);
  const docs = await PartyDocument.find({ partyType, party: oid(partyId) }).sort({ docType: 1, createdAt: -1 }).lean();
  return { docs, kyc: kycStatus(docs as any), canVerify: !isPartnerRole(user.role) && (await hasPermission(user.role, "kyc.verify")) };
}

export async function uploadPartyDocument(
  user: JWTPayload,
  partyType: PartyType,
  partyId: string,
  input: { docType: string; number?: string; validTill?: string; file?: { name: string; type: string; data: Buffer } | null }
) {
  const access = await canActOnParty(user, partyType, partyId);
  if (!access.ok) throw new NetworkError("Partner not found", 404);
  if (access.as === "STAFF" && !(await hasPermission(user.role, partyType === "DEALER" ? "dealer.manage" : "distributor.manage")) && !(await hasPermission(user.role, "kyc.verify"))) {
    throw new NetworkError("You cannot upload documents for this partner", 403);
  }
  if (!(KYC_DOC_TYPES as readonly string[]).includes(input.docType)) throw new NetworkError("Choose a document type");
  if (!input.file && !input.number?.trim()) throw new NetworkError("Attach the file or enter the document number");
  if (input.file) {
    if (input.file.data.length > 2 * 1024 * 1024) throw new NetworkError("File is larger than 2 MB");
    if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(input.file.type)) throw new NetworkError("Upload a PDF, JPG, PNG or WebP file");
  }
  const validTill = input.validTill ? new Date(input.validTill) : null;
  if (validTill && Number.isNaN(+validTill)) throw new NetworkError("Invalid validity date");
  let fileId = null;
  if (input.file) {
    const f = await StoredFile.create({ name: input.file.name, contentType: input.file.type, size: input.file.data.length, data: input.file.data, uploadedBy: oid(user.userId) });
    fileId = f._id;
  }
  const doc = await PartyDocument.create({
    partyType,
    party: oid(partyId),
    docType: input.docType as KycDocType,
    number: input.number?.trim(),
    validTill,
    file: fileId,
    fileName: input.file?.name,
    status: "PENDING",
    uploadedBy: oid(user.userId),
  });
  await logAudit({ user, action: "UPLOAD", resource: "KYC", resourceId: String(doc._id), after: { party: access.doc!.name, docType: input.docType } });
  return doc;
}

/** Company verification. When every required document is verified a PENDING partner becomes ACTIVE. */
export async function verifyPartyDocument(user: JWTPayload, docId: string, decision: "VERIFIED" | "REJECTED", remarks?: string) {
  if (isPartnerRole(user.role) || !(await hasPermission(user.role, "kyc.verify"))) throw new NetworkError("Only company staff with KYC rights can verify", 403);
  if (!mongoose.isValidObjectId(docId)) throw new NetworkError("Document not found", 404);
  const doc = await PartyDocument.findById(docId);
  if (!doc) throw new NetworkError("Document not found", 404);
  if (same(doc.uploadedBy, user.userId)) throw new NetworkError("Someone other than the uploader must verify a document", 403);
  if (decision === "REJECTED" && !remarks?.trim()) throw new NetworkError("Give a reason for rejecting");
  doc.status = decision;
  doc.remarks = remarks?.trim();
  doc.verifiedBy = oid(user.userId);
  doc.verifiedByName = user.name;
  doc.verifiedAt = new Date();
  await doc.save();

  let activated = false;
  const all = await PartyDocument.find({ partyType: doc.partyType, party: doc.party }).lean();
  if (kycStatus(all as any).complete) {
    const Coll: any = doc.partyType === "DEALER" ? Dealer : Distributor;
    const r = await Coll.updateOne({ _id: doc.party, status: "PENDING" }, { $set: { status: "ACTIVE" } });
    activated = r.modifiedCount > 0;
  }
  await logAudit({ user, action: "VERIFY", resource: "KYC", resourceId: docId, after: { decision, remarks, activated } });
  return { doc, activated };
}

/* ------------------------------------------------------------------ */
/* Security deposits                                                   */
/* ------------------------------------------------------------------ */

export async function listDeposits(user: JWTPayload, partyType: PartyType, partyId: string) {
  const access = await canActOnParty(user, partyType, partyId);
  if (!access.ok) throw new NetworkError("Partner not found", 404);
  const entries = await SecurityDeposit.find({ partyType, party: oid(partyId) }).sort({ date: -1 }).lean();
  return { entries, held: depositHeld(entries as any) };
}

export async function recordDeposit(
  user: JWTPayload,
  partyType: PartyType,
  partyId: string,
  input: { type: "RECEIVED" | "REFUNDED" | "ADJUSTED"; amountRupees: number; mode: string; reference?: string; narration?: string; date?: string }
) {
  const party = await getParty(partyType, partyId);
  if (!party) throw new NetworkError("Partner not found", 404);
  // Deposits are taken by whoever supplies the partner: the company (ledger.manage) or the supplying partner.
  const sup = supplierRef(partyType, party);
  if (isPartnerRole(user.role)) {
    const me = await myParty(user);
    if (!me || !isDirectChild(me.type, me.id, partyType, party)) throw new NetworkError("Only the supplier records this partner's deposit", 403);
  } else {
    if (sup) throw new NetworkError(`${party.name}'s deposit is held by its supplier, not the company`);
    if (!(await hasPermission(user.role, "ledger.manage"))) throw new NetworkError("You cannot record deposits", 403);
  }
  if (!["RECEIVED", "REFUNDED", "ADJUSTED"].includes(input.type)) throw new NetworkError("Choose received, refunded or adjusted");
  const amount = rupeesToPaise(Number(input.amountRupees));
  if (!Number.isFinite(amount) || amount <= 0) throw new NetworkError("Enter a valid amount");
  const mode = input.type === "ADJUSTED" ? "LEDGER" : input.mode;
  if (!["CASH", "UPI", "BANK", "CHEQUE", "LEDGER"].includes(mode)) throw new NetworkError("Choose a payment mode");
  if (mode !== "CASH" && mode !== "LEDGER" && !input.reference?.trim()) throw new NetworkError("Enter the transaction / cheque reference");
  const date = input.date ? new Date(input.date) : new Date();
  if (Number.isNaN(+date) || date > new Date(Date.now() + 86400000)) throw new NetworkError("Date cannot be in the future");
  const existing = await SecurityDeposit.find({ partyType, party: party._id }).lean();
  const held = depositHeld(existing as any);
  if (input.type !== "RECEIVED" && amount > held) throw new NetworkError(`Only ₹${(held / 100).toLocaleString("en-IN")} is held`);

  const entry = await withTransaction(async (session) => {
    const [e] = await SecurityDeposit.create(
      [{ partyType, party: party._id, type: input.type, amount, date, mode, reference: input.reference?.trim(), narration: input.narration?.trim(), createdBy: oid(user.userId), createdByName: user.name }],
      { session }
    );
    if (input.type === "ADJUSTED") {
      // Set the deposit off against the partner's outstanding dues.
      const me = isPartnerRole(user.role) ? await myParty(user) : null;
      await LedgerEntry.create(
        [
          {
            bookType: me ? me.type : null,
            book: me ? me.id : null,
            partyType,
            party: party._id,
            date,
            type: "ADJUSTMENT",
            reference: `SD-ADJ/${String(e._id).slice(-6).toUpperCase()}`,
            debit: 0,
            credit: amount,
            narration: input.narration?.trim() || "Security deposit adjusted against dues",
            createdBy: oid(user.userId),
          },
        ],
        { session }
      );
    }
    return e;
  });
  await logAudit({ user, action: "PAYMENT", resource: "DEPOSIT", resourceId: String(entry._id), after: { party: party.name, type: input.type, amount } });
  return entry;
}

/* ------------------------------------------------------------------ */
/* Targets, achievement, commission, ranking                           */
/* ------------------------------------------------------------------ */

/** Units and value a partner BOUGHT in a month: company dispatches, or network sales to them. */
export async function achievement(partyType: PartyType, party: any, period: string) {
  const { start, end } = getPeriodBounds(period);
  const pid = oid(party._id || party);
  const doc = party._id ? party : await getParty(partyType, pid);
  if (doc && supplierRef(partyType, doc)) {
    const sales = await PartnerSale.find({ buyerKind: partyType, buyer: pid, status: { $in: ["IN_TRANSIT", "RECEIVED"] }, saleDate: { $gte: start, $lte: end } })
      .select("lines totalValue")
      .lean();
    return { units: sales.reduce((s, x: any) => s + x.lines.length, 0), value: sales.reduce((s, x: any) => s + x.totalValue, 0) };
  }
  const dos = await DeliveryOrder.find({
    partyType,
    party: pid,
    status: { $in: ["DISPATCHED", "DELIVERED", "DELIVERED_WITH_ISSUES"] },
    "dispatch.at": { $gte: start, $lte: end },
  })
    .select("vehicles document")
    .lean();
  return { units: dos.reduce((s, d: any) => s + (d.vehicles?.length || 0), 0), value: dos.reduce((s, d: any) => s + (d.document?.totalValue || 0), 0) };
}

/** Who may set a party's target: company staff (target.manage) for company-supplied partners, else its supplier. */
async function targetSetter(user: JWTPayload, partyType: PartyType, party: any) {
  const sup = supplierRef(partyType, party);
  if (isPartnerRole(user.role)) {
    const me = await myParty(user);
    if (!me || !sup || sup.type !== me.type || !same(sup.id, me.id)) throw new NetworkError("Targets for this partner are set by its supplier", 403);
    return { setByType: me.type as "DEALER" | "DISTRIBUTOR", setBy: me.id };
  }
  if (sup) throw new NetworkError(`${party.name} is supplied by a partner, who sets its targets`, 403);
  if (!(await hasPermission(user.role, "target.manage"))) throw new NetworkError("You cannot set targets", 403);
  return { setByType: "COMPANY" as const, setBy: null };
}

export async function setTarget(
  user: JWTPayload,
  input: { partyType: PartyType; partyId: string; period: string; targetUnits: number; targetValueRupees?: number; commissionPerUnitRupees?: number }
) {
  if (!/^\d{4}-\d{2}$/.test(input.period || "")) throw new NetworkError("Choose a month");
  if (input.period < getCurrentPeriod()) throw new NetworkError("Targets cannot be set for a past month");
  const party = await getParty(input.partyType, input.partyId);
  if (!party) throw new NetworkError("Partner not found", 404);
  const who = await targetSetter(user, input.partyType, party);
  const units = Math.floor(Number(input.targetUnits));
  if (!Number.isFinite(units) || units < 0 || units > 100000) throw new NetworkError("Enter a valid unit target");
  const doc = await PartnerTarget.findOneAndUpdate(
    { partyType: input.partyType, party: party._id, period: input.period },
    {
      $set: {
        targetUnits: units,
        targetValue: Math.max(0, rupeesToPaise(Number(input.targetValueRupees || 0))),
        commissionPerUnit: Math.max(0, rupeesToPaise(Number(input.commissionPerUnitRupees || 0))),
        setByType: who.setByType,
        setBy: who.setBy,
        setByUser: oid(user.userId),
      },
    },
    { upsert: true, new: true }
  );
  if (doc.settlement) throw new NetworkError("Commission for this month is already settled");
  await logAudit({ user, action: "UPDATE", resource: "TARGET", resourceId: String(doc._id), after: { party: party.name, period: input.period, units } });
  return doc;
}

/** Targets with achievement for a month, ranked by % achieved. Scope: staff = company-set; partner = its own + its downline's. */
export async function targetBoard(user: JWTPayload, period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new NetworkError("Choose a month");
  let filter: any = { period };
  if (isPartnerRole(user.role)) {
    const me = await myParty(user);
    if (!me) throw new NetworkError("Not linked to a partner", 403);
    filter = { period, $or: [{ setBy: me.id }, { partyType: me.type, party: me.id }] };
  } else if (!(await hasPermission(user.role, "network.view"))) {
    throw new NetworkError("Not allowed", 403);
  }
  const targets = await PartnerTarget.find(filter).lean();
  const rows = [];
  for (const t of targets as any[]) {
    const party = await getParty(t.partyType, t.party);
    if (!party) continue;
    const a = await achievement(t.partyType, party, period);
    rows.push({
      _id: t._id,
      partyType: t.partyType,
      party: t.party,
      partyName: party.name,
      partyCode: party.code,
      tier: tierOf(t.partyType, party),
      city: party.city,
      targetUnits: t.targetUnits,
      targetValue: t.targetValue,
      commissionPerUnit: t.commissionPerUnit,
      achievedUnits: a.units,
      achievedValue: a.value,
      pct: t.targetUnits ? Math.round((a.units / t.targetUnits) * 100) : 0,
      commission: commissionEarned(t, a.units),
      setByType: t.setByType,
      settlement: t.settlement,
      mine: isPartnerRole(user.role) ? null : undefined,
    });
  }
  rows.sort((a, b) => b.pct - a.pct || b.achievedUnits - a.achievedUnits);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Settle a finished month's commission as a credit note. Company targets go to the
 * Business Head and Managing Partner for approval; a partner settles its own downline directly.
 */
export async function settleCommission(user: JWTPayload, targetId: string) {
  if (!mongoose.isValidObjectId(targetId)) throw new NetworkError("Target not found", 404);
  const t = await PartnerTarget.findById(targetId);
  if (!t) throw new NetworkError("Target not found", 404);
  if (t.period >= getCurrentPeriod()) throw new NetworkError("Commission is settled after the month ends");
  if (t.settlement && t.settlement.status !== "REJECTED") throw new NetworkError("Already settled or awaiting approval");
  const party = await getParty(t.partyType, t.party);
  if (!party) throw new NetworkError("Partner not found", 404);
  await targetSetter(user, t.partyType, party);
  const a = await achievement(t.partyType, party, t.period);
  const amount = commissionEarned(t, a.units);
  if (amount <= 0) throw new NetworkError("No commission earned: the unit target was not met");
  if (t.setByType === "COMPANY") {
    t.settlement = { status: "PENDING_APPROVAL", amount, units: a.units, approvals: [] };
    await t.save();
  } else {
    const cn = await generateFyCode("CREDIT_NOTE");
    await LedgerEntry.create({
      bookType: t.setByType,
      book: t.setBy,
      partyType: t.partyType,
      party: t.party,
      type: "CREDIT_NOTE",
      reference: cn,
      debit: 0,
      credit: amount,
      narration: `Target commission ${t.period}: ${a.units} units`,
      createdBy: oid(user.userId),
    });
    t.settlement = { status: "SETTLED", amount, units: a.units, approvals: [], creditNote: cn, settledAt: new Date() };
    await t.save();
  }
  await logAudit({ user, action: "SUBMIT", resource: "TARGET", resourceId: targetId, after: { amount, units: a.units, status: t.settlement!.status } });
  return t;
}

/* ------------------------------------------------------------------ */
/* Territory master                                                    */
/* ------------------------------------------------------------------ */

const PARENT_KIND: Record<TerritoryKind, TerritoryKind | null> = { ZONE: null, DISTRICT: "ZONE", AREA: "DISTRICT" };

export async function createTerritory(user: JWTPayload, input: { kind: TerritoryKind; name: string; code: string; parentId?: string; state?: string }) {
  if (!(await hasPermission(user.role, "network.manage"))) throw new NetworkError("You cannot edit territories", 403);
  if (!["ZONE", "DISTRICT", "AREA"].includes(input.kind)) throw new NetworkError("Choose zone, district or area");
  if (!input.name?.trim() || !input.code?.trim()) throw new NetworkError("Name and code are required");
  if (!/^[A-Z0-9-]{2,16}$/i.test(input.code.trim())) throw new NetworkError("Code: 2–16 letters, digits or dashes");
  const needParent = PARENT_KIND[input.kind];
  let parent: any = null;
  if (needParent) {
    if (!mongoose.isValidObjectId(input.parentId)) throw new NetworkError(`Choose the ${needParent.toLowerCase()} it belongs to`);
    parent = await Territory.findById(input.parentId).lean();
    if (!parent || parent.kind !== needParent) throw new NetworkError(`A ${input.kind.toLowerCase()} must sit inside a ${needParent.toLowerCase()}`);
  }
  if (await Territory.findOne({ code: input.code.trim().toUpperCase() })) throw new NetworkError("That code is already used", 409);
  const t = await Territory.create({ kind: input.kind, name: input.name.trim(), code: input.code.trim().toUpperCase(), parent: parent?._id || null, state: input.state?.trim() || parent?.state || "West Bengal" });
  await logAudit({ user, action: "CREATE", resource: "TERRITORY", resourceId: String(t._id), after: { kind: t.kind, name: t.name } });
  return t;
}

/** Territory tree with the partners allocated in each node. */
export async function territoryTree() {
  const [all, sds, dists, dealers, outlets] = await Promise.all([
    Territory.find({ isActive: true }).sort({ kind: 1, name: 1 }).lean(),
    Distributor.find({ tier: "SUPER_DISTRIBUTOR" }).select("name distributorCode territories status").lean(),
    Distributor.find({ tier: { $ne: "SUPER_DISTRIBUTOR" } }).select("name distributorCode territories status").lean(),
    Dealer.find({ territory: { $ne: null } }).select("name dealerCode tier territory status").lean(),
    Outlet.find({ territory: { $ne: null } }).select("name outletCode territory").lean(),
  ]);
  const node = (t: any): any => ({
    _id: t._id,
    kind: t.kind,
    name: t.name,
    code: t.code,
    state: t.state,
    partners: [
      ...sds.filter((d: any) => (d.territories || []).some((x: any) => same(x, t._id))).map((d: any) => ({ label: TIER_LABEL.SUPER_DISTRIBUTOR, name: d.name, code: d.distributorCode })),
      ...dists.filter((d: any) => (d.territories || []).some((x: any) => same(x, t._id))).map((d: any) => ({ label: "Distributor", name: d.name, code: d.distributorCode })),
      ...dealers.filter((d: any) => same(d.territory, t._id)).map((d: any) => ({ label: d.tier === "SUB_DEALER" ? "Sub dealer" : "Dealer", name: d.name, code: d.dealerCode })),
      ...outlets.filter((o: any) => same(o.territory, t._id)).map((o: any) => ({ label: "Outlet", name: o.name, code: o.outletCode })),
    ],
    children: all.filter((c: any) => same(c.parent, t._id)).map(node),
  });
  return all.filter((t: any) => t.kind === "ZONE").map(node);
}

/* ------------------------------------------------------------------ */
/* Business chain tree                                                  */
/* ------------------------------------------------------------------ */

interface ChainNode {
  type: PartyType | "OUTLET";
  id: string;
  name: string;
  code: string;
  tier: string;
  city: string;
  status: string;
  stock: number;
  outstanding: number; // owed to its supplier
  children: ChainNode[];
}

export async function chainTree(user: JWTPayload): Promise<{ root: string; nodes: ChainNode[] }> {
  const [distributors, dealers, outlets] = await Promise.all([
    Distributor.find().select("name distributorCode tier parent city status assignedASM").lean(),
    Dealer.find().select("name dealerCode tier parentDistributor parentDealer city status assignedASM").lean(),
    Outlet.find().select("name outletCode city status").lean(),
  ]);
  const stockRows = await Vehicle.aggregate([
    { $match: { status: { $in: ["WITH_DISTRIBUTOR", "WITH_DEALER", "ALLOCATED_TO_DEALER", "AT_OUTLET"] } } },
    { $group: { _id: { d: "$currentLocationDistributor", l: "$currentLocationDealer", o: "$currentLocationOutlet", s: "$status" }, n: { $sum: 1 } } },
  ]);
  const stockOf = (kind: "d" | "l" | "o", id: any) => stockRows.filter((r: any) => same(r._id[kind], id)).reduce((s: number, r: any) => s + r.n, 0);
  const balances = await LedgerEntry.aggregate([{ $group: { _id: { p: "$party", b: "$book" }, bal: { $sum: { $subtract: ["$debit", "$credit"] } } } }]);
  const owed = (id: any, book: any) => balances.find((b: any) => same(b._id.p, id) && String(b._id.b ?? null) === String(book ?? null))?.bal || 0;

  const dealerNode = (d: any): ChainNode => {
    const sup = supplierRef("DEALER", d);
    return {
      type: "DEALER",
      id: String(d._id),
      name: d.name,
      code: d.dealerCode,
      tier: d.tier || "DEALER",
      city: d.city,
      status: d.status,
      stock: stockOf("l", d._id),
      outstanding: Math.max(0, owed(d._id, sup ? sup.id : null)),
      children: dealers.filter((s: any) => same(s.parentDealer, d._id)).map(dealerNode),
    };
  };
  const distNode = (d: any): ChainNode => {
    const sup = supplierRef("DISTRIBUTOR", d);
    return {
      type: "DISTRIBUTOR",
      id: String(d._id),
      name: d.name,
      code: d.distributorCode,
      tier: d.tier || "DISTRIBUTOR",
      city: d.city,
      status: d.status,
      stock: stockOf("d", d._id),
      outstanding: Math.max(0, owed(d._id, sup ? sup.id : null)),
      children: [
        ...distributors.filter((c: any) => same(c.parent, d._id)).map(distNode),
        ...dealers.filter((c: any) => same(c.parentDistributor, d._id) && !c.parentDealer).map(dealerNode),
      ],
    };
  };

  if (isPartnerRole(user.role)) {
    const me = await myParty(user);
    if (!me) return { root: "", nodes: [] };
    const doc = me.type === "DISTRIBUTOR" ? distributors.find((d: any) => same(d._id, me.id)) : dealers.find((d: any) => same(d._id, me.id));
    if (!doc) return { root: "", nodes: [] };
    return { root: (doc as any).name, nodes: [me.type === "DISTRIBUTOR" ? distNode(doc) : dealerNode(doc)] };
  }
  if (!(await hasPermission(user.role, "network.view"))) throw new NetworkError("Not allowed", 403);
  const asm = user.role === "ASM" ? user.userId : null;
  const mine = (d: any) => !asm || same(d.assignedASM, asm);
  const nodes: ChainNode[] = [
    ...distributors.filter((d: any) => !d.parent && mine(d)).map(distNode),
    ...dealers.filter((d: any) => !d.parentDistributor && !d.parentDealer && mine(d)).map(dealerNode),
  ];
  if (!asm) {
    nodes.push(
      ...outlets.map((o: any) => ({
        type: "OUTLET" as const,
        id: String(o._id),
        name: o.name,
        code: o.outletCode,
        tier: "OUTLET",
        city: o.city,
        status: o.status,
        stock: stockOf("o", o._id),
        outstanding: 0,
        children: [],
      }))
    );
  }
  const order: Record<string, number> = { SUPER_DISTRIBUTOR: 0, DISTRIBUTOR: 1, DEALER: 2, SUB_DEALER: 3, OUTLET: 4 };
  nodes.sort((a, b) => order[a.tier] - order[b.tier] || a.name.localeCompare(b.name));
  return { root: "Joykali EV Mobility", nodes };
}

/* ------------------------------------------------------------------ */
/* Outlets / showrooms                                                  */
/* ------------------------------------------------------------------ */

export async function createOutlet(user: JWTPayload, input: { name: string; address: string; city: string; pincode?: string; phone?: string; territoryId?: string }) {
  if (!(await hasPermission(user.role, "outlet.manage"))) throw new NetworkError("You cannot create outlets", 403);
  if (!input.name?.trim() || !input.address?.trim() || !input.city?.trim()) throw new NetworkError("Name, address and city are required");
  if (input.pincode && !/^\d{6}$/.test(input.pincode)) throw new NetworkError("Pincode must be 6 digits");
  const o = await Outlet.create({
    outletCode: await generateOutletCode(),
    name: input.name.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    pincode: input.pincode || "",
    phone: input.phone || "",
    territory: mongoose.isValidObjectId(input.territoryId) ? input.territoryId : null,
    createdBy: oid(user.userId),
  });
  await logAudit({ user, action: "CREATE", resource: "OUTLET", resourceId: String(o._id), after: { code: o.outletCode, name: o.name } });
  return o;
}

/** The outlet an OUTLET login (or an FEC posted at a showroom) works at. */
export async function outletOfUser(user: JWTPayload) {
  const u: any = await User.findById(user.userId).select("outlet").lean();
  return u?.outlet || null;
}

export async function canSeeOutlet(user: JWTPayload, outletId: any) {
  if (await hasPermission(user.role, "outlet.manage")) return true;
  if (user.role === "OUTLET" || user.role === "FEC") return same(await outletOfUser(user), outletId);
  return hasPermission(user.role, "outlet.view");
}

/** Send company stock from the warehouse to an outlet (or back). Branch transfer — no invoice. */
export async function createStockTransfer(user: JWTPayload, input: { outletId: string; direction: "TO_OUTLET" | "TO_WAREHOUSE"; vehicleIds: string[]; remarks?: string }) {
  if (!mongoose.isValidObjectId(input.outletId)) throw new NetworkError("Outlet not found", 404);
  const outlet = await Outlet.findById(input.outletId).lean();
  if (!outlet || outlet.status !== "ACTIVE") throw new NetworkError("Outlet not found or inactive", 404);
  const dir = input.direction === "TO_WAREHOUSE" ? "TO_WAREHOUSE" : "TO_OUTLET";
  // Warehouse staff send out; the outlet itself may send stock back.
  if (dir === "TO_OUTLET" && !(await hasPermission(user.role, "outlet.manage"))) throw new NetworkError("Only stock controllers can send stock to an outlet", 403);
  if (dir === "TO_WAREHOUSE" && !(await hasPermission(user.role, "outlet.manage")) && !(user.role === "OUTLET" && same(await outletOfUser(user), outlet._id))) {
    throw new NetworkError("Not allowed", 403);
  }
  const ids = [...new Set((input.vehicleIds || []).filter((v) => mongoose.isValidObjectId(v)))];
  if (!ids.length) throw new NetworkError("Pick at least one vehicle");
  const from = dir === "TO_OUTLET" ? { status: "IN_STOCK", currentLocationType: "WAREHOUSE" } : { status: "AT_OUTLET", currentLocationOutlet: outlet._id };
  const vehicles = await Vehicle.find({ _id: { $in: ids }, ...from }).populate("model", "name variant").lean();
  if (vehicles.length !== ids.length) throw new NetworkError(dir === "TO_OUTLET" ? "Some vehicles are not free in the warehouse" : "Some vehicles are not at this outlet", 409);

  const transfer = await withTransaction(async (session) => {
    const code = await generateFyCode("STOCK_TRANSFER", new Date(), session);
    const [t] = await StockTransfer.create(
      [
        {
          transferCode: code,
          direction: dir,
          outlet: outlet._id,
          outletName: outlet.name,
          vehicles: vehicles.map((v: any) => ({ vehicle: v._id, chassisNumber: v.chassisNumber, modelName: `${v.model?.name || ""} ${v.model?.variant || ""}`.trim() })),
          createdBy: oid(user.userId),
          createdByName: user.name,
          remarks: input.remarks?.trim(),
        },
      ],
      { session }
    );
    const r = await Vehicle.updateMany({ _id: { $in: ids }, ...from }, { $set: { status: "IN_TRANSIT", currentLocationType: "IN_TRANSIT", transfer: t._id } }, { session });
    if (r.modifiedCount !== ids.length) throw new NetworkError("Stock changed while saving — try again", 409);
    await StockMovement.create(
      vehicles.map((v: any) => ({
        vehicle: v._id,
        movementType: "OUTLET_TRANSFER",
        fromLocation: dir === "TO_OUTLET" ? "Main Warehouse" : `Outlet: ${outlet.name}`,
        toLocation: dir === "TO_OUTLET" ? `In transit to ${outlet.name}` : "In transit to warehouse",
        performedBy: oid(user.userId),
        reference: code,
        timestamp: new Date(),
      })),
      { session, ordered: true }
    );
    return t;
  });
  await logAudit({ user, action: "DISPATCH", resource: "OUTLET", resourceId: String(transfer._id), after: { code: transfer.transferCode, dir, units: ids.length } });
  return transfer;
}

export async function receiveStockTransfer(user: JWTPayload, id: string) {
  if (!mongoose.isValidObjectId(id)) throw new NetworkError("Transfer not found", 404);
  const t = await StockTransfer.findById(id);
  if (!t) throw new NetworkError("Transfer not found", 404);
  if (t.status !== "IN_TRANSIT") throw new NetworkError(`Already ${t.status.toLowerCase()}`);
  if (t.direction === "TO_OUTLET") {
    const atOutlet = user.role === "OUTLET" && same(await outletOfUser(user), t.outlet);
    if (!atOutlet && !(await hasPermission(user.role, "outlet.manage"))) throw new NetworkError("Only the receiving outlet can confirm", 403);
    if (same(t.createdBy, user.userId)) throw new NetworkError("The sender cannot also confirm receipt", 403);
  } else if (!(await hasPermission(user.role, "outlet.manage"))) {
    throw new NetworkError("Only warehouse staff can receive returns", 403);
  }
  const to =
    t.direction === "TO_OUTLET"
      ? { status: "AT_OUTLET", currentLocationType: "OUTLET", currentLocationOutlet: t.outlet, transfer: null }
      : { status: "IN_STOCK", currentLocationType: "WAREHOUSE", currentLocationOutlet: null, transfer: null };
  await withTransaction(async (session) => {
    await Vehicle.updateMany({ transfer: t._id }, { $set: to }, { session });
    await StockMovement.create(
      t.vehicles.map((v) => ({
        vehicle: v.vehicle,
        movementType: "OUTLET_TRANSFER",
        fromLocation: "In transit",
        toLocation: t.direction === "TO_OUTLET" ? `Outlet: ${t.outletName}` : "Main Warehouse",
        performedBy: oid(user.userId),
        reference: t.transferCode,
        timestamp: new Date(),
      })),
      { session, ordered: true }
    );
    t.status = "RECEIVED";
    t.receivedByName = user.name;
    t.receivedAt = new Date();
    await t.save({ session });
  });
  await logAudit({ user, action: "RECEIVE", resource: "OUTLET", resourceId: id, after: { code: t.transferCode } });
  return t;
}

/** Counter summary for one IST day: bills, collections by mode, stock on hand. */
export async function outletDay(outletId: any, dateStr?: string) {
  const day = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 86400000 - 1);
  const [sales, stock, incoming] = await Promise.all([
    Sale.find({ outlet: oid(outletId), status: { $ne: "CANCELLED" }, saleDate: { $gte: start, $lte: end } })
      .populate({ path: "vehicle", select: "chassisNumber model", populate: { path: "model", select: "name variant" } })
      .populate("soldBy", "name employeeCode")
      .lean(),
    Vehicle.find({ status: "AT_OUTLET", currentLocationOutlet: oid(outletId) }).populate("model", "name variant sellingPrice").lean(),
    StockTransfer.find({ outlet: oid(outletId), status: "IN_TRANSIT" }).sort({ createdAt: -1 }).lean(),
  ]);
  const byMode: Record<string, number> = {};
  let billed = 0;
  for (const s of sales as any[]) {
    billed += s.totalAmount;
    for (const p of s.payments || []) {
      const at = new Date(p.date);
      if (at >= start && at <= end) byMode[p.mode] = (byMode[p.mode] || 0) + p.amount;
    }
  }
  return { day, sales, billed, collected: byMode, stock, incoming };
}

/* ------------------------------------------------------------------ */
/* Partner stock                                                        */
/* ------------------------------------------------------------------ */

export async function partnerStock(partyType: PartyType, partyId: any) {
  const party = await getParty(partyType, partyId);
  if (!party) throw new NetworkError("Partner not found", 404);
  const owned = await Vehicle.find(ownedStockFilter(partyType, partyId)).populate("model", "name variant category sellingPrice").sort({ updatedAt: -1 }).lean();
  const consignment =
    partyType === "DEALER"
      ? await Vehicle.find({ status: "ALLOCATED_TO_DEALER", currentLocationDealer: oid(partyId) }).populate("model", "name variant category sellingPrice").lean()
      : [];
  return { owned, consignment };
}
