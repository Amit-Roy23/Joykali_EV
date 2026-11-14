import mongoose from "mongoose";
import { JWTPayload, EMPLOYEE_ROLES } from "@/types";
import { User } from "@/models/User";
import { Setting } from "@/models/Setting";
import { StoredFile } from "@/models/StoredFile";
import { Sale } from "@/models/Sale";
import { IncentiveLedger } from "@/models/IncentiveLedger";
import {
  AttendanceDay,
  AttendancePunch,
  Department,
  EmployeeTarget,
  Holiday,
  LeaveOpening,
  LeaveRequest,
  LeaveType,
  Regularization,
  RosterEntry,
  Shift,
} from "@/models/Hr";
import { getTeamUserIds, hasPermission } from "@/lib/rbac";
import { logAudit } from "@/lib/audit";
import { periodFor } from "@/lib/period";
import {
  datesBetween,
  DayResult,
  DEFAULT_SHIFT,
  evaluateDay,
  istDate,
  leaveDays,
  proratedQuota,
  ShiftRule,
  summarizeMonth,
  toMin,
  weekday,
} from "@/lib/attendance";

export class HrError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const oid = (v: any) => new mongoose.Types.ObjectId(String(v));
const same = (a: any, b: any) => !!a && !!b && String(a) === String(b);
const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const todayIst = () => istDate(new Date());

/* ------------------------------------------------------------------ */
/* Who may act for whom                                                 */
/* ------------------------------------------------------------------ */

/** Employees a user may see in team attendance / leave screens. null = everyone. */
export async function teamScope(user: JWTPayload): Promise<mongoose.Types.ObjectId[] | null> {
  if (await hasPermission(user.role, "attendance.manage")) return null;
  if (await hasPermission(user.role, "attendance.team")) return [oid(user.userId), ...(await getTeamUserIds(user.userId))];
  return [oid(user.userId)];
}

/**
 * Decide a request for `employeeId`: their reporting line above them, or HR (attendance.manage).
 * Never their own request.
 */
export async function assertApprover(user: JWTPayload, employeeId: any) {
  if (same(user.userId, employeeId)) throw new HrError("You cannot approve your own request", 403);
  if (await hasPermission(user.role, "attendance.manage")) return;
  if (await hasPermission(user.role, "leave.approve")) {
    const team = await getTeamUserIds(user.userId);
    if (team.some((t) => same(t, employeeId))) return;
  }
  throw new HrError("Only the employee's manager or HR can decide this", 403);
}

async function hrSettings() {
  const s: any = await Setting.findOne().select("hr").lean();
  return {
    trackingFrom: s?.hr?.trackingFrom || "",
    latesPerHalfDay: s?.hr?.latesPerHalfDay ?? 3,
    otMultiplier: s?.hr?.otMultiplier ?? 2,
    otEligibleRoles: s?.hr?.otEligibleRoles ?? ["FEC", "OUTLET"],
    office: s?.hr?.office || {},
    maxAdvancePctOfGross: s?.hr?.maxAdvancePctOfGross ?? 50,
    maxLoanMultipleOfGross: s?.hr?.maxLoanMultipleOfGross ?? 3,
    idleLogoutMinutes: s?.hr?.idleLogoutMinutes ?? 30,
  };
}
export { hrSettings };

/* ------------------------------------------------------------------ */
/* Masters: departments, holidays, shifts                               */
/* ------------------------------------------------------------------ */

async function requireHr(user: JWTPayload) {
  if (!(await hasPermission(user.role, "hr.manage"))) throw new HrError("Only HR can change this", 403);
}

export async function upsertDepartment(user: JWTPayload, input: { id?: string; name: string; code: string; headId?: string | null }) {
  await requireHr(user);
  if (!input.name?.trim() || !/^[A-Z0-9-]{2,12}$/i.test(input.code || "")) throw new HrError("Enter a name and a 2–12 character code");
  const data = { name: input.name.trim(), code: input.code.toUpperCase(), head: input.headId && mongoose.isValidObjectId(input.headId) ? oid(input.headId) : null };
  const d = input.id ? await Department.findByIdAndUpdate(input.id, data, { new: true }) : await Department.create(data);
  await logAudit({ user, action: input.id ? "UPDATE" : "CREATE", resource: "EMPLOYEE", resourceId: String(d?._id), after: { department: data.name } });
  return d;
}

