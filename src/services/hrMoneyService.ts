import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import { User } from "@/models/User";
import { SalaryStructure } from "@/models/SalaryStructure";
import { StoredFile } from "@/models/StoredFile";
import { PayrollRun } from "@/models/PayrollRun";
import { AdvanceLoan, EmployeeDocument, EMPLOYEE_DOC_TYPES, ExpenseClaim, Resignation } from "@/models/Hr";
import { hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { generateFyCode } from "@/lib/codeGenerator";
import { rupeesToPaise } from "@/lib/money";
import { getCurrentPeriod, periodFor } from "@/lib/period";
import { datesBetween, finalSettlement, istDate, overtimePay, recoveryDue } from "@/lib/attendance";
import { assertApprover, HrError, hrSettings, leaveBalances, monthAttendance, todayIst } from "./hrService";

const oid = (v: any) => new mongoose.Types.ObjectId(String(v));
const same = (a: any, b: any) => !!a && !!b && String(a) === String(b);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

async function currentStructure(employeeId: any) {
  const s: any = await SalaryStructure.findOne({ employee: oid(employeeId), status: { $in: ["APPROVED", "SUPERSEDED", null] }, effectiveFrom: { $lte: new Date() } })
    .sort({ effectiveFrom: -1, createdAt: -1 })
    .lean();
  if (!s) throw new HrError("No approved salary structure for this employee");
  return { ...s, gross: s.basic + s.hra + s.conveyance + s.otherAllowances };
}

/** First month whose payroll is still open (not locked) from this month onwards. */
async function nextOpenPeriod() {
  let p = getCurrentPeriod();
  for (let i = 0; i < 3; i++) {
    const [y, m] = p.split("-").map(Number);
    const run: any = await PayrollRun.findOne({ year: y, month: m }).select("status").lean();
    if (!run || run.status !== "LOCKED") return p;
    p = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  return p;
}

/* ------------------------------------------------------------------ */
/* Salary advance & loan (BH → MP approval, recovered through payroll)   */
/* ------------------------------------------------------------------ */

export async function requestAdvance(user: JWTPayload, input: { kind: "ADVANCE" | "LOAN"; amountRupees: number; tenureMonths?: number; reason: string }) {
  if (!["ADVANCE", "LOAN"].includes(input.kind)) throw new HrError("Choose advance or loan");
  const amount = rupeesToPaise(Number(input.amountRupees));
  if (!Number.isFinite(amount) || amount < 100000) throw new HrError("Minimum ₹1,000");
  if (!input.reason?.trim()) throw new HrError("Give a reason");
  const tenure = input.kind === "ADVANCE" ? 1 : Math.floor(Number(input.tenureMonths));
  if (input.kind === "LOAN" && (!Number.isFinite(tenure) || tenure < 2 || tenure > 24)) throw new HrError("Loan tenure must be 2–24 months");
  const open = await AdvanceLoan.findOne({ employee: oid(user.userId), status: { $in: ["PENDING_APPROVAL", "ACTIVE"] } }).lean();
  if (open) throw new HrError(`You already have ${open.code} open (balance ₹${Math.round(open.balance / 100).toLocaleString("en-IN")}). Clear it first.`, 409);
  const s = await currentStructure(user.userId);
  const cfg = await hrSettings();
  const cap = input.kind === "ADVANCE" ? Math.floor((s.gross * cfg.maxAdvancePctOfGross) / 100) : s.gross * cfg.maxLoanMultipleOfGross;
  if (amount > cap) throw new HrError(`${input.kind === "ADVANCE" ? "An advance" : "A loan"} can be at most ₹${Math.round(cap / 100).toLocaleString("en-IN")} for your salary`);
  const emi = Math.ceil(amount / tenure);
  if (input.kind === "LOAN" && emi > Math.floor(s.gross * 0.4)) throw new HrError("The monthly instalment would be over 40% of your gross pay; choose a longer tenure");
  const a = await AdvanceLoan.create({
    code: await generateFyCode(input.kind === "ADVANCE" ? "ADVANCE" : "LOAN"),
    employee: oid(user.userId),
    employeeName: user.name,
    kind: input.kind,
    amount,
    emi,
    tenureMonths: tenure,
    reason: input.reason.trim(),
    balance: amount,
    approvals: [],
  });
  await logAudit({ user, action: "CREATE", resource: "PAYROLL", resourceId: String(a._id), after: { code: a.code, amount } });
  return a;
}

/** Called by the approval engine once the Managing Partner signs. */
export async function activateAdvance(id: any) {
  const a = await AdvanceLoan.findById(id);
  if (!a) return;
  a.status = "ACTIVE";
  a.startPeriod = await nextOpenPeriod();
  await a.save();
}

/* ------------------------------------------------------------------ */
/* Expense claims (manager verifies → BH → MP → paid in payroll)          */
/* ------------------------------------------------------------------ */

const CLAIM_CATS = ["TRAVEL", "FUEL", "FOOD", "LODGING", "MOBILE", "CUSTOMER_DEMO", "OTHER"];

export async function submitClaim(
  user: JWTPayload,
  input: { date: string; category: string; amountRupees: number; description: string; kmTravelled?: number; bill?: { name: string; type: string; data: Buffer } | null }
) {
  if (!YMD.test(input.date || "") || input.date > todayIst()) throw new HrError("Choose the expense date (not in the future)");
  if (input.date < istDate(new Date(Date.now() - 60 * 86400000))) throw new HrError("Claims must be submitted within 60 days");
  if (!CLAIM_CATS.includes(input.category)) throw new HrError("Choose a category");
  const amount = rupeesToPaise(Number(input.amountRupees));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) throw new HrError("Enter an amount up to ₹1,00,000");
  if (!input.description?.trim()) throw new HrError("Describe the expense");
  if (amount > 50000 && !input.bill) throw new HrError("Attach the bill for claims above ₹500");
  let bill = null;
  if (input.bill) {
    if (input.bill.data.length > 2 * 1024 * 1024) throw new HrError("Bill larger than 2 MB");
    if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(input.bill.type)) throw new HrError("Upload the bill as PDF, JPG or PNG");
    bill = (await StoredFile.create({ name: input.bill.name, contentType: input.bill.type, size: input.bill.data.length, data: input.bill.data, uploadedBy: oid(user.userId) }))._id;
  }
  const dup = await ExpenseClaim.findOne({ employee: oid(user.userId), date: input.date, category: input.category, amount, status: { $ne: "REJECTED" } }).lean();
  if (dup) throw new HrError(`Looks like a duplicate of ${dup.code}`, 409);
  return ExpenseClaim.create({
    code: await generateFyCode("CLAIM"),
    employee: oid(user.userId),
    employeeName: user.name,
    date: input.date,
    category: input.category as any,
    amount,
    description: input.description.trim(),
    kmTravelled: input.kmTravelled ? Number(input.kmTravelled) : undefined,
    bill,
    approvals: [],
  });
}

