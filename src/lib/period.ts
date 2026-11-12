/**
 * Business calendar helpers. Joykali operates in India, so a "month" for
 * incentives and payroll is an IST (UTC+05:30) calendar month regardless of
 * the server's own timezone. Mixing server-local getMonth() with UTC bounds
 * (the previous behaviour) dropped sales made around midnight on the 1st.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export interface PeriodInfo {
  year: number;
  month: number; // 1-12
  period: string; // "YYYY-MM"
  start: Date; // inclusive, UTC instant of 00:00 IST on the 1st
  end: Date; // inclusive, UTC instant of 23:59:59.999 IST on the last day
  daysInMonth: number;
}

export function periodFor(year: number, month: number): PeriodInfo {
  const start = new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);
  const end = new Date(Date.UTC(year, month, 1) - IST_OFFSET_MS - 1);
  return {
    year,
    month,
    period: `${year}-${String(month).padStart(2, "0")}`,
    start,
    end,
    daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

/** The IST calendar month that contains the given instant. */
export function periodOf(date: Date | string): PeriodInfo {
  const shifted = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return periodFor(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1);
}

/** Every period from `from` to `to` inclusive (by IST month). */
export function periodsBetween(from: Date | string, to: Date | string): PeriodInfo[] {
  const a = periodOf(from);
  const b = periodOf(to);
  const out: PeriodInfo[] = [];
  let y = a.year;
  let m = a.month;
  while (y < b.year || (y === b.year && m <= b.month)) {
    out.push(periodFor(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Parse a scheme validity date. A bare "YYYY-MM-DD" means the whole IST day,
 * so validTo is pushed to 23:59:59.999 IST — otherwise sales on the last day
 * of a scheme silently stop qualifying.
 */
export function parseBusinessDate(value: string | Date, edge: "start" | "end"): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    const startIst = Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
    return new Date(edge === "start" ? startIst : startIst + 24 * 3600 * 1000 - 1);
  }
  return new Date(value);
}
