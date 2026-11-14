import { describe, expect, it } from "vitest";
import { DEFAULT_SHIFT, evaluateDay, finalSettlement, leaveDays, overtimePay, proratedQuota, recoveryDue, summarizeMonth } from "../attendance";

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+05:30`);
const base = { shift: DEFAULT_SHIFT, today: "2026-11-30" };

describe("one day", () => {
  it("on time, full day, with overtime in 30-minute blocks", () => {
    const d = evaluateDay({ ...base, date: "2026-11-10", firstIn: at("2026-11-10", "09:35"), lastOut: at("2026-11-10", "19:45") });
    expect(d.status).toBe("PRESENT");
    expect(d.lateMin).toBe(0); // within 10 min grace
    expect(d.otMin).toBe(60); // 75 min past 18:30 → 2 blocks
    expect(d.lop).toBe(0);
  });
  it("late after grace counts minutes from shift start", () => {
    const d = evaluateDay({ ...base, date: "2026-11-10", firstIn: at("2026-11-10", "09:52"), lastOut: at("2026-11-10", "18:20") });
    expect(d.status).toBe("LATE");
    expect(d.lateMin).toBe(22);
    expect(d.earlyMin).toBe(10);
    expect(d.otMin).toBe(0);
  });
  it("short days become half day or absent", () => {
    expect(evaluateDay({ ...base, date: "2026-11-10", firstIn: at("2026-11-10", "09:30"), lastOut: at("2026-11-10", "15:00") }).status).toBe("HALF_DAY");
    expect(evaluateDay({ ...base, date: "2026-11-10", firstIn: at("2026-11-10", "09:30"), lastOut: at("2026-11-10", "12:00") }).lop).toBe(1);
  });
  it("today is not judged until it is over", () => {
    const t = { ...base, today: "2026-11-10" };
    expect(evaluateDay({ ...t, date: "2026-11-10", firstIn: at("2026-11-10", "09:50") })).toMatchObject({ status: "ON_DUTY", lop: 0, lateMin: 20 });
    expect(evaluateDay({ ...t, date: "2026-11-10" })).toMatchObject({ status: "UPCOMING", lop: 0 });
  });
  it("missing out-punch is half a day until regularised; no punch is absent", () => {
    expect(evaluateDay({ ...base, date: "2026-11-10", firstIn: at("2026-11-10", "09:30") })).toMatchObject({ status: "MISSED_PUNCH", lop: 0.5 });
    expect(evaluateDay({ ...base, date: "2026-11-10" })).toMatchObject({ status: "ABSENT", lop: 1 });
  });
  it("Sundays, holidays, future days and pre-joining days cost nothing; working them is overtime", () => {
    expect(evaluateDay({ ...base, date: "2026-11-08" }).status).toBe("WEEKLY_OFF"); // Sunday
    const h = evaluateDay({ ...base, date: "2026-11-09", holiday: "Kali Puja", firstIn: at("2026-11-09", "10:00"), lastOut: at("2026-11-09", "14:10") });
    expect(h).toMatchObject({ status: "HOLIDAY", lop: 0, otMin: 240 });
    expect(evaluateDay({ ...base, date: "2026-12-02" }).status).toBe("UPCOMING");
    expect(evaluateDay({ ...base, date: "2026-11-02", joined: "2026-11-05" }).status).toBe("NOT_JOINED");
    // rostered off on a Monday
    expect(evaluateDay({ ...base, date: "2026-11-10", offOverride: true }).status).toBe("WEEKLY_OFF");
  });
  it("leave: paid costs nothing, unpaid costs the day; half-day leave plus half a day's work is a full day", () => {
    expect(evaluateDay({ ...base, date: "2026-11-10", leave: { code: "CL", paid: true, half: false } })).toMatchObject({ status: "LEAVE", lop: 0 });
    expect(evaluateDay({ ...base, date: "2026-11-10", leave: { code: "LOP", paid: false, half: false } }).lop).toBe(1);
    const hl = evaluateDay({ ...base, date: "2026-11-10", leave: { code: "CL", paid: true, half: true }, firstIn: at("2026-11-10", "09:30"), lastOut: at("2026-11-10", "14:00") });
    expect(hl).toMatchObject({ status: "HALF_LEAVE", lop: 0, presence: 0.5, leave: 0.5 });
    expect(evaluateDay({ ...base, date: "2026-11-10", leave: { code: "CL", paid: true, half: true } }).lop).toBe(0.5);
  });
});

describe("month", () => {
  it("every third late mark costs half a day", () => {
    const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].map((d) =>
      evaluateDay({ ...base, date: d, firstIn: at(d, "09:50"), lastOut: at(d, "18:40") })
    );
    const s = summarizeMonth(days);
    expect(s.lateCount).toBe(6);
    expect(s.latePenaltyLop).toBe(1);
    expect(s.lop).toBe(1);
    expect(s.present).toBe(6);
    expect(summarizeMonth(days, 0).lop).toBe(0);
  });
  it("counts leave days on working days only", () => {
    // Fri 6 Nov → Tue 10 Nov 2026, Sunday off, Monday 9th a holiday → Fri, Sat, Tue
    expect(leaveDays("2026-11-06", "2026-11-10", { weeklyOffs: [0], holidays: ["2026-11-09"] })).toBe(3);
    expect(leaveDays("2026-11-06", "2026-11-06", { weeklyOffs: [0], holidays: [], half: true })).toBe(0.5);
    expect(proratedQuota(12, 2026, "2026-07-15")).toBe(6);
    expect(proratedQuota(12, 2026, "2025-03-01")).toBe(12);
  });
});

describe("money", () => {
  it("overtime at twice the ordinary hourly rate", () => {
    // (₹10,400 + ₹10,400) / 26 / 8 = ₹100/h → 2 h at 2× = ₹400
    expect(overtimePay(120, { basic: 1040000, otherAllowances: 1040000 })).toBe(40000);
  });
  it("EMI never recovers more than is owed", () => {
    expect(recoveryDue({ balance: 300000, emi: 500000 })).toBe(300000);
    expect(recoveryDue({ balance: 900000, emi: 500000 })).toBe(500000);
  });
  it("full and final settlement", () => {
    const s = finalSettlement({
      monthlyGross: 3000000, basic: 1500000, lastMonthDaysInMonth: 30, lastMonthPaidDays: 10,
      serviceDays: Math.round(6.6 * 365.25), encashableLeave: 8, noticeDays: 30, noticeServedDays: 20, noticeWaived: false,
      loanBalance: 200000, pendingReimbursements: 50000,
    });
    expect(s.gratuityYears).toBe(7); // 6.6 years → 7
    const gratuity = Math.round((15 / 26) * 1500000 * 7);
    expect(s.lines[2].amount).toBe(gratuity);
    expect(s.earnings).toBe(1000000 + Math.round((1500000 / 26) * 8) + gratuity + 50000);
    expect(s.deductions).toBe(1000000 + 200000); // 10 days' notice shortfall + loan
    expect(s.net).toBe(s.earnings - s.deductions);
    const young = finalSettlement({ monthlyGross: 3000000, basic: 1500000, lastMonthDaysInMonth: 30, lastMonthPaidDays: 30, serviceDays: 1700, encashableLeave: 0, noticeDays: 30, noticeServedDays: 0, noticeWaived: true, loanBalance: 0, pendingReimbursements: 0 });
    expect(young.lines[2].amount).toBe(0);
    expect(young.shortfallDays).toBe(0);
  });
});

import { performanceScore, distanceM } from "@/services/hrService";
describe("performance and geofence", () => {
  it("weights sales, attendance and punctuality", () => {
    expect(performanceScore({ units: 6, target: 6, attendancePct: 100, lateCount: 0, workingDays: 22 }).score).toBe(100);
    // sales capped at 120%
    expect(performanceScore({ units: 30, target: 6, attendancePct: 100, lateCount: 0, workingDays: 22 }).sales).toBe(120);
    // no target: attendance and punctuality only
    expect(performanceScore({ units: 0, target: 0, attendancePct: 90, lateCount: 11, workingDays: 22 }).score).toBe(54);
  });
  it("measures distance for office punches", () => {
    expect(distanceM({ lat: 22.7225, lng: 88.481 }, { lat: 22.7225, lng: 88.481 })).toBe(0);
    const d = distanceM({ lat: 22.7225, lng: 88.481 }, { lat: 22.7255, lng: 88.481 });
    expect(d).toBeGreaterThan(320);
    expect(d).toBeLessThan(345);
  });
});
