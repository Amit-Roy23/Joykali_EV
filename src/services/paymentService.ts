import mongoose from "mongoose";
import { JWTPayload, isPartnerRole } from "@/types";
import { LedgerEntry } from "@/models/LedgerEntry";
import { PaymentAdvice } from "@/models/PaymentAdvice";
import { MoneyAccount } from "@/models/Accounts";
import { StoredFile } from "@/models/StoredFile";
import { Dealer } from "@/models/Dealer";
import { Distributor } from "@/models/Distributor";
import { generateFyCode } from "@/lib/codeGenerator";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { myParty, partyScope } from "@/lib/partyAccess";
import { istDay, YMD } from "@/lib/accounting";
import { getParty, supplierRef } from "./creditService";
import { accountBalances, ensureAccounts } from "./accountsService";
import { notifyParty, notifyRoles, notifyUsers, partyStaffIds } from "./notificationService";

export class PaymentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export const PAYMENT_MODES = ["NEFT", "RTGS", "IMPS", "UPI", "CHEQUE", "CASH"] as const;
export type PayMode = (typeof PAYMENT_MODES)[number];
export const MODE_LABEL: Record<string, string> = { NEFT: "NEFT", RTGS: "RTGS", IMPS: "IMPS", UPI: "UPI", CHEQUE: "Cheque", CASH: "Cash", BANK: "Bank transfer" };

const oid = (v: any) => new mongoose.Types.ObjectId(String(v));
const toPaise = (r: any) => Math.round(Number(r) * 100);
const normRef = (s?: string) => String(s || "").replace(/\s+/g, "").toUpperCase();
const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

/** Basic sanity of a bank reference for each mode. */
function checkRef(mode: string, ref: string) {
  if (mode === "CASH") return;
  if (!ref) throw new PaymentError(mode === "CHEQUE" ? "Enter the cheque number" : "Enter the UTR / transaction reference");
  if (mode === "CHEQUE" && !/^\d{6}$/.test(ref)) throw new PaymentError("Cheque number must be 6 digits");
  if (["NEFT", "RTGS", "IMPS"].includes(mode) && !/^[A-Z0-9]{10,22}$/.test(ref)) throw new PaymentError(`${mode} UTR should be 10–22 letters / digits`);
  if (mode === "UPI" && !/^[A-Z0-9]{8,22}$/.test(ref)) throw new PaymentError("UPI reference should be 8–22 letters / digits");
}

/** The same UTR / cheque cannot be counted twice. */
async function assertRefFree(ref: string, exceptAdvice?: any) {
  if (!ref) return;
  const used: any = await LedgerEntry.findOne({ type: "PAYMENT", book: null, utr: ref }).select("reference").lean();
  if (used) throw new PaymentError(`Reference ${ref} is already recorded on receipt ${used.reference}`, 409);
  const open: any = await PaymentAdvice.findOne({ utr: ref, status: { $in: ["SUBMITTED", "VERIFIED"] }, ...(exceptAdvice ? { _id: { $ne: exceptAdvice } } : {}) }).select("code").lean();
  if (open) throw new PaymentError(`Reference ${ref} was already reported on ${open.code}`, 409);
}

function payDay(d?: string) {
  const date = d || istDay(new Date());
  if (!YMD.test(date)) throw new PaymentError("Choose the payment date");
  if (date > istDay(new Date())) throw new PaymentError("Payment date cannot be in the future");
  return date;
}

async function companyParty(partyType: "DEALER" | "DISTRIBUTOR", partyId: string) {
  if (!mongoose.isValidObjectId(partyId)) throw new PaymentError("Partner not found", 404);
  const party: any = await getParty(partyType, partyId);
  if (!party) throw new PaymentError("Partner not found", 404);
  if (supplierRef(partyType, party)) throw new PaymentError(`${party.name} pays its own supplier, not the company. Their supplier records the payment.`);
  return party;
}

export interface ReceiptInput {
  partyType: "DEALER" | "DISTRIBUTOR";
  partyId: string;
  amountRupees: number;
  mode: string;
  utr?: string;
  date?: string;
  accountId?: string;
  payerBank?: string;
  narration?: string;
}

/**
 * Record money received from a dealer / distributor into a company cash or bank account.
 * Cash goes to a cash account; everything else to a bank account. A UTR / cheque is never counted twice.
 */
