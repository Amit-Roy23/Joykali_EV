import mongoose from "mongoose";
import { JWTPayload } from "@/types";
import { MoneyAccount, IMoneyAccount, Expense, Voucher, Budget, PaymentStamp } from "@/models/Accounts";
import { Sale } from "@/models/Sale";
import { PartsSale, ItemMovement } from "@/models/Item";
import { LedgerEntry } from "@/models/LedgerEntry";
import { SecurityDeposit } from "@/models/SecurityDeposit";
import { Purchase } from "@/models/Purchase";
import { Supplier } from "@/models/Supplier";
import { PayrollRun } from "@/models/PayrollRun";
import { PayrollEntry } from "@/models/PayrollEntry";
import { AdvanceLoan, Resignation } from "@/models/Hr";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { PartnerTarget } from "@/models/PartnerTarget";
import { Dealer } from "@/models/Dealer";
import { Distributor } from "@/models/Distributor";
import { Setting } from "@/models/Setting";
import { StoredFile } from "@/models/StoredFile";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/lib/rbac";
import { generateFyCode } from "@/lib/codeGenerator";
import { ageing, AGE_BUCKETS, daySummary, fyOf, istDay, istRange, monthRange, variance, withRunningBalance, YMD } from "@/lib/accounting";
import { vehicleCosts } from "./stockValue";

export class AccountsError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const oid = (v: any) => new mongoose.Types.ObjectId(String(v));
const toPaise = (r: any) => Math.round(Number(r) * 100);
const today = () => istDay(new Date());

/* ------------------------------------------------------------------ */
/* Settings & cash / bank accounts                                     */
/* ------------------------------------------------------------------ */

export const NON_INCOME_RECEIPTS = ["Capital introduced", "Loan received", "Other receipt (not income)"];
export const NON_EXPENSE_PAYMENTS = ["Drawings", "Loan repaid", "Asset purchase", "GST paid", "TDS paid", "Other payment (not expense)"];

export async function accountsSettings() {
  const s: any = await Setting.findOne().lean();
  const a = s?.accounts || {};
  return {
    expenseCategories: (a.expenseCategories?.length ? a.expenseCategories : ["Miscellaneous"]) as string[],
    expenseApprovalPaise: (a.expenseApprovalPaise ?? 1000000) as number,
    incomeHeads: (a.incomeHeads?.length ? a.incomeHeads : ["Other income"]) as string[],
  };
}

/** Cash in hand and a main bank account exist from the start of the current financial year. */
export async function ensureAccounts() {
  if (await MoneyAccount.exists({})) return;
  const from = fyOf(today()).from;
  try {
    await MoneyAccount.create([
      { name: "Cash in hand", kind: "CASH", openingBalance: 0, openingDate: from, isDefault: true },
      { name: "Main bank account", kind: "BANK", bankName: "Bank", openingBalance: 0, openingDate: from, isDefault: true },
    ]);
  } catch {
    // created concurrently
  }
}

async function defaults() {
  await ensureAccounts();
  const list = await MoneyAccount.find().lean();
  const cash = list.find((a) => a.kind === "CASH" && a.isDefault) || list.find((a) => a.kind === "CASH");
  const bank = list.find((a) => a.kind === "BANK" && a.isDefault) || list.find((a) => a.kind === "BANK");
  return { list, cash: cash || bank!, bank: bank || cash! };
}

export async function saveMoneyAccount(
  user: JWTPayload,
  input: { id?: string; name: string; kind: "CASH" | "BANK"; bankName?: string; accountNo?: string; ifsc?: string; openingRupees?: number; openingDate?: string; isDefault?: boolean; status?: "ACTIVE" | "CLOSED" }
) {
  await ensureAccounts();
  if (!input.name?.trim()) throw new AccountsError("Give the account a name");
  if (!["CASH", "BANK"].includes(input.kind)) throw new AccountsError("Choose cash or bank");
  const openingDate = input.openingDate || fyOf(today()).from;
  if (!YMD.test(openingDate)) throw new AccountsError("Opening date must be a date");
  if (input.kind === "BANK" && input.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(input.ifsc.toUpperCase())) throw new AccountsError("Invalid IFSC code");
  const data: any = {
    name: input.name.trim(),
    kind: input.kind,
    bankName: input.bankName?.trim(),
    accountNo: input.accountNo?.trim(),
    ifsc: input.ifsc?.trim().toUpperCase(),
    openingBalance: toPaise(input.openingRupees || 0),
    openingDate,
  };
  let a: IMoneyAccount;
  if (input.id) {
    if (!mongoose.isValidObjectId(input.id)) throw new AccountsError("Account not found", 404);
    const found = await MoneyAccount.findById(input.id);
    if (!found) throw new AccountsError("Account not found", 404);
    if (found.kind !== input.kind) throw new AccountsError("An account cannot change between cash and bank");
    a = found;
    Object.assign(a, data);
    if (input.status) {
      if (input.status === "CLOSED" && a.isDefault) throw new AccountsError("Make another account the default before closing this one");
      a.status = input.status;
    }
  } else {
    a = new MoneyAccount(data);
  }
  if (input.isDefault && !a.isDefault) {
    await MoneyAccount.updateMany({ kind: a.kind, isDefault: true }, { $set: { isDefault: false } });
    a.isDefault = true;
  }
  await a.save();
  await logAudit({ user, action: input.id ? "UPDATE" : "CREATE", resource: "ACCOUNTS", resourceId: String(a._id), after: { account: a.name, opening: a.openingBalance } });
  return a;
}

async function openAccount(id: string, date: string) {
  if (!mongoose.isValidObjectId(id)) throw new AccountsError("Choose the cash or bank account");
  const a = await MoneyAccount.findById(id).lean();
  if (!a || a.status !== "ACTIVE") throw new AccountsError("That account is closed or missing");
  if (date < a.openingDate) throw new AccountsError(`${a.name} starts on ${a.openingDate}`);
  return a;
}

function payDate(d?: string) {
  const date = d || today();
  if (!YMD.test(date)) throw new AccountsError("Choose the payment date");
  if (date > today()) throw new AccountsError("The payment date cannot be in the future");
  return date;
}

