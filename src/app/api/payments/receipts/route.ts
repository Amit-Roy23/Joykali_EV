import { userCan } from "@/lib/grants";
import ExcelJS from "exceljs";
import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { hasPermission } from "@/lib/rbac";
import { rs, xlsxResponse } from "@/lib/xlsx";
import { istDay } from "@/lib/accounting";
import { receiptRegister } from "@/services/paymentService";

/** Payments received from partners. ?from&to&mode&account&cleared=yes|no&party&format=xlsx */
export const GET = handle(async ({ req, user }) => {
  if (!(await hasPermission(user.role, "ledger.view")) && !(await userCan(user, "accounts.view"))) return errorResponse("Not allowed", 403);
  const sp = req.nextUrl.searchParams;
  const r = await receiptRegister(user, {
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    mode: sp.get("mode") || undefined,
    account: sp.get("account") || undefined,
    cleared: sp.get("cleared") || undefined,
    party: sp.get("party") || undefined,
  });
  if (sp.get("format") !== "xlsx") return r;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Receipts");
  ws.addRow(["Date", "Receipt no.", "Partner", "Code", "Mode", "UTR / cheque", "Payer's bank", "Into account", "Amount (Rs.)", "Seen in bank on"]).font = { bold: true };
  for (const x of r.rows as any[]) ws.addRow([istDay(x.date), x.reference, x.partyName, x.partyCode, x.modeLabel, x.utr || "", x.payerBank || "", x.account?.name || "", rs(x.credit), x.cleared?.statementDate || ""]);
  ws.addRow(["", "", "", "", "", "", "", "Total", rs(r.total)]).font = { bold: true };
  [12, 18, 28, 12, 10, 20, 18, 26, 14, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  return xlsxResponse(wb, `Partner_receipts_${istDay(new Date())}.xlsx`);
});
