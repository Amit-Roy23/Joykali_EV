import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, isValidId, jsonResponse } from "@/lib/apiHelper";
import { isPartnerRole } from "@/types";
import { myParty } from "@/lib/partyAccess";
import { hasPermission } from "@/lib/rbac";
import { bookLedger, canActOnParty } from "@/services/networkService";
import { getParty, supplierRef } from "@/services/creditService";

/**
 * Account statement of a partner with its supplier (the company or the supplying partner).
 * ?partyType=&partyId= (default: my own) &format=xlsx to download.
 */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;
    const sp = req.nextUrl.searchParams;
    let type = sp.get("partyType") as "DEALER" | "DISTRIBUTOR" | null;
    let id = sp.get("partyId");
    if (!type || !id) {
      const me = isPartnerRole(auth.user.role) ? await myParty(auth.user) : null;
      if (!me) return errorResponse("Choose a partner", 400);
      type = me.type;
      id = String(me.id);
    }
    if ((type !== "DEALER" && type !== "DISTRIBUTOR") || !isValidId(id)) return errorResponse("Not found", 404);
    const access = await canActOnParty(auth.user, type, id);
    if (!access.ok) return errorResponse("Not found", 404);
    if (access.as === "STAFF" && !(await hasPermission(auth.user.role, "ledger.view"))) return errorResponse("Forbidden", 403);
    const party: any = await getParty(type, id);
    const sup = supplierRef(type, party);
    const supplier = sup ? await getParty(sup.type, sup.id) : null;
    const rows = await bookLedger(type, id, sup);
    const fromQ = sp.get("from");
    const toQ = sp.get("to");
    const from = fromQ ? new Date(`${fromQ}T00:00:00+05:30`) : null;
    const to = toQ ? new Date(`${toQ}T23:59:59+05:30`) : null;
    const opening = from ? rows.filter((r: any) => new Date(r.date) < from).at(-1)?.balance || 0 : 0;
    const shown = rows.filter((r: any) => (!from || new Date(r.date) >= from) && (!to || new Date(r.date) <= to));
    const supplierName = supplier ? supplier.name : "Joykali EV Mobility";

    if (sp.get("format") !== "xlsx") {
      return jsonResponse({ party: { name: party.name, code: party.code }, supplier: supplierName, opening, rows: shown, closing: shown.at(-1)?.balance ?? opening });
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Statement");
    ws.addRow([`Account statement — ${party.name} (${party.code})`]).font = { bold: true, size: 13 };
    ws.addRow([`In the books of ${supplierName}${from || to ? ` · ${fromQ || "start"} to ${toQ || "today"}` : ""}`]);
    ws.addRow([]);
    const head = ws.addRow(["Date", "Type", "Reference", "Narration", "Debit (Rs.)", "Credit (Rs.)", "Balance (Rs.)"]);
    head.font = { bold: true };
    if (from) ws.addRow(["", "OPENING", "", "Balance brought forward", "", "", opening / 100]);
    for (const r of shown as any[]) {
      ws.addRow([
        new Date(r.date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
        r.type,
        r.reference,
        r.narration || "",
        r.debit ? r.debit / 100 : "",
        r.credit ? r.credit / 100 : "",
        r.balance / 100,
      ]);
    }
    ws.columns.forEach((c, i) => (c.width = [12, 13, 22, 40, 14, 14, 15][i]));
    [5, 6, 7].forEach((i) => (ws.getColumn(i).numFmt = "#,##0.00"));
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Statement_${party.code}.xlsx"`,
      },
    });
  } catch (e) {
    return failure(e, "Failed to load statement");
  }
}