export async function addHoliday(user: JWTPayload, input: { date: string; name: string; kind?: string }) {
  await requireHr(user);
  if (!YMD.test(input.date || "") || !input.name?.trim()) throw new HrError("Enter a date and a name");
  if (await Holiday.findOne({ date: input.date })) throw new HrError("There is already a holiday on that date", 409);
  const h = await Holiday.create({ date: input.date, name: input.name.trim(), kind: (["NATIONAL", "FESTIVAL", "OPTIONAL"].includes(input.kind || "") ? input.kind : "FESTIVAL") as any });
  await logAudit({ user, action: "CREATE", resource: "SETTINGS", resourceId: String(h._id), after: { holiday: h.name, date: h.date } });
  return h;
}
export async function removeHoliday(user: JWTPayload, id: string) {
  await requireHr(user);
  const h = await Holiday.findById(id);
  if (!h) throw new HrError("Holiday not found", 404);
  if (h.date < todayIst()) throw new HrError("Past holidays cannot be removed — payroll may already use them");
  await h.deleteOne();
  return { ok: true };
}

export async function upsertShift(user: JWTPayload, input: any) {
  await requireHr(user);
  const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!input.name?.trim() || !input.code?.trim() || !hm.test(input.start) || !hm.test(input.end)) throw new HrError("Enter name, code, start and end (HH:MM)");
  if (toMin(input.end) <= toMin(input.start)) throw new HrError("Shift must end after it starts (night shifts are not supported yet)");
  const offs = (input.weeklyOffs || []).map(Number).filter((n: number) => n >= 0 && n <= 6);
  const span = toMin(input.end) - toMin(input.start);
  const data = {
    name: input.name.trim(),
    code: String(input.code).toUpperCase(),
    start: input.start,
    end: input.end,
    graceMinutes: Math.min(120, Math.max(0, Number(input.graceMinutes ?? 10))),
    fullDayMinutes: Math.min(span, Math.max(60, Number(input.fullDayMinutes ?? span - 60))),
    halfDayMinutes: Math.max(30, Number(input.halfDayMinutes ?? Math.round(span / 2))),
    weeklyOffs: offs,
    isDefault: !!input.isDefault,
  };
  if (data.halfDayMinutes >= data.fullDayMinutes) throw new HrError("Half-day minutes must be less than full-day minutes");
  if (data.isDefault) await Shift.updateMany({}, { $set: { isDefault: false } });
  return input.id ? Shift.findByIdAndUpdate(input.id, data, { new: true }) : Shift.create(data);
}

/* ------------------------------------------------------------------ */
/* Month view (the heart of attendance)                                 */
/* ------------------------------------------------------------------ */

function shiftRule(s: any): ShiftRule {
  if (!s) return DEFAULT_SHIFT;
  return { start: s.start, end: s.end, graceMinutes: s.graceMinutes, halfDayMinutes: s.halfDayMinutes, fullDayMinutes: s.fullDayMinutes, weeklyOffs: s.weeklyOffs || [0] };
}

export interface DayRow extends DayResult {
  holiday?: string | null;
  duty?: string | null;
  location?: string | null;
  leaveCode?: string | null;
  otApprovedMin: number;
  shiftCode?: string;
  punches: Array<{ at: Date; type: string; source: string; hasPhoto: boolean; lat?: number; lng?: number }>;
}