const stamp = (user: JWTPayload, a: any, date: string, reference?: string): PaymentStamp => ({
  account: a._id,
  date,
  mode: a.kind,
  reference: reference?.trim(),
  by: oid(user.userId),
  byName: user.name,
  at: new Date(),
});

/* ------------------------------------------------------------------ */
/* Money movements: every receipt and payment, from every module       */
/* ------------------------------------------------------------------ */

export interface MoneyLine {
  date: string;
  at: number;
  account: string;
  inflow: number;
  outflow: number;
  source: string; // Sale receipt, Dealer payment, Expense, …
  reference: string;
  party: string;
  narration: string;
  href?: string;
}

/**
 * All money in and out of the company's cash and bank accounts up to `to`.
 * Records that carry only a payment mode go to the default cash account (CASH)
 * or the default bank account (UPI, bank transfer, cheque, finance payout).
 */
export async function moneyLines(to: string = today()): Promise<MoneyLine[]> {
  const { cash, bank } = await defaults();
  const byMode = (mode?: string) => String(mode === "CASH" ? cash._id : bank._id);
  const end = istRange(to, to).end;
  const lines: MoneyLine[] = [];
  const push = (l: Omit<MoneyLine, "at"> & { at?: number }) => lines.push({ at: 0, ...l });

  const [sales, receipts, deposits, purchases, expenses, vouchers, runs, advances, exits, partsSales] = await Promise.all([
    Sale.find({ status: { $ne: "CANCELLED" }, "payments.0": { $exists: true } }).select("saleCode customer.name payments").lean(),
    LedgerEntry.find({ type: "PAYMENT", book: null, date: { $lte: end } }).lean(),
    SecurityDeposit.find({ type: { $in: ["RECEIVED", "REFUNDED"] }, mode: { $ne: "LEDGER" }, date: { $lte: end } }).lean(),
    Purchase.find({ "payments.0": { $exists: true } }).populate("supplier", "name").select("purchaseCode invoiceNumber supplier payments").lean(),
    Expense.find({ status: "PAID", "payment.date": { $lte: to } }).lean(),
    Voucher.find({ status: "POSTED", date: { $lte: to } }).lean(),
    PayrollRun.find({ "payment.date": { $lte: to } }).lean(),
    AdvanceLoan.find({ "disbursement.date": { $lte: to } }).lean(),
    Resignation.find({ "payment.date": { $lte: to } }).lean(),
    PartsSale.find({ status: { $ne: "CANCELLED" }, "payments.0": { $exists: true } }).select("saleCode customer.name payments").lean(),
  ]);
  const partyNames = await partyNameMap([...receipts, ...deposits] as any[]);

  for (const s of sales as any[])
    for (const p of s.payments || []) {
      if (new Date(p.date) > end) continue;
      push({ date: istDay(p.date), at: +new Date(p.date), account: byMode(p.mode), inflow: p.amount, outflow: 0, source: "Retail sale", reference: s.saleCode, party: s.customer?.name || "", narration: `${p.mode}${p.reference ? ` · ${p.reference}` : ""}`, href: `/sales/${s._id}` });
    }
  for (const s of partsSales as any[])
    for (const p of s.payments || []) {
      if (new Date(p.date) > end) continue;
      push({ date: istDay(p.date), at: +new Date(p.date), account: byMode(p.mode), inflow: p.amount, outflow: 0, source: "Parts / accessories sale", reference: s.saleCode, party: s.customer?.name || "", narration: `${p.mode}${p.reference ? ` · ${p.reference}` : ""}`, href: "/parts-sales" });
    }
  for (const r of receipts as any[]) {
    push({ date: istDay(r.date), at: +new Date(r.date), account: String(r.account || byMode(r.paymentMode)), inflow: r.credit, outflow: 0, source: `${r.partyType === "DEALER" ? "Dealer" : "Distributor"} payment`, reference: r.reference, party: partyNames.get(String(r.party)) || "", narration: r.narration || r.paymentMode || "" });
  }
  for (const d of deposits as any[]) {
    const isIn = d.type === "RECEIVED";
    push({ date: istDay(d.date), at: +new Date(d.date), account: byMode(d.mode), inflow: isIn ? d.amount : 0, outflow: isIn ? 0 : d.amount, source: isIn ? "Security deposit received" : "Security deposit refunded", reference: d.reference || "", party: partyNames.get(String(d.party)) || "", narration: d.narration || d.mode });
  }
  for (const p of purchases as any[])
    for (const pay of p.payments || []) {
      if (new Date(pay.date) > end) continue;
      push({ date: istDay(pay.date), at: +new Date(pay.date), account: String(pay.account || byMode(pay.mode)), inflow: 0, outflow: pay.amount, source: "Supplier payment", reference: `${p.purchaseCode} · inv ${p.invoiceNumber}`, party: p.supplier?.name || "", narration: pay.reference || pay.mode, href: `/purchases/${p._id}` });
    }
  for (const e of expenses as any[]) {
    push({ date: e.payment.date, at: +new Date(e.payment.at || e.updatedAt), account: String(e.payment.account), inflow: 0, outflow: e.total, source: `Expense · ${e.category}`, reference: e.code, party: e.vendor || "", narration: e.description });
  }
  for (const v of vouchers as any[]) {
    if (v.type === "CONTRA") {
      push({ date: v.date, at: +new Date(v.createdAt), account: String(v.account), inflow: 0, outflow: v.amount, source: "Contra (transfer out)", reference: v.code, party: "", narration: v.narration });
      push({ date: v.date, at: +new Date(v.createdAt) + 1, account: String(v.toAccount), inflow: v.amount, outflow: 0, source: "Contra (transfer in)", reference: v.code, party: "", narration: v.narration });
    } else {
      const isIn = v.type === "RECEIPT";
      push({ date: v.date, at: +new Date(v.createdAt), account: String(v.account), inflow: isIn ? v.amount : 0, outflow: isIn ? 0 : v.amount, source: `${isIn ? "Receipt" : "Payment"} · ${v.head}`, reference: v.code, party: v.reference || "", narration: v.narration });
    }
  }
  for (const r of runs as any[]) {
    push({ date: r.payment.date, at: +new Date(r.payment.at || r.updatedAt), account: String(r.payment.account), inflow: 0, outflow: r.totals?.totalNet || 0, source: "Salaries paid", reference: r.runCode, party: `${r.totals?.totalEmployees || 0} staff`, narration: r.payment.reference || "Net pay", href: `/payroll/${r._id}` });
  }
  for (const a of advances as any[]) {
    push({ date: a.disbursement.date, at: +new Date(a.disbursement.at || a.updatedAt), account: String(a.disbursement.account), inflow: 0, outflow: a.amount, source: a.kind === "LOAN" ? "Staff loan paid" : "Salary advance paid", reference: a.code, party: a.employeeName, narration: a.reason });
  }
  for (const r of exits as any[]) {
    const net = r.settlement?.net || 0;
    push({ date: r.payment.date, at: +new Date(r.payment.at || r.updatedAt), account: String(r.payment.account), inflow: net < 0 ? -net : 0, outflow: net > 0 ? net : 0, source: net >= 0 ? "Full & final paid" : "Full & final recovered", reference: `F&F ${r.acceptedLwd}`, party: r.employeeName, narration: "Final settlement" });
  }
  return lines.filter((l) => l.date <= to);
}

