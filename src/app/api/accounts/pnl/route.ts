import ExcelJS from "exceljs";
import { handle } from "@/lib/route";
import { rs, xlsxResponse } from "@/lib/xlsx";
import { fyOf, istDay } from "@/lib/accounting";
import { profitAndLoss } from "@/services/accountsService";

/** Profit and loss. ?from=&to= (default: financial year to date) &format=xlsx */
export const GET = handle(async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const t = istDay(new Date());
  const p = await profitAndLoss(sp.get("from") || fyOf(t).from, sp.get("to") || t);
  if (sp.get("format") !== "xlsx") return p;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Profit and loss");
  ws.addRow([`Profit and loss account ${p.from} to ${p.to}${p.provisional ? " (provisional — payroll not locked)" : ""}`]).font = { bold: true, size: 13 };
  const sec = (title: string) => (ws.addRow([title]).font = { bold: true });
  sec("Revenue from operations (before GST)");
  for (const l of p.revenue) ws.addRow([l.head, rs(l.amount), l.note || ""]);
  ws.addRow(["Total revenue", rs(p.totalRevenue)]).font = { bold: true };
  ws.addRow([`Less: cost of vehicles sold (${p.unitsSold} units at purchase cost)`, rs(-p.cogs)]);
  ws.addRow([`Gross profit (${p.grossMarginPct}%)`, rs(p.grossProfit)]).font = { bold: true };
  sec("Other income");
  for (const l of p.otherIncome) ws.addRow([l.head, rs(l.amount)]);
  sec("Expenses");
  for (const l of p.expenses) ws.addRow([l.head, rs(l.amount), l.note || ""]);
  ws.addRow(["Total expenses", rs(p.totalExpenses)]).font = { bold: true };
  ws.addRow([`Net ${p.netProfit >= 0 ? "profit" : "loss"} (${p.netMarginPct}%)`, rs(p.netProfit)]).font = { bold: true, size: 12 };
  ws.getColumn(1).width = 58;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 40;
  return xlsxResponse(wb, `Profit_and_loss_${p.from}_${p.to}.xlsx`);
}, "accounts.view");
