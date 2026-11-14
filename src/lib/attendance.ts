/**
 * Attendance, leave and exit rules (pure functions, unit-tested).
 * Dates are IST calendar days written "YYYY-MM-DD"; times are minutes after IST midnight.
 * Money in integer paise.
 */

export const IST_MS = 330 * 60000;

export interface ShiftRule {
  start: string; // "09:30"
  end: string; // "18:30"
  graceMinutes: number; // late only after start + grace
  halfDayMinutes: number; // worked less than this = absent
  fullDayMinutes: number; // worked less than this = half day
  weeklyOffs: number[]; // 0 = Sunday
}

export const DEFAULT_SHIFT: ShiftRule = {
  start: "09:30",
  end: "18:30",
  graceMinutes: 10,
  halfDayMinutes: 240,
  fullDayMinutes: 480,
  weeklyOffs: [0],
};

export type DayStatus =
  | "PRESENT"
  | "LATE"
  | "HALF_DAY"
  | "ABSENT"
  | "MISSED_PUNCH"
  | "LEAVE"
  | "HALF_LEAVE"
  | "HOLIDAY"
  | "WEEKLY_OFF"
  | "NOT_JOINED"
  | "UPCOMING"
  /** Today, punched in and not yet out: nothing is counted until the day is over. */
  | "ON_DUTY";

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
/** IST "YYYY-MM-DD" of an instant. */
export const istDate = (d: Date | string) => new Date(new Date(d).getTime() + IST_MS).toISOString().slice(0, 10);
/** Minutes after IST midnight of an instant. */
export const istMinutes = (d: Date | string) => {
  const t = new Date(new Date(d).getTime() + IST_MS);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
};
/** Weekday (0 = Sunday) of an IST date string. */
export const weekday = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
/** Every IST date string from a to b inclusive. */
export function datesBetween(a: string, b: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${a}T00:00:00Z`); t <= Date.parse(`${b}T00:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export interface DayInput {
  date: string;
  shift: ShiftRule;
  /** Rostered off / weekly off override for this date (null = use shift.weeklyOffs). */
  offOverride?: boolean | null;
  holiday?: string | null;
  /** Approved leave covering the date. */
  leave?: { code: string; paid: boolean; half: boolean } | null;
  firstIn?: Date | null;
  lastOut?: Date | null;
  today: string;
  joined?: string | null; // joining date
  trackingFrom?: string | null; // attendance tracked from this date
}

export interface DayResult {
  date: string;
  status: DayStatus;
  workedMin: number;
  lateMin: number;
  earlyMin: number;
  otMin: number;
  /** Loss of pay for this day: 0, 0.5 or 1 (late-mark penalties are added per month). */
  lop: number;
  inMin: number | null;
  outMin: number | null;
  /** Leave taken this day (0, 0.5, 1) and whether it was paid leave. */
  leave: number;
  leavePaid: boolean;
  /** Days of presence counted (0, 0.5, 1). */
  presence: number;
}

/** OT counts in completed 30-minute blocks, and only once at least 30 minutes past shift end. */
export const otBlocks = (min: number) => (min >= 30 ? Math.floor(min / 30) * 30 : 0);

export function evaluateDay(i: DayInput): DayResult {
  const base: DayResult = { date: i.date, status: "ABSENT", workedMin: 0, lateMin: 0, earlyMin: 0, otMin: 0, lop: 0, inMin: null, outMin: null, leave: 0, leavePaid: false, presence: 0 };
  const inMin = i.firstIn ? istMinutes(i.firstIn) : null;
  const outMin = i.lastOut ? istMinutes(i.lastOut) : null;
  const worked = i.firstIn && i.lastOut ? Math.max(0, Math.round((+new Date(i.lastOut) - +new Date(i.firstIn)) / 60000)) : 0;
  const r = { ...base, inMin, outMin, workedMin: worked };

  if (i.joined && i.date < i.joined) return { ...r, status: "NOT_JOINED" };
  if (i.trackingFrom && i.date < i.trackingFrom) return { ...r, status: "NOT_JOINED" };
  if (i.date > i.today) return { ...r, status: "UPCOMING" };

  const isOff = i.offOverride != null ? i.offOverride : i.shift.weeklyOffs.includes(weekday(i.date));
  if (i.holiday || isOff) {
    // Work on a holiday / weekly off is all overtime.
    return { ...r, status: i.holiday ? "HOLIDAY" : "WEEKLY_OFF", otMin: otBlocks(worked) };
  }
  if (i.leave && !i.leave.half) return { ...r, status: "LEAVE", lop: i.leave.paid ? 0 : 1, leave: 1, leavePaid: i.leave.paid };

  const start = toMin(i.shift.start);
  const end = toMin(i.shift.end);
  const lateMin = inMin != null && inMin > start + i.shift.graceMinutes ? inMin - start : 0;
  const earlyMin = outMin != null && outMin < end ? end - outMin : 0;
  const halfLeaveLop = i.leave?.half ? (i.leave.paid ? 0 : 0.5) : 0;
  const hl = i.leave?.half ? { leave: 0.5, leavePaid: !!i.leave.paid } : {};

  if (i.date === i.today && outMin == null) {
    // the working day is still running — judge it tomorrow
    return inMin == null ? { ...r, status: "UPCOMING" } : { ...r, status: "ON_DUTY", lateMin };
  }
  if (inMin == null) {
    // no punch at all
    if (i.leave?.half) return { ...r, ...hl, status: "HALF_LEAVE", lop: 0.5 + halfLeaveLop };
    return { ...r, status: "ABSENT", lop: 1 };
  }
  if (outMin == null) {
    // punched in but never out: counted as half a day until regularised
    return { ...r, ...hl, status: "MISSED_PUNCH", lateMin, lop: i.leave?.half ? halfLeaveLop : 0.5, presence: 0.5 };
  }
  if (i.leave?.half) {
    // half-day leave + at least a half day's work = full day
    if (worked >= i.shift.halfDayMinutes) return { ...r, ...hl, status: "HALF_LEAVE", lop: halfLeaveLop, presence: 0.5 };
    return { ...r, ...hl, status: "HALF_LEAVE", lop: 0.5 + halfLeaveLop };
  }
  if (worked < i.shift.halfDayMinutes) return { ...r, status: "ABSENT", lateMin, earlyMin, lop: 1 };
  if (worked < i.shift.fullDayMinutes) return { ...r, status: "HALF_DAY", lateMin, earlyMin, lop: 0.5, presence: 0.5 };
  const otMin = outMin > end ? otBlocks(outMin - end) : 0;
  return { ...r, status: lateMin ? "LATE" : "PRESENT", lateMin, earlyMin, otMin, lop: 0, presence: 1 };
}

export interface MonthSummary {
  workingDays: number; // days that needed attendance
  present: number; // present / late (+0.5 per half day)
  absent: number;
  leavePaid: number;
  leaveUnpaid: number;
  holidays: number;
  weeklyOffs: number;
  lateCount: number;
  earlyCount: number;
  lateMinutes: number;
  otMinutes: number; // all recorded overtime
  latePenaltyLop: number;
  lop: number; // total loss-of-pay days incl. late penalty
  attendancePct: number;
}

/**
 * Month totals. Every `latesPerHalfDay`-th late mark costs half a day (0 disables it).
 */
export function summarizeMonth(days: DayResult[], latesPerHalfDay = 3): MonthSummary {
  const counted = days.filter((d) => !["NOT_JOINED", "UPCOMING", "ON_DUTY"].includes(d.status));
  const working = counted.filter((d) => !["HOLIDAY", "WEEKLY_OFF"].includes(d.status));
  const lateCount = counted.filter((d) => d.lateMin > 0).length;
  const latePenaltyLop = latesPerHalfDay > 0 ? Math.floor(lateCount / latesPerHalfDay) * 0.5 : 0;
  const lopDays = counted.reduce((s, d) => s + d.lop, 0);
  const leavePaid = counted.reduce((s, d) => s + (d.leavePaid ? d.leave : 0), 0);
  const leaveUnpaid = counted.reduce((s, d) => s + (d.leavePaid ? 0 : d.leave), 0);
  const absent = counted.reduce((s, d) => s + (d.status === "ABSENT" ? 1 : 0), 0);
  const present = working.reduce((s, d) => s + d.presence, 0);
  const workingDays = working.length;
  return {
    workingDays,
    present,
    absent,
    leavePaid,
    leaveUnpaid,
    holidays: counted.filter((d) => d.status === "HOLIDAY").length,
    weeklyOffs: counted.filter((d) => d.status === "WEEKLY_OFF").length,
    lateCount,
    earlyCount: counted.filter((d) => d.earlyMin > 0).length,
    lateMinutes: counted.reduce((s, d) => s + d.lateMin, 0),
    otMinutes: counted.reduce((s, d) => s + d.otMin, 0),
    latePenaltyLop,
    lop: Math.min(days.length, lopDays + latePenaltyLop),
    attendancePct: workingDays ? Math.round(((workingDays - lopDays) / workingDays) * 1000) / 10 : 100,
  };
}

/** Days a leave request consumes: working days only (holidays and weekly offs are not deducted). */
export function leaveDays(from: string, to: string, opts: { weeklyOffs: number[]; holidays: string[]; half?: boolean }): number {
  if (to < from) return 0;
  if (opts.half) return from === to ? 0.5 : 0;
  return datesBetween(from, to).filter((d) => !opts.weeklyOffs.includes(weekday(d)) && !opts.holidays.includes(d)).length;
}

/** Annual quota for an employee who joined during the year: pro-rated by remaining months, rounded down to 0.5. */
export function proratedQuota(annual: number, year: number, joined: string): number {
  const j = joined.slice(0, 10);
  if (j < `${year}-01-01`) return annual;
  if (j > `${year}-12-31`) return 0;
  const months = 12 - (Number(j.slice(5, 7)) - 1);
  return Math.floor(((annual * months) / 12) * 2) / 2;
}

/**
 * Overtime pay: ordinary hourly rate = (basic + special allowance) ÷ 26 days ÷ 8 hours,
 * paid at `multiplier` × that rate (2× under the Factories / Shops & Establishments Acts).
 */
export function overtimePay(otMinutes: number, salary: { basic: number; otherAllowances: number }, multiplier = 2) {
  const hourly = (salary.basic + salary.otherAllowances) / 26 / 8;
  return Math.round((otMinutes / 60) * hourly * multiplier);
}

/** EMI recovery for this payroll: the instalment, never more than what is still owed. */
export function recoveryDue(loan: { balance: number; emi: number }) {
  return Math.max(0, Math.min(loan.balance, loan.emi));
}

export interface SettlementInput {
  monthlyGross: number; // fixed gross per month
  basic: number; // monthly basic
  lastMonthDaysInMonth: number;
  lastMonthPaidDays: number; // days worked in the final month (after LOP)
  serviceDays: number; // joining → last working day
  encashableLeave: number; // EL balance
  noticeDays: number; // required
  noticeServedDays: number;
  noticeWaived: boolean;
  loanBalance: number;
  pendingReimbursements: number;
  otherDeductions?: number;
}

/**
 * Full & final settlement.
 * Gratuity (Payment of Gratuity Act): 15/26 × last basic × completed years, only after 5 years;
 * a part-year of 6 months or more counts as a full year.
 */
export function finalSettlement(i: SettlementInput) {
  const salary = Math.round((i.monthlyGross / i.lastMonthDaysInMonth) * i.lastMonthPaidDays);
  const leaveEncashment = Math.round((i.basic / 26) * i.encashableLeave);
  const years = i.serviceDays / 365.25;
  const completed = Math.floor(years) + (years - Math.floor(years) >= 0.5 ? 1 : 0);
  const gratuity = years >= 5 ? Math.round((15 / 26) * i.basic * completed) : 0;
  const shortfall = i.noticeWaived ? 0 : Math.max(0, i.noticeDays - i.noticeServedDays);
  const noticeRecovery = Math.round((i.monthlyGross / 30) * shortfall);
  const earnings = salary + leaveEncashment + gratuity + i.pendingReimbursements;
  const deductions = noticeRecovery + i.loanBalance + (i.otherDeductions || 0);
  return {
    lines: [
      { label: `Salary for ${i.lastMonthPaidDays} day(s) of the final month`, amount: salary },
      { label: `Leave encashment (${i.encashableLeave} day(s) earned leave)`, amount: leaveEncashment },
      { label: years >= 5 ? `Gratuity (${completed} year(s) of service)` : "Gratuity (needs 5 years of service)", amount: gratuity },
      { label: "Approved expense claims not yet paid", amount: i.pendingReimbursements },
      { label: `Notice shortfall recovery (${shortfall} day(s))`, amount: -noticeRecovery },
      { label: "Outstanding advance / loan", amount: -i.loanBalance },
      ...(i.otherDeductions ? [{ label: "Other recoveries", amount: -i.otherDeductions }] : []),
    ],
    earnings,
    deductions,
    net: earnings - deductions,
    gratuityYears: completed,
    shortfallDays: shortfall,
  };
}