async function partyNameMap(rows: Array<{ partyType: string; party: any }>) {
  const ids = (t: string) => [...new Set(rows.filter((r) => r.partyType === t).map((r) => String(r.party)))].map(oid);
  const [ds, dts] = await Promise.all([
    Dealer.find({ _id: { $in: ids("DEALER") } }).select("name dealerCode").lean(),
    Distributor.find({ _id: { $in: ids("DISTRIBUTOR") } }).select("name distributorCode").lean(),
  ]);
  return new Map<string, string>([...ds.map((d: any) => [String(d._id), d.name] as [string, string]), ...dts.map((d: any) => [String(d._id), d.name] as [string, string])]);
}

/** Balance of every account today (or on a date). */
export async function accountBalances(asOf: string = today()) {
  const { list } = await defaults();
  const lines = await moneyLines(asOf);
  return list.map((a: any) => {
    const mine = lines.filter((l) => l.account === String(a._id) && l.date >= a.openingDate);
    return { ...a, balance: a.openingBalance + mine.reduce((s, l) => s + l.inflow - l.outflow, 0) };
  });
}

/** Cash book / bank book of one account for a date range, with opening, running and closing balance. */
export async function accountBook(accountId: string, from: string, to: string) {
  if (!YMD.test(from) || !YMD.test(to) || from > to) throw new AccountsError("Choose a valid date range");
  await ensureAccounts();
  if (!mongoose.isValidObjectId(accountId)) throw new AccountsError("Account not found", 404);
  const a: any = await MoneyAccount.findById(accountId).lean();
  if (!a) throw new AccountsError("Account not found", 404);
  const all = (await moneyLines(to)).filter((l) => l.account === String(a._id) && l.date >= a.openingDate);
  const before = all.filter((l) => l.date < from);
  const opening = a.openingBalance + before.reduce((s, l) => s + l.inflow - l.outflow, 0);
  const lines = withRunningBalance(opening, all.filter((l) => l.date >= from));
  const inflow = lines.reduce((s, l) => s + l.inflow, 0);
  const outflow = lines.reduce((s, l) => s + l.outflow, 0);
  return { account: a, from, to, opening, inflow, outflow, closing: opening + inflow - outflow, lines, days: daySummary(opening, lines) };
}

/* ------------------------------------------------------------------ */
/* Profit and loss                                                      */
/* ------------------------------------------------------------------ */

export interface PnlLine {
  head: string;
  amount: number;
  note?: string;
}

/**
 * Profit and loss for an IST date range, on an accrual basis and before GST:
 * sales are taken when billed, the cost of each vehicle sold is its purchase cost,
 * salaries are counted for each payroll month inside the range.
 */
