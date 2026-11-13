import mongoose from "mongoose";
import { Sale } from "@/models/Sale";
import { Vehicle } from "@/models/Vehicle";
import { Dealer } from "@/models/Dealer";
import { User } from "@/models/User";
import { IncentiveLedger } from "@/models/IncentiveLedger";
import { IncentiveScheme } from "@/models/IncentiveScheme";
import { PayrollRun } from "@/models/PayrollRun";
import { PayrollEntry } from "@/models/PayrollEntry";
import { VehicleModel } from "@/models/VehicleModel";
import { getTeamUserIds } from "@/lib/rbac";
import { periodFor, periodOf, PeriodInfo } from "@/lib/period";
import { JWTPayload } from "@/types";
import { ChannelOrder } from "@/models/ChannelOrder";
import { DeliveryOrder } from "@/models/DeliveryOrder";
import { FleetVehicle } from "@/models/FleetVehicle";
import { LedgerEntry } from "@/models/LedgerEntry";
import { Distributor } from "@/models/Distributor";
import { distributorOf } from "@/lib/partyAccess";
import { fleetCompliance } from "@/lib/fleet";
import { creditSummary } from "./creditService";
import { listPending } from "./approvalService";

const MONTH_FMT = (p: PeriodInfo) =>
  new Date(Date.UTC(p.year, p.month - 1, 15)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" });

function lastPeriods(n: number): PeriodInfo[] {
  const cur = periodOf(new Date());
  const out: PeriodInfo[] = [];
  for (let i = n - 1; i >= 0; i--) {
    let m = cur.month - i;
    let y = cur.year;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    out.push(periodFor(y, m));
  }
  return out;
}

function pctChange(now: number, prev: number): number | null {
  if (!prev) return null;
  return ((now - prev) / prev) * 100;
}

/** Monthly units & revenue (rupees) for a sales filter over the last n months. */
async function monthlyTrend(match: Record<string, any>, periods: PeriodInfo[]) {
  const rows = await Sale.aggregate([
    {
      $match: {
        ...match,
        status: "DELIVERED",
        saleDate: { $gte: periods[0].start, $lte: periods[periods.length - 1].end },
      },
    },
    {
      $project: {
        totalAmount: 1,
        ex: "$priceBreakdown.exShowroom",
        // bucket by IST month
        ym: { $dateToString: { format: "%Y-%m", date: "$saleDate", timezone: "+05:30" } },
      },
    },
    { $group: { _id: "$ym", units: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
  ]);
  const map = new Map(rows.map((r: any) => [r._id, r]));
  return periods.map((p) => {
    const r: any = map.get(p.period);
    return { period: p.period, month: MONTH_FMT(p), units: r?.units || 0, revenue: Math.round((r?.revenue || 0) / 100) };
  });
}

/**
 * Month-to-date vs the same number of days last month. Comparing 12 days of
 * this month with all of last month would always show a scary drop.
 */
async function mtdCompare(match: Record<string, any>, cur: PeriodInfo, prev: PeriodInfo) {
  const elapsed = Date.now() - cur.start.getTime();
  const prevEnd = new Date(Math.min(prev.end.getTime(), prev.start.getTime() + elapsed));
  const rows = await Sale.aggregate([
    { $match: { ...match, status: "DELIVERED", saleDate: { $gte: prev.start, $lte: prevEnd } } },
    { $group: { _id: null, units: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
  ]);
  return { units: rows[0]?.units || 0, revenue: Math.round((rows[0]?.revenue || 0) / 100) };
}

async function recentSales(match: Record<string, any>, limit = 6) {
  return Sale.find(match)
    .populate({ path: "vehicle", select: "chassisNumber model color", populate: { path: "model", select: "name category" } })
    .populate("soldBy", "name employeeCode")
    .populate("dealer", "name city")
    .sort({ saleDate: -1, createdAt: -1 })
    .limit(limit)
    .select("saleCode saleDate customer.name totalAmount status paymentMode")
    .lean();
}

async function leaderboard(match: Record<string, any>, p: PeriodInfo, limit = 8) {
  const rows = await Sale.aggregate([
    { $match: { ...match, status: "DELIVERED", saleDate: { $gte: p.start, $lte: p.end } } },
    { $group: { _id: "$soldBy", units: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
    { $sort: { units: -1, revenue: -1 } },
    { $limit: limit },
    { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "u" } },
    { $unwind: "$u" },
    { $project: { units: 1, revenue: 1, name: "$u.name", code: "$u.employeeCode", role: "$u.role" } },
  ]);
  return rows;
}

/**
 * Next milestone across the employee's active SLAB / TARGET_BONUS rules — the
 * "charge bar" on the FEC dashboard.
 */
async function nextMilestone(user: JWTPayload, units: number, p: PeriodInfo) {
  const schemes = await IncentiveScheme.find({
    status: "ACTIVE",
    applicableRoles: user.role,
    validFrom: { $lte: p.end },
    validTo: { $gte: p.start },
  }).lean();
  let best: { scheme: string; target: number; reward: string } | null = null;
  for (const s of schemes) {
    for (const r of s.rules) {
      const targets: Array<{ t: number; reward: string }> = [];
      if (r.ruleType === "SLAB") {
        for (const sl of r.slabs || []) targets.push({ t: sl.minUnits, reward: `₹${(sl.amountPerUnit / 100).toLocaleString("en-IN")}/unit tier` });
      }
      if (r.ruleType === "TARGET_BONUS" && r.targetUnits) {
        targets.push({ t: r.targetUnits, reward: `₹${((r.targetBonusAmount || 0) / 100).toLocaleString("en-IN")} bonus` });
      }
      for (const t of targets) {
        if (t.t > units && (!best || t.t < best.target)) best = { scheme: s.name, target: t.t, reward: t.reward };
      }
    }
  }
  return best;
}

export async function getDashboardData(user: JWTPayload) {
  const periods = lastPeriods(6);
  const cur = periods[periods.length - 1];
  const prev = periods[periods.length - 2];
  const uid = new mongoose.Types.ObjectId(user.userId);
  const inMonth = (p: PeriodInfo) => ({ $gte: p.start, $lte: p.end });

  // ------------------------------------------------------------- DISTRIBUTOR
  // External partner: only their own account — never company figures.
  if (user.role === "DISTRIBUTOR") {
    const distId = await distributorOf(user);
    if (!distId) return { role: "DISTRIBUTOR", period: cur.period, distributor: null };
    const [dist, credit, orders, inTransit, invoices] = await Promise.all([
      Distributor.findById(distId).select("name distributorCode city").lean(),
      creditSummary("DISTRIBUTOR", distId),
      ChannelOrder.find({ partyType: "DISTRIBUTOR", party: distId }).sort({ createdAt: -1 }).limit(6).lean(),
      DeliveryOrder.find({ partyType: "DISTRIBUTOR", party: distId, status: "DISPATCHED" })
        .select("doCode lines loading.registrationNo loading.driverName loading.driverPhone dispatch.at document.number ewayBill.validUpto")
        .sort({ "dispatch.at": -1 })
        .lean(),
      LedgerEntry.find({ partyType: "DISTRIBUTOR", party: distId }).sort({ date: -1 }).limit(6).lean(),
    ]);
    return {
      role: "DISTRIBUTOR",
      period: cur.period,
      distributor: dist,
      credit,
      orders,
      awaitingApproval: orders.filter((o) => o.status === "PENDING_APPROVAL").length,
      inTransit,
      ledger: invoices,
    };
  }

  // --------------------------------------------------------------------- FEC
  if (user.role === "FEC") {
    const match = { soldBy: uid };
    const [trend, recent, ledgers, payslips, me] = await Promise.all([
      monthlyTrend(match, periods),
      recentSales(match, 5),
      IncentiveLedger.find({ employee: uid, period: { $in: periods.map((p) => p.period) } }).lean(),
      PayrollEntry.find({ employee: uid })
        .populate("payrollRun", "runCode month year status")
        .sort({ createdAt: -1 })
        .limit(3)
        .select("payslipCode netPay grossPay payrollRun")
        .lean(),
      User.findById(uid).populate("reportsTo", "name employeeCode").populate("dealer", "name city").lean(),
    ]);
    const thisMonth = trend[trend.length - 1];
    const lastMonth = await mtdCompare(match, cur, prev);
    const ledgerNow = ledgers.find((l) => l.period === cur.period);
    const milestone = await nextMilestone(user, thisMonth.units, cur);

    // Rank among peers under the same ASM this month.
    let rank: { position: number; of: number } | null = null;
    if (me?.reportsTo) {
      const peers = await User.find({ reportsTo: (me.reportsTo as any)._id, role: "FEC", status: "ACTIVE" }, { _id: 1 }).lean();
      const board = await leaderboard({ soldBy: { $in: peers.map((p: any) => p._id) } }, cur, 50);
      const pos = board.findIndex((b: any) => String(b._id) === user.userId);
      rank = { position: pos === -1 ? board.length + 1 : pos + 1, of: peers.length };
    }

    return {
      role: "FEC",
      period: cur.period,
      profile: {
        manager: (me?.reportsTo as any)?.name ?? null,
        dealer: me?.dealer ? `${(me.dealer as any).name}, ${(me.dealer as any).city}` : null,
      },
      kpis: {
        units: thisMonth.units,
        unitsTrend: pctChange(thisMonth.units, lastMonth.units),
        revenue: thisMonth.revenue,
        incentive: (ledgerNow?.totalEarned || 0) / 100,
        incentiveBreakdown: (ledgerNow?.breakdown || []).map((b: any) => ({
          scheme: b.schemeName,
          rule: b.ruleType,
          amount: b.earnedAmount / 100,
          description: b.description,
        })),
        rank,
      },
      milestone,
      trend: trend.map((t) => ({
        ...t,
        incentive: (ledgers.find((l) => l.period === t.period)?.totalEarned || 0) / 100,
      })),
      recentSales: recent,
      payslips,
    };
  }

  // --------------------------------------------------------------------- ASM
  if (user.role === "ASM") {
    const team = await getTeamUserIds(uid);
    const match = { soldBy: { $in: [uid, ...team] } };
    const [trend, recent, board, ledgerNow, dealers] = await Promise.all([
      monthlyTrend(match, periods),
      recentSales(match, 6),
      leaderboard(match, cur, 12),
      IncentiveLedger.findOne({ employee: uid, period: cur.period }).lean(),
      Dealer.find({ assignedASM: uid, status: "ACTIVE" }).select("name city dealerCode").lean(),
    ]);
    const dealerIds = dealers.map((d: any) => d._id);
    const [stock, sold] = await Promise.all([
      Vehicle.aggregate([
        { $match: { currentLocationDealer: { $in: dealerIds }, status: "ALLOCATED_TO_DEALER" } },
        { $group: { _id: "$currentLocationDealer", n: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { dealer: { $in: dealerIds }, status: "DELIVERED", saleDate: inMonth(cur) } },
        { $group: { _id: "$dealer", n: { $sum: 1 } } },
      ]),
    ]);
    const teamMembers = await User.find({ _id: { $in: team } }).select("name employeeCode").lean();
    // Include zero-sale team members so the ASM sees who hasn't sold yet.
    const fullBoard = [
      ...board,
      ...teamMembers
        .filter((m: any) => !board.some((b: any) => String(b._id) === String(m._id)))
        .map((m: any) => ({ _id: m._id, name: m.name, code: m.employeeCode, units: 0, revenue: 0, role: "FEC" })),
    ];
    const thisMonth = trend[trend.length - 1];
    const lastMonth = await mtdCompare(match, cur, prev);
    return {
      role: "ASM",
      period: cur.period,
      kpis: {
        units: thisMonth.units,
        unitsTrend: pctChange(thisMonth.units, lastMonth.units),
        revenue: thisMonth.revenue,
        revenueTrend: pctChange(thisMonth.revenue, lastMonth.revenue),
        incentive: (ledgerNow?.totalEarned || 0) / 100,
        teamSize: team.length,
        active: board.filter((b: any) => b.units > 0).length,
      },
      trend,
      leaderboard: fullBoard.map((b: any) => ({ ...b, revenue: Math.round(b.revenue / 100) })),
      dealers: dealers.map((d: any) => ({
        ...d,
        stock: stock.find((s: any) => String(s._id) === String(d._id))?.n || 0,
        soldThisMonth: sold.find((s: any) => String(s._id) === String(d._id))?.n || 0,
      })),
      recentSales: recent,
    };
  }

  // ------------------------------------------------- BH / MP / ADMIN overview
  const [trend, recent, board, inStock, atDealers, dealersActive, employees, ledgerSum, mix, dealerPerf, models, draftSchemes, openRuns] =
    await Promise.all([
      monthlyTrend({}, periods),
      recentSales({}, 6),
      leaderboard({}, cur, 6),
      Vehicle.countDocuments({ status: "IN_STOCK" }),
      Vehicle.countDocuments({ status: "ALLOCATED_TO_DEALER" }),
      Dealer.countDocuments({ status: "ACTIVE" }),
      User.countDocuments({ status: "ACTIVE", role: { $ne: "DISTRIBUTOR" } }),
      IncentiveLedger.aggregate([{ $match: { period: cur.period } }, { $group: { _id: null, t: { $sum: "$totalEarned" } } }]),
      Sale.aggregate([
        { $match: { status: "DELIVERED", saleDate: { $gte: periods[3].start, $lte: cur.end } } },
        { $lookup: { from: "vehicles", localField: "vehicle", foreignField: "_id", as: "v" } },
        { $unwind: "$v" },
        { $lookup: { from: "vehiclemodels", localField: "v.model", foreignField: "_id", as: "m" } },
        { $unwind: "$m" },
        { $group: { _id: "$m.category", units: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
        { $sort: { units: -1 } },
      ]),
      Sale.aggregate([
        { $match: { status: "DELIVERED", saleDate: inMonth(cur), dealer: { $ne: null } } },
        { $group: { _id: "$dealer", units: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
        { $lookup: { from: "dealers", localField: "_id", foreignField: "_id", as: "d" } },
        { $unwind: "$d" },
        { $project: { units: 1, revenue: 1, name: "$d.name", city: "$d.city", code: "$d.dealerCode" } },
        { $sort: { units: -1 } },
      ]),
      VehicleModel.find({ isActive: true }).select("name category").lean(),
      IncentiveScheme.countDocuments({ status: "DRAFT" }),
      PayrollRun.find({ status: { $in: ["DRAFT", "UNDER_REVIEW", "APPROVED"] } }).select("runCode status month year").lean(),
    ]);

  const availability = await Vehicle.aggregate([
    { $match: { status: { $in: ["IN_STOCK", "ALLOCATED_TO_DEALER"] } } },
    { $group: { _id: "$model", n: { $sum: 1 } } },
  ]);
  const lowStock = models
    .map((m: any) => ({ name: m.name, category: m.category, available: availability.find((a: any) => String(a._id) === String(m._id))?.n || 0 }))
    .filter((m) => m.available < 5)
    .sort((a, b) => a.available - b.available);

  const thisMonth = trend[trend.length - 1];
  const lastMonth = await mtdCompare({}, cur, prev);
  const [monthMix] = await Sale.aggregate([
    { $match: { saleDate: inMonth(cur) } },
    {
      $group: {
        _id: null,
        financed: { $sum: { $cond: [{ $and: [{ $eq: ["$paymentMode", "FINANCE"] }, { $eq: ["$status", "DELIVERED"] }] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } },
      },
    },
  ]);
  const yearUnits = trend.reduce((s, t) => s + t.units, 0);

  const actions: Array<{ kind: string; label: string; href: string; tone: string }> = [];
  // Signatures this person owes (Business Head / Managing Partner).
  if (user.role === "BUSINESS_HEAD" || user.role === "MANAGING_PARTNER") {
    const mine = (await listPending(user)).filter((i) => i.canSign);
    if (mine.length) {
      actions.push({ kind: "approval", label: `${mine.length} approval${mine.length > 1 ? "s" : ""} waiting for your signature`, href: "/approvals", tone: "amber" });
    }
  }
  const [doWaiting, fleet] = await Promise.all([
    DeliveryOrder.aggregate([{ $match: { status: { $in: ["SUBMITTED", "LOADED"] } } }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    FleetVehicle.find({ status: "ACTIVE" }).lean(),
  ]);
  const toLoad = doWaiting.find((x: any) => x._id === "SUBMITTED")?.n || 0;
  const toDispatch = doWaiting.find((x: any) => x._id === "LOADED")?.n || 0;
  if (toLoad) actions.push({ kind: "dispatch", label: `${toLoad} delivery order${toLoad > 1 ? "s" : ""} waiting to be loaded`, href: "/dispatch", tone: "brand" });
  if (toDispatch) actions.push({ kind: "dispatch", label: `${toDispatch} loaded DO${toDispatch > 1 ? "s" : ""} waiting for dispatch`, href: "/dispatch", tone: "brand" });
  const fleetState = fleet.map((f: any) => ({ f, c: fleetCompliance(f) }));
  const locked = fleetState.filter((x) => x.c.locked);
  const expiring = fleetState.filter((x) => !x.c.locked && x.c.expiringSoon.length);
  if (locked.length) actions.push({ kind: "fleet", label: `${locked.length} truck${locked.length > 1 ? "s" : ""} locked: ${locked.map((x) => x.f.registrationNo).join(", ")}`, href: "/fleet", tone: "rose" });
  if (expiring.length) actions.push({ kind: "fleet", label: `Papers expiring soon on ${expiring.map((x) => x.f.registrationNo).join(", ")}`, href: "/fleet", tone: "amber" });
  if (draftSchemes > 0 && user.role === "ADMIN")
    actions.push({ kind: "scheme", label: `${draftSchemes} incentive scheme${draftSchemes > 1 ? "s" : ""} awaiting approval`, href: "/schemes", tone: "amber" });
  for (const r of openRuns) {
    // BH/MP already see unsigned runs in their approvals count above.
    if (r.status !== "APPROVED" && (user.role === "BUSINESS_HEAD" || user.role === "MANAGING_PARTNER")) continue;
    actions.push({
      kind: "payroll",
      label:
        r.status === "APPROVED"
          ? `Payroll ${r.runCode} approved — ready to lock`
          : `Payroll ${r.runCode} in ${r.status.toLowerCase().replace("_", " ")}`,
      href: `/payroll/${r._id}`,
      tone: r.status === "APPROVED" ? "brand" : "amber",
    });
  }
  for (const m of lowStock.slice(0, 2)) {
    actions.push({ kind: "stock", label: `Low stock: ${m.name} (${m.available} left)`, href: "/purchases/new", tone: "rose" });
  }

  return {
    role: user.role,
    period: cur.period,
    kpis: {
      units: thisMonth.units,
      unitsTrend: pctChange(thisMonth.units, lastMonth.units),
      revenue: thisMonth.revenue,
      revenueTrend: pctChange(thisMonth.revenue, lastMonth.revenue),
      inStock,
      atDealers,
      dealers: dealersActive,
      employees,
      incentivesThisMonth: Math.round((ledgerSum[0]?.t || 0) / 100),
      sixMonthUnits: yearUnits,
      avgTicket: thisMonth.units ? Math.round(thisMonth.revenue / thisMonth.units) : 0,
      financeShare: thisMonth.units ? Math.round(((monthMix?.financed || 0) / thisMonth.units) * 100) : 0,
      cancelled: monthMix?.cancelled || 0,
      projectedUnits: Math.round((thisMonth.units / Math.max(1, Math.ceil((Date.now() - cur.start.getTime()) / 86400000))) * cur.daysInMonth),
    },
    trend,
    mix: mix.map((m: any) => ({ category: m._id, units: m.units, revenue: Math.round(m.revenue / 100) })),
    dealerPerformance: dealerPerf.map((d: any) => ({ ...d, revenue: Math.round(d.revenue / 100) })),
    leaderboard: board.map((b: any) => ({ ...b, revenue: Math.round(b.revenue / 100) })),
    lowStock,
    actions,
    recentSales: recent,
  };
}
