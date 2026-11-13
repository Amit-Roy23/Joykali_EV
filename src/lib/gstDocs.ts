/**
 * GST invoice / delivery-challan totals and e-way bill helpers (pure).
 * Amounts in integer paise.
 */
export interface DocLine {
  modelName: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
}

export function documentTotals(lines: DocLine[], supplierStateCode: string, recipientStateCode: string) {
  const interState = String(supplierStateCode) !== String(recipientStateCode);
  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  const rows = lines.map((l) => {
    const t = l.quantity * l.unitPrice;
    const tax = Math.round((t * l.gstRate) / 100);
    taxable += t;
    if (interState) igst += tax;
    else {
      // split evenly; any odd paisa goes to SGST so CGST + SGST = tax exactly
      const half = Math.floor(tax / 2);
      cgst += half;
      sgst += tax - half;
    }
    return { ...l, taxable: t, tax };
  });
  return { interState, rows, taxableValue: taxable, cgst, sgst, igst, totalValue: taxable + cgst + sgst + igst };
}

/**
 * E-way bill validity for normal cargo: 1 day per 200 km (or part). A "day"
 * ends at midnight following the generation date, so a bill generated today
 * for ≤200 km is valid until 23:59:59 IST tomorrow.
 */
export function ewbValidUpto(generatedAt: Date, distanceKm: number): Date {
  const days = Math.max(1, Math.ceil(Math.max(1, distanceKm) / 200));
  const IST = 330 * 60000;
  const istDate = new Date(generatedAt.getTime() + IST);
  const midnightIstUtc = Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate()) - IST;
  return new Date(midnightIstUtc + (days + 1) * 86400000 - 1);
}

export const isEwbNumber = (v: string) => /^\d{12}$/.test(v.trim());

const ddmmyyyy = (d: Date) => {
  const ist = new Date(d.getTime() + 330 * 60000);
  return `${String(ist.getUTCDate()).padStart(2, "0")}/${String(ist.getUTCMonth() + 1).padStart(2, "0")}/${ist.getUTCFullYear()}`;
};
const r2 = (paise: number) => Math.round(paise) / 100;

/**
 * JSON in the NIC e-way bill portal's bulk-upload format (one bill). Upload it at
 * ewaybillgst.gov.in → Generate Bulk, then enter the 12-digit EWB number here.
 */
export function buildEwbJson(p: {
  docKind: "TAX_INVOICE" | "DELIVERY_CHALLAN";
  docNo: string;
  docDate: Date;
  from: { gstin: string; name: string; address: string; place: string; pincode: string; stateCode: string };
  to: { gstin: string; name: string; address: string; place: string; pincode: string; stateCode: string };
  lines: DocLine[];
  distanceKm: number;
  vehicleNo: string;
  transporterName?: string;
  transporterId?: string;
}) {
  const t = documentTotals(p.lines, p.from.stateCode, p.to.stateCode);
  const challan = p.docKind === "DELIVERY_CHALLAN";
  return {
    version: "1.0.0621",
    billLists: [
      {
        userGstin: p.from.gstin,
        supplyType: "O",
        // 1 = Supply; 8 = Others (stock moved to a dealer on consignment)
        subSupplyType: challan ? 8 : 1,
        subSupplyDesc: challan ? "Consignment to dealer" : "",
        docType: challan ? "CHL" : "INV",
        docNo: p.docNo,
        docDate: ddmmyyyy(p.docDate),
        transType: 1,
        fromGstin: p.from.gstin,
        fromTrdName: p.from.name,
        fromAddr1: p.from.address,
        fromAddr2: "",
        fromPlace: p.from.place,
        fromPincode: Number(p.from.pincode) || 0,
        fromStateCode: Number(p.from.stateCode),
        actualFromStateCode: Number(p.from.stateCode),
        toGstin: p.to.gstin || "URP",
        toTrdName: p.to.name,
        toAddr1: p.to.address,
        toAddr2: "",
        toPlace: p.to.place,
        toPincode: Number(p.to.pincode) || 0,
        toStateCode: Number(p.to.stateCode),
        actualToStateCode: Number(p.to.stateCode),
        totalValue: r2(t.taxableValue),
        cgstValue: r2(t.cgst),
        sgstValue: r2(t.sgst),
        igstValue: r2(t.igst),
        cessValue: 0,
        TotNonAdvolVal: 0,
        OthValue: 0,
        totInvValue: r2(t.totalValue),
        transMode: 1, // road
        transDistance: Math.round(p.distanceKm),
        transporterName: p.transporterName || "",
        transporterId: p.transporterId || "",
        transDocNo: "",
        transDocDate: "",
        vehicleNo: p.vehicleNo.replace(/[^A-Z0-9]/gi, "").toUpperCase(),
        vehicleType: "R",
        mainHsnCode: Number(p.lines[0]?.hsnCode || 870380),
        itemList: t.rows.map((r, i) => ({
          itemNo: i + 1,
          productName: r.modelName,
          productDesc: r.modelName,
          hsnCode: Number(r.hsnCode),
          quantity: r.quantity,
          qtyUnit: "NOS",
          taxableAmount: r2(r.taxable),
          cgstRate: t.interState ? 0 : r.gstRate / 2,
          sgstRate: t.interState ? 0 : r.gstRate / 2,
          igstRate: t.interState ? r.gstRate : 0,
          cessRate: 0,
          cessNonAdvol: 0,
        })),
      },
    ],
  };
}
