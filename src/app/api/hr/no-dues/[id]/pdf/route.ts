import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { handle } from "@/lib/route";
import { getNoDuesForPdf } from "@/services/noDuesService";
import { generateNoDuesPDF } from "@/services/noDuesPdf";
import { loadCompany } from "@/services/invoicePdf";

export const maxDuration = 60;

export const GET = handle(async ({ req, user, params }) => {
  const nd = await getNoDuesForPdf(user, params.id);
  const c = await loadCompany();
  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const verifyUrl = `${origin}/verify/no-dues/${encodeURIComponent(nd.code)}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 240 });
  const pdf = await generateNoDuesPDF({
    company: { name: c.name, address: [c.address, c.city, c.state, c.pincode].filter(Boolean).join(", "), phone: c.phone, email: c.email, gstin: c.gstin },
    nd,
    qrPng,
    verifyUrl,
  });
  const file = `NoDues_${nd.employeeCode}_${String(nd.code).replace(/\//g, "-")}.pdf`;
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${file}"` } });
});
