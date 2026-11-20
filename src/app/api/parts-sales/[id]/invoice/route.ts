import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { handle } from "@/lib/route";
import { errorResponse } from "@/lib/apiHelper";
import { PartsSale } from "@/models/Item";
import { generateGstInvoicePDF, loadCompany, partsInvoiceData } from "@/services/invoicePdf";

export const maxDuration = 60;

export const GET = handle(async ({ params }) => {
  if (!mongoose.isValidObjectId(params.id)) return errorResponse("Sale not found", 404);
  const sale = await PartsSale.findById(params.id).lean();
  if (!sale) return errorResponse("Sale not found", 404);
  const pdf = await generateGstInvoicePDF(partsInvoiceData(await loadCompany(), sale));
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Invoice_${sale.saleCode.replace(/\//g, "_")}.pdf"` },
  });
}, "parts.sell");
