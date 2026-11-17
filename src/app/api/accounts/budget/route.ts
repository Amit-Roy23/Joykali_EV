import { handle } from "@/lib/route";
import { istDay } from "@/lib/accounting";
import { budgetVsActual, setBudget } from "@/services/accountsService";

export const GET = handle(async ({ req }) => budgetVsActual(req.nextUrl.searchParams.get("period") || istDay(new Date()).slice(0, 7)), "accounts.view");
/** { period, rows: [{ head, amountRupees }] } */
export const PUT = handle(async ({ req, user }) => {
  const b = await req.json();
  return setBudget(user, b.period, b.rows);
}, "accounts.manage");
