import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import { CashHandover, HANDOVER_REASONS, MoneyAccount, Voucher } from "@/models/Accounts";
import { User } from "@/models/User";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { generateFyCode } from "@/lib/codeGenerator";
import { accountBalances, CASH_EXCESS_HEAD, CASH_SHORT_HEAD, createVoucher } from "./accountsService";
import { notifyRoles, notifyUsers } from "./notificationService";

/**
 * Change of cashier — who holds each cash box, and a counted handover every time it changes.
 *
 *  start   the holder (or Admin / BH / MP when the holder is away, e.g. fell ill) names the next person,
 *          says why and, for a COVER, until when; the outgoing holder enters the cash they counted
 *  accept  the incoming person counts the cash and accepts; any difference from the cash book is
 *          recorded and must be settled by an approver (made good, or written off with a voucher)
 *  return  a COVER ends with a counted RETURN back to the regular cashier
 * While someone holds a box they get the cashier's rights (see lib/grants) and only they pay cash from it.
 */

export class HandoverError extends Error {
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
const APPROVERS = ["ADMIN", "BUSINESS_HEAD", "MANAGING_PARTNER"];
const STAFF_ROLES = ["FEC", "OUTLET", "ASM", "HR_MANAGER", "ACCOUNTANT", "STORE_MANAGER", "STAFF", "BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"];
export const REASON_LABEL: Record<string, string> = {
  LEAVE: "On leave",
  SICK: "Ill / medical leave",
  TRANSFER: "Moved to other work",
  RESIGNED: "Leaving the company",
  SHIFT: "Shift change",
  OTHER: "Other",
};

async function bookBalance(accountId: any) {
  const b = (await accountBalances(today())).find((x: any) => same(x._id, accountId));
  return b?.balance || 0;
}
const paise = (r: any) => {
  if (r === undefined || r === null || r === "") return null;
  const n = Math.round(Number(r) * 100);
  if (!Number.isFinite(n) || n < 0) throw new HandoverError("Enter the cash counted");
  return n;
};
function denoms(list: any): Array<{ note: number; count: number }> {
  if (!Array.isArray(list)) return [];
  return list
    .map((d: any) => ({ note: Number(d.note), count: Math.floor(Number(d.count)) }))
    .filter((d) => [1, 2, 5, 10, 20, 50, 100, 200, 500, 2000].includes(d.note) && d.count > 0);
}

export async function startHandover(
  user: JWTPayload,
  input: { accountId: string; toUserId: string; type: "HANDOVER" | "COVER" | "RETURN"; reason?: string; expectedReturn?: string; countedRupees?: number | string; denominations?: any[]; note?: string }
) {
  if (!mongoose.isValidObjectId(input.accountId)) throw new HandoverError("Choose the cash box");
  const a: any = await MoneyAccount.findById(input.accountId).lean();
  if (!a || a.kind !== "CASH" || a.status !== "ACTIVE") throw new HandoverError("Choose an active cash account");
  const isApprover = await hasPermission(user.role, "payment.approve");
  const isHolder = same(a.custodian, user.userId);
  if (!isHolder && !isApprover) throw new HandoverError("Only the person holding this cash, or the Admin / Business Head / Managing Partner, can hand it over", 403);
  if (await CashHandover.exists({ account: a._id, status: "PENDING" })) throw new HandoverError("A handover of this cash is already waiting to be accepted");

  let type = input.type;
  if (!["HANDOVER", "COVER", "RETURN"].includes(type)) throw new HandoverError("Choose handover, cover or return");
  let toId = input.toUserId;
  let coverDoc: any = null;
  if (type === "RETURN") {
    if (!a.regularCustodian) throw new HandoverError("This cash is not under cover — use a normal handover");
    toId = String(a.regularCustodian);
    coverDoc = await CashHandover.findOne({ account: a._id, type: "COVER", status: "ACCEPTED" }).sort({ acceptedAt: -1 }).lean();
  } else if (a.regularCustodian && type === "COVER") {
    throw new HandoverError(`${a.custodianName} is already covering for ${a.regularCustodianName}. Return it first, or hand it over for good.`);
  }
  if (!mongoose.isValidObjectId(toId)) throw new HandoverError("Choose who takes the cash");
  const to: any = await User.findById(toId).select("name role status").lean();
  if (!to || to.status !== "ACTIVE" || !STAFF_ROLES.includes(to.role)) throw new HandoverError("Choose an active employee to take the cash");
  if (same(to._id, a.custodian)) throw new HandoverError(`${to.name} already holds this cash`);

  const reason = type === "RETURN" ? "OTHER" : String(input.reason || "");
  if (!HANDOVER_REASONS.includes(reason as any)) throw new HandoverError("Choose why the cash is being handed over");
  let expectedReturn: string | null = null;
  if (type === "COVER") {
    expectedReturn = input.expectedReturn || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedReturn) || expectedReturn < today()) throw new HandoverError("Give the date the regular cashier is expected back");
  }
  const outgoingAbsent = !isHolder;
  const countedByFrom = paise(input.countedRupees);
  if (!outgoingAbsent && countedByFrom === null) throw new HandoverError("Count the cash and enter the amount you are handing over");
  if (type !== "RETURN" && (!input.note || input.note.trim().length < 3) && outgoingAbsent) throw new HandoverError("Write a note — the cashier is not here to count, so say who witnessed the count");

  const book = await bookBalance(a._id);
  const h = await CashHandover.create({
    code: await generateFyCode("CASH_HANDOVER"),
    account: a._id,
    accountName: a.name,
    type,
    reason,
    note: input.note?.trim() || (type === "RETURN" ? "Cover ended — cash back to the regular cashier" : ""),
    from: a.custodian || null,
    fromName: a.custodianName || "",
    to: to._id,
    toName: to.name,
    expectedReturn,
    cover: coverDoc?._id || null,
    startedBy: oid(user.userId),
    startedByName: user.name,
    outgoingAbsent,
    bookBalanceAtStart: book,
    countedByFrom,
    denominations: denoms(input.denominations),
  });
  const what = type === "COVER" ? `to cover until ${expectedReturn}` : type === "RETURN" ? "back (cover over)" : "for good";
  await notifyUsers(
    [to._id],
    {
      kind: "cash",
      title: `Cash handover for you: ${a.name}`,
      body: `${user.name} is handing ${a.name} to you ${what}. Book balance ${rupees(book)}${countedByFrom != null ? `, counted ${rupees(countedByFrom)}` : ""}. Count it and accept in Accounts → Cash handover.`,
      href: "/accounts/handover/accept",
    },
    user.userId
  );
  await logAudit({ user, action: "CREATE", resource: "ACCOUNTS", resourceId: String(h._id), after: { code: h.code, account: a.name, type, to: to.name, book, countedByFrom } });
  return h;
}