export async function monthAttendance(employeeId: any, period: string) {
  const [y, m] = period.split("-").map(Number);
  const p = periodFor(y, m);
  const first = `${period}-01`;
  const last = `${period}-${String(p.daysInMonth).padStart(2, "0")}`;
  const [emp, cfg, defShift, holidays, roster, punches, leaves, days] = await Promise.all([
    User.findById(employeeId).select("name employeeCode role joiningDate shift department exitDate").lean(),
    hrSettings(),
    Shift.findOne({ isDefault: true }).lean(),
    Holiday.find({ date: { $gte: first, $lte: last } }).lean(),
    RosterEntry.find({ employee: oid(employeeId), date: { $gte: first, $lte: last } }).populate("shift").lean(),
    AttendancePunch.find({ employee: oid(employeeId), date: { $gte: first, $lte: last } }).sort({ at: 1 }).lean(),
    LeaveRequest.find({ employee: oid(employeeId), status: "APPROVED", from: { $lte: last }, to: { $gte: first } }).lean(),
    AttendanceDay.find({ employee: oid(employeeId), date: { $gte: first, $lte: last } }).lean(),
  ]);
  if (!emp) throw new HrError("Employee not found", 404);
  const userShift = (emp as any).shift ? await Shift.findById((emp as any).shift).lean() : null;
  const today = todayIst();
  const joined = (emp as any).joiningDate ? istDate((emp as any).joiningDate) : null;
  const exit = (emp as any).exitDate ? istDate((emp as any).exitDate) : null;

  const rows: DayRow[] = datesBetween(first, last).map((date) => {
    const r: any = roster.find((x: any) => x.date === date);
    const sh = r?.shift || userShift || defShift;
    const dayPunches = punches.filter((x: any) => x.date === date);
    const ins = dayPunches.filter((x: any) => x.type === "IN");
    const firstIn = ins.length ? ins[0].at : null;
    const outs = dayPunches.filter((x: any) => x.type === "OUT" && (!firstIn || +x.at > +firstIn));
    const lastOut = outs.length ? outs[outs.length - 1].at : null;
    const lv: any = leaves.find((l: any) => l.from <= date && l.to >= date);
    const hol: any = holidays.find((h: any) => h.date === date);
    const res = evaluateDay({
      date,
      shift: shiftRule(sh),
      offOverride: r ? r.off : null,
      holiday: hol?.name || null,
      leave: lv ? { code: lv.leaveCode, paid: lv.paid, half: lv.half } : null,
      firstIn,
      lastOut,
      today,
      joined,
      trackingFrom: cfg.trackingFrom || null,
    });
    const status = exit && date > exit ? "NOT_JOINED" : res.status;
    const d: any = days.find((x: any) => x.date === date);
    return {
      ...res,
      status,
      holiday: hol?.name || null,
      duty: r?.duty || null,
      location: r?.location || null,
      leaveCode: lv?.leaveCode || null,
      otApprovedMin: Math.min(d?.otApprovedMin || 0, res.otMin),
      shiftCode: sh?.code || "GEN",
      punches: dayPunches.map((x: any) => ({ at: x.at, type: x.type, source: x.source, hasPhoto: !!x.photo, lat: x.location?.lat, lng: x.location?.lng })),
    } as DayRow;
  });
  const summary = summarizeMonth(rows, cfg.latesPerHalfDay);
  const otApprovedMinutes = rows.reduce((s, r) => s + r.otApprovedMin, 0);
  return { employee: emp, period, days: rows, summary: { ...summary, otApprovedMinutes }, tracking: !!cfg.trackingFrom && cfg.trackingFrom <= last };
}

/* ------------------------------------------------------------------ */
/* Punching                                                             */
/* ------------------------------------------------------------------ */

const R = 6371000;
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Mobile / web punch. IN or OUT is decided from the day's last punch. Field staff need a photo and location. */
export async function punch(
  user: JWTPayload,
  input: { lat?: number; lng?: number; accuracy?: number; photo?: { name: string; type: string; data: Buffer } | null; device?: string; note?: string }
) {
  if (!(EMPLOYEE_ROLES as readonly string[]).includes(user.role)) throw new HrError("Only employees mark attendance", 403);
  const me: any = await User.findById(user.userId).select("attendanceMode status").lean();
  if (!me || me.status !== "ACTIVE") throw new HrError("Your account is not active", 403);
  const cfg = await hrSettings();
  const now = new Date();
  const date = istDate(now);
  const hasLoc =
    Number.isFinite(input.lat) && Number.isFinite(input.lng) && Math.abs(input.lat!) <= 90 && Math.abs(input.lng!) <= 180 && !(input.lat === 0 && input.lng === 0);
  if (!hasLoc) throw new HrError("Allow location access so your punch can be recorded with where you are");
  if ((input.accuracy ?? 0) > 1000) throw new HrError("Your location is too imprecise (over 1 km). Move to open sky and try again.");
  let distance: number | null = null;
  if (cfg.office?.lat != null && cfg.office?.lng != null) {
    distance = distanceM({ lat: input.lat!, lng: input.lng! }, { lat: cfg.office.lat, lng: cfg.office.lng });
    if (me.attendanceMode === "OFFICE" && distance > (cfg.office.radiusM || 200)) {
      throw new HrError(`You are ${distance} m from the office; office staff must punch within ${cfg.office.radiusM || 200} m`);
    }
  }
  if (me.attendanceMode !== "OFFICE" && !input.photo) throw new HrError("Take a selfie: field staff punches need a photo");
  if (input.photo) {
    if (input.photo.data.length > 2 * 1024 * 1024) throw new HrError("Photo larger than 2 MB");
    if (!/^image\/(jpeg|png|webp)$/.test(input.photo.type)) throw new HrError("The photo must be a JPG, PNG or WebP image");
  }
  const lastToday: any = await AttendancePunch.findOne({ employee: oid(user.userId), date }).sort({ at: -1 }).lean();
  if (lastToday && +now - +new Date(lastToday.at) < 60000) throw new HrError("You just punched — wait a minute before punching again", 409);
  const type = lastToday?.type === "IN" ? "OUT" : "IN";
  let photoId = null;
  if (input.photo) {
    const f = await StoredFile.create({ name: input.photo.name || `punch-${date}.jpg`, contentType: input.photo.type, size: input.photo.data.length, data: input.photo.data, uploadedBy: oid(user.userId) });
    photoId = f._id;
  }
  const p = await AttendancePunch.create({
    employee: oid(user.userId),
    at: now,
    date,
    type,
    source: input.photo ? "MOBILE" : "WEB",
    location: { lat: input.lat!, lng: input.lng!, accuracy: input.accuracy },
    distanceM: distance,
    photo: photoId,
    device: String(input.device || "").slice(0, 160),
    note: input.note?.slice(0, 200),
    createdBy: oid(user.userId),
  });
  return p;
}

