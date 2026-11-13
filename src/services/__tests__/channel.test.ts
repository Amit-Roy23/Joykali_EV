import { describe, it, expect } from "vitest";
import { approvalState, sign, ApprovalError } from "@/lib/approval";
import { channelPrice, lineValue, overdueAmount } from "../creditService";
import { fleetCompliance, requiredDocs } from "@/lib/fleet";
import { buildEwbJson, documentTotals, ewbValidUpto, isEwbNumber } from "@/lib/gstDocs";
import { buildSalaryFromGross, costSalary, grossFromAnnualCtc, calculatePayrollEntry } from "../payrollEngine";

const bh = { userId: "64b000000000000000000001", role: "BUSINESS_HEAD" as const, name: "Ananya", employeeCode: "JKE-BH-0001" };
const mp = { userId: "64b000000000000000000002", role: "MANAGING_PARTNER" as const, name: "Joydeb", employeeCode: "JKE-MP-0001" };
const admin = { userId: "64b000000000000000000003", role: "ADMIN" as const, name: "Rajib", employeeCode: "JKE-ADM-0001" };
const asm = { userId: "64b000000000000000000004", role: "ASM" as const, name: "Moumita", employeeCode: "JKE-ASM-0002" };
const DAY = 86400000;

describe("Two-signature approval (BH → MP)", () => {
  it("needs the Business Head first, then the Managing Partner", () => {
    expect(approvalState([]).next).toBe("BUSINESS_HEAD");
    const a = sign([], bh, "APPROVED");
    expect(a.status).toBe("PENDING");
    expect(a.final).toBe(false);
    expect(a.next).toBe("MANAGING_PARTNER");
    const b = sign(a.signatures, mp, "APPROVED");
    expect(b.status).toBe("APPROVED");
    expect(b.final).toBe(true);
  });

  it("stops the Managing Partner from signing before the Business Head", () => {
    expect(() => sign([], mp, "APPROVED")).toThrow(/Business Head to approve first/);
  });

  it("never lets Admin (or anyone else) approve", () => {
    expect(() => sign([], admin, "APPROVED")).toThrow(ApprovalError);
    expect(() => sign([], admin, "APPROVED")).toThrow(/Admins cannot approve/);
    expect(() => sign([], asm, "APPROVED")).toThrow(/Only the Business Head and the Managing Partner/);
  });

  it("does not let the Business Head sign twice", () => {
    const a = sign([], bh, "APPROVED");
    expect(() => sign(a.signatures, bh, "APPROVED")).toThrow(/waiting for the Managing Partner/);
  });

  it("ends on rejection and requires a reason", () => {
    expect(() => sign([], bh, "REJECTED")).toThrow(/reason is required/);
    const r = sign([], bh, "REJECTED", "Over budget");
    expect(r.status).toBe("REJECTED");
    expect(r.final).toBe(true);
    expect(() => sign(r.signatures, mp, "APPROVED")).toThrow(/Already rejected/);
  });
});

describe("Credit control", () => {
  it("channel prices fall back to a margin off ex-showroom", () => {
    expect(channelPrice({ sellingPrice: 10000000 }, "DISTRIBUTOR")).toBe(8800000);
    expect(channelPrice({ sellingPrice: 10000000 }, "DEALER")).toBe(9200000);
    expect(channelPrice({ sellingPrice: 10000000, distributorPrice: 8500000 }, "DISTRIBUTOR")).toBe(8500000);
  });

  it("line value adds GST", () => {
    expect(lineValue(6, 8526000, 5)).toEqual({ taxable: 51156000, gst: 2557800, total: 53713800 });
  });

  it("applies payments FIFO and only counts debts older than the credit days as overdue", () => {
    const now = new Date("2026-11-30T12:00:00Z");
    const entries = [
      { date: new Date(now.getTime() - 50 * DAY), debit: 100000, credit: 0 }, // old invoice
      { date: new Date(now.getTime() - 40 * DAY), debit: 50000, credit: 0 }, // old invoice
      { date: new Date(now.getTime() - 5 * DAY), debit: 70000, credit: 0 }, // recent invoice
      { date: new Date(now.getTime() - 2 * DAY), debit: 0, credit: 120000 }, // payment
    ];
    // payment clears the 1st invoice and 20,000 of the 2nd → 30,000 of the 2nd is overdue
    expect(overdueAmount(entries, 30, now)).toBe(30000);
    expect(overdueAmount(entries, 60, now)).toBe(0);
  });
});

