import React from "react";
import {
  Document,
  Image,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import JSZip from "jszip";
import { formatINR, numberToWordsINR } from "@/lib/money";
import { LOGO_PNG_DATA_URI } from "@/lib/brandLogo";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },
  headerContainer: {
    borderBottomWidth: 1.5,
    borderBottomColor: "#1565c0",
    paddingBottom: 10,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1565c0",
  },
  tagline: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  headerDetails: {
    fontSize: 8,
    color: "#475569",
    lineHeight: 1.3,
  },
  docTitle: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
    color: "#0f172a",
  },
  metaContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    padding: 8,
    borderRadius: 4,
    marginBottom: 12,
  },
  metaCol: {
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  metaLabel: {
    width: 85,
    fontWeight: "bold",
    color: "#475569",
  },
  metaVal: {
    flex: 1,
    color: "#0f172a",
  },
  table: {
    width: "100%",
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e9f2fd",
    borderBottomWidth: 1,
    borderBottomColor: "#1565c0",
    padding: 5,
    fontWeight: "bold",
    color: "#0d47a1",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    padding: 5,
  },
  colDesc: {
    flex: 3,
  },
  colAmount: {
    flex: 1,
    textAlign: "right",
  },
  twoColumnContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  halfColumn: {
    flex: 1,
  },
  totalBox: {
    borderTopWidth: 1.5,
    borderTopColor: "#1565c0",
    paddingTop: 6,
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontWeight: "bold",
    fontSize: 10,
  },
  wordsBox: {
    backgroundColor: "#f1f5f9",
    padding: 6,
    borderRadius: 4,
    marginTop: 8,
    marginBottom: 12,
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 30,
    right: 30,
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#94a3b8",
  },
});

export interface PayslipPDFProps {
  company: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    gstin: string;
    pan: string;
  };
  employee: {
    name: string;
    employeeCode: string;
    designation: string;
    pan: string;
    bankName: string;
    accountNo: string;
    ifsc: string;
  };
  payroll: {
    runCode: string;
    payslipCode: string;
    month: number;
    year: number;
    workingDays: number;
    paidDays: number;
    lopDays: number;
  };
  earnings: {
    basic: number;
    hra: number;
    conveyance: number;
    otherAllowances: number;
    incentives: number;
    incentiveBreakdown?: Array<{ schemeName: string; amount: number }>;
  };
  /** Template salary columns; when present they replace the four fixed earning rows. */
  earningLines?: Array<{ name: string; amount: number }>;
  deductionLines?: Array<{ name: string; amount: number }>;
  adjustments?: Array<{ amount: number; reason: string }>;
  employer?: { pf: number; eps: number; epf: number; edli: number; pfAdmin: number; esi: number; total: number } | null;
  statutoryIds?: { uan?: string; esiNumber?: string };
  deductions: {
    pf: number;
    esi: number;
    professionalTax: number;
    tds: number;
    advanceRecovery: number;
    other: number;
  };
  grossPay: number;
  totalDeductions: number;
  netPay: number;
}