/**
 * Biometric punches (CSV import or device push). Rows: employee code + timestamp.
 * Punches alternate IN/OUT per employee per day in time order; exact duplicates are ignored.
 */
export async function importBiometric(user: JWTPayload | null, rows: Array<{ employeeCode: string; at: string }>, device = "biometric") {
  if (user && !(await hasPermission(user.role, "attendance.manage"))) throw new HrError("Only HR can import biometric punches", 403);
  if (!rows.length || rows.length > 5000) throw new HrError("Send between 1 and 5000 punches");
  const codes = [...new Set(rows.map((r) => String(r.employeeCode).trim().toUpperCase()))];
  const users = await User.find({ employeeCode: { $in: codes } }).select("employeeCode").lean();
  const byCode = new Map(users.map((u: any) => [u.employeeCode, u._id]));
  let added = 0;
  const skipped: string[] = [];
  const parsed = rows
    .map((r) => ({ code: String(r.employeeCode).trim().toUpperCase(), at: new Date(r.at) }))
    .filter((r) => {
      const ok = byCode.has(r.code) && !Number.isNaN(+r.at) && +r.at <= Date.now() + 5 * 60000;
      if (!ok) skipped.push(`${r.code} ${isNaN(+r.at) ? "bad time" : byCode.has(r.code) ? "future time" : "unknown code"}`);
      return ok;
    })
    .sort((a, b) => +a.at - +b.at);
  for (const r of parsed) {
    const emp = byCode.get(r.code)!;
    const date = istDate(r.at);
    if (await AttendancePunch.findOne({ employee: emp, at: r.at })) continue;
    const prev: any = await AttendancePunch.findOne({ employee: emp, date, at: { $lt: r.at } }).sort({ at: -1 }).lean();
    await AttendancePunch.create({ employee: emp, at: r.at, date, type: prev?.type === "IN" ? "OUT" : "IN", source: "BIOMETRIC", device, createdBy: user ? oid(user.userId) : undefined });
    added++;
  }
  if (user) await logAudit({ user, action: "UPLOAD", resource: "EMPLOYEE", resourceId: "biometric", after: { added, skipped: skipped.length } });
  return { added, skipped };
}

/* ------------------------------------------------------------------ */
/* Regularisation & overtime approval                                   */
/* ------------------------------------------------------------------ */

export async function requestRegularization(user: JWTPayload, input: { date: string; inTime?: string; outTime?: string; reason: string }) {
  const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!YMD.test(input.date || "")) throw new HrError("Choose the date");
  if (input.date > todayIst()) throw new HrError("You cannot regularise a future date");
  if (input.date < istDate(new Date(Date.now() - 31 * 86400000))) throw new HrError("Corrections are allowed for the last 31 days only");
  if (!input.inTime && !input.outTime) throw new HrError("Enter the in time, the out time, or both");
  if ((input.inTime && !hm.test(input.inTime)) || (input.outTime && !hm.test(input.outTime))) throw new HrError("Times must be HH:MM");
  if (input.inTime && input.outTime && toMin(input.outTime) <= toMin(input.inTime)) throw new HrError("Out time must be after in time");
  if (!input.reason?.trim()) throw new HrError("Give a reason");
  if (await Regularization.findOne({ employee: oid(user.userId), date: input.date, status: "PENDING" })) throw new HrError("You already have a pending correction for that day", 409);
  return Regularization.create({ employee: oid(user.userId), employeeName: user.name, date: input.date, inTime: input.inTime, outTime: input.outTime, reason: input.reason.trim() });
}