export async function acceptHandover(user: JWTPayload, id: string, input: { countedRupees: number | string; denominations?: any[]; note?: string }) {
  if (!mongoose.isValidObjectId(id)) throw new HandoverError("Handover not found", 404);
  const h = await CashHandover.findById(id);
  if (!h) throw new HandoverError("Handover not found", 404);
  if (h.status !== "PENDING") throw new HandoverError(`This handover is already ${h.status.toLowerCase()}`);
  if (!same(h.to, user.userId)) throw new HandoverError(`Only ${h.toName} can accept this cash`, 403);
  const counted = paise(input.countedRupees);
  if (counted === null) throw new HandoverError("Count the cash and enter the amount");
  const book = await bookBalance(h.account);
  const diff = counted - book;
  if (diff !== 0 && (!input.note || input.note.trim().length < 3)) throw new HandoverError(`The cash is ${diff < 0 ? "short" : "more"} by ${rupees(Math.abs(diff))} against the book — write a note`);

  // claim the account atomically: the custodian must still be who it was when the handover started
  const a: any = await MoneyAccount.findById(h.account).lean();
  const set: any = { custodian: h.to, custodianName: h.toName };
  if (h.type === "COVER") Object.assign(set, { regularCustodian: h.from || null, regularCustodianName: h.fromName || "", coverUntil: h.expectedReturn });
  else Object.assign(set, { regularCustodian: null, regularCustodianName: "", coverUntil: null });
  const moved = await MoneyAccount.updateOne({ _id: h.account, custodian: a.custodian ?? null }, { $set: set });
  if (!moved.modifiedCount) throw new HandoverError("The cash box changed hands meanwhile — start again");
  const claimed = await CashHandover.updateOne(
    { _id: h._id, status: "PENDING" },
    {
      $set: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        bookBalanceAtAccept: book,
        countedByTo: counted,
        difference: diff,
        denominations: denoms(input.denominations).length ? denoms(input.denominations) : h.denominations,
        acceptNote: input.note?.trim(),
        settlement: { status: diff === 0 ? "NONE" : "OPEN" },
      },
    }
  );
  if (!claimed.modifiedCount) {
    await MoneyAccount.updateOne({ _id: h.account }, { $set: { custodian: a.custodian ?? null, custodianName: a.custodianName, regularCustodian: a.regularCustodian ?? null, regularCustodianName: a.regularCustodianName, coverUntil: a.coverUntil ?? null } });
    throw new HandoverError("This handover was just changed — refresh");
  }
  const notice = {
    kind: "cash",
    title: `${h.accountName} now with ${h.toName}${diff !== 0 ? ` — ${diff < 0 ? "SHORT" : "excess"} ${rupees(Math.abs(diff))}` : ""}`,
    body: `${h.code}: ${h.fromName || "—"} → ${h.toName} (${h.type === "COVER" ? `cover until ${h.expectedReturn}` : h.type === "RETURN" ? "cover ended" : REASON_LABEL[h.reason]}). Book ${rupees(book)}, counted ${rupees(counted)}.${diff !== 0 ? " Settle the difference in Accounts → Cash handover." : ""}`,
    href: "/accounts/handover",
  };
  await notifyRoles(APPROVERS, notice, user.userId);
  await notifyUsers([h.from, h.startedBy], notice, user.userId);
  await logAudit({ user, action: "APPROVE", resource: "ACCOUNTS", resourceId: id, after: { code: h.code, book, counted, diff } });
  return CashHandover.findById(id).lean();
}

