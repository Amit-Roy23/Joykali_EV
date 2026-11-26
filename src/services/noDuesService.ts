import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import { NoDues, HANDBACK_ITEMS } from "@/models/NoDues";
import { AdvanceLoan, ExpenseClaim, Resignation } from "@/models/Hr";
import { CashHandover, MoneyAccount, PaymentRequest } from "@/models/Accounts";
import { User } from "@/models/User";
import { Sale } from "@/models/Sale";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { generateFyCode } from "@/lib/codeGenerator";
import { notifyRoles, notifyUsers } from "./notificationService";

export class NoDuesError extends Error {
  status: number;
  constructor(m: string, status = 400) {
    super(m);
    this.status = status;
  }
}
const oid = (v: any) => new mongoose.Types.ObjectId(String(v));
const rupees = (p: number) => `₹${(p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
/** Who may approve: the Business Head or the Managing Partner (either one). */
export const NDC_APPROVERS = ["BUSINESS_HEAD", "MANAGING_PARTNER"];

export interface DueCheck {
  key: string;
  label: string;
  ok: boolean;
  /** block = must be cleared before approval; info = shown for the record. */
  level: "block" | "info";
  detail: string;
}

/** What the system can see the person still owes, holds or has open. */
export async function noDuesChecks(employeeId: any): Promise<DueCheck[]> {
  const id = oid(employeeId);
  const [res, loans, claims, boxes, handovers, requests, me, team, sales] = await Promise.all([
    Resignation.findOne({ employee: id, status: { $in: ["ACCEPTED", "SETTLEMENT_PENDING", "SETTLED"] } }).sort({ createdAt: -1 }).lean(),
    AdvanceLoan.find({ employee: id, status: { $in: ["PENDING_APPROVAL", "ACTIVE"] } }).lean(),
    ExpenseClaim.find({ employee: id, status: { $in: ["SUBMITTED", "VERIFIED", "APPROVED"] } }).lean(),
    MoneyAccount.find({ custodian: id, status: "ACTIVE" }).select("name").lean(),
    CashHandover.find({ $or: [{ from: id }, { to: id }], $and: [{ $or: [{ status: "PENDING" }, { "settlement.status": "OPEN" }] }] }).select("code status").lean(),
    PaymentRequest.find({ requestedBy: id, status: { $in: ["PENDING", "APPROVED"] } }).select("code amount").lean(),
    User.findById(id).select("territories role").populate("territories", "name").lean(),
    User.find({ reportsTo: id, status: "ACTIVE" }).select("name").lean(),
    Sale.find({ soldBy: id, status: "DELIVERED" }).select("saleCode totalAmount payments").lean(),
  ]);
  const r: any = res;
  const fnfOk = !!r && r.status === "SETTLED" && (!r.settlement || r.settlement.net === 0 || !!r.payment);
  const loanBal = (loans as any[]).filter((l) => l.status === "ACTIVE").reduce((t, l) => t + (l.balance || 0), 0);
  const customerDue = (sales as any[])
    .map((s) => ({ code: s.saleCode, due: s.totalAmount - (s.payments || []).reduce((t: number, p: any) => t + p.amount, 0) }))
    .filter((x) => x.due > 0);
  const terr = ((me as any)?.territories || []).map((t: any) => t.name);
  return [
    {
      key: "FNF",
      label: "Full & final settlement approved and paid",
      level: "block",
      ok: fnfOk,
      detail: !r
        ? "No accepted resignation — record the exit first"
        : r.status !== "SETTLED"
          ? `Settlement is ${r.status === "SETTLEMENT_PENDING" ? "waiting for BH + MP approval" : "not worked out yet"} (Exits page)`
          : !fnfOk
            ? `Approved — ${rupees(Math.abs(r.settlement.net))} still to be ${r.settlement.net > 0 ? "paid" : "recovered"} by Accounts`
            : `Settled${r.settlement ? (r.settlement.net > 0 ? `: ${rupees(r.settlement.net)} paid to the employee` : r.settlement.net < 0 ? `: ${rupees(-r.settlement.net)} recovered from the employee` : ": nothing either way") : ""}${r.payment ? ` on ${r.payment.date}` : ""}`,
    },
    { key: "LOANS", label: "No salary advance or loan outstanding", level: "block", ok: loans.length === 0, detail: loans.length ? `${loans.length} open (${rupees(loanBal)} balance) — recover it in the settlement` : "None" },
    { key: "CLAIMS", label: "No expense claim in progress", level: "block", ok: claims.length === 0, detail: claims.length ? (claims as any[]).map((c) => c.code).join(", ") : "None" },
    { key: "CASH", label: "Holds no company cash", level: "block", ok: boxes.length === 0, detail: boxes.length ? `Holds ${(boxes as any[]).map((b) => b.name).join(", ")} — hand it over (counted) first` : "None held" },
    { key: "HANDOVER", label: "No cash handover or cash shortage open", level: "block", ok: handovers.length === 0, detail: handovers.length ? (handovers as any[]).map((h) => h.code).join(", ") : "None" },
    { key: "REQUESTS", label: "No payment request of theirs still open", level: "block", ok: requests.length === 0, detail: requests.length ? (requests as any[]).map((q) => `${q.code} ${rupees(q.amount)}`).join(", ") : "None" },
    { key: "AREAS", label: "Working areas handed over", level: "block", ok: terr.length === 0, detail: terr.length ? `Still covers ${terr.join(", ")} — give the area to someone else` : "None held" },
    { key: "TEAM", label: "Team moved to a new manager", level: "block", ok: team.length === 0, detail: team.length ? `${team.length} still report to them: ${(team as any[]).slice(0, 5).map((t) => t.name).join(", ")}${team.length > 5 ? "…" : ""}` : "Nobody reports to them" },
    {
      key: "CUSTOMER_DUES",
      label: "Customer balances on their sales (for the record)",
      level: "info",
      ok: customerDue.length === 0,
      detail: customerDue.length ? `${customerDue.length} sale(s), ${rupees(customerDue.reduce((t, x) => t + x.due, 0))} still to come from customers / finance — not owed by the employee` : "All collected",
    },
  ];
}

async function canManage(user: JWTPayload) {
  return hasPermission(user.role, "hr.manage");
}
const approverOk = (user: JWTPayload) => NDC_APPROVERS.includes(user.role);

export async function openNoDues(user: JWTPayload, employeeId: string) {
  if (!(await canManage(user))) throw new NoDuesError("Only HR opens a no dues certificate", 403);
  if (!mongoose.isValidObjectId(employeeId)) throw new NoDuesError("Choose the employee");
  if (employeeId === user.userId) throw new NoDuesError("You cannot open your own no dues certificate", 403);
  const emp: any = await User.findById(employeeId).select("name employeeCode designation joiningDate").lean();
  if (!emp) throw new NoDuesError("Employee not found", 404);
  const res: any = await Resignation.findOne({ employee: emp._id, status: { $in: ["ACCEPTED", "SETTLEMENT_PENDING", "SETTLED"] } }).sort({ createdAt: -1 }).lean();
  if (!res) throw new NoDuesError("Accept the resignation first (Exits) — a no dues certificate is for someone leaving");
  if (await NoDues.exists({ employee: emp._id, status: { $in: ["OPEN", "PENDING_APPROVAL", "ISSUED"] } })) throw new NoDuesError("A no dues certificate is already open or issued for this employee", 409);
  const nd = await NoDues.create({
    employee: emp._id,
    employeeName: emp.name,
    employeeCode: emp.employeeCode,
    designation: emp.designation,
    joiningDate: emp.joiningDate,
    lastWorkingDay: res.acceptedLwd,
    resignation: res._id,
    items: HANDBACK_ITEMS.map((i) => ({ ...i, status: "PENDING" })),
    openedByName: user.name,
  });
  await logAudit({ user, action: "CREATE", resource: "EMPLOYEE", resourceId: String(nd._id), after: { noDues: emp.name } });
  return nd;
}

async function load(id: string) {
  if (!mongoose.isValidObjectId(id)) throw new NoDuesError("Not found", 404);
  const nd = await NoDues.findById(id);
  if (!nd) throw new NoDuesError("Not found", 404);
  return nd;
}

/** HR ticks a hand-back item: cleared, not applicable, or back to pending. */
export async function tickItem(user: JWTPayload, id: string, input: { key: string; status: "CLEARED" | "NA" | "PENDING"; note?: string }) {
  if (!(await canManage(user))) throw new NoDuesError("Only HR updates the hand-back list", 403);
  const nd = await load(id);
  if (nd.status !== "OPEN") throw new NoDuesError("It has already been sent for approval");
  const it = nd.items.find((i) => i.key === input.key);
  if (!it) throw new NoDuesError("Unknown item");
  if (!["CLEARED", "NA", "PENDING"].includes(input.status)) throw new NoDuesError("Choose cleared, not applicable or pending");
  it.status = input.status;
  it.byName = user.name;
  it.at = new Date();
  it.note = input.note?.trim() || "";
  nd.markModified("items");
  await nd.save();
  return nd;
}

export async function submitNoDues(user: JWTPayload, id: string) {
  if (!(await canManage(user))) throw new NoDuesError("Only HR sends it for approval", 403);
  const nd = await load(id);
  if (nd.status !== "OPEN") throw new NoDuesError(`It is already ${nd.status.toLowerCase().replace("_", " ")}`);
  const pending = nd.items.filter((i) => i.status === "PENDING");
  if (pending.length) throw new NoDuesError(`Tick every hand-back item first: ${pending.map((p) => p.label).join("; ")}`);
  const checks = await noDuesChecks(nd.employee);
  const blocked = checks.filter((c) => c.level === "block" && !c.ok);
  if (blocked.length) throw new NoDuesError(`Not clear yet — ${blocked.map((b) => `${b.label}: ${b.detail}`).join(" · ")}`);
  nd.status = "PENDING_APPROVAL";
  nd.checksAtSubmit = checks;
  nd.submittedByName = user.name;
  nd.submittedAt = new Date();
  await nd.save();
  await notifyRoles(NDC_APPROVERS, { kind: "approval", title: `No dues certificate to approve: ${nd.employeeName}`, body: `Last day ${nd.lastWorkingDay}. All checks clear; sent by ${user.name}. The Business Head or the Managing Partner approves.`, href: "/hr/no-dues" }, user.userId);
  await logAudit({ user, action: "SUBMIT", resource: "EMPLOYEE", resourceId: id, after: { noDues: nd.employeeName } });
  return nd;
}

/** The Business Head or the Managing Partner issues (or sends back) the certificate. */
export async function decideNoDues(user: JWTPayload, id: string, decision: "APPROVE" | "REJECT", note?: string) {
  if (!approverOk(user)) throw new NoDuesError("Only the Business Head or the Managing Partner approves a no dues certificate", 403);
  const nd = await load(id);
  if (nd.status !== "PENDING_APPROVAL") throw new NoDuesError(nd.status === "OPEN" ? "HR has not sent it for approval yet" : `It is already ${nd.status.toLowerCase()}`);
  if (String(nd.employee) === user.userId) throw new NoDuesError("You cannot approve your own no dues certificate", 403);
  if (decision === "REJECT") {
    if (!note?.trim()) throw new NoDuesError("Give a reason");
    const r = await NoDues.updateOne({ _id: nd._id, status: "PENDING_APPROVAL" }, { $set: { status: "OPEN", decision: { by: oid(user.userId), byName: user.name, role: user.role, at: new Date(), note: note.trim() }, remarks: `Sent back by ${user.name}: ${note.trim()}` } });
    if (!r.modifiedCount) throw new NoDuesError("It was just decided by someone else");
    await notifyRoles(["HR_MANAGER"], { kind: "approval", title: `No dues for ${nd.employeeName} sent back`, body: `${user.name}: ${note.trim()}`, href: "/hr/no-dues" }, user.userId);
    return NoDues.findById(id).lean();
  }
  // re-check at the moment of issue: nothing may have changed since HR sent it
  const checks = await noDuesChecks(nd.employee);
  const blocked = checks.filter((c) => c.level === "block" && !c.ok);
  if (blocked.length) throw new NoDuesError(`Something changed since HR sent it — ${blocked.map((b) => `${b.label}: ${b.detail}`).join(" · ")}`);
  const code = await generateFyCode("NO_DUES");
  const r = await NoDues.updateOne(
    { _id: nd._id, status: "PENDING_APPROVAL" },
    { $set: { status: "ISSUED", code, checksAtIssue: checks, issuedAt: new Date(), decision: { by: oid(user.userId), byName: user.name, role: user.role, at: new Date(), note: note?.trim() || "" } } }
  );
  if (!r.modifiedCount) throw new NoDuesError("It was just decided by someone else");
  const n = { kind: "approval", title: `No dues certificate issued: ${nd.employeeName} (${code})`, body: `Approved by ${user.name}. Download it from HR → No dues.`, href: "/hr/no-dues" };
  await notifyRoles(["HR_MANAGER", ...NDC_APPROVERS], n, user.userId);
  await notifyUsers([nd.employee], { ...n, title: `Your no dues certificate is issued (${code})`, href: "/hr/no-dues/mine" }, user.userId);
  await logAudit({ user, action: "APPROVE", resource: "EMPLOYEE", resourceId: id, after: { noDues: nd.employeeName, code } });
  return NoDues.findById(id).lean();
}

export async function cancelNoDues(user: JWTPayload, id: string, reason: string) {
  if (!(await canManage(user)) && !approverOk(user)) throw new NoDuesError("Not allowed", 403);
  const nd = await load(id);
  if (!["OPEN", "PENDING_APPROVAL"].includes(nd.status)) throw new NoDuesError("An issued certificate cannot be cancelled");
  if (!reason?.trim()) throw new NoDuesError("Give a reason");
  nd.status = "CANCELLED";
  nd.remarks = `Cancelled by ${user.name}: ${reason.trim()}`;
  await nd.save();
  return nd;
}

/** List with live checks for open ones. HR / BH / MP see all; an employee sees their own. */
export async function listNoDues(user: JWTPayload) {
  const all = (await canManage(user)) || approverOk(user);
  const list: any[] = await NoDues.find(all ? {} : { employee: user.userId }).sort({ createdAt: -1 }).limit(200).lean();
  for (const nd of list) if (["OPEN", "PENDING_APPROVAL"].includes(nd.status)) nd.checks = await noDuesChecks(nd.employee);
  // people leaving with no certificate yet
  const leaving = all
    ? (await Resignation.find({ status: { $in: ["ACCEPTED", "SETTLEMENT_PENDING", "SETTLED"] } }).select("employee employeeName acceptedLwd status").sort({ acceptedLwd: -1 }).lean()).filter(
        (r: any) => !list.some((n) => String(n.employee) === String(r.employee) && n.status !== "CANCELLED" && n.status !== "REJECTED")
      )
    : [];
  return { list, leaving, canOpen: await canManage(user), canDecide: approverOk(user), me: user.userId };
}

export async function getNoDuesForPdf(user: JWTPayload, id: string) {
  const nd: any = await NoDues.findById(id).lean();
  if (!nd) throw new NoDuesError("Not found", 404);
  if (nd.status !== "ISSUED") throw new NoDuesError("The certificate is issued only after approval");
  const allowed = String(nd.employee) === user.userId || (await canManage(user)) || approverOk(user);
  if (!allowed) throw new NoDuesError("Not allowed", 403);
  return nd;
}