export async function profitAndLoss(from: string, to: string) {
  if (!YMD.test(from) || !YMD.test(to) || from > to) throw new AccountsError("Choose a valid date range");
  const { start, end } = istRange(from, to);
  const [sales, invoices, creditNotes, expenses, vouchers, commissions, partsSales, stockMoves] = await Promise.all([
    Sale.find({ status: { $ne: "CANCELLED" }, saleDate: { $gte: start, $lte: end } }).populate("vehicle", "model purchase").lean(),
    DeliveryOrder.find({ "document.kind": "TAX_INVOICE", "document.date": { $gte: start, $lte: end }, status: { $ne: "CANCELLED" } })
      .select("document vehicles lines")
      .lean(),
    DeliveryOrder.find({ "grn.at": { $gte: start, $lte: end }, "grn.creditNoteValue": { $gt: 0 } }).select("grn vehicles lines").lean(),
    Expense.find({ status: { $in: ["APPROVED", "PAID"] }, date: { $gte: from, $lte: to } }).lean(),
    Voucher.find({ status: "POSTED", type: { $in: ["RECEIPT", "PAYMENT"] }, date: { $gte: from, $lte: to } }).lean(),
    PartnerTarget.find({ "settlement.status": "SETTLED", "settlement.settledAt": { $gte: start, $lte: end } }).lean(),
    PartsSale.find({ status: { $ne: "CANCELLED" }, saleDate: { $gte: start, $lte: end } }).select("lines subTotal").lean(),
    // stock that left without a sale: warranty replacements and write-offs
    ItemMovement.find({ at: { $gte: start, $lte: end }, type: { $in: ["REPLACEMENT_OUT", "STOCK_OUT", "SCRAP"] }, condition: "GOOD" }).select("type qty unitCost").lean(),
  ]);

  // Revenue
  const retail = (sales as any[]).reduce((s, x) => s + x.priceBreakdown.exShowroom - (x.priceBreakdown.discount || 0), 0);
  const accessories = (sales as any[]).reduce((s, x) => s + (x.priceBreakdown.accessories || 0), 0);
  // Parts & accessories: lines on vehicle invoices + counter sales (before GST)
  const vehicleItemLines = (sales as any[]).flatMap((x) => x.items || []);
  const counterLines = (partsSales as any[]).flatMap((x) => x.lines || []);
  const partsRevenue = [...vehicleItemLines, ...counterLines].reduce((s, l: any) => s + (l.taxable || 0), 0);
  const channel = (invoices as any[]).reduce((s, d) => s + (d.document?.taxableValue || 0), 0);
  let returns = 0;
  for (const d of creditNotes as any[]) {
    for (const item of (d.grn.items || []).filter((i: any) => i.condition === "SHORT")) {
      const v = d.vehicles.find((x: any) => String(x.vehicle) === String(item.vehicle));
      const line = v && d.lines.find((l: any) => String(l.model) === String(v.model));
      returns += line?.unitPrice || 0;
    }
  }
  const revenue: PnlLine[] = [
    { head: "Vehicle sales — retail (showrooms & dealers on consignment)", amount: retail, note: `${sales.length} sale(s), after discount` },
    { head: "Vehicle sales — distributors (tax invoices)", amount: channel, note: `${invoices.length} invoice(s)` },
    { head: "Accessories (lump sum on older invoices)", amount: accessories },
    { head: "Parts, accessories & batteries", amount: partsRevenue, note: `${vehicleItemLines.length + counterLines.length} line(s) on vehicle invoices and counter bills` },
    { head: "Less: short-delivery credit notes", amount: -returns },
  ];
  const totalRevenue = revenue.reduce((s, l) => s + l.amount, 0);

  // Cost of vehicles sold
  const soldVehicles: any[] = [
    ...(sales as any[]).filter((x) => x.vehicle).map((x) => x.vehicle),
    ...(invoices as any[]).flatMap((d) => d.vehicles.map((v: any) => ({ _id: v.vehicle, model: v.model }))),
  ];
  const { Vehicle } = await import("@/models/Vehicle");
  const missingPurchase = soldVehicles.filter((v) => v.purchase === undefined).map((v) => v._id);
  const purchaseOf = new Map(
    (missingPurchase.length ? await Vehicle.find({ _id: { $in: missingPurchase } }).select("purchase").lean() : []).map((v: any) => [String(v._id), v.purchase])
  );
  const costs = await vehicleCosts(soldVehicles.map((v) => ({ _id: v._id, model: v.model, purchase: v.purchase ?? purchaseOf.get(String(v._id)) })));
  // A vehicle sold without its battery costs less: the battery went back into stock at its purchase rate.
  const batteryBack = (sales as any[]).reduce((s, x) => s + (x.withoutBattery ? x.batteryReturn?.unitCost || 0 : 0), 0);
  const partsCost = [...vehicleItemLines, ...counterLines].reduce((s, l: any) => s + (l.unitCost || 0) * (l.qty || 0), 0);
  const cogs = soldVehicles.reduce((s, v) => s + (costs.get(String(v._id)) || 0), 0) - batteryBack + partsCost;
  const grossProfit = totalRevenue - cogs;

  // Other income
  const otherIncome: PnlLine[] = [];
  for (const v of (vouchers as any[]).filter((x) => x.type === "RECEIPT" && !NON_INCOME_RECEIPTS.includes(x.head))) {
    const row = otherIncome.find((r) => r.head === v.head) || (otherIncome.push({ head: v.head, amount: 0 }), otherIncome[otherIncome.length - 1]);
    row.amount += v.amount;
  }
  const totalOtherIncome = otherIncome.reduce((s, l) => s + l.amount, 0);

  // Expenses
  const payroll = await payrollCost(from.slice(0, 7), to.slice(0, 7));
  const byHead = new Map<string, number>();
  const add = (h: string, n: number) => byHead.set(h, (byHead.get(h) || 0) + n);
  for (const e of expenses as any[]) add(e.category, e.gstInput ? e.amount : e.total);
  for (const v of (vouchers as any[]).filter((x) => x.type === "PAYMENT" && !NON_EXPENSE_PAYMENTS.includes(x.head))) add(v.head, v.amount);
  const commission = (commissions as any[]).reduce((s, t) => s + (t.settlement?.amount || 0), 0);
  const moveCost = (types: string[]) => (stockMoves as any[]).filter((m) => types.includes(m.type)).reduce((s, m) => s + -m.qty * (m.unitCost || 0), 0);
  const expenseLines: PnlLine[] = [
    { head: "Salaries & wages", amount: payroll.salaries, note: payroll.note },
    { head: "Employer PF & ESI", amount: payroll.employer },
    { head: "Sales incentives", amount: payroll.incentives },
    { head: "Staff expense reimbursements", amount: payroll.reimbursements },
    { head: "Partner target commission", amount: commission },
    { head: "Battery warranty replacements (at cost)", amount: moveCost(["REPLACEMENT_OUT"]) },
    { head: "Stock written off (damaged / used / lost, at cost)", amount: moveCost(["STOCK_OUT", "SCRAP"]) },
    ...[...byHead.entries()].sort((a, b) => b[1] - a[1]).map(([head, amount]) => ({ head, amount })),
  ].filter((l) => l.amount !== 0);
  const totalExpenses = expenseLines.reduce((s, l) => s + l.amount, 0);
  const netProfit = grossProfit + totalOtherIncome - totalExpenses;

  return {
    from,
    to,
    revenue,
    totalRevenue,
    cogs,
    unitsSold: soldVehicles.length,
    grossProfit,
    grossMarginPct: totalRevenue ? Math.round((grossProfit / totalRevenue) * 1000) / 10 : 0,
    otherIncome,
    totalOtherIncome,
    expenses: expenseLines,
    totalExpenses,
    netProfit,
    netMarginPct: totalRevenue ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0,
    provisional: payroll.provisional,
  };
}

