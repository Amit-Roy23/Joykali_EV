/** Pure accounting helpers (no database): IST dates, ageing, running balances. Amounts in paise. */

export const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** IST calendar date (YYYY-MM-DD) of an instant. */
export function istDay(d: Date | string): string {
  return new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
}

/** Start / end instants of an IST date range (inclusive). */
export function istRange(from: string, to: string) {
  return { start: new Date(`${from}T00:00:00+05:30`), end: new Date(`${to}T23:59:59.999+05:30`) };
}

/** Indian financial year (1 April – 31 March) containing an IST date. */
export function fyOf(day: string) {
  const y = Number(day.slice(0, 4));
  const startYear = Number(day.slice(5, 7)) < 4 ? y - 1 : y;
  return { label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`, from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

/** First and last IST day of a YYYY-MM period. */
export function monthRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

export type AgeBucket = "0-30" | "31-60" | "61-90" | "90+";
export const AGE_BUCKETS: AgeBucket[] = ["0-30", "31-60", "61-90", "90+"];

/**
 * Ageing of an open balance: credits settle the oldest debits first (FIFO);
 * whatever is still open is bucketed by the age of the debit it belongs to.
 * A net credit balance (advance) is returned as `advance`.
 */
export function ageing(entries: Array<{ date: Date | string; debit: number; credit: number }>, asOf: Date = new Date()) {
  const sorted = [...entries].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  let credits = sorted.reduce((s, e) => s + (e.credit || 0), 0);
  const out: Record<AgeBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let total = 0;
  for (const e of sorted) {
    if (!e.debit) continue;
    const settled = Math.min(credits, e.debit);
    credits -= settled;
    const open = e.debit - settled;
    if (open <= 0) continue;
    const days = Math.floor((asOf.getTime() - new Date(e.date).getTime()) / 86400000);
    const b: AgeBucket = days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
    out[b] += open;
    total += open;
  }
  return { buckets: out, total, advance: credits };
}

export interface BookLine {
  date: string; // YYYY-MM-DD
  at: number; // sort key (ms)
  inflow: number;
  outflow: number;
}

/** Running balance over lines sorted by date, starting from `opening`. */
export function withRunningBalance<T extends BookLine>(opening: number, lines: T[]): Array<T & { balance: number }> {
  let bal = opening;
  return [...lines]
    .sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at)
    .map((l) => {
      bal += l.inflow - l.outflow;
      return { ...l, balance: bal };
    });
}

/** Day totals (receipts, payments, closing) for a book, oldest day first. */
export function daySummary(opening: number, lines: Array<BookLine & { balance: number }>) {
  const days = new Map<string, { date: string; opening: number; inflow: number; outflow: number; closing: number }>();
  let prevClose = opening;
  for (const l of lines) {
    let d = days.get(l.date);
    if (!d) {
      d = { date: l.date, opening: prevClose, inflow: 0, outflow: 0, closing: prevClose };
      days.set(l.date, d);
    }
    d.inflow += l.inflow;
    d.outflow += l.outflow;
    d.closing = l.balance;
    prevClose = l.balance;
  }
  return [...days.values()];
}

/** Variance of actual against budget: positive = overspent. */
export function variance(budget: number, actual: number) {
  return { diff: actual - budget, pct: budget > 0 ? Math.round(((actual - budget) / budget) * 1000) / 10 : null };
}
