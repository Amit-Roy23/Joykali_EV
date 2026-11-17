import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

/** Send a workbook as an .xlsx download. */
export async function xlsxResponse(wb: ExcelJS.Workbook, filename: string) {
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}

/** Paise → rupees with 2 decimals, as a number for spreadsheet cells. */
export const rs = (paise: number) => Math.round(paise) / 100;