export async function recordReceipt(user: JWTPayload, input: ReceiptInput, adviceId?: any) {
  const party = await companyParty(input.partyType, input.partyId);
  const amount = toPaise(input.amountRupees);
  if (!Number.isFinite(amount) || amount <= 0) throw new PaymentError("Enter the amount received");
  const mode = String(input.mode || "").toUpperCase();
  if (!(PAYMENT_MODES as readonly string[]).includes(mode)) throw new PaymentError("Choose how the money was paid");
  const ref = normRef(input.utr);
  checkRef(mode, ref);
  await assertRefFree(ref, adviceId);
  const date = payDay(input.date);
  await ensureAccounts();
  const account: any = input.accountId && mongoose.isValidObjectId(input.accountId)
    ? await MoneyAccount.findById(input.accountId).lean()
    : await MoneyAccount.findOne({ kind: mode === "CASH" ? "CASH" : "BANK", isDefault: true }).lean();
  if (!account || account.status !== "ACTIVE") throw new PaymentError("Choose the account the money came into");
  if (mode === "CASH" && account.kind !== "CASH") throw new PaymentError("Cash goes into a cash account");
  if (mode !== "CASH" && account.kind !== "BANK") throw new PaymentError(`${MODE_LABEL[mode]} goes into a bank account`);
  if (date < account.openingDate) throw new PaymentError(`${account.name} starts on ${account.openingDate}`);
  const receiptNo = await generateFyCode("RECEIPT", new Date(`${date}T12:00:00+05:30`));
  const entry = await LedgerEntry.create({
    partyType: input.partyType,
    party: oid(input.partyId),
    date: new Date(`${date}T12:00:00+05:30`),
    type: "PAYMENT",
    reference: receiptNo,
    debit: 0,
    credit: amount,
    paymentMode: mode,
    account: account._id,
    utr: ref || undefined,
    payerBank: input.payerBank?.trim(),
    advice: adviceId || null,
    // Cash is in hand at once; bank money is "cleared" when it is seen on the statement.
    cleared: mode === "CASH" ? { at: new Date(), statementDate: date, byName: user.name } : null,
    narration: [MODE_LABEL[mode], ref, input.narration?.trim()].filter(Boolean).join(" · "),
    createdBy: oid(user.userId),
  });
  await logAudit({ user, action: "PAYMENT", resource: "LEDGER", resourceId: String(entry._id), after: { party: party.name, amount, receiptNo, mode, ref, account: account.name } });
  await notifyParty(input.partyType, input.partyId, {
    kind: "PAYMENT",
    title: `Payment of ${rs(amount)} received — receipt ${receiptNo}`,
    body: `${MODE_LABEL[mode]}${ref ? ` ${ref}` : ""} on ${date}. Your account is updated.`,
    href: "/partner/payments",
  });
  return entry;
}

/* ------------------------------------------------------------------ */
/* Payment advices from partners                                        */
/* ------------------------------------------------------------------ */

export async function submitAdvice(
  user: JWTPayload,
  input: { amountRupees: number; date: string; mode: string; utr?: string; payerBank?: string; note?: string; proof?: { name: string; type: string; data: Buffer } | null }
) {
  const me = await myParty(user);
  if (!me) throw new PaymentError("Your login is not linked to a partner account", 403);
  const party = await companyParty(me.type, String(me.id));
  const amount = toPaise(input.amountRupees);
  if (!Number.isFinite(amount) || amount <= 0) throw new PaymentError("Enter the amount you paid");
  const mode = String(input.mode || "").toUpperCase();
  if (!(PAYMENT_MODES as readonly string[]).includes(mode)) throw new PaymentError("Choose how you paid");
  const ref = normRef(input.utr);
  checkRef(mode, ref);
  await assertRefFree(ref);
  const date = payDay(input.date);
  if (mode !== "CASH" && !input.proof) throw new PaymentError("Attach the payment screenshot or the bank slip");
  let proof = null;
  if (input.proof) {
    if (input.proof.data.length > 3 * 1024 * 1024) throw new PaymentError("File larger than 3 MB");
    if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(input.proof.type)) throw new PaymentError("Upload a PDF, JPG or PNG");
    proof = (await StoredFile.create({ name: input.proof.name, contentType: input.proof.type, size: input.proof.data.length, data: input.proof.data, uploadedBy: oid(user.userId) }))._id;
  }
  const a = await PaymentAdvice.create({
    code: await generateFyCode("PAYMENT_ADVICE"),
    partyType: me.type,
    party: me.id,
    partyName: party.name,
    amount,
    date,
    mode,
    utr: ref,
    payerBank: input.payerBank?.trim(),
    note: input.note?.trim(),
    proof,
    submittedBy: oid(user.userId),
    submittedByName: user.name,
  });
  await logAudit({ user, action: "SUBMIT", resource: "LEDGER", resourceId: String(a._id), after: { code: a.code, amount, mode, ref } });
  const notice = { kind: "PAYMENT", title: `${party.name} reports a payment of ${rs(amount)}`, body: `${MODE_LABEL[mode]}${ref ? ` ${ref}` : ""} on ${date} — check the bank and confirm.`, href: "/payments" };
  await notifyRoles(["ACCOUNTANT"], notice);
  await notifyUsers(await partyStaffIds(me.type, me.id), notice);
  return a;
}

