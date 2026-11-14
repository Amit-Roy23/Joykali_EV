import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import { ApprovalError, approvalState, sign, ApprovalSignature, LEVEL_LABEL } from "@/lib/approval";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { ChannelOrder } from "@/models/ChannelOrder";
import { IncentiveScheme } from "@/models/IncentiveScheme";
import { PayrollRun } from "@/models/PayrollRun";
import { CreditLimitChange } from "@/models/CreditLimitChange";
import { SalaryStructure } from "@/models/SalaryStructure";
import { Dealer } from "@/models/Dealer";
import { Distributor } from "@/models/Distributor";
import { User } from "@/models/User";
import { PartnerTarget } from "@/models/PartnerTarget";
import { LedgerEntry } from "@/models/LedgerEntry";
import { generateFyCode } from "@/lib/codeGenerator";
import { AdvanceLoan, ExpenseClaim, Resignation } from "@/models/Hr";
import { activateAdvance, closeSettlement } from "./hrMoneyService";
import { assertCredit } from "./creditService";
import { recalculateForScheme } from "./incentiveService";

export type ApprovalKind = "order" | "scheme" | "payroll" | "credit" | "salary" | "commission" | "advance" | "claim" | "settlement";
export const APPROVAL_KINDS: ApprovalKind[] = ["order", "scheme", "payroll", "credit", "salary", "commission", "advance", "claim", "settlement"];

export const KIND_LABEL: Record<ApprovalKind, string> = {
  order: "Vehicle order",
  scheme: "Incentive scheme",
  payroll: "Payroll run",
  credit: "Credit limit change",
  salary: "Salary revision",
  commission: "Partner commission",
  advance: "Salary advance / loan",
  claim: "Expense claim",
  settlement: "Full & final settlement",
};

const rupees = (p: number) => `₹${Math.round(p / 100).toLocaleString("en-IN")}`;

/**
 * Sign (approve or reject) any approvable record. Business Head signs first,
 * Managing Partner second; only the second approval takes effect.
 */
