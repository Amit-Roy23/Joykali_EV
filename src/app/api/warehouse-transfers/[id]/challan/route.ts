import { NextResponse } from "next/server";
import { handle } from "@/lib/route";
import { Setting } from "@/models/Setting";
import { getWarehouseTransfer } from "@/services/warehouseService";
import { generateTransferChallanPDF } from "@/services/channelDocPdf";

export const maxDuration = 60;

export const GET = handle(async ({ user, params }) => {
  const t = await getWarehouseTransfer(user, params.id);
  const s: any = await Setting.findOne().lean();
  const pdf = await generateTransferChallanPDF({
    company: {
      name: s?.companyName || "Joykali EV Mobility",
      address: s?.address || "",
      city: s?.city || "Kolkata",
      state: s?.state || "West Bengal",
      pincode: s?.pincode || "",
      stateCode: s?.stateCode || "19",
      gstin: s?.gstin || "",
      pan: s?.pan || "",
    },
    t,
  });
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${t.transferCode.replace(/\//g, "_")}.pdf"` },
  });
}, "warehouse.view");
