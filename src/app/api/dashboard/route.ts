import { NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { getDashboardData } from "@/services/dashboardService";
import {
  authenticateAndAuthorize,
  jsonResponse,
  errorResponse,
} from "@/lib/apiHelper";

// Heavy work (recalculation, PDFs, spreadsheets): allow up to 60s on Vercel.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const auth = await authenticateAndAuthorize(req);
    if (auth.error) return auth.error;

    const data = await getDashboardData(auth.user);
    return jsonResponse(data);
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch dashboard data", 500);
  }
}