/** Reporting manager / HR checks the claim before it goes to the Business Head. */
export async function verifyClaim(user: JWTPayload, id: string, decision: "VERIFIED" | "REJECTED", reason?: string) {
  const c = await ExpenseClaim.findById(id);
  if (!c) throw new HrError("Claim not found", 404);
  if (c.status !== "SUBMITTED") throw new HrError(`Claim is ${c.status.toLowerCase()}`);
  await assertApprover(user, c.employee);
  if (decision === "REJECTED") {
    if (!reason?.trim()) throw new HrError("Give a reason for rejecting");
    c.status = "REJECTED";
    c.rejectReason = reason.trim();
  } else {
    c.status = "VERIFIED";
  }
  c.verifiedBy = oid(user.userId);
  c.verifiedByName = user.name;
  await c.save();
  await logAudit({ user, action: decision === "VERIFIED" ? "APPROVE" : "REJECT", resource: "PAYROLL", resourceId: id, after: { claim: c.code } });
  return c;
}

/* ------------------------------------------------------------------ */
/* Payroll inputs from HR                                               */
/* ------------------------------------------------------------------ */

export interface HrPayrollInputs {
  lopDays: number | null; // null = attendance not tracked this month → keep manual value
  otMinutes: number;
  otPay: number;
  claims: Array<{ id: mongoose.Types.ObjectId; code: string; amount: number }>;
  loans: Array<{ id: mongoose.Types.ObjectId; code: string; amount: number }>;
  attendance?: any;
}