export async function decideRegularization(user: JWTPayload, id: string, decision: "APPROVED" | "REJECTED", remarks?: string) {
  const r = await Regularization.findById(id);
  if (!r) throw new HrError("Request not found", 404);
  if (r.status !== "PENDING") throw new HrError(`Already ${r.status.toLowerCase()}`);
  await assertApprover(user, r.employee);
  if (decision === "REJECTED" && !remarks?.trim()) throw new HrError("Give a reason for rejecting");
  if (decision === "APPROVED") {
    const mk = (t: string, type: "IN" | "OUT") =>
      AttendancePunch.create({ employee: r.employee, at: new Date(`${r.date}T${t}:00+05:30`), date: r.date, type, source: "MANUAL", note: `Regularised: ${r.reason}`, createdBy: oid(user.userId) });
    if (r.inTime) await mk(r.inTime, "IN");
    if (r.outTime) await mk(r.outTime, "OUT");
  }
  r.status = decision;
  r.decidedBy = oid(user.userId);
  r.decidedByName = user.name;
  r.decidedAt = new Date();
  r.remarks = remarks?.trim();
  await r.save();
  await logAudit({ user, action: decision === "APPROVED" ? "APPROVE" : "REJECT", resource: "EMPLOYEE", resourceId: id, after: { regularization: r.date, employee: r.employeeName } });
  return r;
}

/** Manager approves the overtime actually recorded on the given days (paid in that month's payroll). */
export async function approveOvertime(user: JWTPayload, employeeId: string, dates: string[]) {
  await assertApprover(user, employeeId);
  const cfg = await hrSettings();
  const emp: any = await User.findById(employeeId).select("role").lean();
  if (!emp) throw new HrError("Employee not found", 404);
  if (!cfg.otEligibleRoles.includes(emp.role)) throw new HrError("This role is not eligible for overtime pay");
  const periods = [...new Set(dates.filter((d) => YMD.test(d)).map((d) => d.slice(0, 7)))];
  let approved = 0;
  for (const period of periods) {
    const m = await monthAttendance(employeeId, period);
    for (const d of m.days.filter((x) => dates.includes(x.date) && x.otMin > 0)) {
      await AttendanceDay.findOneAndUpdate(
        { employee: oid(employeeId), date: d.date },
        { $set: { otApprovedMin: d.otMin, otApprovedBy: oid(user.userId), otApprovedByName: user.name } },
        { upsert: true }
      );
      approved += d.otMin;
    }
  }
  await logAudit({ user, action: "APPROVE", resource: "EMPLOYEE", resourceId: employeeId, after: { overtimeMinutes: approved } });
  return { approvedMinutes: approved };
}

/* ------------------------------------------------------------------ */
/* Leave                                                                */
/* ------------------------------------------------------------------ */

export async function leaveBalances(employeeId: any, year: number) {
  const [types, emp, openings, used] = await Promise.all([
    LeaveType.find({ isActive: true }).sort({ code: 1 }).lean(),
    User.findById(employeeId).select("joiningDate").lean(),
    LeaveOpening.find({ employee: oid(employeeId), year }).lean(),
    LeaveRequest.find({ employee: oid(employeeId), status: { $in: ["APPROVED", "PENDING"] }, from: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }).lean(),
  ]);
  const joined = (emp as any)?.joiningDate ? istDate((emp as any).joiningDate) : `${year}-01-01`;
  return types.map((t: any) => {
    const quota = proratedQuota(t.annualQuota, year, joined);
    const opening = openings.find((o: any) => same(o.leaveType, t._id))?.days || 0;
    const taken = used.filter((u: any) => same(u.leaveType, t._id) && u.status === "APPROVED").reduce((s: number, u: any) => s + u.days, 0);
    const pending = used.filter((u: any) => same(u.leaveType, t._id) && u.status === "PENDING").reduce((s: number, u: any) => s + u.days, 0);
    return {
      _id: t._id,
      code: t.code,
      name: t.name,
      paid: t.paid,
      halfDayAllowed: t.halfDayAllowed,
      encashable: t.encashable,
      quota,
      opening,
      taken,
      pending,
      // unpaid leave has no cap
      available: t.paid ? Math.max(0, quota + opening - taken - pending) : null,
    };
  });
}

async function weeklyOffsFor(employeeId: any) {
  const emp: any = await User.findById(employeeId).select("shift").lean();
  const sh: any = (emp?.shift && (await Shift.findById(emp.shift).lean())) || (await Shift.findOne({ isDefault: true }).lean());
  return sh?.weeklyOffs || DEFAULT_SHIFT.weeklyOffs;
}