export const PayslipDocument: React.FC<PayslipPDFProps> = (props) => {
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthStr = `${monthNames[props.payroll.month - 1]} ${props.payroll.year}`;

  const maskedAccount = props.employee.accountNo
    ? `XXXX-XXXX-${props.employee.accountNo.slice(-4)}`
    : "N/A";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={LOGO_PNG_DATA_URI} style={{ width: 144, height: 32, marginBottom: 4, marginLeft: -2 }} />
            <Text style={styles.headerDetails}>
              {props.company.address}, {props.company.city}, {props.company.state} - {props.company.pincode}
            </Text>
            <Text style={styles.headerDetails}>
              GSTIN: {props.company.gstin} | PAN: {props.company.pan}
            </Text>
          </View>
          <View>
            <Text style={styles.docTitle}>PAYSLIP</Text>
            <Text style={{ fontSize: 9, textAlign: "right", color: "#1565c0", marginTop: 3 }}>
              {monthStr}
            </Text>
            <Text style={{ fontSize: 7, textAlign: "right", color: "#64748b", marginTop: 2 }}>
              Slip #{props.payroll.payslipCode}
            </Text>
          </View>
        </View>

        {/* Employee & Attendance Details */}
        <View style={styles.metaContainer}>
          <View style={styles.metaCol}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Employee Name:</Text>
              <Text style={styles.metaVal}>{props.employee.name}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Employee Code:</Text>
              <Text style={styles.metaVal}>{props.employee.employeeCode}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Designation:</Text>
              <Text style={styles.metaVal}>{props.employee.designation}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>PAN:</Text>
              <Text style={styles.metaVal}>{props.employee.pan}</Text>
            </View>
          </View>
          <View style={styles.metaCol}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Bank Name:</Text>
              <Text style={styles.metaVal}>{props.employee.bankName}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Bank A/C No:</Text>
              <Text style={styles.metaVal}>{maskedAccount}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>IFSC Code:</Text>
              <Text style={styles.metaVal}>{props.employee.ifsc}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Paid / Total Days:</Text>
              <Text style={styles.metaVal}>
                {props.payroll.paidDays} / {props.payroll.workingDays} (LOP: {props.payroll.lopDays})
              </Text>
            </View>
          </View>
        </View>

        {/* Earnings & Deductions Tables */}
        <View style={styles.twoColumnContainer}>
          {/* Earnings */}
          <View style={styles.halfColumn}>
            <View style={styles.tableHeader}>
              <Text style={styles.colDesc}>Earnings Component</Text>
              <Text style={styles.colAmount}>Amount</Text>
            </View>
            {(props.earningLines?.length
              ? props.earningLines
              : [
                  { name: "Basic Salary", amount: props.earnings.basic },
                  { name: "House Rent Allowance (HRA)", amount: props.earnings.hra },
                  { name: "Conveyance / Travel Allowance", amount: props.earnings.conveyance },
                  { name: "Other Allowances", amount: props.earnings.otherAllowances },
                ]
            ).map((l, i) => (
              <View key={`e${i}`} style={styles.tableRow}>
                <Text style={styles.colDesc}>{l.name}</Text>
                <Text style={styles.colAmount}>{formatINR(l.amount)}</Text>
              </View>
            ))}
            {(props.adjustments || [])
              .filter((a) => a.amount > 0)
              .map((a, i) => (
                <View key={`a${i}`} style={styles.tableRow}>
                  <Text style={styles.colDesc}>{a.reason}</Text>
                  <Text style={styles.colAmount}>{formatINR(a.amount)}</Text>
                </View>
              ))}
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>Sales Performance Incentives</Text>
              <Text style={styles.colAmount}>{formatINR(props.earnings.incentives)}</Text>
            </View>

            {props.earnings.incentiveBreakdown?.map((item, idx) => (
              <View key={idx} style={[styles.tableRow, { backgroundColor: "#fcfdfd" }]}>
                <Text style={[styles.colDesc, { paddingLeft: 10, fontSize: 8, color: "#64748b" }]}>
                  • {item.schemeName}
                </Text>
                <Text style={[styles.colAmount, { fontSize: 8, color: "#64748b" }]}>
                  {formatINR(item.amount)}
                </Text>
              </View>
            ))}

            <View style={styles.totalBox}>
              <Text>Total Gross Earnings</Text>
              <Text style={{ color: "#1565c0" }}>{formatINR(props.grossPay)}</Text>
            </View>
          </View>

          {/* Deductions */}
          <View style={styles.halfColumn}>
            <View style={styles.tableHeader}>
              <Text style={styles.colDesc}>Deductions</Text>
              <Text style={styles.colAmount}>Amount</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>Provident Fund (PF)</Text>
              <Text style={styles.colAmount}>{formatINR(props.deductions.pf)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>ESI Contribution</Text>
              <Text style={styles.colAmount}>{formatINR(props.deductions.esi)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>Professional Tax (PT)</Text>
              <Text style={styles.colAmount}>{formatINR(props.deductions.professionalTax)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>Tax Deducted at Source (TDS)</Text>
              <Text style={styles.colAmount}>{formatINR(props.deductions.tds)}</Text>
            </View>
            {(props.deductionLines || []).map((l, i) => (
              <View key={`d${i}`} style={styles.tableRow}>
                <Text style={styles.colDesc}>{l.name}</Text>
                <Text style={styles.colAmount}>{formatINR(l.amount)}</Text>
              </View>
            ))}
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>Advance / Other Deductions</Text>
              <Text style={styles.colAmount}>
                {formatINR(props.deductions.advanceRecovery + props.deductions.other - (props.deductionLines || []).reduce((s, l) => s + l.amount, 0))}
              </Text>
            </View>

            <View style={styles.totalBox}>
              <Text>Total Deductions</Text>
              <Text style={{ color: "#dc2626" }}>{formatINR(props.totalDeductions)}</Text>
            </View>
          </View>
        </View>

        {/* Net Pay Box */}
        <View
          style={{
            backgroundColor: "#e9f2fd",
            borderColor: "#1565c0",
            borderWidth: 1,
            padding: 10,
            borderRadius: 4,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#0d47a1" }}>
            NET PAYABLE AMOUNT:
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "bold", color: "#1565c0" }}>
            {formatINR(props.netPay)}
          </Text>
        </View>

        {props.employer && props.employer.total > 0 ? (
          <View style={{ marginTop: 6, padding: 6, borderWidth: 0.5, borderColor: "#cbd5e1", borderRadius: 4 }}>
            <Text style={{ fontSize: 7.5, color: "#475569" }}>
              Employer contributions (not deducted from you): PF {formatINR(props.employer.pf)} (pension EPS {formatINR(props.employer.eps)}, EPF {formatINR(props.employer.epf)}) · EDLI {formatINR(props.employer.edli)} · PF admin {formatINR(props.employer.pfAdmin)} · ESI {formatINR(props.employer.esi)}
              {props.statutoryIds?.uan ? ` · UAN ${props.statutoryIds.uan}` : ""}
              {props.statutoryIds?.esiNumber ? ` · ESI IP ${props.statutoryIds.esiNumber}` : ""}
            </Text>
          </View>
        ) : null}

        {/* Net Pay In Words */}
        <View style={styles.wordsBox}>
          <Text style={{ fontSize: 8, color: "#64748b" }}>Amount in Words:</Text>
          <Text style={{ fontSize: 9, fontWeight: "bold", color: "#0f172a", marginTop: 2 }}>
            {numberToWordsINR(props.netPay)}
          </Text>
        </View>

        {/* Signatures & Footer */}
        <View style={{ marginTop: 20, flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ width: 140, borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 4 }}>
            <Text style={{ fontSize: 7, color: "#64748b", textAlign: "center" }}>
              Employee Signature
            </Text>
          </View>
          <View style={{ width: 140, borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 4 }}>
            <Text style={{ fontSize: 7, color: "#64748b", textAlign: "center" }}>
              For {props.company.name} (Authorized Signatory)
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>This is a computer-generated payslip and does not require a physical signature.</Text>
          <Text>Confidential • Joykali EV Mobility System</Text>
        </View>
      </Page>
    </Document>
  );
};

/**
 * Generate Payslip PDF Buffer
 */
export async function generatePayslipPDF(props: PayslipPDFProps): Promise<Buffer> {
  const doc = <PayslipDocument {...props} />;
  return await renderToBuffer(doc);
}

/**
 * Generate Invoice PDF Buffer
 */

/**
 * Bulk generate ZIP of all payslips in a payroll run
 */
export async function generateBulkPayslipsZIP(
  payrollEntries: PayslipPDFProps[],
  runCode: string
): Promise<Buffer> {
  const zip = new JSZip();
  const folder = zip.folder(`Payslips_${runCode}`);

  for (const entry of payrollEntries) {
    const pdfBuffer = await generatePayslipPDF(entry);
    const fileName = `${entry.employee.employeeCode}_${entry.employee.name.replace(/\s+/g, "_")}.pdf`;
    folder?.file(fileName, pdfBuffer);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return zipBuffer;
}

