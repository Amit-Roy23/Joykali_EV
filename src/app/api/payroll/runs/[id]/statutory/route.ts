import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { handle } from "@/lib/route";
import { rs, xlsxResponse } from "@/lib/xlsx";
import { ecrText, statutoryReport } from "@/services/statutoryReportService";

export const maxDuration = 60;

/** PF / ESI for a payroll run. ?format=ecr (EPFO upload .txt) | esi (ESIC sheet .xlsx) | xlsx (both) */
export const GET = handle(async ({ req, params }) => {
  const r = await statutoryReport(params.id);
  const format = req.nextUrl.searchParams.get("format");
  if (format === "ecr") {
    return new NextResponse(ecrText(r), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="ECR_${r.run.runCode}.txt"` },
    });
  }
  if (format === "esi" || format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    const es = wb.addWorksheet("ESI");
    // ESIC monthly contribution upload layout
    es.addRow(["IP Number", "IP Name", "No of Days for which wages paid", "Total Monthly Wages", "Reason Code for Zero working days", "Last Working Day"]).font = { bold: true };
    for (const m of r.esi) es.addRow([m.ipNumber, m.name, m.days, rs(m.wages), m.days ? "" : "1", ""]);
    [14, 26, 16, 18, 18, 16].forEach((w, i) => (es.getColumn(i + 1).width = w));
    if (format === "xlsx") {
      const pf = wb.addWorksheet("PF");
      pf.addRow(["UAN", "Name", "Emp code", "Gross wages", "EPF wages", "EPS wages", "EDLI wages", "Employee PF", "Employer EPS", "Employer EPF", "EDLI", "Admin", "NCP days"]).font = { bold: true };
      for (const m of r.pf) pf.addRow([m.uan, m.name, m.code, rs(m.gross), rs(m.epfWage), rs(m.epsWage), rs(m.edliWage), rs(m.employeeShare), rs(m.eps), rs(m.epfDiff), rs(m.edli), rs(m.admin), m.ncpDays]);
      const c = wb.addWorksheet("Challan");
      c.addRow([`PF & ESI challan ${r.run.runCode} · due ${r.due}`]).font = { bold: true };
      c.addRow(["PF A/c 1 (EPF: employee + employer)", rs(r.pfChallan.ac1)]);
      c.addRow(["PF A/c 2 (admin charges)", rs(r.pfChallan.ac2)]);
      c.addRow(["PF A/c 10 (pension, EPS)", rs(r.pfChallan.ac10)]);
      c.addRow(["PF A/c 21 (EDLI)", rs(r.pfChallan.ac21)]);
      c.addRow(["PF total", rs(r.pfChallan.total)]).font = { bold: true };
      c.addRow(["ESI employee 0.75%", rs(r.esiChallan.employee)]);
      c.addRow(["ESI employer 3.25%", rs(r.esiChallan.employer)]);
      c.addRow(["ESI total", rs(r.esiChallan.total)]).font = { bold: true };
      c.getColumn(1).width = 40;
    }
    return xlsxResponse(wb, `${format === "esi" ? "ESI" : "PF_ESI"}_${r.run.runCode}.xlsx`);
  }
  return r;
}, "payroll.view");
