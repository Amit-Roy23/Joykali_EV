"use client";

import React from "react";
import { cn } from "@/components/ui/button";

export const hm = (m: number | null | undefined) =>
  m == null ? "--:--" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const DAY_LABEL: Record<string, string> = {
  PRESENT: "Present",
  LATE: "Late",
  HALF_DAY: "Half day",
  ABSENT: "Absent",
  MISSED_PUNCH: "Missed punch",
  LEAVE: "Leave",
  HALF_LEAVE: "Half leave",
  HOLIDAY: "Holiday",
  WEEKLY_OFF: "Weekly off",
  NOT_JOINED: "—",
  UPCOMING: "Upcoming",
  ON_DUTY: "On duty",
};
export const DAY_CODE: Record<string, string> = { PRESENT: "P", LATE: "L", HALF_DAY: "½", ABSENT: "A", MISSED_PUNCH: "MP", LEAVE: "LV", HALF_LEAVE: "½L", HOLIDAY: "H", WEEKLY_OFF: "WO", NOT_JOINED: "", UPCOMING: "", ON_DUTY: "IN" };
export const DAY_STYLE: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800",
  LATE: "bg-amber-100 text-amber-800",
  HALF_DAY: "bg-orange-100 text-orange-800",
  ABSENT: "bg-rose-100 text-rose-700",
  MISSED_PUNCH: "bg-fuchsia-100 text-fuchsia-800",
  LEAVE: "bg-sky-100 text-sky-800",
  HALF_LEAVE: "bg-sky-50 text-sky-700",
  HOLIDAY: "bg-violet-100 text-violet-800",
  WEEKLY_OFF: "bg-slate-100 text-slate-500",
  NOT_JOINED: "bg-white text-slate-300",
  UPCOMING: "bg-white text-slate-400 ring-1 ring-inset ring-slate-100",
  ON_DUTY: "bg-emerald-50 text-emerald-700 ring-2 ring-inset ring-emerald-400",
};

/** Calendar of one month: a tile per day, Monday-first, coloured by status. */
export function MonthGrid({ days, onPick }: { days: any[]; onPick?: (d: any) => void }) {
  if (!days.length) return null;
  const firstDow = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return (
    <div className="max-w-2xl">
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-slate-400">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => (
          <span key={`pad${i}`} />
        ))}
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            onClick={() => onPick?.(d)}
            title={`${d.date} · ${DAY_LABEL[d.status]}${d.holiday ? ` (${d.holiday})` : ""}${d.inMin != null ? ` · ${hm(d.inMin)}–${hm(d.outMin)}` : ""}${d.lateMin ? ` · ${d.lateMin} min late` : ""}${d.otMin ? ` · OT ${d.otMin} min` : ""}`}
            className={cn("flex aspect-square min-w-0 flex-col items-center justify-center rounded-lg text-[11px] font-semibold leading-tight", DAY_STYLE[d.status])}
          >
            <span className="tabular">{Number(d.date.slice(8))}</span>
            <span className="text-[9px] font-bold opacity-80">{DAY_CODE[d.status]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