describe("Fleet document lock", () => {
  const today = new Date("2026-11-14T06:00:00Z");
  const valid = (days: number) => new Date(today.getTime() + days * DAY);
  const docs = (overrides: Record<string, Date | null | undefined> = {}) =>
    ["RC", "INSURANCE", "FITNESS", "PERMIT", "ROAD_TAX", "PUC"]
      .filter((t) => overrides[t] !== undefined || !(t in overrides))
      .map((type) => ({ type, number: "X1", validUpto: type in overrides ? overrides[type] : valid(200) }));

  it("PUC is not required for electric vehicles", () => {
    expect(requiredDocs("ELECTRIC")).not.toContain("PUC");
    expect(requiredDocs("DIESEL")).toContain("PUC");
  });

  it("is cleared when every required document is valid", () => {
    const c = fleetCompliance({ fuel: "DIESEL", status: "ACTIVE", documents: docs() }, today);
    expect(c.locked).toBe(false);
  });

  it("locks on an expired or missing document", () => {
    const expired = fleetCompliance({ fuel: "DIESEL", status: "ACTIVE", documents: docs({ PUC: valid(-1) }) }, today);
    expect(expired.locked).toBe(true);
    expect(expired.reasons.join()).toMatch(/Pollution \(PUC\) expired/);
    const missing = fleetCompliance({ fuel: "DIESEL", status: "ACTIVE", documents: docs().filter((d) => d.type !== "INSURANCE") }, today);
    expect(missing.locked).toBe(true);
    expect(missing.reasons.join()).toMatch(/Insurance missing/);
  });

  it("a document is valid through the whole of its expiry day", () => {
    const expiresToday = new Date("2026-11-14T00:00:00+05:30");
    const c = fleetCompliance({ fuel: "ELECTRIC", status: "ACTIVE", documents: docs({ INSURANCE: expiresToday, PUC: undefined }) }, today);
    expect(c.locked).toBe(false);
    expect(c.expiringSoon.map((e) => e.type)).toContain("INSURANCE");
  });

  it("a renewal (later validity) unlocks it; manual hold and inactive lock it", () => {
    const renewed = [...docs({ PUC: valid(-3) }), { type: "PUC", number: "NEW", validUpto: valid(180) }];
    expect(fleetCompliance({ fuel: "DIESEL", status: "ACTIVE", documents: renewed }, today).locked).toBe(false);
    expect(fleetCompliance({ fuel: "DIESEL", status: "ACTIVE", manualHold: { reason: "Accident repair" }, documents: docs() }, today).reasons).toContain("On hold: Accident repair");
    expect(fleetCompliance({ fuel: "DIESEL", status: "INACTIVE", documents: docs() }, today).locked).toBe(true);
  });
});

