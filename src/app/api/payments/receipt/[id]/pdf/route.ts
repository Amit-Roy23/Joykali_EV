import { NextResponse } from "next/server";
import { handle } from "@/lib/route";
import { errorResponse, isValidId } from "@/lib/apiHelper";
import { LedgerEntry } from "@/models/LedgerEntry";
import { MoneyAccount } from "@/models/Accounts";
import { Setting } from "@/models/Setting";
import { canAccessParty } from "@/lib/partyAccess";
import { getParty } from "@/services/creditService";
import { generateReceiptPDF } from "@/services/channelDocPdf";

export const GET = handle(async ({ user, params }) => {
  if (!isValidId(params.id)) return errorResponse("Receipt not found", 404);
  const e: any = await LedgerEntry.findOne({ _id: params.id, type: "PAYMENT", book: null }).lean();
  if (!e || !(await canAccessParty(user, e.partyType, e.party))) return errorResponse("Receipt not found", 404);
  const [p, s, acc]: any[] = await Promise.all([getParty(e.partyType, e.party), Setting.findOne().lean(), e.account ? MoneyAccount.findById(e.account).select("name").lean() : null]);
  const pdf = await generateReceiptPDF({
    company: { name: s?.companyName || "Joykali EV Mobility", address: s?.address || "", city: s?.city || "", state: s?.state || "", pincode: s?.pincode || "", stateCode: s?.stateCode || "19", gstin: s?.gstin || "", pan: s?.pan || "" },
    e,
    party: { name: p?.name || "Partner", code: p?.code || "", gstin: p?.gstin, city: p?.city },
    accountName: acc?.name,
  });
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${e.reference.replace(/\//g, "_")}.pdf"` } });
}, "ledger.view");
