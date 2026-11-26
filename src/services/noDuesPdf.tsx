import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { LOGO_PNG_DATA_URI } from "@/lib/brandLogo";

const BLUE = "#0d47a1";
const s = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 10, color: "#0f172a", lineHeight: 1.45 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 2, borderBottomColor: BLUE, paddingBottom: 10 },
  logo: { width: 100, height: 60 },
  co: { textAlign: "right", fontSize: 8.5, color: "#475569", maxWidth: 260 },
  coName: { fontSize: 12, fontFamily: "Helvetica-Bold", color: BLUE },
  title: { marginTop: 22, textAlign: "center", fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: 2, color: BLUE },
  meta: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, fontSize: 9, color: "#334155" },
  body: { marginTop: 16, fontSize: 10.5, textAlign: "justify" },
  b: { fontFamily: "Helvetica-Bold" },
  h: { marginTop: 14, marginBottom: 4, fontSize: 9, fontFamily: "Helvetica-Bold", color: "#475569", letterSpacing: 1 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 3.5 },
  c1: { width: 30, color: "#059669", fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  c2: { flex: 1 },
  c3: { width: 210, color: "#475569", fontSize: 8.5 },
  foot: { marginTop: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  sign: { width: 190, borderTopWidth: 0.8, borderTopColor: "#334155", paddingTop: 4, fontSize: 9 },
  qr: { width: 74, height: 74 },
  small: { fontSize: 7.5, color: "#64748b", marginTop: 3 },
});

export interface NoDuesPdfProps {
  company: { name: string; address: string; phone?: string; email?: string; gstin?: string };
  nd: any;
  qrPng: Buffer;
  verifyUrl: string;
}
/** The PDF font has no rupee sign. */
const pdfText = (t: string) => String(t || "").replace(/₹/g, "Rs. ");
const d = (x?: string | Date | null) =>
  x ? new Date(typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? `${x}T12:00:00+05:30` : x).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";

function Certificate({ company, nd, qrPng, verifyUrl }: NoDuesPdfProps) {
  const checks = (nd.checksAtIssue || []).filter((c: any) => c.level === "block");
  return (
    <Document title={`No dues certificate ${nd.code}`}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={LOGO_PNG_DATA_URI} style={s.logo} />
          <View style={s.co}>
            <Text style={s.coName}>{company.name}</Text>
            <Text>{company.address}</Text>
            {(company.phone || company.email) && <Text>{[company.phone, company.email].filter(Boolean).join(" · ")}</Text>}
            {company.gstin ? <Text>GSTIN {company.gstin}</Text> : null}
          </View>
        </View>
        <Text style={s.title}>NO DUES CERTIFICATE</Text>
        <View style={s.meta}>
          <Text>Certificate no. {nd.code}</Text>
          <Text>Date: {d(nd.issuedAt)}</Text>
        </View>
        <Text style={s.body}>
          This is to certify that <Text style={s.b}>{nd.employeeName}</Text> (Employee ID <Text style={s.b}>{nd.employeeCode}</Text>), who worked with {company.name} as{" "}
          <Text style={s.b}>{nd.designation}</Text> from {d(nd.joiningDate)} to {d(nd.lastWorkingDay)}, has cleared all dues to the company. Nothing is payable by them to the company, and
          the full and final settlement has been made. The company has no claim against them on the date of this certificate.
        </Text>
        <Text style={s.h}>CLEARANCE CHECKED</Text>
        {checks.map((c: any) => (
          <View key={c.key} style={s.row}>
            <Text style={s.c1}>YES</Text>
            <Text style={s.c2}>{c.label}</Text>
            <Text style={s.c3}>{pdfText(c.detail)}</Text>
          </View>
        ))}
        {(nd.items || []).map((i: any) => (
          <View key={i.key} style={s.row}>
            <Text style={[s.c1, i.status === "NA" ? { color: "#94a3b8" } : {}]}>{i.status === "NA" ? "N/A" : "YES"}</Text>
            <Text style={s.c2}>{i.label}</Text>
            <Text style={s.c3}>{i.status === "NA" ? "Not applicable" : `Cleared${i.byName ? ` · ${i.byName}` : ""}`}{i.note ? ` · ${i.note}` : ""}</Text>
          </View>
        ))}
        <View style={s.foot}>
          <View>
            <Text style={s.sign}>
              Prepared by {nd.submittedByName || nd.openedByName} (HR){"\n"}
              {d(nd.submittedAt)}
            </Text>
          </View>
          <View>
            <Text style={s.sign}>
              Approved by {nd.decision?.byName}{"\n"}
              {nd.decision?.role === "MANAGING_PARTNER" ? "Managing Partner" : "Business Head"} · {d(nd.decision?.at)}
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={{ data: qrPng, format: "png" }} style={s.qr} />
            <Text style={s.small}>Scan to verify</Text>
          </View>
        </View>
        <Text style={[s.small, { marginTop: 18 }]}>
          Issued from the Joykali EV system after approval. Check it is genuine at {verifyUrl}
        </Text>
      </Page>
    </Document>
  );
}

export async function generateNoDuesPDF(p: NoDuesPdfProps) {
  return renderToBuffer(<Certificate {...p} />);
}
