import { NextRequest } from "next/server";
import crypto from "crypto";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, errorResponse, failure, jsonResponse } from "@/lib/apiHelper";
import { importBiometric } from "@/services/hrService";

/** CSV "EMPLOYEE_CODE,YYYY-MM-DD HH:MM[:SS]" lines (IST) → rows. */
function parseCsv(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^code|^employee/i.test(l))
    .map((l) => {
      const [code, ...rest] = l.split(/[,;\t]/);
      const t = rest.join(" ").trim().replace(" ", "T");
      return { employeeCode: code, at: /[+Z]/.test(t.slice(10)) ? t : `${t}${t.length === 16 ? ":00" : ""}+05:30` };
    });
}

/**
 * Biometric punches. Either a device pushes with header `x-device-key` (= BIOMETRIC_DEVICE_KEY),
 * or HR uploads a CSV export from the machine ({ csv }) / JSON rows ({ rows }).
 */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const key = req.headers.get("x-device-key");
    const b = await req.json();
    const rows = b.csv ? parseCsv(String(b.csv)) : Array.isArray(b.rows) ? b.rows : [];
    if (key) {
      const expected = process.env.BIOMETRIC_DEVICE_KEY || "";
      const ok = expected.length >= 16 && key.length === expected.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
      if (!ok) return errorResponse("Unknown device", 401);
      return jsonResponse(await importBiometric(null, rows, String(b.device || "device")));
    }
    const auth = await authenticateAndAuthorize(req, "attendance.manage");
    if (auth.error) return auth.error;
    return jsonResponse(await importBiometric(auth.user, rows, "csv-import"));
  } catch (e) {
    return failure(e, "Import failed");
  }
}
