import React from "react";
import { Document, Image, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { LOGO_PNG_DATA_URI } from "@/lib/brandLogo";
import { numberToWordsINR } from "@/lib/money";
import { Setting } from "@/models/Setting";
import { MoneyAccount } from "@/models/Accounts";

/**
 * One GST invoice layout for every bill the company issues — retail vehicle sales,
 * parts & accessories counter sales, dealer / distributor tax invoices and delivery challans.
 * Modelled on the classic Indian trade invoice: company block on top, buyer + invoice details,
 * a ruled item table (Sl · Description · HSN · Qty · Rate · GST% · Amount), tax summary,
 * amount in words, terms, bank details and the authorised signatory.
 */

export interface CompanyProfile {
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  stateCode: string;
  gstin: string;
  pan: string;
  phone: string;
  email: string;
  website?: string;
  terms: string[];
  bank?: { bankName?: string; branch?: string; accountName?: string; accountNo?: string; ifsc?: string } | null;
}

export const STATE_NAMES: Record<string, string> = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
  "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
  "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "36": "Telangana", "37": "Andhra Pradesh",
};

/** Company details + invoice bank (settings, else the default bank account in Accounts). */
export async function loadCompany(): Promise<CompanyProfile> {
  const s: any = (await Setting.findOne().lean()) || {};
  let bank = s.invoiceBank && (s.invoiceBank.accountNo || s.invoiceBank.bankName) ? s.invoiceBank : null;
  if (!bank) {
    const acc: any = await MoneyAccount.findOne({ kind: "BANK", status: "ACTIVE" }).sort({ isDefault: -1, createdAt: 1 }).lean();
    if (acc) bank = { bankName: acc.bankName || acc.name, accountNo: acc.accountNo, ifsc: acc.ifsc, accountName: s.companyName };
  }
  return {
    name: s.companyName || "Joykali EV Mobility",
    address: s.address || "",
    city: s.city || "",
    state: s.state || "West Bengal",
    pincode: s.pincode || "",
    stateCode: s.stateCode || "19",
    gstin: s.gstin || "",
    pan: s.pan || "",
    phone: s.phone || "",
    email: s.email || "",
    website: s.website || "",
    terms: (s.invoiceTerms || []).map((t: string) => String(t).trim()).filter(Boolean),
    bank,
  };
}

export interface InvoiceRow {
  description: string;
  sub?: string[]; // smaller lines under the description (spec, chassis / serial numbers, discount)
  hsn: string;
  qty: number;
  unit?: string;
  rate: number; // paise, per unit before GST
  gstRate: number;
  amount: number; // paise, taxable value of the line
  tax: number; // paise, GST on the line
}

export interface GstInvoiceData {
  title: string; // GST INVOICE / TAX INVOICE / DELIVERY CHALLAN
  copyLabel?: string;
  company: CompanyProfile;
  buyer: { label?: string; name: string; lines: string[]; phone?: string; gstin?: string; stateCode?: string };
  meta: Array<[string, string]>;
  rows: InvoiceRow[];
  interState: boolean;
  /** Pass-through charges added after GST (registration, insurance …). */
  extras?: Array<[string, number]>;
  /** Shown on challans: the value is for transport only, nothing is charged. */
  notCharged?: boolean;
  remarks?: string[];
  signLeft?: string;
  footer?: string;
  /** Print the Joykali logo (false on partner-to-partner invoices, where the seller is the partner). */
  showLogo?: boolean;
}

