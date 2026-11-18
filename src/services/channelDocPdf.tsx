import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { numberToWordsINR } from "@/lib/money";
import { documentTotals } from "@/lib/gstDocs";

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

function ChannelDoc({ company, d }: ChannelDocProps) {
  const isInvoice = d.document.kind === "TAX_INVOICE";
  const t = documentTotals(d.lines, company.stateCode, d.partySnapshot.stateCode);
  return (
    <Document title={`${d.document.number}`}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <View>
            <Text style={s.brand}>{company.name}</Text>
            <Text style={s.muted}>{company.address}, {company.city}, {company.state} - {company.pincode}</Text>
            <Text style={s.muted}>GSTIN {company.gstin} · PAN {company.pan} · State code {company.stateCode}</Text>
          </View>
          <View>
            <Text style={s.title}>{isInvoice ? "TAX INVOICE" : "DELIVERY CHALLAN"}</Text>
            <Text style={[s.muted, s.right]}>{isInvoice ? "Original for recipient" : "Stock transfer to dealer on consignment — not a sale"}</Text>
          </View>
        </View>

        <View style={[s.row, { gap: 8 }]}>
          <View style={[s.box, s.half]}>
            <Text style={s.h}>{isInvoice ? "Billed & shipped to" : "Consignee (dealer)"}</Text>
            <Text style={s.bold}>{d.partySnapshot.name} ({d.partySnapshot.code})</Text>
            <Text>{d.partySnapshot.address}, {d.partySnapshot.city} - {d.partySnapshot.pincode}</Text>
            <Text>GSTIN {d.partySnapshot.gstin || "—"} · State code {d.partySnapshot.stateCode}</Text>
            <Text>Place of supply: {t.interState ? `Inter-state (${d.partySnapshot.stateCode})` : `West Bengal (${company.stateCode})`}</Text>
          </View>
          <View style={[s.box, s.half]}>
            <Text style={s.h}>Document</Text>
            <Text>{isInvoice ? "Invoice" : "Challan"} no: <Text style={s.bold}>{d.document.number}</Text></Text>
            <Text>Date: {date(d.document.date)}</Text>
            <Text>Order: {d.orderCode} · DO: {d.doCode}</Text>
            <Text>E-way bill: {d.ewayBill?.ewbNo ? `${d.ewayBill.ewbNo} (valid till ${dateTime(d.ewayBill.validUpto)})` : d.ewayBill?.required ? "pending" : "not required"}</Text>
            <Text>Vehicle: {d.loading?.registrationNo || "—"} · Driver: {d.loading?.driverName || "—"} ({d.loading?.driverPhone || ""})</Text>
          </View>
        </View>

        <View style={s.th}>
          <Text style={[s.c, { width: 20 }]}>#</Text>
          <Text style={[s.c, { flex: 1 }]}>Description</Text>
          <Text style={[s.c, { width: 48 }]}>HSN</Text>
          <Text style={[s.c, { width: 28 }, s.right]}>Qty</Text>
          <Text style={[s.c, { width: 72 }, s.right]}>Rate</Text>
          <Text style={[s.c, { width: 80 }, s.right]}>Taxable</Text>
          <Text style={[s.c, { width: 34 }, s.right]}>GST%</Text>
          <Text style={[s.c, { width: 72 }, s.right]}>Tax</Text>
        </View>
        {t.rows.map((r, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={[s.c, { width: 20 }]}>{i + 1}</Text>
            <View style={[s.c, { flex: 1 }]}>
              <Text style={s.bold}>{r.modelName} — Electric vehicle</Text>
              <Text style={s.muted}>
                Chassis: {d.vehicles.filter((v: any) => String(v.model) === String((d.lines[i] as any).model)).map((v: any) => v.chassisNumber).join(", ")}
              </Text>
            </View>
            <Text style={[s.c, { width: 48 }]}>{r.hsnCode}</Text>
            <Text style={[s.c, { width: 28 }, s.right]}>{r.quantity}</Text>
            <Text style={[s.c, { width: 72 }, s.right]}>{money(r.unitPrice)}</Text>
            <Text style={[s.c, { width: 80 }, s.right]}>{money(r.taxable)}</Text>
            <Text style={[s.c, { width: 34 }, s.right]}>{r.gstRate}%</Text>
            <Text style={[s.c, { width: 72 }, s.right]}>{money(r.tax)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.tline}><Text>Taxable value</Text><Text>{money(t.taxableValue)}</Text></View>
          {t.interState ? (
            <View style={s.tline}><Text>IGST</Text><Text>{money(t.igst)}</Text></View>
          ) : (
            <>
              <View style={s.tline}><Text>CGST</Text><Text>{money(t.cgst)}</Text></View>
              <View style={s.tline}><Text>SGST</Text><Text>{money(t.sgst)}</Text></View>
            </>
          )}
          <View style={s.grand}><Text style={s.bold}>{isInvoice ? "Invoice total" : "Consignment value"}</Text><Text style={s.bold}>{money(t.totalValue)}</Text></View>
        </View>
        <Text style={{ marginTop: 6 }}>Amount in words: <Text style={s.bold}>{numberToWordsINR(t.totalValue)}</Text></Text>

        <View style={[s.box, { marginTop: 10 }]}>
          <Text style={s.h}>Vehicle particulars</Text>
          {d.vehicles.map((v: any) => (
            <Text key={v.chassisNumber}>
              {v.modelName} · {v.color} · Chassis {v.chassisNumber} · Motor {v.motorNumber} · Battery {v.batteryNumber}
            </Text>
          ))}
        </View>

        <View style={s.sign}>
          <View>
            <Text style={s.muted}>Received the above vehicles in good condition</Text>
            <Text style={{ marginTop: 22 }}>Receiver's signature & stamp</Text>
          </View>
          <View>
            <Text style={[s.right, s.bold]}>For {company.name}</Text>
            <Text style={{ marginTop: 22, textAlign: "right" }}>Authorised signatory</Text>
          </View>
        </View>
        <Text style={s.foot} fixed>
          {isInvoice ? "Subject to Kolkata jurisdiction. Goods once sold will not be taken back without authorisation." : "Delivery challan under Rule 55, CGST Rules — movement of goods other than by way of supply."} · Computer-generated document.
        </Text>
      </Page>
    </Document>
  );
}

export async function generateChannelDocPDF(props: ChannelDocProps): Promise<Buffer> {
  return renderToBuffer(<ChannelDoc {...props} />);
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
            <Text style={s.brand}>{company.name}</Text>
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
            <Text style={s.brand}>{company.name}</Text>
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
            <Text style={s.brand}>{company.name}</Text>
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