export async function hrPayrollInputs(employee: any, period: string, salary: { basic: number; otherAllowances: number }, role: string): Promise<HrPayrollInputs> {
  const cfg = await hrSettings();
  const att = await monthAttendance(employee._id || employee, period);
  const otMinutes = cfg.otEligibleRoles.includes(role) ? att.summary.otApprovedMinutes : 0;
  const [claims, loans] = await Promise.all([
    ExpenseClaim.find({ employee: oid(employee._id || employee), $or: [{ status: "APPROVED" }, { status: "PAID", paidInPeriod: period }] }).lean(),
    AdvanceLoan.find({ employee: oid(employee._id || employee), status: { $in: ["ACTIVE", "CLOSED"] }, startPeriod: { $lte: period } }).lean(),
  ]);
  const loanRows = loans
    .map((l: any) => {
      const already = (l.recoveries || []).find((r: any) => r.period === period);
      if (already) return { id: l._id, code: l.code, amount: already.amount };
      if (l.status !== "ACTIVE") return null;
      return { id: l._id, code: l.code, amount: recoveryDue(l) };
    })
    .filter((x: any) => x && x.amount > 0) as HrPayrollInputs["loans"];
  return {
    lopDays: att.tracking ? att.summary.lop : null,
    otMinutes,
    otPay: overtimePay(otMinutes, salary, cfg.otMultiplier),
    claims: claims.map((c: any) => ({ id: c._id, code: c.code, amount: c.amount })),
    loans: loanRows,
    attendance: att.tracking ? att.summary : null,
  };
}