const n2 = (p: number) => (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (r: number) => (Number.isInteger(r) ? `${r}.00` : String(r));

const BORDER = "#1f2937";
const s = StyleSheet.create({
  page: { padding: 22, fontSize: 8.6, fontFamily: "Helvetica", color: "#111827" },
  frame: { borderWidth: 1, borderColor: BORDER, flexGrow: 1 },
  head: { alignItems: "center", paddingTop: 8, paddingBottom: 6, paddingHorizontal: 10, position: "relative", minHeight: 74 },
  logo: { position: "absolute", left: 8, top: 7, width: 100, height: 60 },
  name: { fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, color: "#0b2a6b" },
  line: { fontSize: 8.6, marginTop: 1.5, textAlign: "center" },
  titleRow: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 3, position: "relative" },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  copy: { position: "absolute", right: 6, top: 5, width: 150, textAlign: "right", fontSize: 7, color: "#4b5563" },
  gstinRow: { textAlign: "center", paddingVertical: 2.5, borderBottomWidth: 1, borderColor: BORDER, fontFamily: "Helvetica-Bold", fontSize: 8.6 },
  partyRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: BORDER },
  partyL: { flex: 1.25, padding: 6, borderRightWidth: 1, borderColor: BORDER },
  partyR: { flex: 1, padding: 6 },
  bold: { fontFamily: "Helvetica-Bold" },
  metaRow: { flexDirection: "row", marginBottom: 1.5 },
  metaK: { width: 78 },
  metaV: { flex: 1 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: BORDER, backgroundColor: "#eef2f7" },
  thC: { paddingVertical: 3.5, paddingHorizontal: 3, fontFamily: "Helvetica-Bold", fontSize: 8.4 },
  body: { flexDirection: "row", flexGrow: 1, minHeight: 230, borderBottomWidth: 1, borderColor: BORDER },
  col: { borderRightWidth: 1, borderColor: BORDER, paddingHorizontal: 3, paddingTop: 3 },
  cell: { height: 30, justifyContent: "flex-start" },
  sub: { fontSize: 6.6, color: "#374151", fontFamily: "Helvetica-Bold" },
  totRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: BORDER },
  taxNote: { flex: 1.6, padding: 5, borderRightWidth: 1, borderColor: BORDER, justifyContent: "space-between" },
  totals: { flex: 1, padding: 5 },
  tl: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: BORDER, paddingTop: 3, marginTop: 2 },
  words: { padding: 5, borderBottomWidth: 1, borderColor: BORDER, fontFamily: "Helvetica-Bold" },
  bottom: { flexDirection: "row", minHeight: 110 },
  terms: { flex: 1.4, padding: 6, borderRightWidth: 1, borderColor: BORDER },
  sign: { flex: 1, padding: 6, justifyContent: "space-between" },
  h: { fontFamily: "Helvetica-Bold", textDecoration: "underline", marginBottom: 2, fontSize: 9 },
  small: { fontSize: 7.2, marginBottom: 1 },
  foot: { textAlign: "center", fontSize: 7, color: "#4b5563", marginTop: 4 },
});

// Column widths (points) of the item table; the description takes the rest.
const W = { sl: 24, hsn: 52, qty: 46, rate: 66, gst: 38, amt: 78 };

