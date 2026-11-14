import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

/** CR80 card (85.6 × 54 mm) in points: front and back on two pages. */
const W = 243;
const H = 153;
const s = StyleSheet.create({
  page: { width: W, height: H, fontFamily: "Helvetica", color: "#0f172a" },
  band: { backgroundColor: "#0b1020", paddingHorizontal: 10, paddingVertical: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { color: "#ffffff", fontSize: 10, fontFamily: "Helvetica-Bold" },
  ev: { color: "#c6f432" },
  small: { fontSize: 6.5, color: "#94a3b8" },
  body: { flexDirection: "row", padding: 9, gap: 9 },
  photo: { width: 58, height: 70, borderRadius: 4, objectFit: "cover", backgroundColor: "#e2e8f0" },
  initials: { width: 58, height: 70, borderRadius: 4, backgroundColor: "#e0e7ff", alignItems: "center", justifyContent: "center" },
  name: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  line: { fontSize: 7.5, marginBottom: 1.5 },
  label: { color: "#64748b" },
  code: { marginTop: 4, fontSize: 9, fontFamily: "Helvetica-Bold", color: "#4338ca" },
  foot: { position: "absolute", bottom: 0, left: 0, right: 0, height: 6, backgroundColor: "#c6f432" },
  back: { padding: 10, flexDirection: "row", gap: 10 },
  qr: { width: 78, height: 78 },
  rule: { fontSize: 6.5, color: "#475569", marginBottom: 2 },
});

export interface IdCardProps {
  company: { name: string; address: string; phone?: string };
  emp: { name: string; employeeCode: string; designation: string; department?: string; bloodGroup?: string; joiningDate: Date; emergencyPhone?: string; phone: string };
  photo?: { data: Buffer; contentType: string } | null;
  qrPng: Buffer;
  validTill: string;
}

function Card({ company, emp, photo, qrPng, validTill }: IdCardProps) {
  const initials = emp.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <Document title={`ID card ${emp.employeeCode}`}>
      <Page size={[W, H]} style={s.page}>
        <View style={s.band}>
          <Text style={s.brand}>
            Joykali <Text style={s.ev}>EV</Text>
          </Text>
          <Text style={s.small}>EMPLOYEE IDENTITY CARD</Text>
        </View>
        <View style={s.body}>
          {photo ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.photo} src={{ data: photo.data, format: photo.contentType.includes("png") ? "png" : "jpg" }} />
          ) : (
            <View style={s.initials}>
              <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", color: "#4338ca" }}>{initials}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{emp.name}</Text>
            <Text style={s.line}>{emp.designation}</Text>
            {emp.department ? (
              <Text style={s.line}>
                <Text style={s.label}>Dept </Text>
                {emp.department}
              </Text>
            ) : null}
            <Text style={s.line}>
              <Text style={s.label}>Blood </Text>
              {emp.bloodGroup || "—"}
              <Text style={s.label}>   Joined </Text>
              {new Date(emp.joiningDate).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
            </Text>
            <Text style={s.code}>{emp.employeeCode}</Text>
          </View>
        </View>
        <View style={s.foot} />
      </Page>
      <Page size={[W, H]} style={s.page}>
        <View style={s.back}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={s.qr} src={{ data: qrPng, format: "png" }} />
          <View style={{ flex: 1 }}>
            <Text style={[s.rule, { fontFamily: "Helvetica-Bold", color: "#0f172a" }]}>Scan to check this card is valid.</Text>
            <Text style={s.rule}>This card is company property and must be returned on leaving.</Text>
            <Text style={s.rule}>If found, please return to:</Text>
            <Text style={s.rule}>{company.name}</Text>
            <Text style={s.rule}>{company.address}</Text>
            {company.phone ? <Text style={s.rule}>Ph: {company.phone}</Text> : null}
            <Text style={[s.rule, { marginTop: 3 }]}>Emergency: {emp.emergencyPhone || emp.phone}</Text>
            <Text style={[s.rule, { marginTop: 3 }]}>Valid till {validTill}</Text>
          </View>
        </View>
        <View style={s.foot} />
      </Page>
    </Document>
  );
}

export async function generateIdCardPDF(p: IdCardProps): Promise<Buffer> {
  return renderToBuffer(<Card {...p} />);
}