export async function applyLeave(user: JWTPayload, input: { leaveCode: string; from: string; to: string; half?: boolean; reason: string }) {
  if (!YMD.test(input.from || "") || !YMD.test(input.to || "")) throw new HrError("Choose the dates");
  if (input.to < input.from) throw new HrError("The end date is before the start date");
  if (input.from.slice(0, 4) !== input.to.slice(0, 4)) throw new HrError("Apply separately for each calendar year");
  if (input.from < istDate(new Date(Date.now() - 7 * 86400000))) throw new HrError("Leave can be applied at most 7 days back (for sudden sickness)");
  if (!input.reason?.trim()) throw new HrError("Give a reason");
  const type: any = await LeaveType.findOne({ code: String(input.leaveCode).toUpperCase(), isActive: true }).lean();
  if (!type) throw new HrError("Choose a leave type");
  const half = !!input.half;
  if (half && (input.from !== input.to || !type.halfDayAllowed)) throw new HrError("Half-day leave is for a single day of a type that allows it");
  const overlap = await LeaveRequest.findOne({ employee: oid(user.userId), status: { $in: ["PENDING", "APPROVED"] }, from: { $lte: input.to }, to: { $gte: input.from } }).lean();
  if (overlap) throw new HrError(`You already have ${overlap.leaveCode} leave from ${overlap.from} to ${overlap.to}`, 409);
  const holidays = (await Holiday.find({ date: { $gte: input.from, $lte: input.to } }).lean()).map((h: any) => h.date);
  const days = leaveDays(input.from, input.to, { weeklyOffs: await weeklyOffsFor(user.userId), holidays, half });
  if (days <= 0) throw new HrError("Those dates are all holidays or weekly offs — no leave needed");
  if (type.paid) {
    const bal = (await leaveBalances(user.userId, Number(input.from.slice(0, 4)))).find((b) => b.code === type.code)!;
    if (days > (bal.available ?? 0)) throw new HrError(`Only ${bal.available} day(s) of ${type.name} left; apply the rest as unpaid leave`);
  }
  const lr = await LeaveRequest.create({
    employee: oid(user.userId),
    employeeName: user.name,
    leaveType: type._id,
    leaveCode: type.code,
    paid: type.paid,
    from: input.from,
    to: input.to,
    half,
    days,
    reason: input.reason.trim(),
  });
  return lr;
}

export async function decideLeave(user: JWTPayload, id: string, decision: "APPROVED" | "REJECTED", remarks?: string) {
  const lr = await LeaveRequest.findById(id);
  if (!lr) throw new HrError("Leave request not found", 404);
  if (lr.status !== "PENDING") throw new HrError(`Already ${lr.status.toLowerCase()}`);
  await assertApprover(user, lr.employee);
  if (decision === "REJECTED" && !remarks?.trim()) throw new HrError("Give a reason for rejecting");
  if (decision === "APPROVED" && lr.paid) {
    const bal = (await leaveBalances(lr.employee, Number(lr.from.slice(0, 4)))).find((b) => b.code === lr.leaveCode)!;
    // its own days are counted as pending in the balance
    if ((bal.available ?? 0) < 0) throw new HrError("Not enough balance any more");
  }
  lr.status = decision;
  lr.decidedBy = oid(user.userId);
  lr.decidedByName = user.name;
  lr.decidedAt = new Date();
  lr.remarks = remarks?.trim();
  await lr.save();
  await logAudit({ user, action: decision === "APPROVED" ? "APPROVE" : "REJECT", resource: "EMPLOYEE", resourceId: id, after: { leave: `${lr.leaveCode} ${lr.from}→${lr.to}`, employee: lr.employeeName } });
  return lr;
}

export async function cancelLeave(user: JWTPayload, id: string) {
  const lr = await LeaveRequest.findById(id);
  if (!lr || !same(lr.employee, user.userId)) throw new HrError("Leave request not found", 404);
  if (lr.status === "PENDING" || (lr.status === "APPROVED" && lr.from > todayIst())) {
    lr.status = "CANCELLED";
    await lr.save();
    return lr;
  }
  throw new HrError("Only pending leave, or approved leave that has not started, can be cancelled");
}