export async function signApproval(
  kind: ApprovalKind,
  id: string,
  user: JWTPayload,
  decision: "APPROVED" | "REJECTED",
  note?: string
) {
  if (!mongoose.isValidObjectId(id)) throw new ApprovalError("Record not found", 404);
  if (user.role === "ADMIN") {
    throw new ApprovalError("Admins cannot approve. Approval needs the Business Head and the Managing Partner.", 403);
  }
  if (!(await hasPermission(user.role, "approvals.sign"))) {
    throw new ApprovalError("Only the Business Head and the Managing Partner can approve.", 403);
  }

  let result: { signatures: ApprovalSignature[]; final: boolean; status: string };
  let summary = "";

  if (kind === "order") {
    const order = await ChannelOrder.findById(id);
    if (!order) throw new ApprovalError("Order not found", 404);
    if (order.status !== "PENDING_APPROVAL") throw new ApprovalError(`Order is ${order.status.toLowerCase().replace("_", " ")}`);
    result = sign(order.approvals, user, decision, note);
    if (result.status === "APPROVED") {
      // Final sign-off: credit must still hold at this moment.
      await assertCredit(order.partyType, order.party, order.totalValue, {
        excludeOrder: order._id as mongoose.Types.ObjectId,
        context: `order ${order.orderCode}`,
      }).catch((e) => {
        throw new ApprovalError(e.message);
      });
      order.status = "APPROVED";
    } else if (result.status === "REJECTED") {
      order.status = "REJECTED";
    }
    order.approvals = result.signatures;
    await order.save();
    summary = `${order.orderCode} · ${order.partyName} · ${rupees(order.totalValue)}`;
  } else if (kind === "scheme") {
    const scheme = await IncentiveScheme.findById(id);
    if (!scheme) throw new ApprovalError("Scheme not found", 404);
    if (scheme.status !== "DRAFT") throw new ApprovalError(`Only DRAFT schemes can be approved (current: ${scheme.status})`);
    if (new Date(scheme.validTo) < new Date(scheme.validFrom)) {
      throw new ApprovalError("Scheme validity end date is before its start date", 400);
    }
    result = sign(scheme.approvals, user, decision, note);
    scheme.approvals = result.signatures;
    if (result.status === "APPROVED") {
      scheme.status = "ACTIVE";
      scheme.approvedBy = new mongoose.Types.ObjectId(user.userId);
      scheme.approvedAt = new Date();
    } else if (result.status === "REJECTED") {
      scheme.status = "ARCHIVED";
    }
    await scheme.save();
    if (result.status === "APPROVED") {
      // Activation updates every month the scheme covers and re-prices open payroll drafts.
      await recalculateForScheme(scheme);
    }
    summary = scheme.name;
  } else if (kind === "payroll") {
    const run = await PayrollRun.findById(id);
    if (!run) throw new ApprovalError("Payroll run not found", 404);
    if (!["DRAFT", "UNDER_REVIEW"].includes(run.status)) {
      throw new ApprovalError(`Payroll run is already ${run.status.toLowerCase()}`);
    }
    if (!run.totals || run.totals.totalEmployees === 0) throw new ApprovalError("Cannot approve an empty payroll run");
    result = sign(run.approvals, user, decision, note);
    if (result.status === "REJECTED") {
      // Sent back for correction: clear signatures so it can be fixed and re-approved.
      run.approvals = [];
      run.status = "DRAFT";
      run.notes = `Returned by ${user.name}: ${note}`;
    } else {
      run.approvals = result.signatures;
      run.status = result.status === "APPROVED" ? "APPROVED" : "UNDER_REVIEW";
      if (result.status === "APPROVED") {
        run.approvedBy = new mongoose.Types.ObjectId(user.userId);
        run.approvedAt = new Date();
      }
    }
    await run.save();
    summary = `${run.runCode} · ${run.totals.totalEmployees} staff · ${rupees(run.totals.totalNet)} net`;
  } else if (kind === "credit") {
    const change = await CreditLimitChange.findById(id);
    if (!change) throw new ApprovalError("Credit change request not found", 404);
    if (change.status !== "PENDING") throw new ApprovalError(`Request is already ${change.status.toLowerCase()}`);
    result = sign(change.approvals, user, decision, note);
    change.approvals = result.signatures;
    if (result.status === "APPROVED") {
      const update: Record<string, number> = { creditLimit: change.toLimit };
      if (change.creditDays != null) update.creditDays = change.creditDays;
      if (change.partyType === "DEALER") await Dealer.updateOne({ _id: change.party }, { $set: update });
      else await Distributor.updateOne({ _id: change.party }, { $set: update });
      change.status = "APPROVED";
      change.appliedAt = new Date();
    } else if (result.status === "REJECTED") {
      change.status = "REJECTED";
    }
    await change.save();
    summary = `${change.partyName}: ${rupees(change.fromLimit)} → ${rupees(change.toLimit)}`;
  } else if (kind === "salary") {
    const structure = await SalaryStructure.findById(id);
    if (!structure) throw new ApprovalError("Salary revision not found", 404);
    if (structure.status !== "PENDING_APPROVAL") throw new ApprovalError("This revision is not awaiting approval");
    result = sign(structure.approvals, user, decision, note);
    structure.approvals = result.signatures;
    if (result.status === "REJECTED") structure.status = "REJECTED";
    if (result.status === "APPROVED") structure.status = "APPROVED";
    await structure.save();
    if (result.status === "APPROVED") await activateSalaryStructures(structure.employee);
    const emp = await User.findById(structure.employee).select("name employeeCode").lean();
    summary = `${emp?.name} (${emp?.employeeCode}) · gross ${rupees(structure.grossMonthly || 0)}/month`;
  } else if (kind === "commission") {
    const t = await PartnerTarget.findById(id);
    if (!t || !t.settlement) throw new ApprovalError("Commission claim not found", 404);
    if (t.settlement.status !== "PENDING_APPROVAL") throw new ApprovalError(`Claim is already ${t.settlement.status.toLowerCase()}`);
    result = sign(t.settlement.approvals, user, decision, note);
    t.settlement.approvals = result.signatures;
    if (result.status === "APPROVED") {
      const cn = await generateFyCode("CREDIT_NOTE");
      await LedgerEntry.create({
        partyType: t.partyType,
        party: t.party,
        type: "CREDIT_NOTE",
        reference: cn,
        debit: 0,
        credit: t.settlement.amount,
        narration: `Target commission ${t.period}: ${t.settlement.units} units`,
        createdBy: new mongoose.Types.ObjectId(user.userId),
      });
      t.settlement.status = "SETTLED";
      t.settlement.creditNote = cn;
      t.settlement.settledAt = new Date();
    } else if (result.status === "REJECTED") {
      t.settlement.status = "REJECTED";
    }
    t.markModified("settlement");
    await t.save();
    summary = `${t.period} commission ${rupees(t.settlement.amount)}`;
  } else if (kind === "advance") {
    const a = await AdvanceLoan.findById(id);
    if (!a) throw new ApprovalError("Request not found", 404);
    if (a.status !== "PENDING_APPROVAL") throw new ApprovalError(`Request is ${a.status.toLowerCase()}`);
    if (String(a.employee) === user.userId) throw new ApprovalError("You cannot approve your own advance", 403);
    result = sign(a.approvals, user, decision, note);
    a.approvals = result.signatures;
    if (result.status === "REJECTED") a.status = "REJECTED";
    await a.save();
    if (result.status === "APPROVED") await activateAdvance(a._id);
    summary = `${a.code} ${a.employeeName} ${rupees(a.amount)}`;
  } else if (kind === "claim") {
    const c = await ExpenseClaim.findById(id);
    if (!c) throw new ApprovalError("Claim not found", 404);
    if (c.status !== "VERIFIED") throw new ApprovalError(c.status === "SUBMITTED" ? "The manager must check the claim first" : `Claim is ${c.status.toLowerCase()}`);
    if (String(c.employee) === user.userId) throw new ApprovalError("You cannot approve your own claim", 403);
    result = sign(c.approvals, user, decision, note);
    c.approvals = result.signatures;
    if (result.status === "APPROVED") c.status = "APPROVED";
    if (result.status === "REJECTED") {
      c.status = "REJECTED";
      c.rejectReason = note;
    }
    await c.save();
    summary = `${c.code} ${c.employeeName} ${rupees(c.amount)}`;
  } else if (kind === "settlement") {
    const r = await Resignation.findById(id);
    if (!r || !r.settlement) throw new ApprovalError("Settlement not found", 404);
    if (r.status !== "SETTLEMENT_PENDING") throw new ApprovalError(`Settlement is ${r.status.toLowerCase()}`);
    if (String(r.employee) === user.userId) throw new ApprovalError("You cannot approve your own settlement", 403);
    result = sign(r.approvals, user, decision, note);
    r.approvals = result.signatures;
    if (result.status === "REJECTED") r.status = "ACCEPTED"; // HR recomputes
    await r.save();
    if (result.status === "APPROVED") await closeSettlement(r._id);
    summary = `${r.employeeName} net ${rupees(r.settlement.net)}`;
  } else {
    throw new ApprovalError("Unknown approval type", 400);
  }

  await logAudit({
    user,
    action: decision === "APPROVED" ? "APPROVE" : "REJECT",
    resource: ({ order: "ORDER", scheme: "SCHEME", payroll: "PAYROLL", credit: "CREDIT", salary: "SALARY", commission: "TARGET", advance: "PAYROLL", claim: "PAYROLL", settlement: "PAYROLL" } as const)[kind],
    resourceId: id,
    after: { level: user.role, decision, note, outcome: result.status, summary },
  });

  return { kind, id, status: result.status, final: result.final, waitingFor: approvalState(result.signatures).next };
}

