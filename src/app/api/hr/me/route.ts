import mongoose from "mongoose";
import { handle } from "@/lib/route";
import { User } from "@/models/User";
import { AdvanceLoan, ExpenseClaim, Holiday, LeaveRequest, Regularization, Resignation, RosterEntry, EmployeeDocument } from "@/models/Hr";
import { hrSettings, leaveBalances, monthAttendance, todayIst } from "@/services/hrService";
import { datesBetween } from "@/lib/attendance";

/** Everything the staff app's home needs, for the signed-in employee. */
export const GET = handle(async ({ req, user }) => {
  const today = todayIst();
  const period = req.nextUrl.searchParams.get("period") || today.slice(0, 7);
  const me = new mongoose.Types.ObjectId(user.userId);
  const week = datesBetween(today, new Date(Date.parse(`${today}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10));
  const [profile, month, balances, leaves, corrections, advances, claims, resignation, holidays, roster, cfg, docs] = await Promise.all([
    User.findById(me).select("-passwordHash").populate("department", "name").populate("shift").populate("reportsTo", "name designation").lean(),
    monthAttendance(me, period),
    leaveBalances(me, Number(period.slice(0, 4))),
    LeaveRequest.find({ employee: me }).sort({ createdAt: -1 }).limit(20).lean(),
    Regularization.find({ employee: me }).sort({ createdAt: -1 }).limit(10).lean(),
    AdvanceLoan.find({ employee: me }).sort({ createdAt: -1 }).limit(10).lean(),
    ExpenseClaim.find({ employee: me }).sort({ createdAt: -1 }).limit(20).lean(),
    Resignation.findOne({ employee: me, status: { $nin: ["WITHDRAWN"] } }).sort({ createdAt: -1 }).lean(),
    Holiday.find({ date: { $gte: `${today.slice(0, 4)}-01-01`, $lte: `${today.slice(0, 4)}-12-31` } }).sort({ date: 1 }).lean(),
    RosterEntry.find({ employee: me, date: { $in: week } }).lean(),
    hrSettings(),
    EmployeeDocument.find({ employee: me }).select("docType number verified fileName file createdAt").lean(),
  ]);
  const todayRow = month.days.find((d) => d.date === today) || null;
  return {
    today,
    profile,
    todayRow,
    nextAction: todayRow?.punches?.length && todayRow.punches[todayRow.punches.length - 1].type === "IN" ? "OUT" : "IN",
    month,
    balances,
    leaves,
    corrections,
    advances,
    claims,
    resignation,
    holidays,
    roster,
    docs,
    settings: { idleLogoutMinutes: cfg.idleLogoutMinutes, officeConfigured: cfg.office?.lat != null, trackingFrom: cfg.trackingFrom },
  };
}, "hr.self");
