import { userCan } from "@/lib/grants";
import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import { MoneyAccount, PaymentRequest, Voucher } from "@/models/Accounts";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { generateFyCode } from "@/lib/codeGenerator";
import { createVoucher, voucherHeads } from "./accountsService";
import { notifyRoles, notifyUsers } from "./notificationService";

/**
 * Payment and fund-transfer requests.
 *
 *  raise (what for, how much, to whom / from → to)
 *    → approve or reject — Admin, Business Head or Managing Partner (`payment.approve`), never the requester
 *    → the cashier (`accounts.manage`) pays: a payment voucher (or a contra voucher for a transfer) is
 *      posted, so it shows in the cash / bank book, P&L and budget
 *    → the requester, the approver, the Admin and the Business Head are told.
 * A request raised by an approver is their instruction: approved at once, waiting for the cashier.
 */

export class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const oid = (v: any) => new mongoose.Types.ObjectId(String(v));
const same = (a: any, b: any) => !!a && !!b && String(a) === String(b);
const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const APPROVER_ROLES = ["BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"];

/** Direction of a transfer between two accounts, with its contra head. */
export function transferKind(fromKind: string, toKind: string) {
  if (fromKind === "CASH" && toKind === "BANK") return { label: "Cash → Bank (deposit)", head: "Cash deposited in bank" };
  if (fromKind === "BANK" && toKind === "CASH") return { label: "Bank → Cash in hand (withdrawal)", head: "Cash withdrawn from bank" };
  if (fromKind === "BANK" && toKind === "BANK") return { label: "Bank → Bank", head: "Transfer between banks" };
  return { label: "Cash → Cash", head: "Transfer between cash accounts" };
}

export interface RequestInput {
  type: "PAYMENT" | "TRANSFER";
  amountRupees: number;
  purpose: string;
  head?: string;
  payee?: string;
  accountId?: string;
  toAccountId?: string;
  preferredMode?: string;
  neededBy?: string;
}

async function activeAccount(id: any, label: string) {
  if (!id || !mongoose.isValidObjectId(id)) throw new RequestError(`Choose the ${label}`);
  const a: any = await MoneyAccount.findById(id).lean();
  if (!a || a.status !== "ACTIVE") throw new RequestError(`The ${label} is not an active cash / bank account`);
  return a;
}

export async function createRequest(user: JWTPayload, input: RequestInput) {
  const [canRaise, isApprover] = await Promise.all([
    Promise.all([userCan(user, "expense.create"), userCan(user, "accounts.manage")]).then((x) => x.some(Boolean)),
    hasPermission(user.role, "payment.approve"),
  ]);
  if (!canRaise && !isApprover) throw new RequestError("You cannot raise payment requests", 403);
  const type = input.type === "TRANSFER" ? "TRANSFER" : "PAYMENT";
  const amount = Math.round(Number(input.amountRupees) * 100);
  if (!Number.isFinite(amount) || amount <= 0) throw new RequestError("Enter the amount");
  if (amount > 1e11) throw new RequestError("Amount is too large");
  const purpose = String(input.purpose || "").trim();
  if (purpose.length < 3) throw new RequestError("Write what the money is for");
  if (input.neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(input.neededBy)) throw new RequestError("Choose a valid date");

  let head = String(input.head || "").trim();
  let account: any = null;
  let to: any = null;
  if (type === "TRANSFER") {
    account = await activeAccount(input.accountId, "account the money leaves");
    to = await activeAccount(input.toAccountId, "account the money goes to");
    if (same(account._id, to._id)) throw new RequestError("Choose two different accounts");
    head = transferKind(account.kind, to.kind).head;
  } else {
    const heads = (await voucherHeads()).PAYMENT;
    if (!heads.includes(head)) throw new RequestError("Choose what kind of payment this is (account head)");
    if (input.accountId) account = await activeAccount(input.accountId, "account");
  }

  const code = await generateFyCode("PAYMENT_REQUEST");
  const r = await PaymentRequest.create({
    code,
    type,
    amount,
    purpose,
    head,
    payee: input.payee?.trim() || undefined,
    account: account?._id || null,
    toAccount: to?._id || null,
    preferredMode: input.preferredMode?.trim() || undefined,
    neededBy: input.neededBy || undefined,
    status: isApprover ? "APPROVED" : "PENDING",
    requestedBy: oid(user.userId),
    requestedByName: user.name,
    requestedByRole: user.role,
    decision: isApprover ? { by: oid(user.userId), byName: user.name, role: user.role, at: new Date(), note: "Raised as an instruction by an approver" } : null,
  });
  const what = describe(r, account, to);
  if (isApprover) {
    await notifyRoles(["ACCOUNTANT"], { kind: "payment", title: `To pay: ${code} · ${rupees(amount)}`, body: `${what} — instruction from ${user.name}. Pay it from Accounts → Payment requests.`, href: "/accounts/requests" }, user.userId);
  } else {
    await notifyRoles(APPROVER_ROLES, { kind: "approval", title: `Payment request waiting for approval: ${code} · ${rupees(amount)}`, body: `${what} — asked by ${user.name}.`, href: "/accounts/requests" }, user.userId);
  }
  await logAudit({ user, action: "CREATE", resource: "ACCOUNTS", resourceId: String(r._id), after: { code, type, amount, purpose, status: r.status } });
  return r;
}