/** When a payroll run is locked: book loan recoveries and mark reimbursed claims paid. */
export async function settleHrOnPayrollLock(period: string, runId: any, entries: Array<{ employee: any; hrAuto?: any }>, session?: any) {
  for (const e of entries) {
    const auto = e.hrAuto || {};
    for (const l of auto.loans || []) {
      const loan = await AdvanceLoan.findById(l.id).session(session ?? null);
      if (!loan || loan.recoveries.some((r) => r.period === period)) continue;
      const amt = Math.min(loan.balance, l.amount);
      loan.recoveries.push({ period, amount: amt, payrollRun: runId, at: new Date() });
      loan.balance -= amt;
      if (loan.balance <= 0) loan.status = "CLOSED";
      await loan.save({ session });
    }
    if ((auto.claims || []).length) {
      await ExpenseClaim.updateMany({ _id: { $in: auto.claims.map((c: any) => c.id) }, status: "APPROVED" }, { $set: { status: "PAID", paidInPeriod: period } }, { session });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Employee documents & profile                                         */
/* ------------------------------------------------------------------ */

async function canManageEmployeeHr(user: JWTPayload, employeeId: any) {
  if (same(user.userId, employeeId)) return "SELF";
  if (await hasPermission(user.role, "hr.manage")) return "HR";
  return null;
}

export async function uploadEmployeeDoc(user: JWTPayload, employeeId: string, input: { docType: string; number?: string; file?: { name: string; type: string; data: Buffer } | null }) {
  const who = await canManageEmployeeHr(user, employeeId);
  if (!who) throw new HrError("Not allowed", 403);
  if (!(EMPLOYEE_DOC_TYPES as readonly string[]).includes(input.docType)) throw new HrError("Choose a document type");
  if (!input.file && !input.number?.trim()) throw new HrError("Attach the file or enter the number");
  let file = null;
  if (input.file) {
    if (input.file.data.length > 2 * 1024 * 1024) throw new HrError("File larger than 2 MB");
    if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(input.file.type)) throw new HrError("Upload a PDF, JPG or PNG");
    file = (await StoredFile.create({ name: input.file.name, contentType: input.file.type, size: input.file.data.length, data: input.file.data, uploadedBy: oid(user.userId) }))._id;
  }
  const d = await EmployeeDocument.create({ employee: oid(employeeId), docType: input.docType as any, number: input.number?.trim(), file, fileName: input.file?.name, uploadedBy: oid(user.userId) });
  if (input.docType === "PHOTO" && file) await User.updateOne({ _id: oid(employeeId) }, { $set: { "profile.photo": file } });
  return d;
}

export async function verifyEmployeeDoc(user: JWTPayload, docId: string) {
  if (!(await hasPermission(user.role, "hr.manage"))) throw new HrError("Only HR verifies documents", 403);
  const d = await EmployeeDocument.findById(docId);
  if (!d) throw new HrError("Document not found", 404);
  if (same(d.uploadedBy, user.userId)) throw new HrError("Someone other than the uploader must verify", 403);
  if (same(d.employee, user.userId)) throw new HrError("You cannot verify your own documents", 403);
  d.verified = true;
  d.verifiedByName = user.name;
  await d.save();
  return d;
}

const SELF_FIELDS = ["address", "emergencyName", "emergencyPhone", "emergencyRelation", "bloodGroup"];
const HR_FIELDS = [...SELF_FIELDS, "dob", "gender"];
export async function updateProfile(user: JWTPayload, employeeId: string, input: Record<string, any>) {
  const who = await canManageEmployeeHr(user, employeeId);
  if (!who) throw new HrError("Not allowed", 403);
  const allowed = who === "HR" ? HR_FIELDS : SELF_FIELDS;
  const set: Record<string, any> = {};
  for (const k of allowed) if (k in input) set[`profile.${k}`] = String(input[k] ?? "").slice(0, 200);
  if (input.emergencyPhone && !/^[6-9]\d{9}$/.test(input.emergencyPhone)) throw new HrError("Emergency phone must be a 10-digit mobile number");
  if (who === "HR") {
    if (input.departmentId !== undefined) set.department = input.departmentId && mongoose.isValidObjectId(input.departmentId) ? oid(input.departmentId) : null;
    if (input.shiftId !== undefined) set.shift = input.shiftId && mongoose.isValidObjectId(input.shiftId) ? oid(input.shiftId) : null;
    if (input.attendanceMode) set.attendanceMode = input.attendanceMode === "OFFICE" ? "OFFICE" : "FIELD";
    if (input.noticeDays != null) set.noticeDays = Math.min(180, Math.max(0, Number(input.noticeDays)));
  }
  await User.updateOne({ _id: oid(employeeId) }, { $set: set });
  await logAudit({ user, action: "UPDATE", resource: "EMPLOYEE", resourceId: employeeId, after: set });
  return User.findById(employeeId).select("-passwordHash").lean();
}

/* ------------------------------------------------------------------ */
/* Resignation & full and final settlement                              */
/* ------------------------------------------------------------------ */

export async function submitResignation(user: JWTPayload, input: { reason: string; requestedLwd: string }) {
  if (!input.reason?.trim()) throw new HrError("Give a reason");
  if (!YMD.test(input.requestedLwd || "") || input.requestedLwd < todayIst()) throw new HrError("Choose your last working day (today or later)");
  if (await Resignation.findOne({ employee: oid(user.userId), status: { $in: ["SUBMITTED", "ACCEPTED", "SETTLEMENT_PENDING"] } })) throw new HrError("You already have a resignation in progress", 409);
  const me: any = await User.findById(user.userId).select("noticeDays").lean();
  return Resignation.create({ employee: oid(user.userId), employeeName: user.name, reason: input.reason.trim(), submittedAt: new Date(), requestedLwd: input.requestedLwd, noticeDays: me?.noticeDays ?? 30, approvals: [] });
}

export async function withdrawResignation(user: JWTPayload, id: string) {
  const r = await Resignation.findById(id);
  if (!r || !same(r.employee, user.userId)) throw new HrError("Not found", 404);
  if (r.status !== "SUBMITTED") throw new HrError("It has already been accepted; ask HR");
  r.status = "WITHDRAWN";
  await r.save();
  return r;
}

/** Manager / HR accepts and fixes the last working day (may waive the notice shortfall). */
export async function acceptResignation(user: JWTPayload, id: string, input: { lwd: string; noticeWaived?: boolean }) {
  const r = await Resignation.findById(id);
  if (!r) throw new HrError("Not found", 404);
  if (r.status !== "SUBMITTED") throw new HrError(`Already ${r.status.toLowerCase()}`);
  await assertApprover(user, r.employee);
  if (!YMD.test(input.lwd || "")) throw new HrError("Choose the last working day");
  if (input.lwd < istDate(r.submittedAt)) throw new HrError("The last working day cannot be before the resignation date");
  r.acceptedLwd = input.lwd;
  r.noticeWaived = !!input.noticeWaived;
  r.acceptedByName = user.name;
  r.status = "ACCEPTED";
  await r.save();
  await logAudit({ user, action: "APPROVE", resource: "EMPLOYEE", resourceId: id, after: { resignation: r.employeeName, lwd: r.acceptedLwd, waived: r.noticeWaived } });
  return r;
}

/** HR computes the full & final settlement; it then needs the Business Head and the Managing Partner. */
export async function computeSettlement(user: JWTPayload, id: string, input: { otherDeductionsRupees?: number } = {}) {
  if (!(await hasPermission(user.role, "hr.manage"))) throw new HrError("Only HR computes the settlement", 403);
  const r = await Resignation.findById(id);
  if (!r) throw new HrError("Not found", 404);
  if (!["ACCEPTED", "SETTLEMENT_PENDING"].includes(r.status)) throw new HrError("Accept the resignation first");
  if (same(r.employee, user.userId)) throw new HrError("You cannot settle your own exit", 403);
  const lwd = r.acceptedLwd!;
  const emp: any = await User.findById(r.employee).select("joiningDate").lean();
  const s = await currentStructure(r.employee);
  const period = lwd.slice(0, 7);
  const [y, m] = period.split("-").map(Number);
  const pi = periodFor(y, m);
  const att = await monthAttendance(r.employee, period);
  // days of the final month up to the LWD, less loss of pay (when attendance is tracked)
  const daysToLwd = Number(lwd.slice(8, 10));
  const lopToLwd = att.tracking ? att.days.filter((d) => d.date <= lwd).reduce((t, d) => t + d.lop, 0) : 0;
  const paidDays = Math.max(0, daysToLwd - lopToLwd);
  // was the final month already paid through payroll?
  const run: any = await PayrollRun.findOne({ year: y, month: m, status: "LOCKED" }).lean();
  const balances = await leaveBalances(r.employee, Number(lwd.slice(0, 4)));
  const el = balances.filter((b) => b.encashable).reduce((t, b) => t + (b.available || 0), 0);
  const loans = await AdvanceLoan.find({ employee: r.employee, status: "ACTIVE" }).lean();
  const claims = await ExpenseClaim.find({ employee: r.employee, status: "APPROVED" }).lean();
  const noticeServed = datesBetween(istDate(r.submittedAt), lwd).length - 1;
  const inputs = {
    monthlyGross: s.gross,
    basic: s.basic,
    lastMonthDaysInMonth: pi.daysInMonth,
    lastMonthPaidDays: run ? 0 : paidDays,
    serviceDays: Math.round((Date.parse(`${lwd}T00:00:00Z`) - new Date(emp.joiningDate).getTime()) / 86400000),
    encashableLeave: el,
    noticeDays: r.noticeDays,
    noticeServedDays: Math.max(0, noticeServed),
    noticeWaived: r.noticeWaived,
    loanBalance: loans.reduce((t, l: any) => t + l.balance, 0),
    pendingReimbursements: claims.reduce((t, c: any) => t + c.amount, 0),
    otherDeductions: Math.max(0, rupeesToPaise(Number(input.otherDeductionsRupees || 0))),
  };
  const result = finalSettlement(inputs);
  r.settlement = { ...result, computedAt: new Date(), inputs };
  r.status = "SETTLEMENT_PENDING";
  r.approvals = [];
  r.markModified("settlement");
  await r.save();
  await logAudit({ user, action: "SUBMIT", resource: "PAYROLL", resourceId: id, after: { settlement: r.employeeName, net: result.net } });
  return r;
}

/** Final approval (MP): close loans and claims, deactivate the login from the LWD. */
export async function closeSettlement(id: any) {
  const r = await Resignation.findById(id);
  if (!r) return;
  await AdvanceLoan.updateMany({ employee: r.employee, status: "ACTIVE" }, { $set: { status: "CLOSED", balance: 0 } });
  await ExpenseClaim.updateMany({ employee: r.employee, status: "APPROVED" }, { $set: { status: "PAID", paidInPeriod: `F&F ${r.acceptedLwd}` } });
  const lwdDate = new Date(`${r.acceptedLwd}T23:59:59+05:30`);
  await User.updateOne({ _id: r.employee }, { $set: { exitDate: lwdDate, ...(lwdDate <= new Date() ? { status: "INACTIVE" } : {}) } });
  r.status = "SETTLED";
  r.settledAt = new Date();
  await r.save();
}

/** Daily job: deactivate logins whose last working day has passed. */
export async function deactivateLeavers() {
  const res = await User.updateMany({ status: "ACTIVE", exitDate: { $ne: null, $lt: new Date() } }, { $set: { status: "INACTIVE" } });
  return res.modifiedCount;
}