/**
 * After a salary revision is approved: exactly one structure per employee is
 * "in force today" (isActive). Older approved ones stay for past payroll months.
 */
export async function activateSalaryStructures(employeeId: mongoose.Types.ObjectId | string) {
  const now = new Date();
  const list = await SalaryStructure.find({
    employee: employeeId,
    status: { $in: ["APPROVED", "SUPERSEDED", null] },
  }).sort({ effectiveFrom: -1, createdAt: -1 });
  const current = list.find((s) => s.effectiveFrom <= now) || null;
  for (const s of list) {
    const active = !!current && String(s._id) === String(current._id);
    const status = active || s.effectiveFrom > now ? "APPROVED" : "SUPERSEDED";
    if (s.isActive !== active || s.status !== status) {
      s.isActive = active;
      s.status = status;
      await s.save();
    }
  }
}

export interface PendingItem {
  kind: ApprovalKind;
  kindLabel: string;
  id: string;
  title: string;
  subtitle: string;
  amount?: number;
  submittedAt: Date;
  waitingFor: string | null;
  canSign: boolean;
  signatures: ApprovalSignature[];
  href: string;
}

/** Everything awaiting a signature. `canSign` marks what the caller can sign right now. */
export async function listPending(user: JWTPayload): Promise<PendingItem[]> {
  const mine = (sigs: ApprovalSignature[] | undefined) => {
    const st = approvalState(sigs);
    return st.next !== null && st.next === user.role;
  };
  const items: PendingItem[] = [];

  const orders = await ChannelOrder.find({ status: "PENDING_APPROVAL" }).sort({ createdAt: 1 }).lean();
  for (const o of orders) {
    items.push({
      kind: "order",
      kindLabel: KIND_LABEL.order,
      id: String(o._id),
      title: `${o.orderCode} — ${o.partyName}`,
      subtitle: `${o.partyType === "DEALER" ? "Dealer" : "Distributor"} · ${o.lines.reduce((s, l) => s + l.quantity, 0)} vehicles · by ${o.placedByName}`,
      amount: o.totalValue,
      submittedAt: o.createdAt,
      waitingFor: waitingLabel(o.approvals),
      canSign: mine(o.approvals),
      signatures: o.approvals || [],
      href: `/orders/${o._id}`,
    });
  }
  const schemes = await IncentiveScheme.find({ status: "DRAFT" }).sort({ createdAt: 1 }).lean();
  for (const s of schemes) {
    items.push({
      kind: "scheme",
      kindLabel: KIND_LABEL.scheme,
      id: String(s._id),
      title: s.name,
      subtitle: `${(s.applicableRoles || []).join(", ")} · ${s.rules.map((r) => r.ruleType).join(" + ")}`,
      submittedAt: (s as any).createdAt,
      waitingFor: waitingLabel(s.approvals),
      canSign: mine(s.approvals),
      signatures: s.approvals || [],
      href: `/schemes/${s._id}`,
    });
  }
  const runs = await PayrollRun.find({ status: { $in: ["DRAFT", "UNDER_REVIEW"] } }).sort({ createdAt: 1 }).lean();
  for (const r of runs) {
    items.push({
      kind: "payroll",
      kindLabel: KIND_LABEL.payroll,
      id: String(r._id),
      title: `Payroll ${r.runCode}`,
      subtitle: `${r.totals?.totalEmployees || 0} staff`,
      amount: r.totals?.totalNet,
      submittedAt: (r as any).updatedAt,
      waitingFor: waitingLabel(r.approvals),
      canSign: mine(r.approvals),
      signatures: r.approvals || [],
      href: `/payroll/${r._id}`,
    });
  }
  const credits = await CreditLimitChange.find({ status: "PENDING" }).sort({ createdAt: 1 }).lean();
  for (const c of credits) {
    items.push({
      kind: "credit",
      kindLabel: KIND_LABEL.credit,
      id: String(c._id),
      title: `${c.partyName} (${c.partyCode})`,
      subtitle: `${rupees(c.fromLimit)} → ${rupees(c.toLimit)} · ${c.reason}`,
      amount: c.toLimit,
      submittedAt: c.createdAt,
      waitingFor: waitingLabel(c.approvals),
      canSign: mine(c.approvals),
      signatures: c.approvals || [],
      href: c.partyType === "DEALER" ? `/dealers/${c.party}` : `/distributors/${c.party}`,
    });
  }
  const salaries = await SalaryStructure.find({ status: "PENDING_APPROVAL" })
    .populate("employee", "name employeeCode")
    .sort({ createdAt: 1 })
    .lean();
  for (const s of salaries) {
    const emp: any = s.employee;
    items.push({
      kind: "salary",
      kindLabel: KIND_LABEL.salary,
      id: String(s._id),
      title: `${emp?.name} (${emp?.employeeCode})`,
      subtitle: `Gross ${rupees(s.grossMonthly || s.basic + s.hra + s.conveyance + s.otherAllowances)}/month from ${new Date(
        s.effectiveFrom
      ).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}${s.reason ? ` · ${s.reason}` : ""}`,
      amount: s.grossMonthly,
      submittedAt: (s as any).createdAt,
      waitingFor: waitingLabel(s.approvals),
      canSign: mine(s.approvals),
      signatures: s.approvals || [],
      href: `/employees/${emp?._id}`,
    });
  }
  const claims = await PartnerTarget.find({ "settlement.status": "PENDING_APPROVAL" }).sort({ updatedAt: 1 }).lean();
  for (const t of claims as any[]) {
    const Coll: any = t.partyType === "DEALER" ? Dealer : Distributor;
    const p: any = await Coll.findById(t.party).select("name dealerCode distributorCode").lean();
    items.push({
      kind: "commission",
      kindLabel: KIND_LABEL.commission,
      id: String(t._id),
      title: `${p?.name || "Partner"} (${p?.dealerCode || p?.distributorCode || ""})`,
      subtitle: `${t.period}: ${t.settlement.units} units against a target of ${t.targetUnits} · credit note`,
      amount: t.settlement.amount,
      submittedAt: t.updatedAt,
      waitingFor: waitingLabel(t.settlement.approvals),
      canSign: mine(t.settlement.approvals),
      signatures: t.settlement.approvals || [],
      href: `/targets?period=${t.period}`,
    });
  }
  for (const a of (await AdvanceLoan.find({ status: "PENDING_APPROVAL" }).sort({ createdAt: 1 }).lean()) as any[]) {
    items.push({
      kind: "advance", kindLabel: KIND_LABEL.advance, id: String(a._id),
      title: `${a.employeeName} — ${a.kind === "LOAN" ? "loan" : "salary advance"} ${a.code}`,
      subtitle: `${rupees(a.amount)}${a.kind === "LOAN" ? ` over ${a.tenureMonths} months (${rupees(a.emi)}/month)` : " recovered next payroll"} · ${a.reason}`,
      amount: a.amount, submittedAt: a.createdAt, waitingFor: waitingLabel(a.approvals),
      canSign: mine(a.approvals) && String(a.employee) !== user.userId, signatures: a.approvals || [], href: `/hr/money`,
    });
  }
  for (const c of (await ExpenseClaim.find({ status: "VERIFIED" }).sort({ createdAt: 1 }).lean()) as any[]) {
    items.push({
      kind: "claim", kindLabel: KIND_LABEL.claim, id: String(c._id),
      title: `${c.employeeName} — ${c.code}`,
      subtitle: `${c.category.toLowerCase().replace("_", " ")} on ${c.date} · ${c.description} · checked by ${c.verifiedByName}`,
      amount: c.amount, submittedAt: c.createdAt, waitingFor: waitingLabel(c.approvals),
      canSign: mine(c.approvals) && String(c.employee) !== user.userId, signatures: c.approvals || [], href: `/hr/money`,
    });
  }
  for (const r of (await Resignation.find({ status: "SETTLEMENT_PENDING" }).sort({ updatedAt: 1 }).lean()) as any[]) {
    items.push({
      kind: "settlement", kindLabel: KIND_LABEL.settlement, id: String(r._id),
      title: `${r.employeeName} — last day ${r.acceptedLwd}`,
      subtitle: r.settlement.lines.filter((l: any) => l.amount).map((l: any) => `${l.label}: ${rupees(l.amount)}`).join(" · "),
      amount: r.settlement.net, submittedAt: r.updatedAt, waitingFor: waitingLabel(r.approvals),
      canSign: mine(r.approvals) && String(r.employee) !== user.userId, signatures: r.approvals || [], href: `/hr/exits`,
    });
  }
  return items.sort((a, b) => Number(b.canSign) - Number(a.canSign) || +new Date(a.submittedAt) - +new Date(b.submittedAt));
}

function waitingLabel(sigs: ApprovalSignature[] | undefined) {
  const n = approvalState(sigs).next;
  return n ? LEVEL_LABEL[n] : null;
}
