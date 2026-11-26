/**
 * Read-only data audit: recomputes the stored figures independently and reports any mismatch.
 * Sales & GST, invoices, ledgers, credit, incentives, payroll, stock states, warehouses, accounts.
 *
 *   pnpm tsx scripts/audit.ts
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { connectToDatabase } from "../src/lib/db";
import { PartnerSale, Sale, Vehicle, VehicleModel, DeliveryOrder, LedgerEntry, Distributor, Dealer, IncentiveLedger, PayrollEntry, PayrollRun, StockMovement, Purchase, WarehouseTransfer, StockTransfer } from "../src/models";
import { creditSummary } from "../src/services/creditService";
import { profitAndLoss, accountBalances, accountBook, outstandingReport } from "../src/services/accountsService";
import { warehouseBoard } from "../src/services/warehouseService";
import { MoneyAccount } from "../src/models/Accounts";
import { fyOf, istDay, monthRange } from "../src/lib/accounting";

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  -> ${detail}`}`);
}
const S = (x: any) => String(x);

async function main() {
  await connectToDatabase();

  /* ---------- Retail sales & GST ---------- */
  const sales: any[] = await Sale.find().lean();
  const models = new Map((await VehicleModel.find().lean()).map((m: any) => [S(m._id), m]));
  const vehicles: any[] = await Vehicle.find().lean();
  const vById = new Map(vehicles.map((v) => [S(v._id), v]));
  let badGst = 0, badTotal = 0, overpaid = 0;
  for (const s of sales) {
    const p = s.priceBreakdown;
    const m = models.get(S(vById.get(S(s.vehicle))?.model));
    const gst = Math.round(((p.exShowroom - p.discount) * (m?.gstRate ?? 5)) / 100);
    if (gst !== p.gst) badGst++;
    const itemsTotal = (s.items || []).reduce((t: number, l: any) => t + l.amount, 0);
    if (p.exShowroom - p.discount + p.gst + p.registration + p.insurance + p.accessories + itemsTotal !== s.totalAmount) badTotal++;
    if ((s.payments || []).reduce((t: number, x: any) => t + x.amount, 0) > s.totalAmount) overpaid++;
  }
  check(`retail sales: GST = rate × (ex-showroom − discount) on all ${sales.length}`, badGst === 0, `${badGst} wrong`);
  check("retail sales: bill total = ex-showroom − discount + GST + registration + insurance + accessories + item lines", badTotal === 0, `${badTotal} wrong`);
  check("retail sales: no sale collected more than its bill", overpaid === 0, `${overpaid}`);
  const live = sales.filter((s) => s.status !== "CANCELLED");
  const perVehicle = new Map<string, number>();
  for (const s of live) perVehicle.set(S(s.vehicle), (perVehicle.get(S(s.vehicle)) || 0) + 1);
  check("each vehicle has at most one live retail sale", [...perVehicle.values()].every((n) => n === 1));
  check("every live sale's vehicle is SOLD", live.every((s) => vById.get(S(s.vehicle))?.status === "SOLD"), live.filter((s) => vById.get(S(s.vehicle))?.status !== "SOLD").map((s) => s.saleCode).join(","));
  const cancelled = sales.filter((s) => s.status === "CANCELLED");
  check("cancelled sales released their vehicle", cancelled.every((s) => perVehicle.has(S(s.vehicle)) || vById.get(S(s.vehicle))?.status !== "SOLD"));

  const inwardAt = new Map((await StockMovement.find({ movementType: "INWARD" }).select("vehicle timestamp").lean()).map((m: any) => [S(m.vehicle), istDay(m.timestamp)]));
  const today0 = istDay(new Date());
  check("no retail sale is dated in the future or before its vehicle came into stock", sales.every((s) => istDay(s.saleDate) <= today0 && (!inwardAt.get(S(s.vehicle)) || istDay(s.saleDate) >= inwardAt.get(S(s.vehicle))!)), sales.filter((s) => istDay(s.saleDate) > today0 || istDay(s.saleDate) < (inwardAt.get(S(s.vehicle)) || "")).map((s) => s.saleCode).slice(0, 5).join(","));

  /* ---------- Vehicle state consistency ---------- */
  const partnerSales: any[] = await PartnerSale.find({ status: { $ne: "CANCELLED" } }).lean();
  const psVehicles = (ps: any) => (ps.lines || ps.vehicles || []).map((l: any) => S(l.vehicle));
  const soldByRetail = new Set([...live.map((s) => S(s.vehicle)), ...partnerSales.filter((p) => p.buyerKind === "CUSTOMER" || p.buyerType === "CUSTOMER" || p.customer?.name).flatMap(psVehicles)]);
  const odd: string[] = [];
  for (const v of vehicles) {
    const id = v.chassisNumber;
    if (v.status === "IN_STOCK" && v.currentLocationType !== "WAREHOUSE") odd.push(`${id} IN_STOCK at ${v.currentLocationType}`);
    if (v.status === "RESERVED" && (!v.deliveryOrder || v.currentLocationType !== "WAREHOUSE")) odd.push(`${id} RESERVED without DO`);
    if (v.status === "AT_OUTLET" && !v.currentLocationOutlet) odd.push(`${id} AT_OUTLET without outlet`);
    if (v.status === "IN_TRANSIT" && !v.transfer && !v.deliveryOrder) odd.push(`${id} IN_TRANSIT without a transfer or DO`);
    if (v.status === "WITH_DISTRIBUTOR" && !v.currentLocationDistributor) odd.push(`${id} WITH_DISTRIBUTOR without distributor`);
    if (v.status === "ALLOCATED_TO_DEALER" && !v.currentLocationDealer) odd.push(`${id} ALLOCATED without dealer`);
    if (v.status === "SOLD" && !soldByRetail.has(S(v._id)) && !v.sale) odd.push(`${id} SOLD without a sale`);
  }
  check(`every vehicle's status matches its location (${vehicles.length} vehicles)`, odd.length === 0, odd.slice(0, 5).join("; "));
  const inward = new Set((await StockMovement.find({ movementType: "INWARD" }).select("vehicle").lean()).map((m: any) => S(m.vehicle)));
  check("every vehicle has an inward stock movement", vehicles.every((v) => inward.has(S(v._id))), `${vehicles.filter((v) => !inward.has(S(v._id))).length} missing`);
  const purchases: any[] = await Purchase.find().lean();
  let badPurchase = 0;
  for (const p of purchases) {
    const sub = p.lineItems.reduce((t: number, l: any) => t + l.unitCost * l.quantity, 0);
    const gst = p.lineItems.reduce((t: number, l: any) => t + Math.round((l.unitCost * l.quantity * l.gstRate) / 100), 0);
    const paid = (p.payments || []).reduce((t: number, x: any) => t + x.amount, 0);
    const status = paid === 0 ? "UNPAID" : paid >= p.totalAmount ? "PAID" : "PARTIAL";
    if (Math.abs(sub - p.subTotal) > 1 || Math.abs(sub + gst - p.totalAmount) > p.lineItems.length || status !== p.paymentStatus || paid > p.totalAmount) badPurchase++;
  }
  check(`purchases: subtotal, GST, total and paid status add up (${purchases.length})`, badPurchase === 0, `${badPurchase} wrong`);

  /* ---------- Delivery orders: invoice maths, place of supply ---------- */
  const dos: any[] = await DeliveryOrder.find({ "document.number": { $exists: true } }).lean();
  let badDoc = 0, badSplit = 0, badUnits = 0;
  for (const d of dos) {
    const taxable = d.lines.reduce((t: number, l: any) => t + l.quantity * l.unitPrice, 0);
    const tax = d.lines.reduce((t: number, l: any) => t + Math.round((l.quantity * l.unitPrice * l.gstRate) / 100), 0);
    if (Math.abs(taxable - d.document.taxableValue) > 1 || Math.abs(taxable + tax - d.document.totalValue) > d.lines.length) badDoc++;
    const inter = d.partySnapshot.stateCode !== "19";
    if (inter ? (d.document.cgst || 0) + (d.document.sgst || 0) !== 0 : (d.document.igst || 0) !== 0) badSplit++;
    if (["DISPATCHED", "DELIVERED", "DELIVERED_WITH_ISSUES"].includes(d.status) && d.vehicles.length !== d.lines.reduce((t: number, l: any) => t + l.quantity, 0)) badUnits++;
  }
  check(`DO invoices/challans: taxable + GST = total (${dos.length})`, badDoc === 0, `${badDoc}`);
  check("DO invoices: IGST only between states, CGST+SGST inside West Bengal", badSplit === 0, `${badSplit}`);
  check("dispatched DOs carry exactly the ordered units", badUnits === 0, `${badUnits}`);
  const inv = await LedgerEntry.find({ type: "INVOICE", book: null }).lean();
  const docTotal = new Map(dos.filter((d) => d.document.kind === "TAX_INVOICE").map((d) => [d.document.number, d.document.totalValue]));
  check("each distributor invoice is posted to its ledger at the invoice value", inv.every((e: any) => !docTotal.has(e.reference) || docTotal.get(e.reference) === e.debit) && [...docTotal.keys()].every((n) => inv.some((e: any) => e.reference === n)));

  /* ---------- Credit ---------- */
  let badCredit = 0;
  const parties = [...(await Distributor.find().select("_id").lean()).map((d: any) => ["DISTRIBUTOR", d._id]), ...(await Dealer.find().select("_id").lean()).map((d: any) => ["DEALER", d._id])] as Array<["DISTRIBUTOR" | "DEALER", any]>;
  for (const [t, id] of parties) {
    const c = await creditSummary(t, id);
    const book = c.supplier ? { book: new mongoose.Types.ObjectId(c.supplier.id) } : { book: null };
    const e = await LedgerEntry.find({ partyType: t, party: id, ...book }).lean();
    const bal = e.reduce((s: number, x: any) => s + x.debit - x.credit, 0);
    if (c.ledgerBalance !== bal || c.exposure !== c.ledgerBalance + c.openOrders + c.pipeline + c.consignment || c.available !== c.limit - c.exposure) badCredit++;
  }
  check(`credit: balance = ledger, exposure = ledger + orders + pipeline + consignment, available = limit − exposure (${parties.length} partners)`, badCredit === 0, `${badCredit}`);

  /* ---------- Incentives & payroll ---------- */
  const ledgers: any[] = await IncentiveLedger.find().lean();
  check(`incentive ledgers: total = sum of schemes (${ledgers.length})`, ledgers.every((l) => Math.abs(l.totalEarned - l.breakdown.reduce((s: number, b: any) => s + b.earnedAmount, 0)) <= 1));
  const runs: any[] = await PayrollRun.find().lean();
  const entries: any[] = await PayrollEntry.find().lean();
  let badEntry = 0, badStat = 0, badInc = 0;
  const reasons: string[] = [];
  for (const e of entries) {
    const lines = e.earningLines?.length ? e.earningLines.reduce((s: number, l: any) => s + l.amount, 0) : e.earnings.basic + e.earnings.hra + e.earnings.conveyance + e.earnings.otherAllowances;
    const plus = (e.adjustments || []).filter((a: any) => a.amount > 0).reduce((s: number, a: any) => s + a.amount, 0);
    const d = e.deductions;
    const ded = d.pf + d.esi + d.professionalTax + d.tds + d.advanceRecovery + d.other;
    if (lines + e.earnings.incentives + plus !== e.grossPay || ded !== e.totalDeductions || Math.max(0, e.grossPay - ded) !== e.netPay || e.workingDays - e.lopDays !== e.paidDays) {
      badEntry++;
      reasons.push(e.payslipCode);
    }
    const st = e.salaryStructureSnapshot?.setup?.statutory;
    if (st && d.pf > Math.round((st.pfCeilingPaise * st.pfEmployeeRate) / 100 / 100) * 100 && st.pfCapAtCeiling) badStat++;
    const full = (e.salaryStructureSnapshot?.setup?.earnings || []).reduce((s: number, l: any) => s + l.amount, 0);
    if (st && d.esi > 0 && full > st.esiCeilingPaise) badStat++;
    const run = runs.find((r) => S(r._id) === S(e.payrollRun));
    const led = ledgers.find((l) => S(l.employee) === S(e.employee) && l.period === `${run.year}-${String(run.month).padStart(2, "0")}`);
    if ((led?.totalEarned || 0) !== e.earnings.incentives) badInc++;
  }
  check(`payslips: columns + incentives + additions = gross; deductions add up; net = gross − deductions (${entries.length})`, badEntry === 0, reasons.slice(0, 5).join(","));
  check("payslips: PF within the wage ceiling, ESI only up to ₹21,000 gross", badStat === 0, `${badStat}`);
  check("payslips: incentives equal the incentive ledger of that month", badInc === 0, `${badInc}`);
  let badRun = 0;
  for (const r of runs) {
    const es = entries.filter((e) => S(e.payrollRun) === S(r._id));
    if (r.totals.totalGross !== es.reduce((s, e) => s + e.grossPay, 0) || r.totals.totalNet !== es.reduce((s, e) => s + e.netPay, 0) || r.totals.totalEmployees !== es.length) badRun++;
  }
  check(`payroll run totals = sum of payslips (${runs.length} runs)`, badRun === 0, `${badRun}`);

  /* ---------- Warehouses & transfers ---------- */
  const board = await warehouseBoard();
  const inWh = vehicles.filter((v) => v.currentLocationType === "WAREHOUSE" && ["IN_STOCK", "RESERVED"].includes(v.status)).length;
  check("warehouse board units = vehicles held in warehouses", board.reduce((s: number, w: any) => s + w.units, 0) === inWh, `${board.reduce((s: number, w: any) => s + w.units, 0)} vs ${inWh}`);
  const wts: any[] = await WarehouseTransfer.find().lean();
  const stx: any[] = await StockTransfer.find().lean();
  const moving = new Set([
    ...[...wts, ...stx].filter((t) => t.status === "IN_TRANSIT").flatMap((t) => t.vehicles.map((v: any) => S(v.vehicle))),
    ...partnerSales.filter((p) => p.status === "IN_TRANSIT").flatMap(psVehicles),
  ]);
  check("units on an open transfer are IN_TRANSIT, and only those", vehicles.filter((v) => v.transfer && v.status === "IN_TRANSIT").every((v) => moving.has(S(v._id))) && [...moving].every((id) => vById.get(id)?.status === "IN_TRANSIT"));
  check("transfer value = sum of its units", wts.every((t) => t.totalValue === t.vehicles.reduce((s: number, v: any) => s + v.value, 0)));

  /* ---------- Accounts ---------- */
  const today = istDay(new Date());
  const fy = fyOf(today);
  const bal = await accountBalances(today);
  let badBook = 0;
  for (const a of bal as any[]) {
    const b = await accountBook(S(a._id), a.openingDate, today);
    if (b.closing !== a.balance || b.opening !== a.openingBalance) badBook++;
    if (a.kind === "CASH" && b.lines.some((l) => l.balance < 0)) badBook++;
  }
  check("each cash / bank book closes at the account balance; cash never below zero", badBook === 0, `${badBook}`);
  const year = await profitAndLoss(fy.from, today);
  const months: string[] = [];
  for (let p = fy.from.slice(0, 7); p <= today.slice(0, 7); ) {
    months.push(p);
    const [y, m] = p.split("-").map(Number);
    p = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  const parts = await Promise.all(months.map((p) => { const r = monthRange(p); return profitAndLoss(r.from, r.to > today ? today : r.to); }));
  const sum = (k: "totalRevenue" | "cogs" | "totalExpenses" | "netProfit" | "totalOtherIncome") => parts.reduce((s, x) => s + x[k], 0);
  check("P&L for the year = sum of the monthly P&Ls (revenue, cost, expenses, profit)", (["totalRevenue", "cogs", "totalExpenses", "netProfit", "totalOtherIncome"] as const).every((k) => sum(k) === year[k]), (["totalRevenue", "cogs", "totalExpenses", "netProfit"] as const).map((k) => `${k} ${sum(k)} vs ${year[k]}`).join("; "));
  const { start, end } = { start: new Date(`${fy.from}T00:00:00+05:30`), end: new Date(`${today}T23:59:59.999+05:30`) };
  const retail = live.filter((s) => s.saleDate >= start && s.saleDate <= end).reduce((t, s) => t + s.priceBreakdown.exShowroom - s.priceBreakdown.discount, 0);
  check("P&L retail sales = sales register before GST", year.revenue[0].amount === retail, `${year.revenue[0].amount} vs ${retail}`);
  const sold = live.filter((s) => s.saleDate >= start && s.saleDate <= end).length + dos.filter((d) => d.document.kind === "TAX_INVOICE" && new Date(d.document.date) >= start).reduce((t, d) => t + d.vehicles.length, 0);
  check("P&L cost of sales covers every vehicle billed in the year", year.unitsSold === sold, `${year.unitsSold} vs ${sold}`);
  const out = await outstandingReport();
  const ledgerAll = await LedgerEntry.find({ book: null }).lean();
  const net = ledgerAll.reduce((s: number, e: any) => s + e.debit - e.credit, 0);
  const advances = out.receivables.reduce((s: number, r: any) => s + r.advance, 0);
  check("outstanding receivables − advances = net of the company's partner ledgers", out.receivableTotal - advances === net, `${out.receivableTotal} − ${advances} vs ${net}`);
  const due = purchases.reduce((s, p) => s + p.totalAmount - (p.payments || []).reduce((t: number, x: any) => t + x.amount, 0), 0);
  check("outstanding payables = unpaid purchase invoices", out.payableTotal === due, `${out.payableTotal} vs ${due}`);
  check("cash/bank accounts exist with one default of each kind", (await MoneyAccount.countDocuments({ kind: "CASH", isDefault: true })) === 1 && (await MoneyAccount.countDocuments({ kind: "BANK", isDefault: true })) === 1);

  // ---------------- Parts, accessories, batteries & chargers
  const { Item, ItemStock, ItemSerial, ItemMovement, PartsSale, BatteryJob } = await import("../src/models/Item");
  const allItems: any[] = await Item.find().lean();
  let stockVsLedger = 0;
  let serialVsStock = 0;
  for (const i of allItems) {
    for (const cond of ["GOOD", "DEFECTIVE", "REPAIR"]) {
      const held = (await ItemStock.find({ item: i._id, condition: cond }).lean()).reduce((t: number, x: any) => t + x.qty, 0);
      const moved = (await ItemMovement.find({ item: i._id, condition: cond }).lean()).reduce((t: number, x: any) => t + x.qty, 0);
      if (held !== moved) stockVsLedger++;
      if (i.serialTracked && (await ItemSerial.countDocuments({ item: i._id, status: "IN_STOCK", condition: cond })) !== held) serialVsStock++;
    }
  }
  check(`items: stock on hand = sum of stock movements, per item and condition (${allItems.length} items)`, stockVsLedger === 0, `${stockVsLedger} off`);
  check("items: serial numbers in stock = quantity on hand for serial-tracked items", serialVsStock === 0, `${serialVsStock} off`);
  check("items: no negative stock anywhere", (await ItemStock.countDocuments({ qty: { $lt: 0 } })) === 0);
  const ps: any[] = await PartsSale.find().lean();
  const badPs = ps.filter((x) => {
    const sub = x.lines.reduce((t: number, l: any) => t + l.taxable, 0);
    const gst = x.lines.reduce((t: number, l: any) => t + l.gst, 0);
    const linesOk = x.lines.every((l: any) => l.taxable === l.rate * l.qty - l.discount && l.gst === Math.round((l.taxable * l.gstRate) / 100) && l.amount === l.taxable + l.gst);
    return !linesOk || sub !== x.subTotal || gst !== x.gstAmount || sub + gst !== x.totalAmount || x.payments.reduce((t: number, p: any) => t + p.amount, 0) > x.totalAmount;
  }).length;
  check(`parts sales: line GST, totals and payments add up (${ps.length} bills)`, badPs === 0, `${badPs} wrong`);
  const soldOut = (await ItemMovement.find({ type: { $in: ["SALE", "SALE_CANCEL"] } }).lean()).reduce((t: number, m: any) => t - m.qty, 0);
  const liveLines = [...ps.filter((x) => x.status !== "CANCELLED").flatMap((x) => x.lines), ...live.flatMap((x: any) => x.items || [])].reduce((t: number, l: any) => t + l.qty, 0);
  check("items: units sold in the stock ledger = units on live invoices", soldOut === liveLines, `${soldOut} vs ${liveLines}`);
  const noBat: any[] = live.filter((x: any) => x.withoutBattery);
  const noBatOk = (await Promise.all(noBat.map(async (x: any) => !!x.batteryReturn && (await ItemMovement.exists({ type: "BATTERY_FROM_VEHICLE", reference: x.saleCode }))))).every(Boolean);
  check(`vehicles sold without battery put the battery into stock (${noBat.length})`, noBatOk);
  const jobs: any[] = await BatteryJob.find().lean();
  const repairHeld = (await ItemStock.find({ condition: "REPAIR" }).lean()).reduce((t: number, x: any) => t + x.qty, 0);
  check("battery service: customer batteries held = jobs still in repair", repairHeld === jobs.filter((j) => j.status === "IN_REPAIR").length, `${repairHeld} vs ${jobs.filter((j) => j.status === "IN_REPAIR").length}`);

  // ---------------- Battery out register & payment requests
  const { BatteryRemoval } = await import("../src/models/Item");
  const openRemovals = await BatteryRemoval.find({ status: "REMOVED" }).select("vehicle").lean();
  const offVehicles = await Vehicle.find({ batteryRemoved: true }).select("_id").lean();
  const openSet = new Set(openRemovals.map((r: any) => String(r.vehicle)));
  check(
    `battery register: every vehicle without battery has one open record, and only those (${offVehicles.length})`,
    openRemovals.length === offVehicles.length && offVehicles.every((v: any) => openSet.has(String(v._id))),
    `${openRemovals.length} records vs ${offVehicles.length} vehicles`
  );
  const { Item: ItemM } = await import("../src/models/Item");
  check("batteries carry 18% GST", (await ItemM.countDocuments({ category: "BATTERY", gstRate: { $ne: 18 } })) === 0);
  const { PaymentRequest, Voucher: VoucherM } = await import("../src/models/Accounts");
  const reqs: any[] = await PaymentRequest.find().lean();
  let badReq = 0;
  for (const r of reqs) {
    const v: any = r.payment?.voucher ? await VoucherM.findById(r.payment.voucher).lean() : null;
    if (r.status === "PAID" && (!v || v.amount !== r.amount || v.status !== "POSTED" || String(v.request) !== String(r._id) || v.type !== (r.type === "TRANSFER" ? "CONTRA" : "PAYMENT"))) badReq++;
    if (r.status !== "PAID" && r.payment) badReq++;
    if (["APPROVED", "PAID", "REJECTED"].includes(r.status) && !r.decision) badReq++;
    if (r.decision && String(r.decision.by) === String(r.requestedBy) && !["BUSINESS_HEAD", "MANAGING_PARTNER", "ADMIN"].includes(r.requestedByRole)) badReq++;
  }
  check(`payment requests: paid ones have their voucher, approved ones a decision, nobody approves their own (${reqs.length})`, badReq === 0, `${badReq} wrong`);

  console.log(`\n${pass} passed, ${fails.length} failed`);
  await mongoose.disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
