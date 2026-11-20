import React from "react";
import { Document, Image, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { LOGO_PNG_DATA_URI } from "@/lib/brandLogo";
import { numberToWordsINR } from "@/lib/money";
import { documentTotals } from "@/lib/gstDocs";
import { VehicleModel } from "@/models/VehicleModel";
import { CompanyProfile, channelInvoiceData, generateGstInvoicePDF } from "./invoicePdf";

// Helvetica has no ₹ glyph, so amounts are printed as "Rs." in PDFs.
const money = (paise: number) =>
  `Rs. ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
const dateTime = (d?: Date | string | null) =>
  d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "—";

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 8.5, fontFamily: "Helvetica", color: "#0a2a5e" },
  top: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 2, borderBottomColor: "#0d47a1", paddingBottom: 8, marginBottom: 10 },
  brand: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  logo: { width: 85, height: 51, marginBottom: 4 },
  muted: { color: "#64748b" },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "right" },
  box: { borderWidth: 0.8, borderColor: "#cbd5e1", padding: 7, marginBottom: 8 },
  row: { flexDirection: "row" },
  half: { flex: 1 },
  h: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#0d47a1", marginBottom: 3, textTransform: "uppercase" },
  bold: { fontFamily: "Helvetica-Bold" },
  th: { flexDirection: "row", backgroundColor: "#e9f2fd", borderBottomWidth: 0.8, borderBottomColor: "#a9caf5", paddingVertical: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 3.5 },
  c: { paddingHorizontal: 3 },
  right: { textAlign: "right" },
  totals: { marginLeft: "auto", width: 230, marginTop: 6 },
  tline: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#0a2a5e", paddingTop: 4, marginTop: 2 },
  sign: { marginTop: 26, flexDirection: "row", justifyContent: "space-between" },
  foot: { position: "absolute", bottom: 18, left: 28, right: 28, fontSize: 7, color: "#94a3b8", textAlign: "center" },
});

export interface ChannelDocProps {
  company: { name: string; address: string; city: string; state: string; pincode: string; stateCode: string; gstin: string; pan: string; phone?: string; email?: string };
  d: any; // lean DeliveryOrder
}

/**
 * Dealer / distributor tax invoice or consignment challan (and partner-to-partner invoices),
 * printed in the company's GST invoice layout.
 */
export async function generateChannelDocPDF(props: ChannelDocProps & { profile?: CompanyProfile; dueDays?: number }): Promise<Buffer> {
  const profile: CompanyProfile = props.profile || {
    ...props.company,
    phone: props.company.phone || "",
    email: props.company.email || "",
    terms: ["Goods once sold will not be taken back.", "Interest @ 18% p.a. on payments beyond the due date.", "Subject to local jurisdiction."],
    bank: null,
  };
  const t = documentTotals(props.d.lines, profile.stateCode, props.d.partySnapshot.stateCode);
  const ids = [...new Set((props.d.lines || []).map((l: any) => String(l.model)).filter(Boolean))];
  const models = new Map(
    ((await VehicleModel.find({ _id: { $in: ids } }).select("rangeKm batteryType").lean()) as any[]).map((m) => [String(m._id), m])
  );
  // Company documents carry the Joykali logo; a partner-to-partner invoice is the partner's own bill.
  return generateGstInvoicePDF({ ...channelInvoiceData(profile, props.d, t, { models, dueDays: props.dueDays }), showLogo: !!props.profile });
}

/* ------------------------------------------------------------------ */
/* Warehouse → warehouse transfer challan                              */
/* ------------------------------------------------------------------ */
export interface TransferChallanProps {
  company: ChannelDocProps["company"];
  t: any; // lean WarehouseTransfer with fromWarehouse / toWarehouse
}

function TransferChallan({ company, t }: TransferChallanProps) {
  const addr = (w: any) => (w ? `${w.address}, ${w.city}${w.pincode ? ` - ${w.pincode}` : ""} (State code ${w.stateCode})` : "—");
  return (
    <Document title={t.transferCode}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO_PNG_DATA_URI} style={s.logo} />
            <Text style={s.muted}>{company.address}, {company.city}, {company.state} - {company.pincode}</Text>
            <Text style={s.muted}>GSTIN {company.gstin} · PAN {company.pan}</Text>
          </View>
          <View>
            <Text style={s.title}>DELIVERY CHALLAN</Text>
            <Text style={[s.muted, s.right]}>Stock transfer between own warehouses — not a sale</Text>
          </View>
        </View>
        <View style={[s.row, { gap: 8 }]}>
          <View style={[s.box, s.half]}>
            <Text style={s.h}>From</Text>
            <Text style={s.bold}>{t.fromName}</Text>
            <Text>{addr(t.fromWarehouse)}</Text>
            <Text style={[s.h, { marginTop: 6 }]}>To</Text>
            <Text style={s.bold}>{t.toName}</Text>
            <Text>{addr(t.toWarehouse)}</Text>
          </View>
          <View style={[s.box, s.half]}>
            <Text style={s.h}>Document</Text>
            <Text>Challan no: <Text style={s.bold}>{t.transferCode}</Text></Text>
            <Text>Date: {date(t.createdAt)}</Text>
            <Text>Movement: {t.interState ? `Inter-state branch transfer · Tax invoice ${t.transport?.invoiceNo || "—"}` : "Intra-state, same GSTIN"}</Text>
            <Text>E-way bill: {t.transport?.ewayBillNo || "not required"}</Text>
            <Text>Vehicle: {t.transport?.vehicleNo || "—"} · Driver: {t.transport?.driverName || "—"} {t.transport?.driverPhone ? `(${t.transport.driverPhone})` : ""}</Text>
            <Text>Sent by: {t.createdByName}</Text>
          </View>
        </View>
        <View style={s.th}>
          <Text style={[s.c, { width: 20 }]}>#</Text>
          <Text style={[s.c, { flex: 1 }]}>Description</Text>
          <Text style={[s.c, { width: 130 }]}>Chassis</Text>
          <Text style={[s.c, { width: 90 }, s.right]}>Value (cost)</Text>
        </View>
        {t.vehicles.map((v: any, i: number) => (
          <View key={v.chassisNumber} style={s.tr} wrap={false}>
            <Text style={[s.c, { width: 20 }]}>{i + 1}</Text>
            <Text style={[s.c, { flex: 1 }]}>{v.modelName} — Electric vehicle</Text>
            <Text style={[s.c, { width: 130 }]}>{v.chassisNumber}</Text>
            <Text style={[s.c, { width: 90 }, s.right]}>{money(v.value || 0)}</Text>
          </View>
        ))}
        <View style={s.totals}>
          <View style={s.grand}><Text style={s.bold}>{t.vehicles.length} unit(s) · Consignment value</Text><Text style={s.bold}>{money(t.totalValue || 0)}</Text></View>
        </View>
        <Text style={{ marginTop: 6 }}>Amount in words: <Text style={s.bold}>{numberToWordsINR(t.totalValue || 0)}</Text></Text>
        {t.remarks ? <Text style={{ marginTop: 6 }}>Remarks: {t.remarks}</Text> : null}
        <View style={s.sign}>
          <View>
            <Text style={s.muted}>Received the above vehicles at {t.toName}</Text>
            <Text style={{ marginTop: 22 }}>Store in-charge signature</Text>
          </View>
          <View>
            <Text style={[s.right, s.bold]}>For {company.name}</Text>
            <Text style={{ marginTop: 22, textAlign: "right" }}>Authorised signatory</Text>
          </View>
        </View>
        <Text style={s.foot} fixed>
          Delivery challan under Rule 55, CGST Rules — transfer of own goods between places of business. · Computer-generated document.
        </Text>
      </Page>
    </Document>
  );
}

export async function generateTransferChallanPDF(props: TransferChallanProps): Promise<Buffer> {
  return renderToBuffer(<TransferChallan {...props} />);
}

/* ------------------------------------------------------------------ */
/* Goods receipt note                                                  */
/* ------------------------------------------------------------------ */
export interface GrnNoteProps {
  company: ChannelDocProps["company"];
  row: any;
  lines: Array<{ chassis: string; model: string; condition: string; remarks: string }>;
}

function GrnNote({ company, row, lines }: GrnNoteProps) {
  return (
    <Document title={row.grnNo}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO_PNG_DATA_URI} style={s.logo} />
            <Text style={s.muted}>{company.address}, {company.city}, {company.state} - {company.pincode}</Text>
            <Text style={s.muted}>GSTIN {company.gstin}</Text>
          </View>
          <View>
            <Text style={s.title}>GOODS RECEIPT NOTE</Text>
            <Text style={[s.muted, s.right]}>{row.grnNo}</Text>
          </View>
        </View>
        <View style={[s.row, { gap: 8 }]}>
          <View style={[s.box, s.half]}>
            <Text style={s.h}>Shipment</Text>
            <Text>Against: <Text style={s.bold}>{row.document}</Text></Text>
            <Text>From: {row.from}</Text>
            <Text>To: <Text style={s.bold}>{row.to}</Text></Text>
            <Text>Dispatched: {date(row.dispatchedAt)}{row.truck ? ` · truck ${row.truck}` : ""}</Text>
          </View>
          <View style={[s.box, s.half]}>
            <Text style={s.h}>Receipt</Text>
            <Text>Received on: <Text style={s.bold}>{dateTime(row.receivedAt)}</Text></Text>
            <Text>Received by: {row.receivedBy}</Text>
            <Text>Result: {row.received} received{row.short ? ` · ${row.short} short` : ""}{row.damaged ? ` · ${row.damaged} damaged` : ""}</Text>
            {row.creditNote ? <Text>Credit note: {row.creditNote}</Text> : null}
          </View>
        </View>
        <View style={s.th}>
          <Text style={[s.c, { width: 20 }]}>#</Text>
          <Text style={[s.c, { width: 130 }]}>Chassis</Text>
          <Text style={[s.c, { flex: 1 }]}>Model</Text>
          <Text style={[s.c, { width: 70 }]}>Condition</Text>
          <Text style={[s.c, { width: 120 }]}>Remarks</Text>
        </View>
        {lines.map((l, i) => (
          <View key={l.chassis} style={s.tr} wrap={false}>
            <Text style={[s.c, { width: 20 }]}>{i + 1}</Text>
            <Text style={[s.c, { width: 130 }]}>{l.chassis}</Text>
            <Text style={[s.c, { flex: 1 }]}>{l.model}</Text>
            <Text style={[s.c, { width: 70 }, l.condition !== "RECEIVED" ? s.bold : {}]}>{l.condition}</Text>
            <Text style={[s.c, { width: 120 }]}>{l.remarks}</Text>
          </View>
        ))}
        {row.remarks ? <Text style={{ marginTop: 8 }}>Remarks: {row.remarks}</Text> : null}
        <View style={s.sign}>
          <View>
            <Text style={{ marginTop: 22 }}>Receiver's signature & stamp</Text>
          </View>
          <View>
            <Text style={{ marginTop: 22, textAlign: "right" }}>For {company.name}</Text>
          </View>
        </View>
        <Text style={s.foot} fixed>Goods receipt recorded in the Joykali EV system · Computer-generated document.</Text>
      </Page>
    </Document>
  );
}

export async function generateGrnPDF(props: GrnNoteProps): Promise<Buffer> {
  return renderToBuffer(<GrnNote {...props} />);
}

/* ------------------------------------------------------------------ */
/* Payment receipt                                                      */
/* ------------------------------------------------------------------ */
export interface ReceiptProps {
  company: ChannelDocProps["company"];
  e: any; // LedgerEntry PAYMENT
  party: { name: string; code: string; gstin?: string; address?: string; city?: string };
  accountName?: string;
}

function ReceiptDoc({ company, e, party, accountName }: ReceiptProps) {
  const MODE: Record<string, string> = { NEFT: "NEFT", RTGS: "RTGS", IMPS: "IMPS", UPI: "UPI", CHEQUE: "Cheque", CASH: "Cash", BANK: "Bank transfer" };
  return (
    <Document title={e.reference}>
      <Page size="A5" orientation="landscape" style={s.page}>
        <View style={s.top}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO_PNG_DATA_URI} style={s.logo} />
            <Text style={s.muted}>{company.address}, {company.city}, {company.state} - {company.pincode}</Text>
            <Text style={s.muted}>GSTIN {company.gstin}</Text>
          </View>
          <View>
            <Text style={s.title}>PAYMENT RECEIPT</Text>
            <Text style={[s.muted, s.right]}>{e.reference}</Text>
          </View>
        </View>
        <View style={s.box}>
          <Text>Received with thanks from <Text style={s.bold}>{party.name} ({party.code})</Text>{party.city ? `, ${party.city}` : ""}{party.gstin ? ` · GSTIN ${party.gstin}` : ""}</Text>
          <Text style={{ marginTop: 6 }}>the sum of <Text style={s.bold}>{money(e.credit)}</Text> ({numberToWordsINR(e.credit)})</Text>
          <Text style={{ marginTop: 6 }}>on {date(e.date)} by {MODE[e.paymentMode] || e.paymentMode}{e.utr ? ` · ref ${e.utr}` : ""}{e.payerBank ? ` · ${e.payerBank}` : ""}</Text>
          {accountName ? <Text style={{ marginTop: 6 }}>Credited to: {accountName}</Text> : null}
          {e.narration ? <Text style={[s.muted, { marginTop: 6 }]}>{e.narration}</Text> : null}
        </View>
        <Text style={s.muted}>{e.paymentMode === "CHEQUE" ? "Subject to realisation of the cheque." : ""}</Text>
        <View style={s.sign}>
          <View />
          <View>
            <Text style={[s.right, s.bold]}>For {company.name}</Text>
            <Text style={{ marginTop: 22, textAlign: "right" }}>Authorised signatory</Text>
          </View>
        </View>
        <Text style={s.foot} fixed>Computer-generated receipt.</Text>
      </Page>
    </Document>
  );
}

export async function generateReceiptPDF(props: ReceiptProps): Promise<Buffer> {
  return renderToBuffer(<ReceiptDoc {...props} />);
}
