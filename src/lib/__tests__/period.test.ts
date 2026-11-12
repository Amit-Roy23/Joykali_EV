import { describe, it, expect } from "vitest";
import { parseBusinessDate, periodFor, periodOf, periodsBetween } from "../period";

describe("IST business periods", () => {
  it("assigns a sale just after midnight IST on the 1st to the new month", () => {
    // 00:30 IST on 1 Nov = 19:00 UTC on 31 Oct. The old server-local/UTC mix put this in October.
    expect(periodOf(new Date("2026-10-31T19:00:00Z")).period).toBe("2026-11");
    expect(periodOf(new Date("2026-10-31T18:29:59Z")).period).toBe("2026-10");
  });

  it("builds inclusive IST month bounds", () => {
    const p = periodFor(2026, 11);
    expect(p.start.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(p.end.toISOString()).toBe("2026-11-30T18:29:59.999Z");
    expect(p.daysInMonth).toBe(30);
    expect(periodFor(2028, 2).daysInMonth).toBe(29);
  });

  it("contains a date-only sale stored as UTC midnight on the last day", () => {
    const p = periodFor(2026, 11);
    const sale = new Date("2026-11-30");
    expect(sale >= p.start && sale <= p.end).toBe(true);
  });

  it("lists months across a year boundary", () => {
    expect(periodsBetween("2026-11-15", "2027-02-01").map((p) => p.period)).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("treats a scheme's end date as the whole IST day", () => {
    const end = parseBusinessDate("2026-11-30", "end");
    expect(end.toISOString()).toBe("2026-11-30T18:29:59.999Z");
    // a sale entered for 30 Nov still qualifies
    expect(new Date("2026-11-30") <= end).toBe(true);
    expect(parseBusinessDate("2026-11-01", "start").toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });
});
