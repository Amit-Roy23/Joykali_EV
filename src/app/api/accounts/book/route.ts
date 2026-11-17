import ExcelJS from "exceljs";
import { handle } from "@/lib/route";
import { rs, xlsxResponse } from "@/lib/xlsx";
import { istDay, monthRange } from "@/lib/accounting";
import { accountBook } from "@/services/accountsService";

/** Cash book / bank book. ?account=&from=&to=&format=xlsx */
export const GET = handle(async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const m = monthRange(istDay(new Date()).slice(0, 7));
  const b = await accountBook(sp.get("account") || "", sp.get("from") || m.from, sp.get("to") || istDay(new Date()));
  if (sp.get("format") !== "xlsx") return b;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(b.account.kind === "CASH" ? "Cash book" : "Bank book");
  ws.addRow([`${b.account.name} — ${b.account.kind === "CASH" ? "Cash book" : "Bank book"} ${b.from} to ${b.to}`]).font = { bold: true, size: 13 };
  ws.addRow(["Date", "Particulars", "Party", "Reference", "Narration", "Receipts (Rs.)", "Payments (Rs.)", "Balance (Rs.)"]).font = { bold: true };
  ws.addRow([b.from, "Opening balance", "", "", "", "", "", rs(b.opening)]);
  for (const l of b.lines) ws.addRow([l.date, l.source, l.party, l.reference, l.narration, l.inflow ? rs(l.inflow) : "", l.outflow ? rs(l.outflow) : "", rs(l.balance)]);
  ws.addRow([b.to, "Closing balance", "", "", "", rs(b.inflow), rs(b.outflow), rs(b.closing)]).font = { bold: true };
  [12, 30, 24, 22, 30, 14, 14, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const dw = wb.addWorksheet("Day summary");
  dw.addRow(["Date", "Opening", "Receipts", "Payments", "Closing"]).font = { bold: true };
  for (const d of b.days) dw.addRow([d.date, rs(d.opening), rs(d.inflow), rs(d.outflow), rs(d.closing)]);
  return xlsxResponse(wb, `${b.account.name.replace(/\W+/g, "_")}_${b.from}_${b.to}.xlsx`);
}, "accounts.view");
