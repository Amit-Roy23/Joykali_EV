import mongoose from "mongoose";
import { PayrollRun } from "@/models/PayrollRun";
import { PayrollEntry } from "@/models/PayrollEntry";

export class StatutoryError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const rs = (p: number) => Math.round((p || 0) / 100);

/**
 * PF and ESI for one payroll month: member-wise contributions, the EPFO ECR upload file,
 * the ESIC monthly contribution sheet and the challan totals (due by the 15th of next month).
 */
export async function statutoryReport(runId: string) {
  if (!mongoose.isValidObjectId(runId)) throw new StatutoryError("Payroll run not found", 404);
  const run: any = await PayrollRun.findById(runId).lean();
  if (!run) throw new StatutoryError("Payroll run not found", 404);
  const entries: any[] = await PayrollEntry.find({ payrollRun: run._id }).populate("employee", "name employeeCode uan esiNumber exitDate").lean();
  const ceiling = (e: any) => e.salaryStructureSnapshot?.setup?.statutory?.pfCeilingPaise ?? 1500000;
  const pf = entries
    .filter((e) => (e.deductions?.pf || 0) > 0)
    .map((e) => {
      const epfWage = e.pfWage || 0;
      const statWage = Math.min(epfWage, ceiling(e));
      return {
        employeeId: String(e.employee?._id),
        code: e.employee?.employeeCode || "",
        uan: e.employee?.uan || "",
        name: e.employee?.name || "",
        gross: e.grossPay,
        epfWage,
        epsWage: statWage,
        edliWage: statWage,
        employeeShare: e.deductions.pf,
        eps: e.employer?.eps || 0,
        epfDiff: e.employer?.epf || 0,
        edli: e.employer?.edli || 0,
        admin: e.employer?.pfAdmin || 0,
        ncpDays: e.lopDays || 0,
      };
    });
  const esi = entries
    .filter((e) => (e.deductions?.esi || 0) > 0)
    .map((e) => ({
      employeeId: String(e.employee?._id),
      code: e.employee?.employeeCode || "",
      ipNumber: e.employee?.esiNumber || "",
      name: e.employee?.name || "",
      days: e.paidDays,
      wages: e.esiWage || 0,
      employeeShare: e.deductions.esi,
      employerShare: e.employer?.esi || 0,
    }));
  const sum = (rows: any[], k: string) => rows.reduce((s, r) => s + (r[k] || 0), 0);
  const nextMonth = run.month === 12 ? { y: run.year + 1, m: 1 } : { y: run.year, m: run.month + 1 };
  const due = `${nextMonth.y}-${String(nextMonth.m).padStart(2, "0")}-15`;
  return {
    run: { _id: run._id, runCode: run.runCode, year: run.year, month: run.month, status: run.status },
    due,
    pf,
    esi,
    missing: {
      uan: pf.filter((r) => !/^\d{12}$/.test(r.uan)).map((r) => `${r.name} (${r.code})`),
      esiNumber: esi.filter((r) => !/^\d{10}$/.test(r.ipNumber)).map((r) => `${r.name} (${r.code})`),
    },
    pfChallan: {
      ac1: sum(pf, "employeeShare") + sum(pf, "epfDiff"), // EPF: employee 12% + employer 3.67%
      ac2: sum(pf, "admin"),
      ac10: sum(pf, "eps"),
      ac21: sum(pf, "edli"),
      employees: pf.length,
      total: sum(pf, "employeeShare") + sum(pf, "epfDiff") + sum(pf, "admin") + sum(pf, "eps") + sum(pf, "edli"),
    },
    esiChallan: { employee: sum(esi, "employeeShare"), employer: sum(esi, "employerShare"), employees: esi.length, total: sum(esi, "employeeShare") + sum(esi, "employerShare"), wages: sum(esi, "wages") },
  };
}

/** EPFO ECR 2.0 text: one member per line, fields joined by #~#, amounts in whole rupees. */
export function ecrText(r: Awaited<ReturnType<typeof statutoryReport>>) {
  return r.pf
    .map((m) => [m.uan, m.name.toUpperCase(), rs(m.gross), rs(m.epfWage), rs(m.epsWage), rs(m.edliWage), rs(m.employeeShare), rs(m.eps), rs(m.epfDiff), m.ncpDays, 0].join("#~#"))
    .join("\n");
}