/** Employee cost for payroll months fromPeriod..toPeriod (YYYY-MM). */
async function payrollCost(fromPeriod: string, toPeriod: string) {
  const runs = await PayrollRun.find().select("year month status runCode").lean();
  const inRange = runs.filter((r: any) => {
    const p = `${r.year}-${String(r.month).padStart(2, "0")}`;
    return p >= fromPeriod && p <= toPeriod;
  });
  const entries = inRange.length ? await PayrollEntry.find({ payrollRun: { $in: inRange.map((r: any) => r._id) } }).select("grossPay earnings hrAuto employer").lean() : [];
  let gross = 0;
  let incentives = 0;
  let reimbursements = 0;
  let employer = 0;
  for (const e of entries as any[]) {
    gross += e.grossPay || 0;
    incentives += e.earnings?.incentives || 0;
    reimbursements += (e.hrAuto?.claims || []).reduce((s: number, c: any) => s + (c.amount || 0), 0);
    employer += e.employer?.total || 0;
  }
  const open = inRange.filter((r: any) => r.status !== "LOCKED");
  return {
    salaries: gross - incentives - reimbursements,
    incentives,
    reimbursements,
    employer,
    provisional: open.length > 0,
    note: inRange.length ? `${inRange.map((r: any) => r.runCode).join(", ")}${open.length ? " (not all locked)" : ""}` : "No payroll in this range",
  };
}

/* ------------------------------------------------------------------ */
/* Company expenses                                                    */
/* ------------------------------------------------------------------ */

export interface ExpenseInput {
  date: string;
  category: string;
  description: string;
  vendor?: string;
  billNo?: string;
  amountRupees: number;
  gstRupees?: number;
  gstInput?: boolean;
  costCentre?: string;
  bill?: { name: string; type: string; data: Buffer } | null;
  /** Pay at once (small expenses only, Accounts): cash / bank account + reference. */
  payNow?: { accountId: string; date?: string; reference?: string } | null;
}

export async function createExpense(user: JWTPayload, input: ExpenseInput) {
  const cfg = await accountsSettings();
  if (!YMD.test(input.date || "") || input.date > today()) throw new AccountsError("Choose the bill date (not in the future)");
  if (!cfg.expenseCategories.includes(input.category)) throw new AccountsError("Choose an expense head");
  if (!input.description?.trim()) throw new AccountsError("Describe the expense");
  const amount = toPaise(input.amountRupees);
  const gst = toPaise(input.gstRupees || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new AccountsError("Enter the amount");
  if (!Number.isFinite(gst) || gst < 0 || gst > amount) throw new AccountsError("GST looks wrong");
  const total = amount + gst;
  if (total >= 200000 && !input.bill) throw new AccountsError("Attach the bill for expenses of ₹2,000 or more");
  if (input.gstInput && !gst) throw new AccountsError("Input credit needs the GST amount on the bill");
  let bill = null;
  if (input.bill) {
    if (input.bill.data.length > 3 * 1024 * 1024) throw new AccountsError("Bill larger than 3 MB");
    if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(input.bill.type)) throw new AccountsError("Upload the bill as PDF, JPG or PNG");
    bill = (await StoredFile.create({ name: input.bill.name, contentType: input.bill.type, size: input.bill.data.length, data: input.bill.data, uploadedBy: oid(user.userId) }))._id;
  }
  const approvalRequired = total >= cfg.expenseApprovalPaise;
  let status: "PENDING_APPROVAL" | "APPROVED" | "PAID" = approvalRequired ? "PENDING_APPROVAL" : "APPROVED";
  let payment: PaymentStamp | null = null;
  if (input.payNow?.accountId) {
    if (approvalRequired) throw new AccountsError(`Expenses of ₹${cfg.expenseApprovalPaise / 100} or more need Business Head and Managing Partner approval before payment`);
    if (!(await hasPermission(user.role, "accounts.manage"))) throw new AccountsError("Only Accounts can pay an expense", 403);
    const date = payDate(input.payNow.date);
    if (date < input.date) throw new AccountsError("Payment date is before the bill date");
    const a = await openAccount(input.payNow.accountId, date);
    payment = stamp(user, a, date, input.payNow.reference);
    status = "PAID";
  }
  const e = await Expense.create({
    code: await generateFyCode("EXPENSE"),
    date: input.date,
    category: input.category,
    description: input.description.trim(),
    vendor: input.vendor?.trim(),
    billNo: input.billNo?.trim(),
    amount,
    gstAmount: gst,
    total,
    gstInput: !!input.gstInput,
    costCentre: input.costCentre?.trim() || "Head office",
    bill,
    status,
    approvalRequired,
    approvals: [],
    payment,
    createdBy: oid(user.userId),
    createdByName: user.name,
  });
  await logAudit({ user, action: "CREATE", resource: "EXPENSE", resourceId: String(e._id), after: { code: e.code, total, category: e.category, status } });
  // A small bill (no approval needed) entered by someone else goes straight to the Payments desk.
  if (status === "APPROVED") {
    const { notifyRoles } = await import("./notificationService");
    await notifyRoles(
      ["ACCOUNTANT"],
      { kind: "payment", title: `New bill to pay: ${e.code} ${e.category} ₹${Math.round(total / 100).toLocaleString("en-IN")}`, body: `${e.description} — entered by ${user.name}. Pay it from Accounts → Payments desk.`, href: "/accounts" },
      user.userId
    );
  }
  return e;
}

export async function listExpenses(q: { status?: string; from?: string; to?: string; category?: string }) {
  const f: any = {};
  if (q.status) f.status = { $in: q.status.split(",") };
  if (q.category) f.category = q.category;
  if (q.from && YMD.test(q.from)) f.date = { ...(f.date || {}), $gte: q.from };
  if (q.to && YMD.test(q.to)) f.date = { ...(f.date || {}), $lte: q.to };
  return Expense.find(f).sort({ date: -1, createdAt: -1 }).limit(300).lean();
}

export async function cancelExpense(user: JWTPayload, id: string, reason: string) {
  if (!mongoose.isValidObjectId(id)) throw new AccountsError("Expense not found", 404);
  const e = await Expense.findById(id);
  if (!e) throw new AccountsError("Expense not found", 404);
  if (!["PENDING_APPROVAL", "APPROVED"].includes(e.status)) throw new AccountsError("Only an unpaid expense can be cancelled");
  if (String(e.createdBy) !== user.userId && !(await hasPermission(user.role, "accounts.manage"))) throw new AccountsError("Not allowed", 403);
  if (!reason?.trim()) throw new AccountsError("Give a reason");
  e.status = "CANCELLED";
  e.rejectReason = reason.trim();
  await e.save();
  await logAudit({ user, action: "CANCEL", resource: "EXPENSE", resourceId: id, after: { code: e.code, reason } });
  return e;
}

