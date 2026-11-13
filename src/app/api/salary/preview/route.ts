import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { authenticateAndAuthorize, failure, jsonResponse } from "@/lib/apiHelper";
import { previewSalary } from "@/services/salaryService";

/** Live automatic breakup: { mode: "GROSS"|"CTC", amount (₹), flags } */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req, "salary.manage");
    if (auth.error) return auth.error;
    const b = await req.json();
    return jsonResponse(await previewSalary({ mode: b.mode === "CTC" ? "CTC" : "GROSS", amountRupees: b.amount, flags: b.flags }));
  } catch (e) {
    return failure(e, "Failed to calculate");
  }
}