function describe(r: any, from?: any, to?: any) {
  if (r.type === "TRANSFER") return `${transferKind(from?.kind, to?.kind).label}: ${from?.name || "?"} → ${to?.name || "?"} — ${r.purpose}`;
  return `${r.head}${r.payee ? ` to ${r.payee}` : ""} — ${r.purpose}`;
}

export async function decideRequest(user: JWTPayload, id: string, decision: "APPROVED" | "REJECTED", note?: string) {
  if (!(await hasPermission(user.role, "payment.approve"))) throw new RequestError("Only the Admin, Business Head or Managing Partner approve payments", 403);
  if (!mongoose.isValidObjectId(id)) throw new RequestError("Request not found", 404);
  const r = await PaymentRequest.findById(id);
  if (!r) throw new RequestError("Request not found", 404);
  if (r.status !== "PENDING") throw new RequestError(`This request is already ${r.status.toLowerCase()}`);
  if (same(r.requestedBy, user.userId)) throw new RequestError("You cannot approve your own request", 403);
  if (decision === "REJECTED" && !note?.trim()) throw new RequestError("Give a reason for rejecting");
  r.status = decision === "APPROVED" ? "APPROVED" : "REJECTED";
  r.decision = { by: oid(user.userId), byName: user.name, role: user.role, at: new Date(), note: note?.trim() || undefined };
  await r.save();
  const [from, to] = await Promise.all([r.account ? MoneyAccount.findById(r.account).lean() : null, r.toAccount ? MoneyAccount.findById(r.toAccount).lean() : null]);
  const what = describe(r, from, to);
  if (r.status === "APPROVED") {
    await notifyRoles(["ACCOUNTANT"], { kind: "payment", title: `Approved — ready to pay: ${r.code} · ${rupees(r.amount)}`, body: `${what} — approved by ${user.name}. Pay it from Accounts → Payment requests.`, href: "/accounts/requests" }, user.userId);
    await notifyUsers([r.requestedBy], { kind: "approval", title: `Your request ${r.code} is approved`, body: `${rupees(r.amount)} — ${r.purpose}. The cashier will pay it.`, href: "/accounts/requests" }, user.userId);
  } else {
    await notifyUsers([r.requestedBy], { kind: "approval", title: `Your request ${r.code} was rejected`, body: `${rupees(r.amount)} — ${r.purpose}. Reason: ${note}`, href: "/accounts/requests" }, user.userId);
  }
  await logAudit({ user, action: decision === "APPROVED" ? "APPROVE" : "REJECT", resource: "ACCOUNTS", resourceId: id, after: { code: r.code, amount: r.amount, note } });
  return r;
}