export async function withdrawAdvice(user: JWTPayload, id: string) {
  const me = await myParty(user);
  const a = await PaymentAdvice.findById(mongoose.isValidObjectId(id) ? id : null);
  if (!a || !me || String(a.party) !== String(me.id)) throw new PaymentError("Not found", 404);
  if (a.status !== "SUBMITTED") throw new PaymentError("Only an unconfirmed advice can be withdrawn");
  a.status = "WITHDRAWN";
  await a.save();
  return a;
}

/** Accounts confirms the money is in the bank → receipt posted to the partner's account. */
export async function verifyAdvice(user: JWTPayload, id: string, input: { accountId: string; date?: string }) {
  const a = await PaymentAdvice.findById(mongoose.isValidObjectId(id) ? id : null);
  if (!a) throw new PaymentError("Advice not found", 404);
  if (a.status !== "SUBMITTED") throw new PaymentError(`Advice is already ${a.status.toLowerCase()}`);
  if (String(a.submittedBy) === user.userId) throw new PaymentError("You cannot confirm your own advice", 403);
  const entry = await recordReceipt(
    user,
    { partyType: a.partyType, partyId: String(a.party), amountRupees: a.amount / 100, mode: a.mode, utr: a.utr, date: input.date || a.date, accountId: input.accountId, payerBank: a.payerBank, narration: `against ${a.code}` },
    a._id
  );
  a.status = "VERIFIED";
  a.receipt = entry._id as any;
  a.receiptNo = entry.reference;
  a.decidedByName = user.name;
  a.decidedAt = new Date();
  await a.save();
  return a;
}

export async function rejectAdvice(user: JWTPayload, id: string, reason: string) {
  const a = await PaymentAdvice.findById(mongoose.isValidObjectId(id) ? id : null);
  if (!a) throw new PaymentError("Advice not found", 404);
  if (a.status !== "SUBMITTED") throw new PaymentError(`Advice is already ${a.status.toLowerCase()}`);
  if (!reason?.trim()) throw new PaymentError("Say why — e.g. not seen in the bank, amount differs");
  a.status = "REJECTED";
  a.rejectReason = reason.trim();
  a.decidedByName = user.name;
  a.decidedAt = new Date();
  await a.save();
  await logAudit({ user, action: "REJECT", resource: "LEDGER", resourceId: id, after: { code: a.code, reason } });
  await notifyParty(a.partyType, a.party, { kind: "PAYMENT", title: `Payment advice ${a.code} not accepted`, body: reason.trim(), href: "/partner/payments" });
  return a;
}

/* ------------------------------------------------------------------ */
/* Registers                                                           */
/* ------------------------------------------------------------------ */

async function scopeFilter(user: JWTPayload) {
  if (isPartnerRole(user.role)) {
    const me = await myParty(user);
    if (!me) throw new PaymentError("Not linked to a partner", 403);
    return { partyType: me.type, party: me.id };
  }
  const scope = await partyScope(user);
  if (!scope) return {};
  return { $or: [{ partyType: "DEALER", party: { $in: scope.DEALER } }, { partyType: "DISTRIBUTOR", party: { $in: scope.DISTRIBUTOR } }] };
}