/** Everything waiting for this user's decision (leave, corrections), within their scope. */
export async function pendingForApprover(user: JWTPayload) {
  const scope = await teamScope(user);
  const canDecide = (await hasPermission(user.role, "leave.approve")) || (await hasPermission(user.role, "attendance.manage"));
  if (!canDecide) return { leaves: [], corrections: [] };
  const f: any = { status: "PENDING", employee: { $ne: oid(user.userId) } };
  if (scope) f.employee = { $in: scope.filter((x) => !same(x, user.userId)) };
  const [leaves, corrections] = await Promise.all([LeaveRequest.find(f).sort({ from: 1 }).lean(), Regularization.find(f).sort({ date: 1 }).lean()]);
  return { leaves, corrections };
}

/* ------------------------------------------------------------------ */
/* Roster & duty assignment                                             */
/* ------------------------------------------------------------------ */

export async function setRoster(user: JWTPayload, input: { employeeId: string; dates: string[]; shiftId?: string | null; off?: boolean; duty?: string; location?: string }) {
  const scope = await teamScope(user);
  if (!(await hasPermission(user.role, "attendance.team"))) throw new HrError("Only managers and HR can assign duties", 403);
  if (scope && !scope.some((s) => same(s, input.employeeId))) throw new HrError("You can only assign duties to your own team", 403);
  const dates = (input.dates || []).filter((d) => YMD.test(d));
  if (!dates.length || dates.length > 62) throw new HrError("Choose 1–62 dates");
  if (dates.some((d) => d < todayIst())) throw new HrError("Duties cannot be changed for past days");
  for (const date of dates) {
    await RosterEntry.findOneAndUpdate(
      { employee: oid(input.employeeId), date },
      {
        $set: {
          shift: input.shiftId && mongoose.isValidObjectId(input.shiftId) ? oid(input.shiftId) : null,
          off: !!input.off,
          duty: input.duty?.trim() || "",
          location: input.location?.trim() || "",
          assignedBy: oid(user.userId),
          assignedByName: user.name,
        },
      },
      { upsert: true }
    );
  }
  return { updated: dates.length };
}

export async function rosterWeek(user: JWTPayload, from: string) {
  if (!YMD.test(from)) throw new HrError("Choose a week");
  const dates = datesBetween(from, istDate(new Date(Date.parse(`${from}T00:00:00Z`) + 6 * 86400000 - IST_FIX)));
  const scope = await teamScope(user);
  const emps = await User.find({ status: "ACTIVE", role: { $in: [...EMPLOYEE_ROLES] }, ...(scope ? { _id: { $in: scope } } : {}) })
    .select("name employeeCode role shift department")
    .sort({ role: 1, name: 1 })
    .lean();
  const [entries, shifts, holidays, leaves] = await Promise.all([
    RosterEntry.find({ employee: { $in: emps.map((e: any) => e._id) }, date: { $in: dates } }).lean(),
    Shift.find().lean(),
    Holiday.find({ date: { $in: dates } }).lean(),
    LeaveRequest.find({ employee: { $in: emps.map((e: any) => e._id) }, status: "APPROVED", from: { $lte: dates[6] }, to: { $gte: dates[0] } }).lean(),
  ]);
  const def: any = shifts.find((s: any) => s.isDefault);
  return {
    dates,
    shifts,
    holidays,
    rows: emps.map((e: any) => {
      const own: any = shifts.find((s: any) => same(s._id, e.shift)) || def;
      return {
        employee: e,
        cells: dates.map((d) => {
          const r: any = entries.find((x: any) => same(x.employee, e._id) && x.date === d);
          const sh: any = (r?.shift && shifts.find((s: any) => same(s._id, r.shift))) || own;
          const lv: any = leaves.find((l: any) => same(l.employee, e._id) && l.from <= d && l.to >= d);
          return {
            date: d,
            shift: sh?.code || "GEN",
            off: r ? r.off : (sh?.weeklyOffs || [0]).includes(weekday(d)),
            duty: r?.duty || "",
            location: r?.location || "",
            leave: lv?.leaveCode || null,
            holiday: holidays.find((h: any) => h.date === d)?.name || null,
          };
        }),
      };
    }),
  };
}
const IST_FIX = 0;

/* ------------------------------------------------------------------ */
/* Team view, targets, performance                                     */
/* ------------------------------------------------------------------ */

export async function teamToday(user: JWTPayload, date = todayIst()) {
  const scope = await teamScope(user);
  const emps = await User.find({ status: "ACTIVE", role: { $in: [...EMPLOYEE_ROLES] }, ...(scope ? { _id: { $in: scope } } : {}) })
    .select("name employeeCode role designation")
    .sort({ name: 1 })
    .lean();
  const period = date.slice(0, 7);
  const rows = [];
  for (const e of emps as any[]) {
    const m = await monthAttendance(e._id, period);
    const d = m.days.find((x) => x.date === date)!;
    rows.push({ employee: e, day: d, month: m.summary });
  }
  return { date, rows };
}