export async function cancelHandover(user: JWTPayload, id: string, reason: string) {
  if (!mongoose.isValidObjectId(id)) throw new HandoverError("Handover not found", 404);
  const h = await CashHandover.findById(id);
  if (!h || h.status !== "PENDING") throw new HandoverError("Only a handover waiting to be accepted can be cancelled");
  const ok = same(h.startedBy, user.userId) || same(h.to, user.userId) || (await hasPermission(user.role, "payment.approve"));
  if (!ok) throw new HandoverError("You cannot cancel this handover", 403);
  if (!reason?.trim()) throw new HandoverError("Give a reason");
  h.status = "CANCELLED";
  h.cancelledByName = user.name;
  h.cancelReason = reason.trim();
  await h.save();
  await notifyUsers([h.to, h.from, h.startedBy], { kind: "cash", title: `Cash handover ${h.code} cancelled`, body: `${user.name}: ${reason.trim()}`, href: "/accounts/handover" }, user.userId);
  return h;
}

/** An approver settles a counted difference: the person made it good, or it is written off through a voucher. */
export async function settleDifference(user: JWTPayload, id: string, input: { how: "MADE_GOOD" | "WRITTEN_OFF"; note?: string }) {
  if (!(await hasPermission(user.role, "payment.approve"))) throw new HandoverError("Only the Admin, Business Head or Managing Partner settle a cash difference", 403);
  if (!mongoose.isValidObjectId(id)) throw new HandoverError("Handover not found", 404);
  const h = await CashHandover.findById(id);
  if (!h || h.status !== "ACCEPTED" || h.settlement?.status !== "OPEN") throw new HandoverError("Nothing to settle on this handover");
  if (!input.note?.trim()) throw new HandoverError("Write what was decided");
  const diff = h.difference || 0;
  // claim first so two clicks cannot post two vouchers
  const claim = await CashHandover.updateOne({ _id: h._id, "settlement.status": "OPEN" }, { $set: { "settlement.status": input.how, "settlement.byName": user.name, "settlement.at": new Date(), "settlement.note": input.note.trim() } });
  if (!claim.modifiedCount) throw new HandoverError("Already settled");
  let voucher: any = null;
  if (input.how === "WRITTEN_OFF") {
    try {
      // the book is brought to the cash actually counted
      voucher = await createVoucher(
        user,
        {
          type: diff < 0 ? "PAYMENT" : "RECEIPT",
          date: today(),
          accountId: String(h.account),
          amountRupees: Math.abs(diff) / 100,
          head: diff < 0 ? CASH_SHORT_HEAD : CASH_EXCESS_HEAD,
          narration: `${diff < 0 ? "Shortage" : "Excess"} found at cash handover ${h.code} (${h.fromName || "—"} → ${h.toName}) — ${input.note.trim()}`,
          reference: h.code,
        },
        { bookEntryOnly: true }
      );
      await CashHandover.updateOne({ _id: h._id }, { $set: { "settlement.voucher": voucher._id } });
    } catch (e) {
      await CashHandover.updateOne({ _id: h._id }, { $set: { "settlement.status": "OPEN" } });
      throw e;
    }
  }
  await notifyUsers([h.to, h.from], { kind: "cash", title: `Cash difference on ${h.code} settled`, body: `${rupees(Math.abs(diff))} ${diff < 0 ? "short" : "excess"} — ${input.how === "MADE_GOOD" ? "made good" : "written off"} by ${user.name}: ${input.note.trim()}`, href: "/accounts/handover" }, user.userId);
  await logAudit({ user, action: "APPROVE", resource: "ACCOUNTS", resourceId: id, after: { code: h.code, how: input.how, diff, voucher: voucher?.code } });
  return CashHandover.findById(id).lean();
}

