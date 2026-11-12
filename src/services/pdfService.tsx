import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import JSZip from "jszip";
import { formatINR, numberToWordsINR } from "@/lib/money";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1e293b",
  },
  headerContainer: {
    borderBottomWidth: 1.5,
    borderBottomColor: "#059669",
    paddingBottom: 10,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#059669",
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
    backgroundColor: "#ecfdf5",
    borderBottomWidth: 1,
    borderBottomColor: "#059669",
    padding: 5,
    fontWeight: "bold",
    color: "#065f46",
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
    borderTopColor: "#059669",
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
            <Text style={styles.companyName}>{props.company.name}</Text>
            <Text style={styles.tagline}>Electric Mobility Redefined</Text>
            <Text style={styles.headerDetails}>
              {props.company.address}, {props.company.city}, {props.company.state} - {props.company.pincode}
            </Text>
            <Text style={styles.headerDetails}>
              GSTIN: {props.company.gstin} | PAN: {props.company.pan}
            </Text>
          </View>
          <View>
            <Text style={styles.docTitle}>PAYSLIP</Text>
            <Text style={{ fontSize: 9, textAlign: "right", color: "#059669", marginTop: 3 }}>
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
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>Basic Salary</Text>
              <Text style={styles.colAmount}>{formatINR(props.earnings.basic)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>House Rent Allowance (HRA)</Text>
              <Text style={styles.colAmount}>{formatINR(props.earnings.hra)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>Conveyance / Travel Allowance</Text>
              <Text style={styles.colAmount}>{formatINR(props.earnings.conveyance)}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>Other Allowances</Text>
              <Text style={styles.colAmount}>{formatINR(props.earnings.otherAllowances)}</Text>
            </View>
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
              <Text style={{ color: "#059669" }}>{formatINR(props.grossPay)}</Text>
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
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>Advance / Other Deductions</Text>
              <Text style={styles.colAmount}>
                {formatINR(props.deductions.advanceRecovery + props.deductions.other)}
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
            backgroundColor: "#ecfdf5",
            borderColor: "#059669",
            borderWidth: 1,
            padding: 10,
            borderRadius: 4,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "bold", color: "#065f46" }}>
            NET PAYABLE AMOUNT:
          </Text>
          <Text style={{ fontSize: 14, fontWeight: "bold", color: "#059669" }}>
            {formatINR(props.netPay)}
          </Text>
        </View>

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

export interface InvoicePDFProps {
  company: {
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    gstin: string;
    pan: string;
    phone: string;
    email: string;
    invoiceTerms?: string[];
  };
  sale: {
    saleCode: string;
    saleDate: Date;
    paymentMode: string;
    customer: {
      name: string;
      phone: string;
      email?: string;
      address: string;
      idProofType?: string;
      idProofNumber?: string;
    };
    vehicle: {
      modelName: string;
      variant: string;
      category: string;
      color: string;
      chassisNumber: string;
      motorNumber: string;
      batteryNumber: string;
      chargerNumber?: string;
    };
    dealer?: {
      name: string;
      gstin: string;
      address: string;
    } | null;
    priceBreakdown: {
      exShowroom: number;
      discount: number;
      gst: number;
      registration: number;
      insurance: number;
      accessories: number;
    };
    totalAmount: number;
  };
}

export const InvoiceDocument: React.FC<InvoicePDFProps> = ({ company, sale }) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerContainer}>
          <View>
            <Text style={styles.companyName}>{company.name}</Text>
            <Text style={styles.tagline}>Authorized Electric Vehicle Dealership</Text>
            <Text style={styles.headerDetails}>
              {company.address}, {company.city}, {company.state} - {company.pincode}
            </Text>
            <Text style={styles.headerDetails}>
              GSTIN: {company.gstin} | PAN: {company.pan}
            </Text>
            <Text style={styles.headerDetails}>
              Phone: {company.phone} | Email: {company.email}
            </Text>
          </View>
          <View>
            <Text style={styles.docTitle}>TAX INVOICE</Text>
            <Text style={{ fontSize: 9, textAlign: "right", fontWeight: "bold", color: "#059669", marginTop: 3 }}>
              Invoice #{sale.saleCode}
            </Text>
            <Text style={{ fontSize: 8, textAlign: "right", color: "#64748b", marginTop: 2 }}>
              Date: {new Date(sale.saleDate).toLocaleDateString("en-IN")}
            </Text>
          </View>
        </View>

        {/* Customer & Dealer Info */}
        <View style={styles.metaContainer}>
          <View style={styles.metaCol}>
            <Text style={{ fontSize: 9, fontWeight: "bold", color: "#059669", marginBottom: 4 }}>
              BILL TO (CUSTOMER):
            </Text>
            <Text style={{ fontWeight: "bold", fontSize: 10 }}>{sale.customer.name}</Text>
            <Text style={{ fontSize: 8, color: "#475569", marginTop: 2 }}>
              Phone: {sale.customer.phone}
            </Text>
            {sale.customer.email && (
              <Text style={{ fontSize: 8, color: "#475569" }}>Email: {sale.customer.email}</Text>
            )}
            <Text style={{ fontSize: 8, color: "#475569" }}>Address: {sale.customer.address}</Text>
            {sale.customer.idProofNumber && (
              <Text style={{ fontSize: 8, color: "#475569" }}>
                ID Proof: {sale.customer.idProofType || "ID"} ({sale.customer.idProofNumber})
              </Text>
            )}
          </View>

          <View style={styles.metaCol}>
            <Text style={{ fontSize: 9, fontWeight: "bold", color: "#059669", marginBottom: 4 }}>
              DISPATCH / OUTLET:
            </Text>
            {sale.dealer ? (
              <>
                <Text style={{ fontWeight: "bold", fontSize: 9 }}>{sale.dealer.name}</Text>
                <Text style={{ fontSize: 8, color: "#475569" }}>GSTIN: {sale.dealer.gstin}</Text>
                <Text style={{ fontSize: 8, color: "#475569" }}>{sale.dealer.address}</Text>
              </>
            ) : (
              <>
                <Text style={{ fontWeight: "bold", fontSize: 9 }}>Direct Warehouse Outlet</Text>
                <Text style={{ fontSize: 8, color: "#475569" }}>{company.address}</Text>
              </>
            )}
            <Text style={{ fontSize: 8, color: "#475569", marginTop: 3 }}>
              Payment Mode: {sale.paymentMode}
            </Text>
          </View>
        </View>

        {/* Vehicle Unit Specification */}
        <View
          style={{
            backgroundColor: "#f8fafc",
            borderWidth: 1,
            borderColor: "#e2e8f0",
            borderRadius: 4,
            padding: 8,
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "bold", color: "#0f172a", marginBottom: 4 }}>
            VEHICLE SPECIFICATION & IDENTIFIERS
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8, color: "#475569" }}>
                <Text style={{ fontWeight: "bold" }}>Model:</Text> {sale.vehicle.modelName} ({sale.vehicle.variant})
              </Text>
              <Text style={{ fontSize: 8, color: "#475569" }}>
                <Text style={{ fontWeight: "bold" }}>Color:</Text> {sale.vehicle.color}
              </Text>
              <Text style={{ fontSize: 8, color: "#475569" }}>
                <Text style={{ fontWeight: "bold" }}>Category:</Text> {sale.vehicle.category}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8, color: "#475569" }}>
                <Text style={{ fontWeight: "bold" }}>Chassis No:</Text> {sale.vehicle.chassisNumber}
              </Text>
              <Text style={{ fontSize: 8, color: "#475569" }}>
                <Text style={{ fontWeight: "bold" }}>Motor No:</Text> {sale.vehicle.motorNumber}
              </Text>
              <Text style={{ fontSize: 8, color: "#475569" }}>
                <Text style={{ fontWeight: "bold" }}>Battery No:</Text> {sale.vehicle.batteryNumber}
              </Text>
            </View>
          </View>
        </View>

        {/* Pricing Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={{ flex: 3 }}>Particulars / Description</Text>
            <Text style={{ flex: 1, textAlign: "center" }}>HSN</Text>
            <Text style={{ flex: 1, textAlign: "right" }}>Amount</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={{ flex: 3 }}>
              {sale.vehicle.modelName} {sale.vehicle.variant} (Ex-Showroom Base)
            </Text>
            <Text style={{ flex: 1, textAlign: "center" }}>870380</Text>
            <Text style={{ flex: 1, textAlign: "right" }}>
              {formatINR(sale.priceBreakdown.exShowroom)}
            </Text>
          </View>
          {sale.priceBreakdown.discount > 0 && (
            <View style={styles.tableRow}>
              <Text style={{ flex: 3, color: "#dc2626" }}>Promotional Dealer Discount</Text>
              <Text style={{ flex: 1, textAlign: "center" }}>-</Text>
              <Text style={{ flex: 1, textAlign: "right", color: "#dc2626" }}>
                -{formatINR(sale.priceBreakdown.discount)}
              </Text>
            </View>
          )}
          <View style={styles.tableRow}>
            <Text style={{ flex: 3 }}>Goods and Services Tax (GST @ 5% EV Concessional)</Text>
            <Text style={{ flex: 1, textAlign: "center" }}>-</Text>
            <Text style={{ flex: 1, textAlign: "right" }}>{formatINR(sale.priceBreakdown.gst)}</Text>
          </View>
          {sale.priceBreakdown.insurance > 0 && (
            <View style={styles.tableRow}>
              <Text style={{ flex: 3 }}>Comprehensive Vehicle Insurance</Text>
              <Text style={{ flex: 1, textAlign: "center" }}>997133</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>
                {formatINR(sale.priceBreakdown.insurance)}
              </Text>
            </View>
          )}
          {sale.priceBreakdown.registration > 0 && (
            <View style={styles.tableRow}>
              <Text style={{ flex: 3 }}>RTO Registration & Road Tax</Text>
              <Text style={{ flex: 1, textAlign: "center" }}>999119</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>
                {formatINR(sale.priceBreakdown.registration)}
              </Text>
            </View>
          )}
          {sale.priceBreakdown.accessories > 0 && (
            <View style={styles.tableRow}>
              <Text style={{ flex: 3 }}>Vehicle Accessories & Helmet Kit</Text>
              <Text style={{ flex: 1, textAlign: "center" }}>8714</Text>
              <Text style={{ flex: 1, textAlign: "right" }}>
                {formatINR(sale.priceBreakdown.accessories)}
              </Text>
            </View>
          )}

          <View style={styles.totalBox}>
            <Text style={{ fontSize: 11, fontWeight: "bold" }}>TOTAL INVOICE AMOUNT</Text>
            <Text style={{ fontSize: 13, fontWeight: "bold", color: "#059669" }}>
              {formatINR(sale.totalAmount)}
            </Text>
          </View>
        </View>

        {/* In Words */}
        <View style={styles.wordsBox}>
          <Text style={{ fontSize: 8, color: "#64748b" }}>Amount in Words:</Text>
          <Text style={{ fontSize: 9, fontWeight: "bold", color: "#0f172a", marginTop: 2 }}>
            {numberToWordsINR(sale.totalAmount)}
          </Text>
        </View>

        {/* Terms */}
        <View style={{ marginTop: 8, padding: 6, backgroundColor: "#f8fafc", borderRadius: 4 }}>
          <Text style={{ fontSize: 8, fontWeight: "bold", color: "#475569", marginBottom: 2 }}>
            Terms & Conditions:
          </Text>
          {(company.invoiceTerms || [
            "Goods once sold will not be taken back without authorization.",
            "Vehicle warranty coverage as per OEM policy and conditions.",
            "Subject to local jurisdiction only.",
          ]).map((term, i) => (
            <Text key={i} style={{ fontSize: 7, color: "#64748b" }}>
              {i + 1}. {term}
            </Text>
          ))}
        </View>

        {/* Signatures */}
        <View style={{ marginTop: 24, flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ width: 140, borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 4 }}>
            <Text style={{ fontSize: 7, color: "#64748b", textAlign: "center" }}>
              Customer Signature
            </Text>
          </View>
          <View style={{ width: 140, borderTopWidth: 1, borderTopColor: "#94a3b8", paddingTop: 4 }}>
            <Text style={{ fontSize: 7, color: "#64748b", textAlign: "center" }}>
              For {company.name} (Authorized Signatory)
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>Thank you for choosing Joykali EV Mobility for your green commute!</Text>
          <Text>Original for Recipient</Text>
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
export async function generateInvoicePDF(props: InvoicePDFProps): Promise<Buffer> {
  const doc = <InvoiceDocument {...props} />;
  return await renderToBuffer(doc);
}

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

