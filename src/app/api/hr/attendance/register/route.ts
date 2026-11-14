import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { handle } from "@/lib/route";
import { attendanceRegister, todayIst } from "@/services/hrService";

const CODE: Record<string, string> = { PRESENT: "P", LATE: "P*", HALF_DAY: "HD", ABSENT: "A", MISSED_PUNCH: "MP", LEAVE: "L", HALF_LEAVE: "HL", HOLIDAY: "H", WEEKLY_OFF: "WO", NOT_JOINED: "", UPCOMING: "", ON_DUTY: "IN" };
const hm = (m: number | null) => (m == null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

/** Monthly attendance register + late/early report. ?period=YYYY-MM &format=xlsx */
export const GET = handle(async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const period = sp.get("period") || todayIst().slice(0, 7);
  const rows = await attendanceRegister(user, period);
  if (sp.get("format") !== "xlsx") {
    return {
      period,
      rows: rows.map((r) => ({ employee: r.employee, summary: r.summary, codes: r.days.map((d) => CODE[d.status]) })),
      late: rows.flatMap((r) => r.days.filter((d) => d.lateMin || d.earlyMin).map((d) => ({ employee: r.employee.name, code: r.employee.employeeCode, date: d.date, in: hm(d.inMin), out: hm(d.outMin), lateMin: d.lateMin, earlyMin: d.earlyMin }))),
    };
  }
  const wb = new ExcelJS.Workbook();
  const days = rows[0]?.days.length || 31;
  const ws = wb.addWorksheet("Register");
  ws.addRow([`Attendance register ${period}`]).font = { bold: true, size: 13 };
  ws.addRow(["P present · P* late · HD half day · A absent · MP missed punch · L leave · HL half leave · H holiday · WO weekly off"]);
  const head = ws.addRow(["Code", "Name", "Department", ...Array.from({ length: days }, (_, i) => i + 1), "Present", "Leave (paid)", "LOP", "Late", "OT h (approved)"]);
  head.font = { bold: true };
  for (const r of rows as any[]) {
    ws.addRow([r.employee.employeeCode, r.employee.name, r.employee.department?.name || "", ...r.days.map((d: any) => CODE[d.status]), r.summary.present, r.summary.leavePaid, r.summary.lop, r.summary.lateCount, +(r.summary.otApprovedMinutes / 60).toFixed(1)]);
  }
  ws.getColumn(2).width = 24;
  ws.getColumn(3).width = 14;
  const lw = wb.addWorksheet("Late & early");
  lw.addRow(["Code", "Name", "Date", "In", "Out", "Late (min)", "Early leaving (min)"]).font = { bold: true };
  for (const r of rows as any[]) for (const d of r.days.filter((x: any) => x.lateMin || x.earlyMin)) lw.addRow([r.employee.employeeCode, r.employee.name, d.date, hm(d.inMin), hm(d.outMin), d.lateMin, d.earlyMin]);
  const ow = wb.addWorksheet("Overtime");
  ow.addRow(["Code", "Name", "Date", "OT recorded (min)", "OT approved (min)"]).font = { bold: true };
  for (const r of rows as any[]) for (const d of r.days.filter((x: any) => x.otMin)) ow.addRow([r.employee.employeeCode, r.employee.name, d.date, d.otMin, d.otApprovedMin]);
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="Attendance_${period}.xlsx"` },
  });
}, "attendance.team");
