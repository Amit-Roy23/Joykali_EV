import { NextResponse } from "next/server";
import { handle } from "@/lib/route";
import { Setting } from "@/models/Setting";
import { grnDocument } from "@/services/grnService";
import { generateGrnPDF } from "@/services/channelDocPdf";

export const maxDuration = 60;

export const GET = handle(async ({ user, params }) => {
  const { row, lines } = await grnDocument(user, params.kind, params.id);
  const s: any = await Setting.findOne().lean();
  const pdf = await generateGrnPDF({
    company: { name: s?.companyName || "Joykali EV Mobility", address: s?.address || "", city: s?.city || "", state: s?.state || "", pincode: s?.pincode || "", stateCode: s?.stateCode || "19", gstin: s?.gstin || "", pan: s?.pan || "" },
    row,
    lines,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${String(row.grnNo).replace(/\//g, "_")}.pdf"` },
  });
});