describe("GST invoice & e-way bill", () => {
  const lines = [
    { modelName: "Falcon", hsnCode: "870380", quantity: 6, unitPrice: 8526000, gstRate: 5 },
    { modelName: "Storm", hsnCode: "870380", quantity: 4, unitPrice: 6786000, gstRate: 5 },
  ];
  it("intra-state: CGST + SGST that add up exactly", () => {
    const t = documentTotals(lines, "19", "19");
    expect(t.interState).toBe(false);
    expect(t.taxableValue).toBe(78300000);
    expect(t.cgst + t.sgst).toBe(3915000);
    expect(t.igst).toBe(0);
    expect(t.totalValue).toBe(82215000);
  });
  it("inter-state: IGST only", () => {
    const t = documentTotals(lines, "19", "10");
    expect(t.interState).toBe(true);
    expect(t.igst).toBe(3915000);
    expect(t.cgst + t.sgst).toBe(0);
  });
  it("odd paise split: SGST takes the extra paisa", () => {
    const t = documentTotals([{ modelName: "X", hsnCode: "870380", quantity: 1, unitPrice: 1001, gstRate: 5 }], "19", "19");
    expect(t.cgst).toBe(25);
    expect(t.sgst).toBe(25);
  });
  it("e-way bill validity: 1 day per 200 km, ending at midnight IST of the following day", () => {
    const gen = new Date("2026-11-14T10:00:00+05:30");
    expect(ewbValidUpto(gen, 110).toISOString()).toBe("2026-11-15T18:29:59.999Z"); // end of 15 Nov IST
    expect(ewbValidUpto(gen, 200).toISOString()).toBe("2026-11-15T18:29:59.999Z");
    expect(ewbValidUpto(gen, 201).toISOString()).toBe("2026-11-16T18:29:59.999Z");
    expect(ewbValidUpto(gen, 560).toISOString()).toBe("2026-11-17T18:29:59.999Z");
  });
  it("validates EWB numbers and builds NIC bulk JSON", () => {
    expect(isEwbNumber("381012345678")).toBe(true);
    expect(isEwbNumber("38101234567")).toBe(false);
    const j = buildEwbJson({
      docKind: "DELIVERY_CHALLAN",
      docNo: "JKC/2026-27/0001",
      docDate: new Date("2026-11-14T10:00:00+05:30"),
      from: { gstin: "19AAACJ1234F1Z5", name: "Joykali", address: "Barasat", place: "Kolkata", pincode: "700124", stateCode: "19" },
      to: { gstin: "19AHKPH9012M1Z3", name: "Howrah Hub", address: "GT Road", place: "Howrah", pincode: "711101", stateCode: "19" },
      lines,
      distanceKm: 32,
      vehicleNo: "WB-25-K-4521",
    });
    const b = j.billLists[0];
    expect(b.docType).toBe("CHL");
    expect(b.subSupplyType).toBe(8);
    expect(b.docDate).toBe("14/11/2026");
    expect(b.vehicleNo).toBe("WB25K4521");
    expect(b.totInvValue).toBe(822150);
    expect(b.itemList[0].cgstRate).toBe(2.5);
  });
});

describe("Automatic salary structure", () => {
  const flags = { pf: true, esi: true, professionalTax: true };
  it("splits a gross so the components add back exactly", () => {
    const b = buildSalaryFromGross(2000000, flags); // ₹20,000
    expect(b.basic).toBe(1000000);
    expect(b.hra).toBe(400000);
    expect(b.conveyance).toBe(160000);
    expect(b.basic + b.hra + b.conveyance + b.otherAllowances).toBe(2000000);
    expect(b.employee.pf).toBe(120000); // 12% of ₹10,000
    expect(b.employee.esi).toBe(15000); // 0.75% of ₹20,000
    expect(b.employee.professionalTax).toBe(13000); // WB slab ₹15,001–25,000
    expect(b.netTakeHome).toBe(2000000 - 120000 - 15000 - 13000);
    expect(b.employer.esi).toBe(65000); // 3.25%
    expect(b.monthlyCtc).toBe(2000000 + 120000 + 65000);
  });
  it("caps PF at the ₹15,000 statutory wage ceiling", () => {
    const b = buildSalaryFromGross(8500000, { pf: true, esi: false, professionalTax: true }); // ₹85,000
    expect(b.basic).toBe(4250000);
    expect(b.employee.pf).toBe(180000); // 12% of ₹15,000, not of ₹42,500
    expect(b.employee.esi).toBe(0);
  });
  it("finds the gross for a target annual CTC", () => {
    const target = 30000000; // ₹3 lakh CTC
    const gross = grossFromAnnualCtc(target, flags);
    const b = buildSalaryFromGross(gross, flags);
    expect(b.annualCtc).toBeLessThanOrEqual(target);
    expect(buildSalaryFromGross(gross + 1, flags).annualCtc).toBeGreaterThan(target);
  });
  it("costs existing components without re-splitting them", () => {
    const c = costSalary({ basic: 900000, hra: 360000, conveyance: 160000, otherAllowances: 180000 }, flags);
    expect(c.gross).toBe(1600000);
    expect(c.basic).toBe(900000);
  });
  it("payroll uses the PF ceiling when configured", () => {
    const r = calculatePayrollEntry({
      salary: { basic: 4200000, hra: 1680000, conveyance: 480000, otherAllowances: 2140000, fixedDeductions: { pf: true, esi: false, professionalTax: true } },
      workingDays: 30,
      lopDays: 0,
      incentives: 0,
      settings: { pfWageCeilingPaise: 1500000 },
    });
    expect(r.deductions.pf).toBe(180000);
  });
});