/* ------------------------------------------------------------------ */
/* Payouts: approved expenses, salaries, advances, settlements, suppliers */
/* ------------------------------------------------------------------ */

export type PayoutKind = "expense" | "payroll" | "advance" | "settlement" | "purchase";

/** Everything approved that still has to be paid out. */
export async function pendingPayouts() {
  const [expenses, runs, advances, exits, purchases] = await Promise.all([
    Expense.find({ status: "APPROVED" }).sort({ date: 1 }).lean(),
    PayrollRun.find({ status: "LOCKED", $or: [{ payment: null }, { payment: { $exists: false } }] }).sort({ year: 1, month: 1 }).lean(),
    AdvanceLoan.find({ status: { $in: ["ACTIVE", "CLOSED"] }, $or: [{ disbursement: null }, { disbursement: { $exists: false } }] }).sort({ createdAt: 1 }).lean(),
    Resignation.find({ status: "SETTLED", $or: [{ payment: null }, { payment: { $exists: false } }] }).lean(),
    Purchase.find({ paymentStatus: { $ne: "PAID" } }).populate("supplier", "name").sort({ invoiceDate: 1 }).lean(),
  ]);
  const paid = (p: any) => (p.payments || []).reduce((s: number, x: any) => s + x.amount, 0);
  return [
    ...expenses.map((e: any) => ({ kind: "expense" as const, id: String(e._id), title: `${e.code} · ${e.category}`, subtitle: `${e.description}${e.vendor ? ` · ${e.vendor}` : ""} · bill ${e.date}`, amount: e.total, since: e.date })),
    ...runs.map((r: any) => ({ kind: "payroll" as const, id: String(r._id), title: `Salaries ${r.runCode}`, subtitle: `${r.totals?.totalEmployees || 0} staff · net pay (locked)`, amount: r.totals?.totalNet || 0, since: istDay(r.lockedAt || r.updatedAt) })),
    ...advances.map((a: any) => ({ kind: "advance" as const, id: String(a._id), title: `${a.code} · ${a.employeeName}`, subtitle: `${a.kind === "LOAN" ? "Loan" : "Salary advance"} approved · ${a.reason}`, amount: a.amount, since: istDay(a.updatedAt) })),
    ...exits
      .filter((r: any) => (r.settlement?.net || 0) !== 0)
      .map((r: any) => ({ kind: "settlement" as const, id: String(r._id), title: `Full & final · ${r.employeeName}`, subtitle: (r.settlement?.net || 0) > 0 ? `Pay out (last day ${r.acceptedLwd})` : `Recover from employee (last day ${r.acceptedLwd})`, amount: Math.abs(r.settlement?.net || 0), since: r.acceptedLwd })),
    ...purchases
      .map((p: any) => ({ kind: "purchase" as const, id: String(p._id), title: `${p.purchaseCode} · ${p.supplier?.name || "Supplier"}`, subtitle: `Invoice ${p.invoiceNumber} · ${p.paymentStatus === "PARTIAL" ? "part paid" : "unpaid"}`, amount: p.totalAmount - paid(p), since: istDay(p.invoiceDate) }))
      .filter((p) => p.amount > 0),
  ];
}