function GstInvoice({ d }: { d: GstInvoiceData }) {
  const c = d.company;
  const taxable = d.rows.reduce((t, r) => t + r.amount, 0);
  const groups = new Map<number, { taxable: number; tax: number }>();
  for (const r of d.rows) {
    const g = groups.get(r.gstRate) || { taxable: 0, tax: 0 };
    g.taxable += r.amount;
    g.tax += r.tax;
    groups.set(r.gstRate, g);
  }
  const taxTotal = [...groups.values()].reduce((t, g) => t + g.tax, 0);
  const extras = (d.extras || []).filter(([, v]) => v > 0);
  const grand = taxable + taxTotal + extras.reduce((t, [, v]) => t + v, 0);
  const totalQty = d.rows.reduce((t, r) => t + r.qty, 0);
  const taxLines: Array<[string, number]> = [];
  for (const [rate, g] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    if (!rate) continue;
    if (d.interState) taxLines.push([`IGST ${rate}%`, g.tax]);
    else {
      const cg = Math.floor(g.tax / 2);
      taxLines.push([`CGST ${rate / 2}%`, cg], [`SGST ${rate / 2}%`, g.tax - cg]);
    }
  }
  const supplyState = d.buyer.stateCode ? `${STATE_NAMES[d.buyer.stateCode] || ""} (${d.buyer.stateCode})` : `${c.state} (${c.stateCode})`;
  return (
    <Document title={d.meta.find(([k]) => /no/i.test(k))?.[1] || d.title}>
      <Page size="A4" style={s.page}>
        <View style={s.frame}>
          <View style={s.head}>
            {/* the company's own logo on its invoices; partner-to-partner invoices print the seller without it */}
            {d.showLogo !== false ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={LOGO_PNG_DATA_URI} style={s.logo} />
            ) : null}
            <Text style={s.name}>{c.name.toUpperCase()}</Text>
            <Text style={s.line}>{[c.address, c.city].filter(Boolean).join(", ").toUpperCase()}</Text>
            <Text style={s.line}>
              {[c.state, c.pincode].filter(Boolean).join(" , ").toUpperCase()}
            </Text>
            <Text style={s.line}>Phone : {c.phone}</Text>
            <Text style={s.line}>
              {c.website ? `Website : ${c.website.replace(/^https?:\/\//, "")}   ` : ""}E-Mail : {c.email}
            </Text>
          </View>
          <View style={s.titleRow}>
            <Text style={s.title}>{d.title}</Text>
            {d.copyLabel ? <Text style={s.copy}>{d.copyLabel}</Text> : null}
          </View>
          <Text style={s.gstinRow}>
            GSTIN : {c.gstin}
            {c.pan ? `     PAN : ${c.pan}` : ""}     STATE : {c.state.toUpperCase()} ({c.stateCode})
          </Text>

          <View style={s.partyRow}>
            <View style={s.partyL}>
              {d.buyer.label ? <Text style={[s.small, { color: "#4b5563" }]}>{d.buyer.label}</Text> : null}
              <Text style={[s.bold, { fontSize: 9.6 }]}>M/s {d.buyer.name.toUpperCase()}</Text>
              {d.buyer.lines.filter(Boolean).map((l, i) => (
                <Text key={i}>{l}</Text>
              ))}
              {d.buyer.phone ? <Text>PH.NO. : {d.buyer.phone}</Text> : null}
              <Text>GSTIN : {d.buyer.gstin || "Unregistered"}</Text>
              <Text>Place of supply : {supplyState}</Text>
            </View>
            <View style={s.partyR}>
              {d.meta.map(([k, v], i) => (
                <View key={i} style={s.metaRow}>
                  <Text style={s.metaK}>{k}</Text>
                  <Text style={i === 0 ? [s.metaV, s.bold] : s.metaV}>: {v}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Item table */}
          <View style={s.th}>
            <Text style={[s.thC, { width: W.sl, borderRightWidth: 1, borderColor: BORDER }]}>Sl.</Text>
            <Text style={[s.thC, { flex: 1, borderRightWidth: 1, borderColor: BORDER }]}>Product Description</Text>
            <Text style={[s.thC, { width: W.hsn, borderRightWidth: 1, borderColor: BORDER, textAlign: "center" }]}>HSN CODE</Text>
            <Text style={[s.thC, { width: W.qty, borderRightWidth: 1, borderColor: BORDER, textAlign: "center" }]}>T.Qty</Text>
            <Text style={[s.thC, { width: W.rate, borderRightWidth: 1, borderColor: BORDER, textAlign: "center" }]}>Rate</Text>
            <Text style={[s.thC, { width: W.gst, borderRightWidth: 1, borderColor: BORDER, textAlign: "center" }]}>Gst%</Text>
            <Text style={[s.thC, { width: W.amt, textAlign: "center" }]}>Amount</Text>
          </View>
          <View style={s.body}>
            <View style={[s.col, { width: W.sl }]}>
              {d.rows.map((r, i) => (
                <View key={i} style={[s.cell, { height: rowH(r) }]}>
                  <Text>{i + 1}</Text>
                </View>
              ))}
            </View>
            <View style={[s.col, { flex: 1 }]}>
              {d.rows.map((r, i) => (
                <View key={i} style={[s.cell, { height: rowH(r) }]}>
                  <Text style={s.bold}>{r.description.toUpperCase()}</Text>
                  {(r.sub || []).map((x, k) => (
                    <Text key={k} style={s.sub}>
                      {x}
                    </Text>
                  ))}
                </View>
              ))}
              {d.remarks?.length ? (
                <View style={{ marginTop: 6 }}>
                  {d.remarks.map((x, k) => (
                    <Text key={k} style={[s.small, { color: "#374151" }]}>
                      {x}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={[s.col, { width: W.hsn }]}>
              {d.rows.map((r, i) => (
                <View key={i} style={[s.cell, { height: rowH(r), alignItems: "center" }]}>
                  <Text>{r.hsn}</Text>
                </View>
              ))}
            </View>
            <View style={[s.col, { width: W.qty }]}>
              {d.rows.map((r, i) => (
                <View key={i} style={[s.cell, { height: rowH(r), alignItems: "center" }]}>
                  <Text>
                    {r.qty} {r.unit || "PCS"}
                  </Text>
                </View>
              ))}
            </View>
            <View style={[s.col, { width: W.rate }]}>
              {d.rows.map((r, i) => (
                <View key={i} style={[s.cell, { height: rowH(r), alignItems: "flex-end" }]}>
                  <Text>{n2(r.rate)}</Text>
                </View>
              ))}
            </View>
            <View style={[s.col, { width: W.gst }]}>
              {d.rows.map((r, i) => (
                <View key={i} style={[s.cell, { height: rowH(r), alignItems: "center" }]}>
                  <Text>{pct(r.gstRate)}</Text>
                </View>
              ))}
            </View>
            <View style={[s.col, { width: W.amt, borderRightWidth: 0 }]}>
              {d.rows.map((r, i) => (
                <View key={i} style={[s.cell, { height: rowH(r), alignItems: "flex-end" }]}>
                  <Text>{n2(r.amount)}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Tax note + totals */}
          <View style={s.totRow}>
            <View style={s.taxNote}>
              <View>
                {[...groups.entries()]
                  .filter(([rate]) => rate > 0)
                  .map(([rate, g]) => (
                    <Text key={rate} style={s.small}>
                      {d.interState ? "IGST" : "CGST+SGST"} {n2(g.taxable)}*{rate}%={n2(g.tax)}
                    </Text>
                  ))}
              </View>
              <Text style={[s.bold, { marginTop: 4 }]}>
                Total Items : {d.rows.length}     Total Qty : {totalQty}
              </Text>
            </View>
            <View style={s.totals}>
              <View style={s.tl}>
                <Text style={s.bold}>SUB TOTAL</Text>
                <Text style={s.bold}>{n2(taxable)}</Text>
              </View>
              {taxLines.map(([k, v]) => (
                <View key={k} style={s.tl}>
                  <Text>{k}</Text>
                  <Text>{n2(v)}</Text>
                </View>
              ))}
              {extras.map(([k, v]) => (
                <View key={k} style={s.tl}>
                  <Text>{k}</Text>
                  <Text>{n2(v)}</Text>
                </View>
              ))}
              <View style={s.grand}>
                <Text style={[s.bold, { fontSize: 10 }]}>{d.notCharged ? "VALUE" : "GRAND TOTAL"}</Text>
                <Text style={[s.bold, { fontSize: 10 }]}>{n2(grand)}</Text>
              </View>
            </View>
          </View>
          <Text style={s.words}>
            {numberToWordsINR(grand)}
            {d.notCharged ? " (value for transport only — not a sale)" : ""}
          </Text>

          <View style={s.bottom}>
            <View style={s.terms}>
              <Text style={s.h}>Terms & Conditions</Text>
              {(c.terms.length ? c.terms : ["Goods once sold will not be taken back.", "Subject to local jurisdiction."]).map((t, i) => (
                <Text key={i} style={s.small}>
                  {i + 1}. {t}
                </Text>
              ))}
              {c.bank && !d.notCharged ? (
                <View style={{ marginTop: 5 }}>
                  <Text style={s.h}>BANK DETAIL :</Text>
                  {c.bank.accountName ? <Text style={s.small}>A/C NAME : {c.bank.accountName}</Text> : null}
                  {c.bank.bankName ? <Text style={s.small}>BANK NAME : {c.bank.bankName}</Text> : null}
                  {c.bank.branch ? <Text style={s.small}>BRANCH : {c.bank.branch}</Text> : null}
                  {c.bank.accountNo ? <Text style={s.small}>A/C NO. : {c.bank.accountNo}</Text> : null}
                  {c.bank.ifsc ? <Text style={s.small}>IFSC CODE : {c.bank.ifsc}</Text> : null}
                </View>
              ) : null}
            </View>
            <View style={s.sign}>
              <Text style={[s.bold, { textAlign: "right" }]}>For {c.name.toUpperCase()}</Text>
              <View>
                {d.signLeft ? <Text style={[s.small, { marginBottom: 10 }]}>{d.signLeft} : ____________________</Text> : null}
                <Text style={{ textAlign: "right" }}>Authorised Signatory</Text>
              </View>
            </View>
          </View>
        </View>
        <Text style={s.foot}>{d.footer || "This is a computer generated invoice."}</Text>
      </Page>
    </Document>
  );
}

/** Row height grows with the number of sub-lines so the ruled columns stay aligned. */
function rowH(r: InvoiceRow) {
  return 13 + (r.sub?.length || 0) * 8.5 + 4;
}

export async function generateGstInvoicePDF(d: GstInvoiceData): Promise<Buffer> {
  return renderToBuffer(<GstInvoice d={d} />);
}

/** Totals the invoice prints (for checks and tests). */
export function invoiceTotals(d: Pick<GstInvoiceData, "rows" | "extras">) {
  const taxable = d.rows.reduce((t, r) => t + r.amount, 0);
  const tax = d.rows.reduce((t, r) => t + r.tax, 0);
  const extras = (d.extras || []).reduce((t, [, v]) => t + Math.max(0, v), 0);
  return { taxable, tax, grand: taxable + tax + extras };
}

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

const fmtDate = (d: any) => (d ? new Date(d).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }) : "—");
const vehicleSpec = (m: any, withoutBattery = false) => {
  if (!m) return "";
  const range = m.rangeKm ? `${m.rangeKm}KM ` : "";
  return withoutBattery ? `${range}— SOLD WITHOUT BATTERY` : `${range}${String(m.batteryType || "").toUpperCase()} BATTERY & CHARGER`.trim();
};

/** Retail vehicle sale (with any accessories / parts on the same bill). */
export function retailInvoiceData(company: CompanyProfile, sale: any): GstInvoiceData {
  const v = sale.vehicle || {};
  const m = v.model || {};
  const pb = sale.priceBreakdown || {};
  const taxable = (pb.exShowroom || 0) - (pb.discount || 0);
  const rows: InvoiceRow[] = [
    {
      description: `${m.name || "Electric vehicle"} ${m.variant || ""}`.trim(),
      sub: [
        vehicleSpec(m, sale.withoutBattery),
        `CHASSIS ${v.chassisNumber || "—"} · MOTOR ${v.motorNumber || "—"}${sale.withoutBattery ? "" : ` · BATTERY ${v.batteryNumber || "—"}`}${v.chargerNumber && !sale.withoutBattery ? ` · CHARGER ${v.chargerNumber}` : ""}`,
        `COLOUR ${String(v.color || "").toUpperCase()}${pb.discount ? ` · LESS DISCOUNT ${n2(pb.discount)}` : ""}`,
      ].filter(Boolean),
      hsn: m.hsnCode || "870380",
      qty: 1,
      unit: "PCS",
      rate: pb.exShowroom || 0,
      gstRate: m.gstRate ?? 5,
      amount: taxable,
      tax: pb.gst || 0,
    },
  ];
  for (const l of sale.items || []) {
    rows.push({
      description: l.name,
      sub: [l.serials?.length ? `SL NO. ${l.serials.join(", ")}` : "", l.discount ? `LESS DISCOUNT ${n2(l.discount)}` : ""].filter(Boolean),
      hsn: l.hsnCode,
      qty: l.qty,
      unit: l.unit,
      rate: l.rate,
      gstRate: l.gstRate,
      amount: l.taxable,
      tax: l.gst,
    });
  }
  // Older invoices carried a lump-sum "accessories" amount (GST-inclusive).
  const extras: Array<[string, number]> = [
    ["Accessories", pb.accessories || 0],
    ["RTO registration", pb.registration || 0],
    ["Insurance", pb.insurance || 0],
  ];
  const c = sale.customer || {};
  const stateCode = c.stateCode || company.stateCode;
  const paid = (sale.payments || []).reduce((t: number, p: any) => t + p.amount, 0);
  return {
    title: "GST INVOICE",
    copyLabel: "Original for recipient",
    company,
    buyer: { name: c.name || "Customer", lines: [c.address || ""], phone: c.phone, gstin: c.gstin, stateCode },
    meta: [
      ["Invoice No.", sale.saleCode],
      ["Date", fmtDate(sale.saleDate)],
      ...(sale.dealer ? ([["Dealership code", `${sale.dealer.dealerCode || ""} ${sale.dealer.name ? `(${sale.dealer.name})` : ""}`.trim()]] as Array<[string, string]>) : []),
      ["Sold by", sale.soldBy?.name ? `${sale.soldBy.name} (${sale.soldBy.employeeCode})` : "—"],
      ["Payment", `${sale.paymentMode}${sale.financierDetails?.financierName ? ` · ${sale.financierDetails.financierName}` : ""}`],
      ["Received", `Rs. ${n2(paid)}`],
      ...(c.idProofNumber ? ([[c.idProofType || "ID proof", c.idProofNumber]] as Array<[string, string]>) : []),
    ],
    rows,
    interState: stateCode !== company.stateCode,
    extras,
    signLeft: "Customer's signature",
    footer: sale.status === "CANCELLED" ? "CANCELLED INVOICE — not valid for any purpose." : undefined,
  };
}

/** Parts / accessories / battery counter sale. */
export function partsInvoiceData(company: CompanyProfile, sale: any): GstInvoiceData {
  const c = sale.customer || {};
  const paid = (sale.payments || []).reduce((t: number, p: any) => t + p.amount, 0);
  return {
    title: "GST INVOICE",
    copyLabel: "Original for recipient",
    company,
    buyer: { name: c.name, lines: [c.address || ""], phone: c.phone, gstin: c.gstin, stateCode: c.stateCode || company.stateCode },
    meta: [
      ["Invoice No.", sale.saleCode],
      ["Date", fmtDate(sale.saleDate)],
      ...(sale.chassisNumber ? ([["Vehicle", sale.chassisNumber]] as Array<[string, string]>) : []),
      ["Billed by", sale.soldByName || "—"],
      ["Payment", sale.paymentMode === "CREDIT" ? "Credit" : sale.paymentMode],
      ["Received", `Rs. ${n2(paid)}`],
    ],
    rows: (sale.lines || []).map((l: any) => ({
      description: l.name,
      sub: [l.serials?.length ? `SL NO. ${l.serials.join(", ")}` : "", l.discount ? `LESS DISCOUNT ${n2(l.discount)}` : ""].filter(Boolean),
      hsn: l.hsnCode,
      qty: l.qty,
      unit: l.unit,
      rate: l.rate,
      gstRate: l.gstRate,
      amount: l.taxable,
      tax: l.gst,
    })),
    interState: !!sale.interState,
    remarks: sale.notes ? [sale.notes] : undefined,
    signLeft: "Customer's signature",
    footer: sale.status === "CANCELLED" ? "CANCELLED INVOICE — not valid for any purpose." : undefined,
  };
}

/**
 * Dealer / distributor tax invoice or consignment delivery challan from a delivery order
 * (or a partner-to-partner network sale shaped the same way).
 */
export function channelInvoiceData(company: CompanyProfile, d: any, t: { rows: any[]; interState: boolean }, opts: { models?: Map<string, any>; dueDays?: number } = {}): GstInvoiceData {
  const isInvoice = d.document?.kind === "TAX_INVOICE";
  const p = d.partySnapshot || {};
  const rows: InvoiceRow[] = t.rows.map((r: any, i: number) => {
    const line = d.lines?.[i] || {};
    const model = opts.models?.get(String(line.model));
    const chassis = (d.vehicles || []).filter((v: any) => String(v.model) === String(line.model)).map((v: any) => v.chassisNumber);
    return {
      description: r.modelName,
      sub: [vehicleSpec(model), chassis.length ? `CHASSIS ${chassis.join(", ")}` : ""].filter(Boolean),
      hsn: r.hsnCode,
      qty: r.quantity,
      unit: "PCS",
      rate: r.unitPrice,
      gstRate: r.gstRate,
      amount: r.taxable,
      tax: r.tax,
    };
  });
  const due = isInvoice && opts.dueDays != null && d.document?.date ? new Date(new Date(d.document.date).getTime() + opts.dueDays * 86400000) : null;
  return {
    title: isInvoice ? "GST INVOICE" : "DELIVERY CHALLAN",
    copyLabel: isInvoice ? "Original for recipient" : "Stock on consignment — not a sale",
    company,
    buyer: {
      label: isInvoice ? "Billed & shipped to" : "Consignee (dealer)",
      name: p.name || "Partner",
      lines: [p.address, [p.city, p.pincode].filter(Boolean).join(" - ")],
      phone: p.phone,
      gstin: p.gstin,
      stateCode: p.stateCode,
    },
    meta: [
      [isInvoice ? "Invoice No." : "Challan No.", d.document?.number || "—"],
      ["Date", fmtDate(d.document?.date)],
      ["Dealership code", p.code || "—"],
      ["Ref. No.", `${d.orderCode || ""}${d.doCode ? ` / ${d.doCode}` : ""}` || "—"],
      ["Cases", String(rows.reduce((x, r) => x + r.qty, 0))],
      ["E-Way Bill", d.ewayBill?.ewbNo || (d.ewayBill?.required ? "pending" : "not required")],
      ["Vehicle", `${d.loading?.registrationNo || "—"}${d.loading?.driverName ? ` · ${d.loading.driverName}` : ""}`],
      ...(due ? ([["Due Date", fmtDate(due)]] as Array<[string, string]>) : []),
    ],
    rows,
    interState: t.interState,
    notCharged: !isInvoice,
    remarks: (d.vehicles || []).length
      ? [`Vehicle particulars: ${(d.vehicles || []).map((v: any) => `${v.chassisNumber} (motor ${v.motorNumber || "—"}, battery ${v.batteryNumber || "—"}, ${v.color || ""})`).join("; ")}`]
      : undefined,
    signLeft: "Received in good condition — receiver's signature & stamp",
    footer: isInvoice ? undefined : "Delivery challan under Rule 55, CGST Rules — movement of goods other than by way of supply. Computer-generated document.",
  };
}