/** Cash boxes with their holder, cover state and book balance; the handover log; what waits for me. */
export async function handoverDesk(user: JWTPayload) {
  const [accounts, balances, log, staff] = await Promise.all([
    MoneyAccount.find({ kind: "CASH", status: "ACTIVE" }).sort({ name: 1 }).lean(),
    accountBalances(today()),
    CashHandover.find().sort({ createdAt: -1 }).limit(200).lean(),
    User.find({ status: "ACTIVE", role: { $in: STAFF_ROLES } }).select("name role employeeCode").sort({ name: 1 }).lean(),
  ]);
  const t = today();
  const boxes = accounts.map((a: any) => ({
    _id: a._id,
    name: a.name,
    isDefault: a.isDefault,
    custodian: a.custodian,
    custodianName: a.custodianName || "",
    regularCustodian: a.regularCustodian,
    regularCustodianName: a.regularCustodianName || "",
    coverUntil: a.coverUntil,
    coverOverdue: !!a.coverUntil && a.coverUntil < t,
    balance: (balances as any[]).find((b) => same(b._id, a._id))?.balance || 0,
    pending: log.find((h: any) => same(h.account, a._id) && h.status === "PENDING") || null,
    iHold: same(a.custodian, user.userId),
  }));
  return {
    boxes,
    log,
    staff: staff.map((u: any) => ({ _id: u._id, name: u.name, role: u.role, employeeCode: u.employeeCode })),
    forMe: log.filter((h: any) => h.status === "PENDING" && same(h.to, user.userId)),
    openDifferences: log.filter((h: any) => h.settlement?.status === "OPEN"),
    canStartAny: await hasPermission(user.role, "payment.approve"),
    me: user.userId,
  };
}

/** Daily: remind when a cover has run past its return date. */
export async function remindOverdueCovers() {
  const late = await MoneyAccount.find({ kind: "CASH", status: "ACTIVE", coverUntil: { $ne: null, $lt: today() } }).lean();
  for (const a of late as any[]) {
    const n = { kind: "cash", title: `Cash cover overdue: ${a.name}`, body: `${a.custodianName} was covering for ${a.regularCustodianName} until ${a.coverUntil}. Hand the cash back (counted) or hand it over for good.`, href: "/accounts/handover" };
    await notifyUsers([a.custodian, a.regularCustodian], n);
    await notifyRoles(APPROVERS, n);
  }
  return late.length;
}