export async function setEmployeeTarget(user: JWTPayload, input: { employeeId: string; period: string; targetUnits: number }) {
  if (!/^\d{4}-\d{2}$/.test(input.period || "")) throw new HrError("Choose a month");
  const scope = await teamScope(user);
  if (!(await hasPermission(user.role, "attendance.team"))) throw new HrError("Only managers set targets", 403);
  if (same(user.userId, input.employeeId)) throw new HrError("You cannot set your own target", 403);
  if (scope && !scope.some((s) => same(s, input.employeeId))) throw new HrError("Not in your team", 403);
  const units = Math.floor(Number(input.targetUnits));
  if (!Number.isFinite(units) || units < 0 || units > 1000) throw new HrError("Enter a valid target");
  return EmployeeTarget.findOneAndUpdate({ employee: oid(input.employeeId), period: input.period }, { $set: { targetUnits: units, setByName: user.name } }, { upsert: true, new: true });
}

/**
 * Staff performance for a month: sales against target (50%), attendance (30%), punctuality (20%).
 */
export function performanceScore(p: { units: number; target: number; attendancePct: number; lateCount: number; workingDays: number }) {
  const sales = p.target > 0 ? Math.min(120, (p.units / p.target) * 100) : null;
  const punctuality = p.workingDays ? Math.max(0, 100 - (p.lateCount / p.workingDays) * 100 * 2) : 100;
  const score = sales == null ? 0.6 * p.attendancePct + 0.4 * punctuality : 0.5 * sales + 0.3 * p.attendancePct + 0.2 * punctuality;
  return { sales: sales == null ? null : Math.round(sales), punctuality: Math.round(punctuality), score: Math.round(score) };
}

export async function performanceBoard(user: JWTPayload, period: string) {
  const scope = await teamScope(user);
  const emps = await User.find({ status: "ACTIVE", role: { $in: [...EMPLOYEE_ROLES] }, ...(scope ? { _id: { $in: scope } } : {}) })
    .select("name employeeCode role designation")
    .lean();
  const [y, m] = period.split("-").map(Number);
  const p = periodFor(y, m);
  const [targets, sales, ledgers] = await Promise.all([
    EmployeeTarget.find({ period, employee: { $in: emps.map((e: any) => e._id) } }).lean(),
    Sale.aggregate([
      { $match: { status: { $ne: "CANCELLED" }, saleDate: { $gte: p.start, $lte: p.end }, soldBy: { $in: emps.map((e: any) => e._id) } } },
      { $group: { _id: "$soldBy", units: { $sum: 1 }, value: { $sum: "$totalAmount" } } },
    ]),
    IncentiveLedger.find({ period, employee: { $in: emps.map((e: any) => e._id) } }).select("employee totalEarned").lean(),
  ]);
  const rows = [];
  for (const e of emps as any[]) {
    const att = await monthAttendance(e._id, period);
    const s: any = sales.find((x: any) => same(x._id, e._id));
    const t: any = targets.find((x: any) => same(x.employee, e._id));
    const sc = performanceScore({ units: s?.units || 0, target: t?.targetUnits || 0, attendancePct: att.tracking ? att.summary.attendancePct : 100, lateCount: att.summary.lateCount, workingDays: att.summary.workingDays });
    rows.push({
      employee: e,
      units: s?.units || 0,
      value: s?.value || 0,
      target: t?.targetUnits || 0,
      incentive: (ledgers.find((l: any) => same(l.employee, e._id)) as any)?.totalEarned || 0,
      attendancePct: att.summary.attendancePct,
      lateCount: att.summary.lateCount,
      lop: att.summary.lop,
      ...sc,
    });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Employees + their month summaries for the register / late report. */
export async function attendanceRegister(user: JWTPayload, period: string) {
  const scope = await teamScope(user);
  const emps = await User.find({ role: { $in: [...EMPLOYEE_ROLES] }, ...(scope ? { _id: { $in: scope } } : {}) })
    .select("name employeeCode role status department")
    .populate("department", "name")
    .sort({ employeeCode: 1 })
    .lean();
  const out = [];
  for (const e of emps as any[]) {
    const m = await monthAttendance(e._id, period);
    if (m.days.every((d) => d.status === "NOT_JOINED") && e.status !== "ACTIVE") continue;
    out.push({ employee: e, days: m.days, summary: m.summary });
  }
  return out;
}
