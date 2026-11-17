import { describe, expect, it } from "vitest";
import { ageing, daySummary, fyOf, istDay, monthRange, variance, withRunningBalance } from "../accounting";

describe("accounting helpers", () => {
  it("IST day and financial year", () => {
    expect(istDay(new Date("2026-03-31T20:00:00Z"))).toBe("2026-04-01");
    expect(fyOf("2026-03-31")).toEqual({ label: "2025-26", from: "2025-04-01", to: "2026-03-31" });
    expect(fyOf("2026-11-17").label).toBe("2026-27");
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("ageing settles the oldest bills first", () => {
    const asOf = new Date("2026-11-17T12:00:00Z");
    const d = (days: number) => new Date(asOf.getTime() - days * 86400000);
    const r = ageing(
      [
        { date: d(100), debit: 5000, credit: 0 },
        { date: d(45), debit: 3000, credit: 0 },
        { date: d(10), debit: 2000, credit: 0 },
        { date: d(5), debit: 0, credit: 6000 },
      ],
      asOf
    );
    // 6000 paid: clears the 100-day bill (5000) and 1000 of the 45-day bill
    expect(r.buckets).toEqual({ "0-30": 2000, "31-60": 2000, "61-90": 0, "90+": 0 });
    expect(r.total).toBe(4000);
    expect(r.advance).toBe(0);
    expect(ageing([{ date: d(1), debit: 0, credit: 700 }], asOf).advance).toBe(700);
  });

  it("running balance and day summary", () => {
    const lines = withRunningBalance(1000, [
      { date: "2026-11-02", at: 2, inflow: 0, outflow: 300 },
      { date: "2026-11-01", at: 1, inflow: 500, outflow: 0 },
      { date: "2026-11-02", at: 1, inflow: 200, outflow: 0 },
    ]);
    expect(lines.map((l) => l.balance)).toEqual([1500, 1700, 1400]);
    expect(daySummary(1000, lines)).toEqual([
      { date: "2026-11-01", opening: 1000, inflow: 500, outflow: 0, closing: 1500 },
      { date: "2026-11-02", opening: 1500, inflow: 200, outflow: 300, closing: 1400 },
    ]);
  });

  it("variance", () => {
    expect(variance(1000, 1200)).toEqual({ diff: 200, pct: 20 });
    expect(variance(0, 50)).toEqual({ diff: 50, pct: null });
  });
});