/** Record a payout from a cash or bank account. Purchases accept a part payment. */
export async function recordPayout(user: JWTPayload, kind: PayoutKind, id: string, input: { accountId: string; date?: string; reference?: string; amountRupees?: number }) {
  if (!mongoose.isValidObjectId(id)) throw new AccountsError("Not found", 404);
  const date = payDate(input.date);
  const a = await openAccount(input.accountId, date);
  const st = stamp(user, a, date, input.reference);
  let summary = "";
  if (kind === "expense") {
    const e = await Expense.findById(id);
    if (!e) throw new AccountsError("Expense not found", 404);
    if (e.status !== "APPROVED") throw new AccountsError(e.status === "PENDING_APPROVAL" ? "Waiting for Business Head and Managing Partner approval" : `Expense is ${e.status.toLowerCase()}`);
    if (date < e.date) throw new AccountsError("Payment date is before the bill date");
    e.payment = st;
    e.status = "PAID";
    await e.save();
    summary = `${e.code} ${e.total}`;
  } else if (kind === "payroll") {
    const r = await PayrollRun.findById(id);
    if (!r) throw new AccountsError("Payroll run not found", 404);
    if (r.status !== "LOCKED") throw new AccountsError("Salaries are paid only after the payroll run is locked");
    if (r.payment) throw new AccountsError("Already paid");
    r.payment = st;
    await r.save();
    summary = `${r.runCode} ${r.totals?.totalNet}`;
  } else if (kind === "advance") {
    const x = await AdvanceLoan.findById(id);
    if (!x) throw new AccountsError("Advance not found", 404);
    if (!["ACTIVE", "CLOSED"].includes(x.status)) throw new AccountsError("Only an approved advance can be paid out");
    if (x.disbursement) throw new AccountsError("Already paid out");
    x.disbursement = st;
    await x.save();
    summary = `${x.code} ${x.amount}`;
  } else if (kind === "settlement") {
    const r = await Resignation.findById(id);
    if (!r) throw new AccountsError("Settlement not found", 404);
    if (r.status !== "SETTLED") throw new AccountsError("The settlement must be approved first");
    if (r.payment) throw new AccountsError("Already paid");
    r.payment = st;
    await r.save();
    summary = `F&F ${r.employeeName} ${r.settlement?.net}`;
  } else if (kind === "purchase") {
    const p = await Purchase.findById(id);
    if (!p) throw new AccountsError("Purchase not found", 404);
    const due = p.totalAmount - (p.payments || []).reduce((s, x) => s + x.amount, 0);
    const amt = input.amountRupees != null && input.amountRupees !== ("" as any) ? toPaise(input.amountRupees) : due;
    if (!Number.isFinite(amt) || amt <= 0) throw new AccountsError("Enter the amount paid");
    if (amt > due) throw new AccountsError(`Only ₹${(due / 100).toLocaleString("en-IN")} is due on this invoice`);
    if (date < istDay(p.invoiceDate)) throw new AccountsError("Payment date is before the supplier invoice date");
    p.payments.push({ amount: amt, date: new Date(`${date}T12:00:00+05:30`), mode: a.kind === "CASH" ? "CASH" : "BANK", reference: input.reference?.trim(), account: a._id as any, byName: user.name } as any);
    p.paymentStatus = amt === due ? "PAID" : "PARTIAL";
    await p.save();
    summary = `${p.purchaseCode} ${amt}`;
  } else throw new AccountsError("Unknown payout");
  await logAudit({ user, action: "PAYMENT", resource: "ACCOUNTS", resourceId: id, after: { kind, account: a.name, date, summary } });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Vouchers                                                            */
/* ------------------------------------------------------------------ */

export async function voucherHeads() {
  const cfg = await accountsSettings();
  return {
    RECEIPT: [...cfg.incomeHeads, ...NON_INCOME_RECEIPTS],
    PAYMENT: [...cfg.expenseCategories, ...NON_EXPENSE_PAYMENTS],
    CONTRA: ["Cash deposited in bank", "Cash withdrawn from bank", "Transfer between banks"],
  };
}

export async function createVoucher(
  user: JWTPayload,
  input: { type: "RECEIPT" | "PAYMENT" | "CONTRA"; date: string; accountId: string; toAccountId?: string; amountRupees: number; head: string; narration: string; reference?: string }
) {
  if (!["RECEIPT", "PAYMENT", "CONTRA"].includes(input.type)) throw new AccountsError("Choose receipt, payment or contra");
  const date = payDate(input.date);
  const a = await openAccount(input.accountId, date);
  const heads = (await voucherHeads())[input.type];
  if (!heads.includes(input.head)) throw new AccountsError("Choose an account head");
  if (!input.narration?.trim()) throw new AccountsError("Write a narration");
  const amount = toPaise(input.amountRupees);
  if (!Number.isFinite(amount) || amount <= 0) throw new AccountsError("Enter the amount");
  let to: any = null;
  if (input.type === "CONTRA") {
    to = await openAccount(input.toAccountId || "", date);
    if (String(to._id) === String(a._id)) throw new AccountsError("Choose two different accounts");
  }
  if (input.type !== "RECEIPT") {
    // A cash account can never go below zero.
    if (a.kind === "CASH") {
      const bal = (await accountBalances(date)).find((x: any) => String(x._id) === String(a._id))?.balance || 0;
      if (amount > bal) throw new AccountsError(`${a.name} has only ₹${(bal / 100).toLocaleString("en-IN")} on ${date}`);
    }
  }
  const v = await Voucher.create({
    code: await generateFyCode("VOUCHER"),
    type: input.type,
    date,
    account: a._id,
    toAccount: to?._id || null,
    amount,
    head: input.head,
    narration: input.narration.trim(),
    reference: input.reference?.trim(),
    createdBy: oid(user.userId),
    createdByName: user.name,
  });
  await logAudit({ user, action: "CREATE", resource: "ACCOUNTS", resourceId: String(v._id), after: { code: v.code, type: v.type, amount, head: v.head } });
  return v;
}

export async function cancelVoucher(user: JWTPayload, id: string, reason: string) {
  if (!mongoose.isValidObjectId(id)) throw new AccountsError("Voucher not found", 404);
  const v = await Voucher.findById(id);
  if (!v || v.status !== "POSTED") throw new AccountsError("Voucher not found", 404);
  if (!reason?.trim()) throw new AccountsError("Give a reason");
  v.status = "CANCELLED";
  v.cancelReason = reason.trim();
  await v.save();
  await logAudit({ user, action: "CANCEL", resource: "ACCOUNTS", resourceId: id, after: { code: v.code, reason } });
  return v;
}

export async function listVouchers(q: { from?: string; to?: string }) {
  const f: any = {};
  if (q.from && YMD.test(q.from)) f.date = { ...(f.date || {}), $gte: q.from };
  if (q.to && YMD.test(q.to)) f.date = { ...(f.date || {}), $lte: q.to };
  return Voucher.find(f).populate("account", "name").populate("toAccount", "name").sort({ date: -1, createdAt: -1 }).limit(300).lean();
}

/* ------------------------------------------------------------------ */
/* Outstanding: receivables and payables with ageing                   */
/* ------------------------------------------------------------------ */

export async function outstandingReport() {
  const now = new Date();
  const entries = await LedgerEntry.find({ book: null }).select("partyType party date debit credit").lean();
  const groups = new Map<string, any[]>();
  for (const e of entries as any[]) {
    const k = `${e.partyType}:${e.party}`;
    groups.set(k, [...(groups.get(k) || []), e]);
  }
  const names = await partyNameMap(entries as any[]);
  const [dealers, distributors] = await Promise.all([
    Dealer.find().select("creditDays dealerCode city").lean(),
    Distributor.find().select("creditDays distributorCode city").lean(),
  ]);
  const meta = new Map<string, any>([...dealers, ...distributors].map((p: any) => [String(p._id), p]));
  const receivables = [...groups.entries()]
    .map(([k, list]) => {
      const [partyType, party] = k.split(":");
      const ag = ageing(list, now);
      const m = meta.get(party);
      return { partyType, party, name: names.get(party) || "Partner", code: m?.dealerCode || m?.distributorCode || "", city: m?.city || "", creditDays: m?.creditDays ?? 30, ...ag };
    })
    .filter((r) => r.total > 0 || r.advance > 0)
    .sort((a, b) => b.total - a.total);

  const purchases = await Purchase.find({ paymentStatus: { $ne: "PAID" } }).populate("supplier", "name").lean();
  const bySupplier = new Map<string, { supplier: string; name: string; entries: any[] }>();
  for (const p of purchases as any[]) {
    const k = String(p.supplier?._id || p.supplier);
    const row = bySupplier.get(k) || { supplier: k, name: p.supplier?.name || "Supplier", entries: [] as any[] };
    row.entries.push({ date: p.invoiceDate, debit: p.totalAmount, credit: (p.payments || []).reduce((s: number, x: any) => s + x.amount, 0) });
    bySupplier.set(k, row);
  }
  const payables = [...bySupplier.values()].map((r) => ({ supplier: r.supplier, name: r.name, invoices: r.entries.length, ...ageing(r.entries, now) })).filter((r) => r.total > 0);
  const payouts = await pendingPayouts();
  const other = payouts.filter((p) => p.kind !== "purchase");
  const sum = (rows: any[], b: string) => rows.reduce((s, r) => s + (r.buckets?.[b] || 0), 0);
  return {
    asOf: today(),
    buckets: AGE_BUCKETS,
    receivables,
    receivableTotals: Object.fromEntries(AGE_BUCKETS.map((b) => [b, sum(receivables, b)])),
    receivableTotal: receivables.reduce((s, r) => s + r.total, 0),
    payables,
    payableTotals: Object.fromEntries(AGE_BUCKETS.map((b) => [b, sum(payables, b)])),
    payableTotal: payables.reduce((s, r) => s + r.total, 0),
    otherPayables: other,
    otherPayableTotal: other.reduce((s, r) => s + r.amount, 0),
  };
}

/* ------------------------------------------------------------------ */
/* Budget vs actual                                                    */
/* ------------------------------------------------------------------ */

export const SALARY_HEAD = "Salaries & wages (incl. PF/ESI, incentives)";

export async function budgetHeads() {
  return [SALARY_HEAD, ...(await accountsSettings()).expenseCategories];
}

export async function setBudget(user: JWTPayload, period: string, rows: Array<{ head: string; amountRupees: number }>) {
  if (!/^\d{4}-\d{2}$/.test(period || "")) throw new AccountsError("Choose the month");
  const heads = await budgetHeads();
  for (const r of rows || []) {
    if (!heads.includes(r.head)) continue;
    const amount = toPaise(r.amountRupees || 0);
    if (!Number.isFinite(amount) || amount < 0) throw new AccountsError(`Budget for ${r.head} looks wrong`);
    if (amount === 0) await Budget.deleteOne({ period, head: r.head });
    else await Budget.updateOne({ period, head: r.head }, { $set: { amount, updatedByName: user.name } }, { upsert: true });
  }
  await logAudit({ user, action: "UPDATE", resource: "BUDGET", resourceId: period, after: { heads: rows?.length || 0 } });
  return budgetVsActual(period);
}

/** Actual spend per head for one month. */
async function actualsFor(period: string) {
  const { from, to } = monthRange(period);
  const [expenses, vouchers, pay] = await Promise.all([
    Expense.find({ status: { $in: ["APPROVED", "PAID"] }, date: { $gte: from, $lte: to } }).select("category amount total gstInput").lean(),
    Voucher.find({ status: "POSTED", type: "PAYMENT", date: { $gte: from, $lte: to } }).select("head amount").lean(),
    payrollCost(period, period),
  ]);
  const m = new Map<string, number>();
  m.set(SALARY_HEAD, pay.salaries + pay.employer + pay.incentives);
  for (const e of expenses as any[]) m.set(e.category, (m.get(e.category) || 0) + (e.gstInput ? e.amount : e.total));
  for (const v of (vouchers as any[]).filter((x) => !NON_EXPENSE_PAYMENTS.includes(x.head))) m.set(v.head, (m.get(v.head) || 0) + v.amount);
  return m;
}

/** Month and financial-year-to-date budget against actual, per head. */
export async function budgetVsActual(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period || "")) throw new AccountsError("Choose the month");
  const heads = await budgetHeads();
  const fy = fyOf(`${period}-01`);
  const months: string[] = [];
  for (let p = fy.from.slice(0, 7); p <= period; ) {
    months.push(p);
    const [y, mm] = p.split("-").map(Number);
    p = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  }
  const [budgets, actualList] = await Promise.all([Budget.find({ period: { $in: months } }).lean(), Promise.all(months.map((p) => actualsFor(p)))]);
  const actual = new Map(months.map((p, i) => [p, actualList[i]]));
  const rows = heads.map((head) => {
    const b = (p: string) => (budgets as any[]).find((x) => x.period === p && x.head === head)?.amount || 0;
    const a = (p: string) => actual.get(p)?.get(head) || 0;
    const month = { budget: b(period), actual: a(period) };
    // Year to date compares like with like: only months that carry a budget for this head.
    const budgeted = months.filter((p) => b(p) > 0);
    const ytd = { budget: budgeted.reduce((s, p) => s + b(p), 0), actual: budgeted.reduce((s, p) => s + a(p), 0), months: budgeted.length, actualAll: months.reduce((s, p) => s + a(p), 0) };
    return { head, month: { ...month, ...variance(month.budget, month.actual) }, ytd: { ...ytd, ...variance(ytd.budget, ytd.actual) } };
  });
  const tot = (k: "month" | "ytd") => {
    const budget = rows.reduce((s, r) => s + r[k].budget, 0);
    const act = rows.reduce((s, r) => s + r[k].actual, 0);
    return { budget, actual: act, ...variance(budget, act) };
  };
  return { period, fy: fy.label, rows, totals: { month: tot("month"), ytd: tot("ytd") } };
}

/* ------------------------------------------------------------------ */
/* Dashboard summary                                                   */
/* ------------------------------------------------------------------ */

export async function accountsOverview() {
  const t = today();
  const fy = fyOf(t);
  const month = monthRange(t.slice(0, 7));
  const [balances, payouts, pnlMonth, pendingApproval] = await Promise.all([
    accountBalances(t),
    pendingPayouts(),
    profitAndLoss(month.from, t),
    Expense.countDocuments({ status: "PENDING_APPROVAL" }),
  ]);
  return { today: t, fy, balances, payouts, pnlMonth, pendingApproval };
}