/** Every payment received from partners, with mode, reference, account and bank status. */
export async function receiptRegister(user: JWTPayload, q: { from?: string; to?: string; mode?: string; account?: string; cleared?: string; party?: string }) {
  const f: any = { type: "PAYMENT", book: null, ...(await scopeFilter(user)) };
  if (q.from && YMD.test(q.from)) f.date = { ...(f.date || {}), $gte: new Date(`${q.from}T00:00:00+05:30`) };
  if (q.to && YMD.test(q.to)) f.date = { ...(f.date || {}), $lte: new Date(`${q.to}T23:59:59.999+05:30`) };
  if (q.mode) f.paymentMode = q.mode;
  if (q.account && mongoose.isValidObjectId(q.account)) f.account = oid(q.account);
  if (q.cleared === "yes") f.cleared = { $ne: null };
  if (q.cleared === "no") f.cleared = null;
  if (q.party && mongoose.isValidObjectId(q.party)) f.party = oid(q.party);
  const rows: any[] = await LedgerEntry.find(f).populate("account", "name kind").sort({ date: -1, createdAt: -1 }).limit(1000).lean();
  const names = new Map<string, any>();
  const ids = (t: string) => [...new Set(rows.filter((r) => r.partyType === t).map((r) => String(r.party)))].map(oid);
  for (const d of await Dealer.find({ _id: { $in: ids("DEALER") } }).select("name dealerCode city").lean()) names.set(String(d._id), { name: d.name, code: (d as any).dealerCode, city: d.city });
  for (const d of await Distributor.find({ _id: { $in: ids("DISTRIBUTOR") } }).select("name distributorCode city").lean()) names.set(String(d._id), { name: d.name, code: (d as any).distributorCode, city: d.city });
  const list = rows.map((r) => ({ ...r, partyName: names.get(String(r.party))?.name || "Partner", partyCode: names.get(String(r.party))?.code || "", modeLabel: MODE_LABEL[r.paymentMode] || r.paymentMode || "—" }));
  const byMode: Record<string, number> = {};
  for (const r of list) byMode[r.modeLabel] = (byMode[r.modeLabel] || 0) + r.credit;
  return {
    rows: list,
    total: list.reduce((s, r) => s + r.credit, 0),
    byMode,
    uncleared: list.filter((r) => !r.cleared).reduce((s, r) => s + r.credit, 0),
  };
}

export async function adviceList(user: JWTPayload, status?: string) {
  const f: any = { ...(await scopeFilter(user)) };
  if (status) f.status = { $in: status.split(",") };
  return PaymentAdvice.find(f).sort({ createdAt: -1 }).limit(300).lean();
}

/** Tick receipts as seen on the bank statement (or untick a mistake). */
export async function setCleared(user: JWTPayload, ids: string[], statementDate: string | null) {
  if (!(await hasPermission(user.role, "ledger.manage")) && !(await hasPermission(user.role, "accounts.manage"))) throw new PaymentError("Not allowed", 403);
  if (statementDate && (!YMD.test(statementDate) || statementDate > istDay(new Date()))) throw new PaymentError("Choose the bank statement date");
  const valid = (ids || []).filter((i) => mongoose.isValidObjectId(i)).map(oid);
  if (!valid.length) throw new PaymentError("Pick at least one receipt");
  const entries = await LedgerEntry.find({ _id: { $in: valid }, type: "PAYMENT", book: null }).lean();
  for (const e of entries as any[]) {
    if (e.paymentMode === "CASH") throw new PaymentError(`${e.reference} is cash — nothing to match in the bank`);
    if (statementDate && statementDate < istDay(e.date)) throw new PaymentError(`${e.reference}: the bank date cannot be before the payment date`);
  }
  await LedgerEntry.updateMany({ _id: { $in: entries.map((e: any) => e._id) } }, { $set: { cleared: statementDate ? { at: new Date(), statementDate, byName: user.name } : null } });
  await logAudit({ user, action: "UPDATE", resource: "LEDGER", resourceId: "bank-reconciliation", after: { receipts: entries.length, statementDate } });
  return { updated: entries.length };
}

/**
 * Bank reconciliation for one bank account on a date: balance as per books, less partner
 * receipts not yet seen in the bank = balance the bank statement should show.
 */
export async function bankReconciliation(accountId: string, asOf?: string) {
  if (!mongoose.isValidObjectId(accountId)) throw new PaymentError("Choose a bank account");
  const day = asOf && YMD.test(asOf) ? asOf : istDay(new Date());
  const acc: any = await MoneyAccount.findById(accountId).lean();
  if (!acc || acc.kind !== "BANK") throw new PaymentError("Choose a bank account");
  const book = (await accountBalances(day)).find((a: any) => String(a._id) === String(acc._id))?.balance || 0;
  const pending: any[] = await LedgerEntry.find({
    type: "PAYMENT",
    book: null,
    account: acc._id,
    date: { $lte: new Date(`${day}T23:59:59.999+05:30`) },
    $or: [{ cleared: null }, { "cleared.statementDate": { $gt: day } }],
  })
    .sort({ date: 1 })
    .lean();
  const notInBank = pending.reduce((s, e) => s + e.credit, 0);
  return { account: acc, asOf: day, bookBalance: book, notInBank, expectedBank: book - notInBank, pending };
}