/** The cashier carries out an approved request: payment voucher (or contra for a transfer). */
export async function payRequest(user: JWTPayload, id: string, input: { accountId?: string; date?: string; reference?: string }) {
  if (!(await userCan(user, "accounts.manage"))) throw new RequestError("Only the cashier / accounts can pay", 403);
  if (!mongoose.isValidObjectId(id)) throw new RequestError("Request not found", 404);
  // claim it first so two clicks cannot pay twice
  const r = await PaymentRequest.findOneAndUpdate({ _id: id, status: "APPROVED", payment: null }, { $set: { status: "PAID" } }, { new: false });
  if (!r) {
    const cur: any = await PaymentRequest.findById(id).lean();
    if (!cur) throw new RequestError("Request not found", 404);
    throw new RequestError(cur.status === "PENDING" ? "This request is waiting for approval" : `This request is ${cur.status.toLowerCase()}`);
  }
  const date = input.date || today();
  try {
    const fromId = r.type === "TRANSFER" ? r.account : input.accountId || r.account;
    if (!fromId) throw new RequestError("Choose the account to pay from");
    const v = await createVoucher(user, {
      type: r.type === "TRANSFER" ? "CONTRA" : "PAYMENT",
      date,
      accountId: String(fromId),
      toAccountId: r.toAccount ? String(r.toAccount) : undefined,
      amountRupees: r.amount / 100,
      head: r.head,
      narration: `${r.purpose}${r.payee ? ` — ${r.payee}` : ""} (${r.code}, approved by ${r.decision?.byName || "—"})`,
      reference: [r.code, input.reference?.trim()].filter(Boolean).join(" · "),
    });
    await Voucher.updateOne({ _id: v._id }, { $set: { request: r._id } });
    const acc: any = await MoneyAccount.findById(fromId).lean();
    const to: any = r.toAccount ? await MoneyAccount.findById(r.toAccount).lean() : null;
    await PaymentRequest.updateOne(
      { _id: r._id },
      { $set: { payment: { account: acc._id, accountName: acc.name, date, mode: acc.kind, reference: input.reference?.trim(), by: oid(user.userId), byName: user.name, at: new Date(), voucher: v._id } } }
    );
    const what = describe(r, acc, to);
    const notice = {
      kind: "payment",
      title: `${r.type === "TRANSFER" ? "Transfer done" : "Paid"}: ${r.code} · ${rupees(r.amount)}`,
      body: `${what} — ${r.type === "TRANSFER" ? "moved" : `paid from ${acc.name}`} by ${user.name} on ${date}${input.reference?.trim() ? ` (ref ${input.reference.trim()})` : ""}.`,
      href: "/accounts/requests",
    };
    await notifyUsers([r.requestedBy, r.decision?.by], notice, user.userId);
    await notifyRoles(["ADMIN", "BUSINESS_HEAD"], notice, user.userId);
    await logAudit({ user, action: "PAYMENT", resource: "ACCOUNTS", resourceId: id, after: { code: r.code, amount: r.amount, account: acc.name, voucher: v.code } });
    return PaymentRequest.findById(id).lean();
  } catch (e) {
    // the voucher failed (e.g. not enough cash) — the request goes back to approved
    await PaymentRequest.updateOne({ _id: r._id, payment: null }, { $set: { status: "APPROVED" } });
    throw e;
  }
}

export async function cancelRequest(user: JWTPayload, id: string, reason: string) {
  if (!mongoose.isValidObjectId(id)) throw new RequestError("Request not found", 404);
  const r = await PaymentRequest.findById(id);
  if (!r) throw new RequestError("Request not found", 404);
  if (!["PENDING", "APPROVED"].includes(r.status)) throw new RequestError(`This request is already ${r.status.toLowerCase()}`);
  const mine = same(r.requestedBy, user.userId);
  if (!mine && !(await hasPermission(user.role, "payment.approve"))) throw new RequestError("Only the person who asked, or an approver, can cancel", 403);
  if (!reason?.trim()) throw new RequestError("Give a reason");
  r.status = "CANCELLED";
  r.cancelReason = `${reason.trim()} — ${user.name}`;
  await r.save();
  if (!mine) await notifyUsers([r.requestedBy], { kind: "approval", title: `Your request ${r.code} was cancelled`, body: reason.trim(), href: "/accounts/requests" }, user.userId);
  await logAudit({ user, action: "CANCEL", resource: "ACCOUNTS", resourceId: id, after: { code: r.code, reason } });
  return r;
}

/** Requests the user may see: accounts and approvers see all; anyone else sees their own. */
export async function listRequests(user: JWTPayload, q: { status?: string; type?: string }) {
  const all = (await userCan(user, "accounts.view")) || (await hasPermission(user.role, "payment.approve"));
  const f: any = all ? {} : { requestedBy: oid(user.userId) };
  if (q.status) f.status = { $in: q.status.split(",") };
  if (q.type) f.type = q.type;
  const list = await PaymentRequest.find(f).populate("account", "name kind").populate("toAccount", "name kind").sort({ createdAt: -1 }).limit(300).lean();
  return {
    list: list.map((r: any) => ({ ...r, direction: r.type === "TRANSFER" ? transferKind(r.account?.kind, r.toAccount?.kind).label : null })),
    canApprove: await hasPermission(user.role, "payment.approve"),
    canPay: await userCan(user, "accounts.manage"),
    me: user.userId,
  };
}

/**
 * Register of every movement between cash and bank: posted contra vouchers (direct or from a request)
 * plus transfer requests still waiting.
 */
export async function transferRegister(q: { from?: string; to?: string; direction?: string }) {
  const f: any = { type: "CONTRA" };
  if (q.from) f.date = { ...(f.date || {}), $gte: q.from };
  if (q.to) f.date = { ...(f.date || {}), $lte: q.to };
  const [vouchers, open] = await Promise.all([
    Voucher.find(f).populate("account", "name kind").populate("toAccount", "name kind").populate("request", "code requestedByName decision").sort({ date: -1, createdAt: -1 }).limit(500).lean(),
    PaymentRequest.find({ type: "TRANSFER", status: { $in: ["PENDING", "APPROVED"] } }).populate("account", "name kind").populate("toAccount", "name kind").sort({ createdAt: -1 }).lean(),
  ]);
  const rows = [
    ...open.map((r: any) => ({
      kind: "REQUEST" as const,
      id: String(r._id),
      code: r.code,
      date: (r.neededBy || new Date(r.createdAt).toISOString().slice(0, 10)) as string,
      from: r.account?.name,
      to: r.toAccount?.name,
      direction: transferKind(r.account?.kind, r.toAccount?.kind).label,
      amount: r.amount,
      status: r.status,
      purpose: r.purpose,
      requestedBy: r.requestedByName,
      requestedById: String(r.requestedBy),
      approvedBy: r.decision?.byName,
      doneBy: null as string | null,
      reference: null as string | null,
    })),
    ...vouchers.map((v: any) => ({
      kind: "VOUCHER" as const,
      id: String(v._id),
      code: v.code,
      date: v.date as string,
      from: v.account?.name,
      to: v.toAccount?.name,
      direction: transferKind(v.account?.kind, v.toAccount?.kind).label,
      amount: v.amount,
      status: v.status === "CANCELLED" ? "CANCELLED" : "DONE",
      purpose: v.narration,
      requestedBy: v.request?.requestedByName || v.createdByName,
      requestedById: null as string | null,
      approvedBy: v.request?.decision?.byName || null,
      doneBy: v.createdByName,
      reference: v.reference || null,
    })),
  ].filter((r) => !q.direction || r.direction.startsWith(q.direction));
  const done = rows.filter((r) => r.status === "DONE");
  const sum = (prefix: string) => done.filter((r) => r.direction.startsWith(prefix)).reduce((s, r) => s + r.amount, 0);
  return { rows, totals: { bankToBank: sum("Bank → Bank"), bankToCash: sum("Bank → Cash"), cashToBank: sum("Cash → Bank"), waiting: rows.filter((r) => r.kind === "REQUEST").length } };
}
